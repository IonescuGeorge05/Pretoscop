"""Istoric sintetic realist pe 12 luni: 5 modele x toate magazinele, marcat source="mock".

    python -m app.seed.mock_history            # (re)generează datele demo
    python -m app.seed.mock_history --if-stale # doar dacă lipsesc sau au fost generate în altă zi

Scenarii incluse intenționat (pentru demo):
- reduceri la Black Friday, Crăciun, Paște, Singles' Day, back-to-school (cu preț tăiat afișat);
- REDUCERE FALSĂ: Flanco, PS5 Slim Digital — preț urcat ~13% cu 3 săptămâni înainte de "reducere";
- PC Garage: preț afișat puțin mai mic, dar transport plătit;
- evoMAG: cel mai mic preț afișat, dar garanție 12 luni -> pierde la preț final;
- tendințe diferite per model, ca recomandările să difere (cumpără / urmează reducere / obișnuit);
- majorarea oficială Sony din 2 aprilie 2026 (prețurile de dinainte sunt cu 11-17% mai mici);
- o ofertă eMAG Marketplace (vânzător terț, preț umflat) -> apare marcată, nu intră în minimul pieței;
- refurbished (Flip, pe grade estetice) și second hand (OLX, persoane fizice, fără garanție).
"""

import argparse
import logging
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from urllib.parse import quote_plus

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Offer, PricePoint, Product, Shop
from app.seed.load import upsert_seed
from recommender.calendar import Event, load_calendar

log = logging.getLogger(__name__)

DAYS = 365

# nivel de preț după majorarea din aprilie 2026 (~4% sub MSRP-ul UE convertit)
BASE_PRICE = {
    "ps5-disc-825gb": 3149,
    "ps5-digital-825gb": 2899,
    "ps5-slim-disc-1tb": 3179,
    "ps5-slim-digital-1tb": 2929,
    "ps5-pro-2tb": 4399,
}
# majorarea Sony în Europa din 02.04.2026: raportul preț vechi / preț nou (549,99/649,99 etc.)
PRICE_HIKE_DATE = date(2026, 4, 2)
PRICE_HIKE_RATIO = {
    "ps5-disc-825gb": 0.846,
    "ps5-digital-825gb": 0.833,
    "ps5-slim-disc-1tb": 0.846,
    "ps5-slim-digital-1tb": 0.833,
    "ps5-pro-2tb": 0.889,
}
OLX_CITIES = ["București, Sectorul 3", "Cluj-Napoca", "Iași", "Timișoara", "Brașov", "Constanța", "Craiova"]
FLIP_GRADES = {"Bun": 0.80, "Foarte bun": 0.84, "Excelent": 0.88, "Ca nou": 0.92}  # față de prețul nou
SHOP_FACTOR = {"emag": 1.0, "altex": 1.012, "flanco": 1.008, "pcgarage": 0.995, "evomag": 0.975}
SHOP_WARRANTY = {"evomag": 12}  # restul: default-ul magazinului (24)
EVENT_DISCOUNT = {"black_friday": 0.14, "singles_day": 0.07, "craciun": 0.06, "paste": 0.05, "back_to_school": 0.05}
MARKET_NOISE = 0.006  # +/- 0.6%: fluctuație comună tuturor magazinelor (distribuitor, curs)
SHOP_NOISE = 0.0015  # +/- 0.15%: ajustări proprii fiecărui magazin
CHANGE_PROB = 0.12  # șansa zilnică de ajustare de preț


@dataclass(frozen=True)
class Scenario:
    trend_pct_per_year: float = 0.0  # tendință liniară pe tot intervalul
    recent_shift_pct: float = 0.0  # ajustare în ultimele `recent_days` zile
    recent_days: int = 0
    flash_sale_shop: str | None = None  # promo curentă la un magazin
    flash_sale_pct: float = 0.0
    flash_sale_days: int = 0


