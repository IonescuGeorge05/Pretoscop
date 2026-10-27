"""Rulează scraperul unui magazin: izolat (o eroare nu afectează alte magazine), cu log structurat."""

import json
import logging
import time
from collections import Counter
from collections.abc import Iterable
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import ManualMatch, Product, Shop
from app.services.ingest import record_offer, record_unmatched
from scrapers.base import BlockedError, PoliteClient, RobotsDisallowed, ScrapedOffer
from scrapers.feed_scraper import FeedScraper
from scrapers.sitemap_scraper import SitemapScraper
from scrapers.matcher import ProductRef, match, title_condition
from scrapers.registry import REGISTRY

log = logging.getLogger("scrape")


def scraper_for(shop: Shop, client: PoliteClient):
    """Feed-ul configurat are prioritate față de scraperul de pagini (date oferite chiar de magazin)."""
    if shop.feed and shop.feed.get("url"):
        return FeedScraper(client, shop.slug, shop.feed)
    if shop.crawl and shop.crawl.get("type") == "sitemap":
        return SitemapScraper(client, shop.slug, shop.base_url, shop.crawl)
    return REGISTRY[shop.slug](client)


def scrape_shop(session: Session, shop: Shop, client: PoliteClient) -> Counter:
    return ingest_offers(session, shop, scraper_for(shop, client).scrape())


def ingest_offers(session: Session, shop: Shop, scraped_offers: Iterable[ScrapedOffer]) -> Counter:
    """Asociere + salvare pentru anunțuri colectate (automat de scraper sau importate manual din /admin)."""
    products = {p.slug: p for p in session.scalars(select(Product))}
    by_id = {p.id: p for p in products.values()}
    refs = [ProductRef(p.slug, p.ean, p.model_code) for p in products.values()]
    manual = {m.url: m for m in session.scalars(select(ManualMatch).where(ManualMatch.shop_id == shop.id))}
    allow_used = shop.kind in ("secondhand", "refurbished")
    stats: Counter = Counter()
    for scraped in scraped_offers:
        stats["listings"] += 1
        # magazine mixte (ex. Buy2Play): produsele „Second-Hand SH” / „resigilat” merg la secțiunea potrivită,
        # chiar dacă datele structurate ale paginii le declară „noi”
        item_allow_used = allow_used
        if shop.kind == "retail" and scraped.condition == "new" and (cond := title_condition(scraped.title)):
            scraped.condition = cond
            item_allow_used = True
        # o asociere făcută de mână în pagina de admin are prioritate față de reguli
        if (m := manual.get(scraped.url)) is not None:
            if m.ignored:
                stats["ignored_manual"] += 1
            else:
                _, changed = record_offer(session, shop, by_id[m.product_id], scraped, m.is_bundle)
                stats["matched_manual"] += 1
                stats["price_points_written"] += int(changed)
            continue
        title_for_match = f"{scraped.title} {scraped.match_hints}".strip()
        result = match(title_for_match, refs, scraped.ean, scraped.mpn, scraped.condition, item_allow_used)
        if result.kind == "product":
            _, changed = record_offer(session, shop, products[result.product_slug], scraped, result.is_bundle)
            stats["bundles" if result.is_bundle else "matched"] += 1
            stats["price_points_written"] += int(changed)
        elif result.kind == "unmatched":
            record_unmatched(session, shop, scraped, result.reason)
            stats["unmatched"] += 1
        else:
            stats[result.kind] += 1
        refs = [ProductRef(p.slug, p.ean, p.model_code) for p in products.values()]  # EAN-uri noi
    return stats


def run_shop(slug: str, skip_blocked: bool = False) -> dict:
    started = time.monotonic()
    summary: dict = {"event": "scrape_done", "shop": slug}
    with SessionLocal() as session:
        shop = session.scalar(select(Shop).where(Shop.slug == slug))
        if shop is None or (slug not in REGISTRY and not (shop.feed and shop.feed.get("url")) and not shop.crawl):
            summary["status"] = "no_scraper"
        elif skip_blocked and shop.status == "blocked":
            summary["status"] = "skipped_blocked"
        else:
            client = PoliteClient(timeout=180) if shop.feed else PoliteClient()  # feed-urile pot fi mari
            try:
                summary.update(scrape_shop(session, shop, client))
                shop.status, shop.status_reason = "active", None
                summary["status"] = "ok"
            except (BlockedError, RobotsDisallowed, httpx.TransportError) as exc:
                shop.status, shop.status_reason = "blocked", f"{type(exc).__name__}: {exc}"
                summary["status"] = "blocked"
                summary["reason"] = shop.status_reason
            except Exception as exc:  # izolare: nu oprim celelalte magazine
                log.exception("scraper %s a eșuat", slug)
                session.rollback()
                summary["status"] = "error"
                summary["reason"] = repr(exc)
            finally:
                client.close()
                shop.last_scraped_at = datetime.now(UTC)
                session.commit()
    summary["duration_s"] = round(time.monotonic() - started, 1)
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


def run_all(skip_blocked: bool = False) -> list[dict]:
    return [run_shop(slug, skip_blocked) for slug in REGISTRY]


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Rulează scraperii (fără scheduler)")
    parser.add_argument("--shop", help="slug magazin; implicit toate")
    args = parser.parse_args()
    print(run_shop(args.shop) if args.shop else run_all())
