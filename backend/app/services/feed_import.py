"""Import de feed dintr-un fișier sau URL, pentru un magazin din shops.yaml (ex. feed trimis de magazin pe email).

    python -m app.services.feed_import --shop pcgarage --file feed.xml
    python -m app.services.feed_import --shop pcgarage --url https://.../feed.xml --no-vat

Feed-urile cu URL permanent se pun în shops.yaml (`feed: {url: ...}`) și le citește worker-ul automat.
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Shop
from app.services.scrape_runner import ingest_offers
from scrapers.base import PoliteClient
from scrapers.feeds import parse_feed

log = logging.getLogger("feed_import")


def import_feed(shop_slug: str, data: bytes, vat_included: bool = True) -> dict:
    with SessionLocal() as session:
        shop = session.scalar(select(Shop).where(Shop.slug == shop_slug))
        if shop is None:
            raise ValueError(f"Magazin inexistent: {shop_slug} (adaugă-l în shops.yaml)")
        offers = parse_feed(data, shop_slug, vat_included=vat_included)
        stats = ingest_offers(session, shop, offers)
        session.commit()
    summary = {"event": "feed_imported", "shop": shop_slug, "relevant_rows": len(offers), **stats}
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--shop", required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path)
    source.add_argument("--url")
    parser.add_argument("--no-vat", action="store_true", help="prețurile din feed sunt fără TVA")
    args = parser.parse_args()
    if args.file:
        content = args.file.read_bytes()
    else:
        client = PoliteClient(timeout=180)
        content = client.get(args.url, respect_robots=False).content  # URL primit de la magazin
        client.close()
    print(import_feed(args.shop, content, vat_included=not args.no_vat))
