"""Scrierea ofertelor în DB. `price_points` primește rând nou DOAR la schimbare de preț / preț tăiat / stoc;
altfel se actualizează doar `offers.last_seen_at` și `confirmed_at` pe ultimul punct (prețul e încă valabil)."""

from datetime import UTC
from decimal import Decimal
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Offer, PricePoint, Product, Shop, UnmatchedListing
from scrapers.base import ScrapedOffer


def _utc(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def latest_point(session: Session, offer: Offer) -> PricePoint | None:
    return session.scalar(
        select(PricePoint).where(PricePoint.offer_id == offer.id).order_by(PricePoint.ts.desc()).limit(1)
    )


def record_offer(
    session: Session,
    shop: Shop,
    product: Product,
    scraped: ScrapedOffer,
    is_bundle: bool,
    source: str = "real",
    origin: str = "scrape",
) -> tuple[Offer, bool]:
    """Upsert ofertă + punct de preț doar la schimbare. Întoarce (ofertă, s-a_scris_punct_nou)."""
    offer = session.scalar(
        select(Offer).where(Offer.shop_id == shop.id, Offer.url == scraped.url, Offer.source == source)
    )
    if offer is None:
        offer = Offer(shop_id=shop.id, url=scraped.url, source=source)
        session.add(offer)
    elif offer.last_seen_at is not None and _utc(scraped.scraped_at) < _utc(offer.last_seen_at):
        # date mai vechi decât oferta (ex. un anunț nepotrivit asociat acum): nu suprascriu ce știm deja mai nou
        offer.product_id = product.id
        offer.is_bundle = is_bundle
        session.flush()
        return offer, False
    offer.product_id = product.id
    offer.title = scraped.title
    offer.warranty_months = scraped.warranty_months
    offer.condition = scraped.condition
    offer.is_bundle = is_bundle
    offer.seller = scraped.seller
    offer.preorder = scraped.preorder
    offer.grade = scraped.grade
    offer.location = scraped.location
    offer.posted_label = scraped.posted_label
    offer.last_seen_at = scraped.scraped_at
    if scraped.raw.get("affiliate_url"):  # link de afiliere venit direct din feed
        offer.affiliate_url = scraped.raw["affiliate_url"]
    elif shop.affiliate_url_template:
        offer.affiliate_url = shop.affiliate_url_template.format(url=quote(scraped.url, safe=""))
    session.flush()

    last = latest_point(session, offer)
    changed = (
        last is None
        or last.price != scraped.price
        or last.old_price != scraped.old_price
        or last.in_stock != scraped.in_stock
    )
    if changed:
        session.add(
            PricePoint(
                offer_id=offer.id,
                ts=scraped.scraped_at,
                confirmed_at=scraped.scraped_at,
                price=scraped.price,
                old_price=scraped.old_price,
                in_stock=scraped.in_stock,
                origin=origin,
            )
        )
    else:
        last.confirmed_at = scraped.scraped_at
        last.origin = origin  # un preț reconfirmat de mână rămâne „manual” (expiră mai repede), unul citit de robot devine „scrape”

    # EAN găsit de scraper -> se salvează pe produs dacă lipsește (nu din pachete, nu dacă e deja folosit)
    if scraped.ean and not is_bundle and scraped.condition == "new" and product.ean is None:
        taken = session.scalar(select(Product.id).where(Product.ean == scraped.ean))
        if taken is None:
            product.ean = scraped.ean
    session.flush()
    return offer, changed


def record_unmatched(session: Session, shop: Shop, scraped: ScrapedOffer, reason: str) -> None:
    row = session.scalar(
        select(UnmatchedListing).where(UnmatchedListing.shop_id == shop.id, UnmatchedListing.url == scraped.url)
    )
    if row is None:
        row = UnmatchedListing(shop_id=shop.id, url=scraped.url)
        session.add(row)
    row.title = scraped.title
    row.reason = reason
    row.scraped_at = scraped.scraped_at
    row.raw = {
        "price": str(scraped.price),
        "old_price": str(scraped.old_price) if scraped.old_price else None,
        "in_stock": scraped.in_stock,
        "ean": scraped.ean,
        "mpn": scraped.mpn,
        "seller": scraped.seller,
        "grade": scraped.grade,
        "location": scraped.location,
        "condition": scraped.condition,
        "warranty_months": scraped.warranty_months,
        "posted_label": scraped.posted_label,
        "preorder": scraped.preorder,
    }
    session.flush()


def offer_from_unmatched(row: UnmatchedListing) -> ScrapedOffer:
    """Anunțul nepotrivit, refăcut din datele salvate (pentru asocierea din admin și pentru re-potrivire)."""
    raw = row.raw
    scraped_at = row.scraped_at if row.scraped_at.tzinfo else row.scraped_at.replace(tzinfo=UTC)
    return ScrapedOffer(
        shop_slug="",
        url=row.url,
        title=row.title,
        price=Decimal(raw["price"]),
        old_price=Decimal(raw["old_price"]) if raw.get("old_price") else None,
        in_stock=bool(raw.get("in_stock", True)),
        ean=raw.get("ean"),
        mpn=raw.get("mpn"),
        warranty_months=raw.get("warranty_months"),
        condition=raw.get("condition") or "new",
        scraped_at=scraped_at,
        seller=raw.get("seller"),
        grade=raw.get("grade"),
        location=raw.get("location"),
        posted_label=raw.get("posted_label"),
        preorder=bool(raw.get("preorder")),
    )
