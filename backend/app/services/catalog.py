"""Citiri pentru API: oferte curente cu preț final, istoric, recomandare."""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from statistics import median
from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import Offer, PricePoint, Product, Shop
from app.services.pricing import PriceBreakdown, final_price
from recommender.calendar import Event, load_calendar
from recommender.rules import HistoryPoint, OfferHistory, Recommendation, recommend

# o ofertă reală nevăzută de atâtea zile nu mai apare în tabelul de oferte curente
STALE_AFTER = timedelta(days=3)
# un preț rămâne valabil până la ultima confirmare + toleranță; după aceea e gol în istoric
# (scrape la 6 ore -> o zi acoperă o noapte cu calculatorul oprit)
CONFIRMATION_GRACE = timedelta(days=1)

VERDICT_LABELS = {
    "BUY_NOW": "Cumpără acum",
    "WAIT": "Așteaptă",
    "UPCOMING_SALE": "Urmează o reducere",
    "NEUTRAL": "Preț obișnuit",
    "INSUFFICIENT_DATA": "Date insuficiente",
}


@lru_cache
def calendar() -> list[Event]:
    return load_calendar()


def resolve_source(source: str | None) -> str:
    return source if source in ("mock", "real") else settings.data_mode


def warranty_for(offer: Offer) -> int:
    return offer.warranty_months if offer.warranty_months is not None else offer.shop.default_warranty_months


def breakdown(offer: Offer, price) -> PriceBreakdown:
    return final_price(price, offer.shop.shipping_rules, warranty_for(offer))


@dataclass
class OfferView:
    offer: Offer
    point: PricePoint
    breakdown: PriceBreakdown


def load_offers(session: Session, product_id: int, source: str, used: bool = False) -> list[Offer]:
    """`used=False`: produse noi din magazine (retail). `used=True`: refurbished + second hand."""
    stmt = (
        select(Offer)
        .join(Shop)
        .where(Offer.product_id == product_id, Offer.source == source)
        .where((Offer.condition != "new") if used else (Offer.condition == "new") & (Shop.kind == "retail"))
        .options(selectinload(Offer.shop), selectinload(Offer.price_points), selectinload(Offer.product))
    )
    return [o for o in session.scalars(stmt) if o.price_points]


def is_marketplace(offer: Offer) -> bool:
    """Oferta e vândută de un terț prin marketplace-ul magazinului (ex. eMAG Marketplace)."""
    if offer.shop.kind != "retail" or not offer.seller:
        return False
    seller = offer.seller.lower().replace(" ", "")
    return not (seller.startswith(offer.shop.slug) or seller.startswith(offer.shop.name.lower().replace(" ", "")))


# sub acest procent din MSRP un anunț second hand e aproape sigur țeapă, defect sau greșeală de preț
SUSPICIOUS_BELOW_MSRP = 0.40


def suspicious_price(offer: Offer, price) -> bool:
    msrp = offer.product.msrp_ron
    return offer.condition != "new" and msrp is not None and price < msrp * Decimal(str(SUSPICIOUS_BELOW_MSRP))


# o ofertă nouă de la un magazin peste aceste praguri e „neobișnuit de mare” (eroare, stoc de revânzător, speculă)
OUTLIER_OVER_MSRP = Decimal("1.5")
OUTLIER_OVER_PEERS = Decimal("1.3")


def price_outliers(offers: list[Offer]) -> dict[int, str]:
    """offer.id -> motiv, pentru ofertele noi, simple, vândute direct de magazin, cu preț aberant."""
    direct = [o for o in offers if o.condition == "new" and not o.is_bundle and not is_marketplace(o) and o.price_points]
    prices = {o.id: o.price_points[-1].price for o in direct}
    peers = median(prices.values()) if len(prices) >= 3 else None
    out: dict[int, str] = {}
    for o in direct:
        price, msrp = prices[o.id], o.product.msrp_ron
        if msrp and price > msrp * OUTLIER_OVER_MSRP:
            out[o.id] = f"cu {(price / msrp - 1) * 100:.0f}% peste prețul recomandat de producător"
        elif peers and price > peers * OUTLIER_OVER_PEERS:
            out[o.id] = f"cu {(price / peers - 1) * 100:.0f}% peste mediana celorlalte magazine"
    return out


def comparable(offers: list[Offer]) -> list[Offer]:
    """Ofertele care intră în minimul pieței, grafic și recomandare: produs simplu, vândut de magazin, preț plauzibil.
    Dacă toate ofertele directe sunt aberante (ex. piața reală la un moment dat), le păstrăm — altfel nu rămâne nimic."""
    base = [o for o in offers if not o.is_bundle and not is_marketplace(o)]
    outliers = price_outliers(offers)
    return [o for o in base if o.id not in outliers] or base


