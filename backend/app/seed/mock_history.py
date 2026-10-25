"""Istoric sintetic realist pe 12 luni: 5 modele x toate magazinele, marcat source="mock".

    python -m app.seed.mock_history            # (re)generează datele demo
    python -m app.seed.mock_history --if-stale # doar dacă lipsesc sau au fost generate în altă zi

Scenarii incluse intenționat (pentru demo):
- reduceri la Black Friday, Crăciun, Paște, Singles' Day, back-to-school (cu preț tăiat afișat);
- REDUCERE FALSĂ: Flanco, PS5 Slim Digital — preț urcat ~13% cu 3 săptămâni înainte de "reducere";
- PC Garage: preț afișat puțin mai mic, dar transport plătit;
- evoMAG: cel mai mic preț afișat, dar garanție 12 luni -> pierde la preț final;
- tendințe diferite per model, ca recomandările să difere (cumpără / urmează reducere / obișnuit).
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

BASE_PRICE = {
    "ps5-disc-825gb": 2599,
    "ps5-digital-825gb": 2199,
    "ps5-slim-disc-1tb": 2799,
    "ps5-slim-digital-1tb": 2399,
    "ps5-pro-2tb": 3899,
}
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
) -> list[tuple[date, Decimal, Decimal | None, bool]]:
    """Zilele în care se schimbă ceva: (zi, preț, preț_tăiat, în_stoc)."""
    sc = SCENARIOS[product_slug]
    base = BASE_PRICE[product_slug] * SHOP_FACTOR[shop_slug]
    start = today - timedelta(days=DAYS - 1)
    participates = {e: rng.random() < 0.85 for e in calendar}
    depth = {e: EVENT_DISCOUNT[e.slug] * rng.uniform(0.7, 1.2) for e in calendar}
    shop_noise = random_walk(rng, SHOP_NOISE)
    out_of_stock_left = 0
    changes = []
    last = None

    for i in range(DAYS):
        day = start + timedelta(days=i)
        days_ago = (today - day).days
        noise = market_noise[i] + shop_noise[i]
        regular = base * (1 + sc.trend_pct_per_year / 100 * (i - DAYS) / 365 + noise)
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

    mock_ids = select(Offer.id).where(Offer.source == "mock")
    session.execute(delete(PricePoint).where(PricePoint.offer_id.in_(mock_ids)))
    session.execute(delete(Offer).where(Offer.source == "mock"))

    products = session.scalars(select(Product).order_by(Product.id)).all()
    shops = session.scalars(select(Shop).order_by(Shop.id)).all()
    now = datetime.now(UTC)
    count = 0
    for product in products:
        if product.slug not in BASE_PRICE:
            continue
        market_noise = random_walk(rng, MARKET_NOISE)
        for shop in shops:
            if shop.slug not in SHOP_FACTOR:
                continue
            template = shop.search_url_template or shop.base_url + "/?q={query}"
            offer = Offer(
                product_id=product.id,
                shop_id=shop.id,
                url=template.format(query=quote_plus(product.name.split(",")[0])),
                title=f"[DEMO] {product.name} — {shop.name}",
                warranty_months=SHOP_WARRANTY.get(shop.slug),
                condition="new",
                is_bundle=False,
                last_seen_at=now,
                source="mock",
            )
            session.add(offer)
            session.flush()
            changes = simulate(product.slug, shop.slug, today, calendar, rng, market_noise)
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
    session.commit()
    return count


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
