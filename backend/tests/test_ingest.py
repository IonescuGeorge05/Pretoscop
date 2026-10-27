"""Scriere în DB doar la schimbare de preț/stoc (SQLite in-memory)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Base, PricePoint, Product, Shop
from app.services.ingest import record_offer
from scrapers.base import ScrapedOffer


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Product(slug="ps5-pro-2tb", family="PlayStation 5", name="PS5 Pro", edition="digital", storage_gb=2000))
        s.add(Shop(slug="pcgarage", name="PC Garage", base_url="https://www.pcgarage.ro", shipping_rules={}))
        s.commit()
        yield s


def scraped(price: str, in_stock=True, minutes=0, ean=None) -> ScrapedOffer:
    return ScrapedOffer(
        shop_slug="pcgarage",
        url="https://www.pcgarage.ro/ps5-pro/",
        title="Consola Sony PlayStation 5 Pro 2TB",
        price=Decimal(price),
        old_price=None,
        in_stock=in_stock,
        ean=ean,
        mpn=None,
        warranty_months=None,
        condition="new",
        scraped_at=datetime(2026, 10, 25, tzinfo=UTC) + timedelta(minutes=minutes),
    )


def test_price_point_written_only_on_change(session):
    shop, product = session.scalar(select(Shop)), session.scalar(select(Product))
    results = [
        record_offer(session, shop, product, scraped("3899.99", minutes=0), False)[1],
        record_offer(session, shop, product, scraped("3899.99", minutes=360), False)[1],  # identic
        record_offer(session, shop, product, scraped("3799.99", minutes=720), False)[1],  # preț nou
        record_offer(session, shop, product, scraped("3799.99", in_stock=False, minutes=1080), False)[1],  # stoc
        record_offer(session, shop, product, scraped("3799.99", in_stock=False, minutes=1440), False)[1],
    ]
    assert results == [True, False, True, True, False]
    assert session.scalar(select(func.count(PricePoint.id))) == 3
    offer = product.offers[0]
    assert offer.last_seen_at.replace(tzinfo=UTC) == datetime(2026, 10, 26, tzinfo=UTC)  # actualizat mereu
    # ultimul punct e confirmat la ultimul scrape, chiar dacă nu s-a scris rând nou
    last = session.scalars(select(PricePoint).order_by(PricePoint.ts.desc())).first()
    assert last.confirmed_at.replace(tzinfo=UTC) == datetime(2026, 10, 26, tzinfo=UTC)


def test_ean_saved_on_product_when_missing_but_not_from_bundle(session):
    shop, product = session.scalar(select(Shop)), session.scalar(select(Product))
    record_offer(session, shop, product, scraped("3899.99", ean="1111111111111"), is_bundle=True)
    assert product.ean is None
    record_offer(session, shop, product, scraped("3899.99", ean="0711719000000"), is_bundle=False)
    assert product.ean == "0711719000000"


def test_suspicious_second_hand_price_below_40pct_of_msrp():
    from app.models import Offer
    from app.services.catalog import suspicious_price

    pro = Product(slug="ps5-pro-2tb", family="PlayStation 5", name="PS5 Pro", edition="digital", storage_gb=2000,
                  msrp_ron=Decimal("4579"))
    used, new = Offer(condition="used", product=pro), Offer(condition="new", product=pro)
    assert suspicious_price(used, Decimal("500"))  # „PS5 Pro 500 lei” real de pe Publi24
    assert not suspicious_price(used, Decimal("3000"))
    assert not suspicious_price(new, Decimal("500"))  # regula e doar pentru second hand / refurbished


def _offer(oid, price, msrp="4579", seller=None, kind="retail"):
    from app.models import Offer, PricePoint

    shop = Shop(slug=f"s{oid}", name=f"S{oid}", base_url="https://x.ro", kind=kind)
    prod = Product(slug="ps5-pro-2tb", family="PlayStation 5", name="PS5 Pro", edition="pro", storage_gb=2000,
                   msrp_ron=Decimal(msrp))
    o = Offer(id=oid, shop=shop, product=prod, condition="new", is_bundle=False, seller=seller)
    o.price_points = [PricePoint(price=Decimal(price), in_stock=True)]
    return o


def test_price_outliers_by_msrp_and_by_peers():
    from app.services.catalog import comparable, price_outliers

    offers = [_offer(1, "4400"), _offer(2, "4500"), _offer(3, "4550"), _offer(4, "7999")]
    out = price_outliers(offers)
    assert set(out) == {4} and "peste prețul recomandat" in out[4]
    assert [o.id for o in comparable(offers)] == [1, 2, 3]
    # peste mediana celorlalte, chiar sub pragul MSRP
    peers = [_offer(1, "4000"), _offer(2, "4100"), _offer(3, "4050"), _offer(4, "5500", msrp="4579")]
    assert set(price_outliers(peers)) == {4}


def test_all_outliers_are_kept_so_the_page_is_not_empty():
    from app.services.catalog import comparable

    offers = [_offer(1, "7999"), _offer(2, "8200")]
    assert [o.id for o in comparable(offers)] == [1, 2]