SCENARIOS = {
    # model vechi, stoc în scădere -> prețul urcă
    "ps5-disc-825gb": Scenario(trend_pct_per_year=4, recent_shift_pct=3, recent_days=45),
    # promo curentă la eMAG -> sub percentila 10 -> "Cumpără acum"
    "ps5-digital-825gb": Scenario(flash_sale_shop="emag", flash_sale_pct=9, flash_sale_days=5),
    # scumpire înainte de Black Friday -> "Urmează o reducere"
    "ps5-slim-disc-1tb": Scenario(recent_shift_pct=4, recent_days=30),
    # ușor ieftinit recent; conține reducerea falsă de la Flanco
    "ps5-slim-digital-1tb": Scenario(recent_shift_pct=-2, recent_days=20),
    # se ieftinește lent, dar e scumpit acum -> "Urmează o reducere"
    "ps5-pro-2tb": Scenario(trend_pct_per_year=-5, recent_shift_pct=5, recent_days=25),
}

# produse fără scenariu dedicat (ex. iPhone): ieftinire lentă după lansare
DEFAULT_SCENARIO = Scenario(trend_pct_per_year=-8)
# promo Altex la Pro 256 GB -> „Cumpără acum”; Pro Max 256 GB se ieftinește constant -> regula de trend
SCENARIOS["iphone-18-pro-256gb"] = Scenario(trend_pct_per_year=-8, flash_sale_shop="altex", flash_sale_pct=7, flash_sale_days=4)
SCENARIOS["iphone-18-pro-max-256gb"] = Scenario(trend_pct_per_year=-60)

# istoricul începe la lansare pentru produsele noi (nu există prețuri înainte)
LAUNCH_DATE = {"iPhone 18 Pro": date(2026, 9, 18)}
# produsele fără preț de bază fix pornesc de la MSRP x acest factor
DEFAULT_BASE_OF_MSRP = 0.97


def base_price(product) -> float | None:
    if product.slug in BASE_PRICE:
        return BASE_PRICE[product.slug]
    return float(product.msrp_ron) * DEFAULT_BASE_OF_MSRP if product.msrp_ron else None


FAKE_DISCOUNT = {"product": "ps5-slim-digital-1tb", "shop": "flanco", "rise_pct": 13, "rise_days_before": 21, "since": 6}


def psychological(price: float) -> Decimal:
    """2537.4 -> 2539.99 (prețuri cu terminație x9,99 ca în magazine)."""
    return Decimal(int(price / 10) * 10 + 9) + Decimal("0.99")


def event_on(day: date, calendar: list[Event]) -> Event | None:
    return next((e for e in calendar if e.start <= day <= e.end), None)


def random_walk(rng: random.Random, amplitude: float) -> list[float]:
    value, out = 0.0, []
    for _ in range(DAYS):
        if rng.random() < CHANGE_PROB:
            value = rng.uniform(-amplitude, amplitude)
        out.append(value)
    return out


