"""Căutare web prin Brave Search API (oficial; nu accesăm direct site-urile căutate).

Două utilizări:
1. Anunțuri OLX: motorul de căutare are voie pe OLX și ne dă link + titlu + fragment (uneori cu preț).
   E un supliment: rezultatele pot fi vechi și incomplete; sursa principală pentru OLX sunt alertele pe email.
2. Descoperire de magazine: căutări gen „iPhone 18 Pro 256GB preț” -> domenii noi, verificate apoi automat
   (robots.txt, sitemap, date structurate) și listate în /admin.

Necesită BRAVE_API_KEY în .env (https://brave.com/search/api/). Bugetul de căutări e limitat (QUERY_BUDGET).
"""

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import DiscoveredShop, Shop
from app.services.scrape_runner import ingest_offers
from scrapers.base import ScrapedOffer
from scrapers.jsonld import parse_price

log = logging.getLogger("web_search")

BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"
PRICE_RE = re.compile(r"([\d][\d .]*(?:,\d{1,2})?)\s*(?:lei|ron)\b", re.I)
MAX_RESULT_AGE = timedelta(days=30)  # anunțuri mai vechi sunt probabil vândute

OLX_QUERIES = [
    "site:olx.ro ps5 slim",
    "site:olx.ro playstation 5 consola",
    "site:olx.ro ps5 pro",
    "site:olx.ro iphone 18 pro",
    "site:olx.ro iphone 18 pro max",
]
DISCOVERY_QUERIES = [
    "consola PlayStation 5 Slim Digital pret",
    "consola PS5 Pro pret magazin",
    "iPhone 18 Pro 256GB pret",
    "iPhone 18 Pro Max 256GB pret",
]
# domenii care nu sunt magazine (comparatoare, presă, forumuri, social, anunțuri deja acoperite)
NOT_SHOPS = {
    "olx.ro", "publi24.ro", "compari.ro", "price.ro", "pricy.ro", "google.com", "youtube.com", "facebook.com",
    "instagram.com", "tiktok.com", "reddit.com", "wikipedia.org", "mobilissimo.ro", "playtech.ro", "go4it.ro",
    "playstation.com", "apple.com", "sony.ro", "okazii.ro", "lajumate.ro", "vinted.ro", "x.com", "twitter.com",
}


def _domain(url: str) -> str:
    host = urlsplit(url).netloc.lower()
    return host.removeprefix("www.")


def brave_search(query: str, client: httpx.Client | None = None, count: int = 20) -> list[dict]:
    """Rezultatele web pentru o căutare, limitate la România."""
    own = client is None
    client = client or httpx.Client(timeout=30)
    try:
        resp = client.get(
            BRAVE_URL,
            params={"q": query, "country": "RO", "search_lang": "ro", "count": count, "extra_snippets": "true"},
            headers={"Accept": "application/json", "X-Subscription-Token": settings.brave_api_key},
        )
        resp.raise_for_status()
        return resp.json().get("web", {}).get("results", [])
    finally:
        if own:
            client.close()


def _result_date(r: dict) -> datetime | None:
    value = r.get("page_age")
    try:
        return datetime.fromisoformat(value).replace(tzinfo=UTC) if value else None
    except ValueError:
        return None


def olx_offers_from_results(results: list[dict], now: datetime | None = None) -> list[ScrapedOffer]:
    """Doar anunțuri individuale (/d/oferta/) cu un preț în titlu sau fragmente, nu mai vechi de MAX_RESULT_AGE."""
    now = now or datetime.now(UTC)
    offers: dict[str, ScrapedOffer] = {}
    for r in results:
        url = (r.get("url") or "").split("?")[0]
        if "olx.ro/d/oferta/" not in url or url in offers:
            continue
        seen = _result_date(r)
        if seen and now - seen > MAX_RESULT_AGE:
            continue
        text = " ".join([r.get("title") or "", r.get("description") or "", *(r.get("extra_snippets") or [])])
        text = re.sub(r"<[^>]+>", "", text)  # Brave marchează termenii cu <strong>
        m = PRICE_RE.search(text)
        price = parse_price(m.group(1)) if m else None
        if not price:
            continue
        title = re.sub(r"\s*[-•|]\s*OLX\.ro.*$", "", re.sub(r"<[^>]+>", "", r.get("title") or "")).strip()
        offers[url] = ScrapedOffer(
            shop_slug="olx",
            url=url,
            title=title,
            price=price,
            old_price=None,
            in_stock=True,
            ean=None,
            mpn=None,
            warranty_months=0,
            condition="used",
            scraped_at=now,
            raw={"source": "search"},
            seller="persoană fizică",
            posted_label=f"găsit prin căutare ({seen:%d.%m.%Y})" if seen else "găsit prin căutare",
        )
    return list(offers.values())


def run_olx_search() -> dict:
    if not settings.brave_api_key:
        return {"status": "not_configured"}
    with httpx.Client(timeout=30) as client:
        results = [r for q in OLX_QUERIES for r in brave_search(q, client)]
    offers = olx_offers_from_results(results)
    with SessionLocal() as session:
        shop = session.scalar(select(Shop).where(Shop.slug == "olx"))
        stats = ingest_offers(session, shop, offers)
        session.commit()
    summary = {"event": "olx_search_done", "queries": len(OLX_QUERIES), "results": len(results), "offers": len(offers), **stats}
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


def known_domains(session) -> set[str]:
    return {_domain(s.base_url) for s in session.scalars(select(Shop))} | NOT_SHOPS


def run_discovery() -> dict:
    """Domenii .ro noi care apar la căutările de produse -> tabelul discovered_shops."""
    if not settings.brave_api_key:
        return {"status": "not_configured"}
    now = datetime.now(UTC)
    found = 0
    with httpx.Client(timeout=30) as client, SessionLocal() as session:
        skip = known_domains(session)
        for q in DISCOVERY_QUERIES:
            for r in brave_search(q, client):
                url = r.get("url") or ""
                domain = _domain(url)
                if not domain.endswith(".ro") or domain in skip:
                    continue
                row = session.scalar(select(DiscoveredShop).where(DiscoveredShop.domain == domain))
                if row is None:
                    row = DiscoveredShop(domain=domain, example_url=url, example_title=r.get("title"), query=q,
                                         first_seen=now, last_seen=now, hits=0)
                    session.add(row)
                    found += 1
                row.hits += 1
                row.last_seen = now
                session.flush()
        session.commit()
    summary = {"event": "discovery_done", "queries": len(DISCOVERY_QUERIES), "new_domains": found}
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("what", choices=["olx", "discovery"])
    args = parser.parse_args()
    print(run_olx_search() if args.what == "olx" else run_discovery())
