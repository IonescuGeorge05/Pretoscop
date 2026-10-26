"""Scrierea ofertelor în DB. `price_points` primește rând nou DOAR la schimbare de preț / preț tăiat / stoc;
altfel se actualizează doar `offers.last_seen_at` și `confirmed_at` pe ultimul punct (prețul e încă valabil)."""

from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Offer, PricePoint, Product, Shop, UnmatchedListing
from scrapers.base import ScrapedOffer


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
) -> tuple[Offer, bool]:
    """Upsert ofertă + punct de preț doar la schimbare. Întoarce (ofertă, s-a_scris_punct_nou)."""
    offer = session.scalar(
        select(Offer).where(Offer.shop_id == shop.id, Offer.url == scraped.url, Offer.source == source)
    )
    if offer is None:
        offer = Offer(shop_id=shop.id, url=scraped.url, source=source)
        session.add(offer)
    offer.product_id = product.id
    offer.title = scraped.title
    offer.warranty_months = scraped.warranty_months
    offer.condition = scraped.condition
    offer.is_bundle = is_bundle
    offer.seller = scraped.seller
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
                origin="scrape",
            )
        )
    else:
        last.confirmed_at = scraped.scraped_at

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
    }
    session.flush()
