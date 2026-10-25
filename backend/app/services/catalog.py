"""Citiri pentru API: oferte curente cu preț final, istoric, recomandare."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache

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
        .options(selectinload(Offer.shop), selectinload(Offer.price_points))
    )
    return [o for o in session.scalars(stmt) if o.price_points]


def is_marketplace(offer: Offer) -> bool:
    """Oferta e vândută de un terț prin marketplace-ul magazinului (ex. eMAG Marketplace)."""
    if offer.shop.kind != "retail" or not offer.seller:
        return False
    seller = offer.seller.lower().replace(" ", "")
    return not (seller.startswith(offer.shop.slug) or seller.startswith(offer.shop.name.lower().replace(" ", "")))


def comparable(offers: list[Offer]) -> list[Offer]:
    """Ofertele care intră în minimul pieței, grafic și recomandare: produs simplu, vândut de magazin."""
    return [o for o in offers if not o.is_bundle and not is_marketplace(o)]


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


def get_product(session: Session, slug: str) -> Product | None:
    return session.scalar(select(Product).where(Product.slug == slug))


def available_sources(session: Session, product_id: int) -> list[str]:
    rows = session.scalars(select(Offer.source).where(Offer.product_id == product_id).distinct())
    return sorted(rows)