def simulate(
    product_slug: str,
    shop_slug: str,
    today: date,
    calendar: list[Event],
    rng: random.Random,
    market_noise: list[float],
    product_base: float,
    launch: date | None = None,
) -> list[tuple[date, Decimal, Decimal | None, bool]]:
    """Zilele în care se schimbă ceva: (zi, preț, preț_tăiat, în_stoc)."""
    sc = SCENARIOS.get(product_slug, DEFAULT_SCENARIO)
    base = product_base * SHOP_FACTOR[shop_slug]
    start = today - timedelta(days=DAYS - 1)
    participates = {e: rng.random() < 0.85 for e in calendar}
    depth = {e: EVENT_DISCOUNT[e.slug] * rng.uniform(0.7, 1.2) for e in calendar}
    shop_noise = random_walk(rng, SHOP_NOISE)
    out_of_stock_left = 0
    changes = []
    last = None

    for i in range(DAYS):
        day = start + timedelta(days=i)
        if launch and day < launch:
            continue
        days_ago = (today - day).days
        noise = market_noise[i] + shop_noise[i]
        regular = base * (1 + sc.trend_pct_per_year / 100 * (i - DAYS) / 365 + noise)
        if day < PRICE_HIKE_DATE:
            regular *= PRICE_HIKE_RATIO.get(product_slug, 1.0)
        if sc.recent_days and days_ago < sc.recent_days:
            regular *= 1 + sc.recent_shift_pct / 100

        price, old = regular, None
        ev = event_on(day, calendar)
        if ev and participates[ev]:
            price, old = regular * (1 - depth[ev]), regular
        if sc.flash_sale_shop == shop_slug and days_ago < sc.flash_sale_days:
            price, old = regular * (1 - sc.flash_sale_pct / 100), regular

        fd = FAKE_DISCOUNT
        if product_slug == fd["product"] and shop_slug == fd["shop"]:
            inflated = base * (1 + fd["rise_pct"] / 100)
            if fd["since"] <= days_ago < fd["since"] + fd["rise_days_before"]:
                price, old = inflated, None
            elif days_ago < fd["since"]:
                price, old = base * 0.995, inflated  # "reducere" de ~12%, de fapt prețul vechi

        # rupturi de stoc rare (nu în ultima săptămână, ca demo-ul să fie stabil)
        if out_of_stock_left == 0 and days_ago > 7 and rng.random() < 0.004:
            out_of_stock_left = rng.randint(2, 6)
        in_stock = out_of_stock_left == 0
        out_of_stock_left = max(0, out_of_stock_left - 1)

        state = (psychological(price), psychological(old) if old else None, in_stock)
        if state != last:
            changes.append((day, *state))
            last = state
    return changes


def generate(session: Session, today: date | None = None, seed: int = 42) -> int:
    today = today or date.today()
    rng = random.Random(seed)
    calendar = load_calendar()

    shops_by_slug = {sh.slug: sh for sh in session.scalars(select(Shop))}
    mock_ids = select(Offer.id).where(Offer.source == "mock")
    session.execute(delete(PricePoint).where(PricePoint.offer_id.in_(mock_ids)))
    session.execute(delete(Offer).where(Offer.source == "mock"))

    products = session.scalars(select(Product).order_by(Product.id)).all()
    shops = session.scalars(select(Shop).order_by(Shop.id)).all()
    now = datetime.now(UTC)
    count = 0
    for product in products:
        pbase = base_price(product)
        if pbase is None:
            continue
        market_noise = random_walk(rng, MARKET_NOISE)
        for shop in shops:
            if shop.slug not in SHOP_FACTOR:
                continue
            template = shop.search_url_template or shop.base_url + "/?q={query}"
            offer = Offer(
                product_id=product.id,
                shop_id=shop.id,
                url=template.format(query=quote_plus(product.name.replace(",", ""))),
                title=f"[DEMO] {product.name} — {shop.name}",
                warranty_months=SHOP_WARRANTY.get(shop.slug),
                condition="new",
                is_bundle=False,
                last_seen_at=now,
                source="mock",
            )
            session.add(offer)
            session.flush()
            changes = simulate(
                product.slug, shop.slug, today, calendar, rng, market_noise, pbase, LAUNCH_DATE.get(product.family)
            )
            for i, (day, price, old, in_stock) in enumerate(changes):
                ts = datetime.combine(day, time(6, 0), tzinfo=UTC)
                # demo = colectare continuă: fiecare preț e confirmat până la următoarea schimbare
                until = datetime.combine(changes[i + 1][0], time(6, 0), tzinfo=UTC) if i + 1 < len(changes) else now
                session.add(
                    PricePoint(
                        offer_id=offer.id, ts=ts, confirmed_at=until, price=price, old_price=old, in_stock=in_stock
                    )
                )
                count += 1
        count += add_secondary_offers(session, product, shops_by_slug, today, rng, now, pbase)
    session.commit()
    return count