# culoarea din titlu (RO + EN) -> numele afișat; culoarea nu e un produs separat
COLORS = {
    "negru": "Negru", "black": "Negru", "argintiu": "Argintiu", "silver": "Argintiu", "alb": "Alb", "white": "Alb",
    "glacier": "Glacier", "burgundy": "Burgundy", "albastru": "Albastru", "blue": "Albastru", "rosu": "Roșu",
    "roșu": "Roșu", "red": "Roșu", "portocaliu": "Portocaliu", "orange": "Portocaliu", "gri": "Gri", "gray": "Gri",
    "grey": "Gri", "auriu": "Auriu", "gold": "Auriu", "verde": "Verde", "green": "Verde", "mov": "Mov", "purple": "Mov",
}
COLOR_RE = re.compile(r"(?i)\b(" + "|".join(sorted(COLORS, key=len, reverse=True)) + r")\b")


def color_of(title: str | None) -> str | None:
    m = COLOR_RE.findall(title or "")
    return COLORS[m[-1].lower()] if m else None  # ultima apariție: culoarea e de obicei la final


def group_colors(views: list["OfferView"]) -> list[tuple["OfferView", list[str], int]]:
    """Un rând per magazin (+ vânzător / stare / grad): variantele de culoare ale aceluiași produs se unesc.
    Rămâne cea mai bună variantă (lista e sortată: în stoc întâi, apoi preț); se păstrează culorile și numărul lor.
    Second hand nu se grupează: fiecare anunț e alt vânzător."""
    groups: dict[tuple, list[OfferView]] = {}
    for v in views:
        o = v.offer
        key = (o.id,) if o.condition == "used" or o.is_bundle else (o.shop_id, o.seller, o.condition, o.grade)
        groups.setdefault(key, []).append(v)
    out = []
    for members in groups.values():
        colors = list(dict.fromkeys(c for m in members if (c := color_of(m.offer.title))))
        out.append((members[0], colors, len(members)))
    return out


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def current_views(offers: list[Offer]) -> list[OfferView]:
    now = datetime.now(UTC)
    views = []
    for o in offers:
        if o.source == "real" and now - _aware(o.last_seen_at) > STALE_AFTER:
            continue
        point = o.price_points[-1]
        views.append(OfferView(o, point, breakdown(o, point.price)))
    # sortare: în stoc întâi, apoi după preț final
    return sorted(views, key=lambda v: (not v.point.in_stock, v.breakdown.final_price))


def to_history(offer: Offer) -> OfferHistory:
    return OfferHistory(
        offer_id=offer.id,
        shop_name=offer.shop.name,
        points=[
            HistoryPoint(
                ts=_aware(p.ts).date(),
                price=float(p.price),
                final_price=float(breakdown(offer, p.price).final_price),
                old_price=float(p.old_price) if p.old_price is not None else None,
                in_stock=p.in_stock,
                until=(_aware(p.confirmed_at) + CONFIRMATION_GRACE).date(),
                origin=p.origin,
            )
            for p in offer.price_points
        ],
    )


def product_recommendation(product: Product, offers: list[Offer], today: date | None = None) -> Recommendation:
    histories = [to_history(o) for o in comparable(offers)]
    msrp = float(product.msrp_ron) if product.msrp_ron is not None else None
    return recommend(histories, today or date.today(), calendar(), msrp=msrp)


def search_query(product: Product) -> str:
    """Textul de căutat la alt magazin: numele fără paranteze și virgule, ex. „PlayStation 5 Slim Digital Edition 825 GB”."""
    name = re.sub(r"\(.*?\)", " ", product.name)
    return re.sub(r"\s+", " ", name.replace(",", " ")).strip()


def missing_shops(session: Session, product: Product) -> list[tuple[Shop, str]]:
    """Magazinele cu produse noi pe care nu le putem citi (blocate sau oprite), cu link spre căutarea lor."""
    shops = session.scalars(select(Shop).where(Shop.kind == "retail").order_by(Shop.name))
    return [
        (s, s.search_url_template.format(query=quote_plus(search_query(product))))
        for s in shops
        if (s.status == "blocked" or not s.enabled) and s.search_url_template
    ]


def get_product(session: Session, slug: str) -> Product | None:
    return session.scalar(select(Product).where(Product.slug == slug))


def available_sources(session: Session, product_id: int) -> list[str]:
    rows = session.scalars(select(Offer.source).where(Offer.product_id == product_id).distinct())
    return sorted(rows)
