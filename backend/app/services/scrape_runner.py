"""Rulează scraperul unui magazin: izolat (o eroare nu afectează alte magazine), cu log structurat."""

import json
import logging
import time
from collections import Counter
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Product, Shop
from app.services.ingest import record_offer, record_unmatched
from scrapers.base import BlockedError, PoliteClient, RobotsDisallowed
from scrapers.matcher import ProductRef, match
from scrapers.registry import REGISTRY

log = logging.getLogger("scrape")


def scrape_shop(session: Session, shop: Shop, client: PoliteClient) -> Counter:
    products = {p.slug: p for p in session.scalars(select(Product))}
    refs = [ProductRef(p.slug, p.ean, p.model_code) for p in products.values()]
    stats: Counter = Counter()
    for scraped in REGISTRY[shop.slug](client).scrape():
        stats["listings"] += 1
        result = match(scraped.title, refs, scraped.ean, scraped.mpn, scraped.condition)
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
        if shop is None or slug not in REGISTRY:
            summary["status"] = "no_scraper"
        elif skip_blocked and shop.status == "blocked":
            summary["status"] = "skipped_blocked"
        else:
            client = PoliteClient()
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
