"""Căutare web (Brave): anunțuri OLX din rezultate și apelul API, cu răspunsuri simulate."""

from datetime import UTC, datetime
from decimal import Decimal

import httpx

from app.services import web_search
from app.services.web_search import _domain, brave_search, olx_offers_from_results

NOW = datetime(2026, 10, 26, tzinfo=UTC)

RESULTS = [
    {  # pagină de căutare OLX, nu anunț -> ignorată
        "title": "ps5 slim de vanzare • Anunturi • OLX.ro",
        "url": "https://www.olx.ro/oferte/q-ps5-slim/",
        "description": "Peste 500 de anunțuri, de la 1 500 lei",
    },
    {  # anunț cu preț în fragment, termenii marcați cu <strong>
        "title": "Vând <strong>PlayStation 5 Slim Digital</strong> Edition 1TB - OLX.ro",
        "url": "https://www.olx.ro/d/oferta/vand-playstation-5-slim-digital-IDkHPnX.html?reason=x",
        "description": "Stare impecabilă, garanție. <strong>1 700 lei</strong> Negociabil",
        "page_age": "2026-10-20T10:00:00",
    },
    {  # anunț fără preț -> ignorat
        "title": "iPhone 18 Pro 256GB sigilat",
        "url": "https://www.olx.ro/d/oferta/iphone-18-pro-IDa.html",
        "description": "Sigilat, factură.",
    },
    {  # anunț prea vechi (probabil vândut) -> ignorat
        "title": "PS5 Pro 2TB",
        "url": "https://www.olx.ro/d/oferta/ps5-pro-IDb.html",
        "description": "3 500 lei",
        "page_age": "2026-08-01T10:00:00",
    },
    {  # preț în extra_snippets
        "title": "iPhone 18 Pro Max 512GB • OLX.ro",
        "url": "https://www.olx.ro/d/oferta/iphone-18-pro-max-IDc.html",
        "description": "Ca nou, cutie",
        "extra_snippets": ["Preț: 8 400 lei", "Cluj-Napoca"],
    },
]


def test_olx_offers_only_individual_recent_ads_with_price():
    offers = {o.url: o for o in olx_offers_from_results(RESULTS, now=NOW)}
    assert set(offers) == {
        "https://www.olx.ro/d/oferta/vand-playstation-5-slim-digital-IDkHPnX.html",
        "https://www.olx.ro/d/oferta/iphone-18-pro-max-IDc.html",
    }
    ps5 = offers["https://www.olx.ro/d/oferta/vand-playstation-5-slim-digital-IDkHPnX.html"]
    assert ps5.title == "Vând PlayStation 5 Slim Digital Edition 1TB"  # fără <strong> și fără sufixul OLX
    assert ps5.price == Decimal("1700.00") and ps5.condition == "used"
    assert ps5.posted_label == "găsit prin căutare (20.10.2026)"
    assert offers["https://www.olx.ro/d/oferta/iphone-18-pro-max-IDc.html"].price == Decimal("8400.00")


def test_brave_request_uses_key_and_romania(monkeypatch):
    monkeypatch.setattr(web_search.settings, "brave_api_key", "test-key")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["token"] = request.headers.get("X-Subscription-Token")
        seen["params"] = dict(request.url.params)
        return httpx.Response(200, json={"web": {"results": [{"title": "x", "url": "https://shop.ro/p"}]}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        results = brave_search("iPhone 18 Pro 256GB pret", client)
    assert results == [{"title": "x", "url": "https://shop.ro/p"}]
    assert seen["token"] == "test-key"
    assert seen["params"]["country"] == "ALL" and seen["params"]["search_lang"] == "ro" and seen["params"]["q"] == "iPhone 18 Pro 256GB pret"


def test_domain_normalization():
    assert _domain("https://www.buy2play.ro/products/x") == "buy2play.ro"
    assert _domain("https://gsmnet.ro/iphone") == "gsmnet.ro"
