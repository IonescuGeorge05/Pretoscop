"""Recuperează prețuri din trecut din capturile Wayback Machine (archive.org) ale paginilor de produs.

    python -m app.services.wayback               # toate ofertele reale
    python -m app.services.wayback --shop evomag --limit 5

Capturile sunt rare (de obicei câteva pe an per pagină), deci dau repere, nu serii zilnice. Fiecare captură
devine un punct `origin="wayback"` valabil doar în ziua capturii (`confirmed_at = ts`): între capturi
istoricul rămâne gol, nu îl completăm prin presupuneri. Doar paginile pe care le-am găsit deja prin scraping.
"""

import argparse
import json
import logging
from datetime import UTC, datetime
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models import Offer, PricePoint, Product
from scrapers.base import BlockedError, PoliteClient
from scrapers.matcher import match_title
from scrapers.registry import REGISTRY

log = logging.getLogger("wayback")

CDX_URL = "https://web.archive.org/cdx/search/cdx"


def snapshot_timestamps(client: PoliteClient, url: str) -> list[str]:
    """Câte o captură pe zi (status 200) pentru URL-ul exact."""
    target = url.split("://", 1)[-1]
    resp = client.get(f"{CDX_URL}?url={quote(target, safe='')}&output=json&filter=statuscode:200&collapse=timestamp:8")
    rows = resp.json() if resp.text.strip() else []
    return [r[1] for r in rows[1:]]


def backfill_offer(session, offer: Offer, client: PoliteClient) -> int:
    scraper = REGISTRY[offer.shop.slug](client)
    first_scrape = min((p.ts for p in offer.price_points if p.origin == "scrape"), default=None)
    known = {p.ts.replace(tzinfo=p.ts.tzinfo or UTC) for p in offer.price_points}
    added = 0
    for stamp in snapshot_timestamps(client, offer.url):
        ts = datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=UTC)
        if (first_scrape and ts >= first_scrape) or ts in known:
            continue  # avem deja date colectate direct pentru perioada asta
        resp = client.get(f"https://web.archive.org/web/{stamp}id_/{offer.url}")
        parsed = scraper.parse_product(offer.url, resp.text)
        if parsed is None:
            continue
        # URL-urile se refolosesc uneori pentru alt produs: păstrăm captura doar dacă e același model
        result = match_title(parsed.title)
        if result.kind != "product" or result.product_slug != offer.product.slug or result.is_bundle != offer.is_bundle:
            log.info(json.dumps({"event": "wayback_mismatch", "url": offer.url, "ts": stamp, "title": parsed.title}))
            continue
        session.add(
            PricePoint(
                offer_id=offer.id,
                ts=ts,
                confirmed_at=ts,
                price=parsed.price,
                old_price=parsed.old_price,
                in_stock=parsed.in_stock,
                origin="wayback",
            )
        )
        added += 1
    session.commit()
    return added


def run(shop: str | None = None, limit: int | None = None) -> dict:
    client = PoliteClient()
    summary = {"event": "wayback_done", "offers": 0, "points_added": 0, "errors": 0}
    try:
        with SessionLocal() as session:
            stmt = (
                select(Offer)
                .join(Product)
                .where(Offer.source == "real")
                .options(selectinload(Offer.shop), selectinload(Offer.product), selectinload(Offer.price_points))
                .order_by(Offer.id)
            )
            offers = [o for o in session.scalars(stmt) if o.shop.slug in REGISTRY and (shop is None or o.shop.slug == shop)]
            for offer in offers[:limit]:
                try:
                    n = backfill_offer(session, offer, client)
                except (BlockedError, httpx.HTTPError, ValueError) as exc:
                    session.rollback()
                    summary["errors"] += 1
                    log.warning(json.dumps({"event": "wayback_error", "url": offer.url, "error": str(exc)}))
                    continue
                summary["offers"] += 1
                summary["points_added"] += n
                log.info(json.dumps({"event": "wayback_offer", "url": offer.url, "added": n}))
    finally:
        client.close()
    log.info(json.dumps(summary))
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Backfill prețuri din Wayback Machine")
    parser.add_argument("--shop")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    print(run(args.shop, args.limit))