def _add_offer(session, product, shop, url, title, changes, now, **fields) -> int:
    """changes: [(zi, preț, în_stoc)] -> ofertă demo cu puncte confirmate până la următoarea schimbare."""
    offer = Offer(
        product_id=product.id, shop_id=shop.id, url=url, title=title, last_seen_at=now, source="mock", **fields
    )
    session.add(offer)
    session.flush()
    for i, (day, price, in_stock) in enumerate(changes):
        ts = datetime.combine(day, time(6, 0), tzinfo=UTC)
        until = datetime.combine(changes[i + 1][0], time(6, 0), tzinfo=UTC) if i + 1 < len(changes) else now
        session.add(PricePoint(offer_id=offer.id, ts=ts, confirmed_at=until, price=price, in_stock=in_stock))
    return len(changes)


def add_secondary_offers(session, product, shops, today, rng, now, base: float) -> int:
    """Oferte demo în afara comparației principale: marketplace, refurbished (Flip), second hand (OLX)."""
    n = 0
    is_phone = product.family != "PlayStation 5"
    first_day = LAUNCH_DATE.get(product.family, today - timedelta(days=60))
    if product.slug == "ps5-slim-digital-1tb" and "emag" in shops:
        # vânzător terț pe eMAG cu preț umflat: apare cu eticheta „Marketplace”, nu în minimul pieței
        n += _add_offer(
            session, product, shops["emag"],
            url=shops["emag"].search_url_template.format(query="playstation+5+slim+digital") + "#demo-marketplace",
            title=f"[DEMO] {product.name} — vânzător marketplace",
            changes=[(today - timedelta(days=40), psychological(base * 1.38), True),
                     (today - timedelta(days=9), psychological(base * 1.45), True)],
            now=now, condition="new", is_bundle=False, seller="[DEMO] Vânzător Marketplace SRL",
        )
    if "flip" in shops:
        for grade, factor in FLIP_GRADES.items():
            price = base * factor
            changes = [(max(first_day, today - timedelta(days=60)), psychological(price * 1.03), rng.random() < 0.7),
                       (today - timedelta(days=rng.randint(5, 25)), psychological(price), rng.random() < 0.6)]
            n += _add_offer(
                session, product, shops["flip"],
                url=f"https://flip.ro/console-jocuri/sony/#demo-{product.slug}-{quote_plus(grade)}",
                title=f"[DEMO] {product.name}, {grade}",
                changes=changes, now=now, condition="refurbished", is_bundle=False,
                seller="Flip", grade=grade, warranty_months=24,
            )
    if "olx" in shops:
        for k in range(rng.randint(2, 3)):
            # telefoanele noi apar pe OLX mai ales sigilate, aproape de prețul din magazin
            price = base * (rng.uniform(0.82, 0.95) if is_phone else rng.uniform(0.62, 0.8))
            posted = today - timedelta(days=rng.randint(1, 20))
            n += _add_offer(
                session, product, shops["olx"],
                url=shops["olx"].search_url_template.format(query="iphone-18-pro" if is_phone else "playstation-5") + f"#demo-{product.slug}-{k}",
                title=f"[DEMO] Vând {product.name.split(',')[0]}, stare foarte bună",
                changes=[(posted, Decimal(int(price / 50) * 50), True)],
                now=now, condition="used", is_bundle=False, seller="persoană fizică", warranty_months=0,
                location=rng.choice(OLX_CITIES), posted_label=f"{posted.day:02d}.{posted.month:02d}.{posted.year}",
            )
    return n


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--if-stale", action="store_true", help="regenerează doar dacă lipsesc sau nu sunt de azi")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    with SessionLocal() as session:
        upsert_seed(session)
        last = session.scalar(select(func.max(Offer.last_seen_at)).where(Offer.source == "mock"))
        if args.if_stale and last is not None and last.date() == datetime.now(UTC).date():
            log.info("date demo de azi existente — sar peste generare")
            return
        n = generate(session, seed=args.seed)
        log.info("istoric demo generat: %d puncte de preț", n)


if __name__ == "__main__":
    main()
