from decimal import Decimal

from app.models import Product
from app.services.manual_import import build_rows, pick_prices

SLIM = Product(slug="ps5-slim-digital-1tb", family="PlayStation 5", name="PS5 Slim Digital 1TB", edition="digital",
               storage_gb=1000, msrp_ron=Decimal("3209"))
PRODUCTS = {SLIM.slug: SLIM}


def test_pick_prices_ignores_installments_and_takes_crossed_price():
    # card tipic: preț vechi, preț nou, „de la 199 lei/lună”, transport
    assert pick_prices(["2.599,99 Lei", "2.299,99 Lei", "199 lei/lună", "19,99 lei"], Decimal("3209")) == (
        Decimal("2299.99"), Decimal("2599.99"))
    assert pick_prices(["2.299,99 Lei"], Decimal("3209")) == (Decimal("2299.99"), None)
    assert pick_prices(["99,99 Lei"], Decimal("3209")) == (None, None)  # accesoriu / rată, nu consola


def test_build_rows_matches_titles_and_leaves_unclear_unselected():
    rows = build_rows(
        [
            {"title": "Consola PlayStation 5 Slim Digital Edition, 1TB, D-Chassis", "url": "/consola-ps5/pd/X1/",
             "prices": ["3.199,99 Lei", "2.899,99 Lei"], "context": "în stoc"},
            {"title": "Controller DualSense pentru PS5", "url": "/dualsense/pd/X2/", "prices": ["349,99 Lei"]},
            {"title": "Consola PlayStation 5 Slim Digital Edition, 1TB, D-Chassis", "url": "/consola-ps5-2/pd/X3/",
             "prices": ["2.999,99 Lei"], "context": "Stoc epuizat"},
        ],
        PRODUCTS, None, "https://www.emag.ro",
    )
    ok = [r for r in rows if r.selected]
    assert [(r.product_slug, r.price, r.old_price, r.url) for r in ok] == [
        ("ps5-slim-digital-1tb", Decimal("2899.99"), Decimal("3199.99"), "https://www.emag.ro/consola-ps5/pd/X1/"),
        ("ps5-slim-digital-1tb", Decimal("2999.99"), None, "https://www.emag.ro/consola-ps5-2/pd/X3/"),
    ]
    assert ok[1].in_stock is False
    assert [r.selected for r in rows if r.product_slug is None] == [False]  # controllerul
