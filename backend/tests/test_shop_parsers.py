"""Parserii specifici magazinelor, pe fragmente care reproduc structura reală a paginilor (10.2026)."""

import json
from decimal import Decimal

from scrapers.emag import old_price_from_page
from scrapers.flip import parse_flip_page
from scrapers.olx import parse_olx_listing


def emag_price_block(current, lowest_amount=0, lowest_visible=False, initial=None):
    lowest = json.dumps({"amount": lowest_amount, "is_visible": lowest_visible, "tooltip": "x"})
    return (
        f'"price":{{"current":{current},"is_min":false,"recommended_retail_price":{{"amount":0,"is_visible":false}},'
        f'"lowest_price_30_days":{lowest},"initial":{initial or current}}}'
    )


def test_emag_old_price_is_lowest_30_days_when_shown():
    html = emag_price_block(2999.99, lowest_amount=3399.99, lowest_visible=True, initial=3599.99)
    assert old_price_from_page(html, Decimal("2999.99")) == Decimal("3399.99")


def test_emag_old_price_falls_back_to_initial():
    html = emag_price_block(2999.99, initial=3299.99)
    assert old_price_from_page(html, Decimal("2999.99")) == Decimal("3299.99")


def test_emag_no_discount_and_other_products_ignored():
    html = emag_price_block(129.99, initial=199.99) + emag_price_block(4999.99)  # primul e alt produs din pagină
    assert old_price_from_page(html, Decimal("4999.99")) is None


def flip_item(shape, price, stock, previous=None):
    return {
        "product": {
            "naming": {"title": f"Sony PlayStation 5 Slim Digital Edition, 1 TB, White, {shape}"},
            "spec": {"shape": shape},
            "price": price,
            "previousPrice": previous or price,
            "stock": stock,
            "pdpUrl": f"https://flip.ro/magazin/sony/ps5/1/?shape={shape}",
        }
    }


def test_flip_one_offer_per_grade_with_warranty():
    data = {
        "props": {
            "pageProps": {
                "warrantyAndReturnData": {"defaultWarrantyPeriodYears": 2},
                "product": {
                    "relatedSpecs": [
                        {"name": "color", "items": [flip_item("CA_NOU", 3399.99, 0)]},
                        {
                            "name": "shape",
                            "items": [
                                flip_item("BUN", 3099.99, 2, previous=3199.99),
                                flip_item("CA_NOU", 3399.99, 0),
                            ],
                        },
                    ]
                },
            }
        }
    }
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script>'
    offers = {o.grade: o for o in parse_flip_page("u", html)}
    assert set(offers) == {"Bun", "Ca nou"}  # „Ca nou” apare de două ori în pagină, o singură ofertă
    assert offers["Bun"].price == Decimal("3099.99") and offers["Bun"].old_price == Decimal("3199.99")
    assert offers["Bun"].in_stock and not offers["Ca nou"].in_stock
    assert offers["Bun"].warranty_months == 24 and offers["Bun"].condition == "refurbished"


def olx_card(href, title, price_text):
    # nodul de preț real conține și CSS inline (emotion) după preț
    return (
        f'<div data-cy="l-card"><a href="{href}"></a><h4>{title}</h4>'
        f'<p data-testid="ad-price">{price_text}<style>.css-x{{font-size:12px;}}</style></p>'
        f'<p data-testid="location-date">Iasi - Azi la 10:00</p></div>'
    )


def test_olx_listing_cards():
    html = (
        olx_card("/d/oferta/ps5-slim-IDa.html?search_reason=x", "PS5 Slim Disc 1TB", "3 000 lei")
        + olx_card("/d/oferta/ps5-IDb.html", "Vand PS5 digital", "2 300 leiPrețul e negociabil")
        + olx_card("/d/oferta/ps5-IDc.html", "Schimb PS5 cu PC", "Schimb")
    )
    offers = parse_olx_listing("https://www.olx.ro/lista/", html)
    assert [o.url for o in offers] == ["https://www.olx.ro/d/oferta/ps5-slim-IDa.html", "https://www.olx.ro/d/oferta/ps5-IDb.html"]
    assert [o.price for o in offers] == [Decimal("3000.00"), Decimal("2300.00")]
    assert offers[1].raw["negotiable"] is True
    assert (offers[0].location, offers[0].posted_label) == ("Iasi", "Azi la 10:00")
    assert all(o.condition == "used" and o.warranty_months == 0 for o in offers)


def test_olx_location_split_keeps_sector():
    from selectolax.parser import HTMLParser

    from scrapers.olx import split_location

    node = HTMLParser('<p data-testid="location-date">Bucuresti, Sectorul 1 - 02 octombrie 2026</p>').css_first("p")
    assert split_location(node) == ("Bucuresti, Sectorul 1", "02 octombrie 2026")
    assert split_location(None) == (None, None)


def test_olx_searches_all_name_variants():
    from scrapers.olx import OlxScraper

    urls = list(OlxScraper(None).discover_product_urls())
    for q in ("q-ps5/", "q-playstation-5/", "q-playstation5/"):
        assert any(u.endswith(q) for u in urls)


def test_publi24_cards():
    from scrapers.publi24 import parse_publi24_listing

    def card(href, title, price, loc, date):
        return (
            f'<div class="article-item"><h2 class="article-title"><a href="{href}"> {title} </a></h2>'
            f'<p class="article-location"><i></i><span>{loc}</span></p><p class="article-date"><i></i><span>{date}</span></p>'
            f'<div class="article-info"><span class="article-lbl"><span class="article-price">{price}</span></span></div></div>'
        )

    html = card("https://www.publi24.ro/anunturi/x/anunt/ps5/abc.html", "Vând PS5 Slim Digital", "2 699 RON", "Campina, Prahova", "20 octombrie") + card(
        "https://www.publi24.ro/anunturi/x/anunt/b/def.html", "Schimb PS5", "Schimb", "Iasi, Iasi", "azi 10:00"
    )
    offers = parse_publi24_listing(html)
    assert len(offers) == 1
    o = offers[0]
    assert (o.price, o.location, o.posted_label, o.condition) == (Decimal("2699.00"), "Campina, Prahova", "20 octombrie", "used")
