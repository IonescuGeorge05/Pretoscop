"""Magazin cu feed: în loc să deschidă pagini, descarcă feed-ul configurat în shops.yaml (`feed:`)."""

import json
import logging
from collections.abc import Iterator

from scrapers.base import BaseScraper, PoliteClient, ScrapedOffer
from scrapers.feeds import parse_feed

log = logging.getLogger("scrapers")


class FeedScraper(BaseScraper):
    def __init__(self, client: PoliteClient, shop_slug: str, feed: dict):
        super().__init__(client)
        self.shop_slug = shop_slug
        self.feed = feed

    def discover_product_urls(self):  # nu se folosește: totul vine din feed
        return []

    def scrape(self) -> Iterator[ScrapedOffer]:
        # feed-ul ne-a fost dat de magazin -> permisiune explicită, robots.txt nu se aplică acestui URL
        resp = self.client.get(self.feed["url"], respect_robots=not self.feed.get("explicit_permission", True))
        offers = parse_feed(resp.content, self.shop_slug, vat_included=self.feed.get("vat_included", True))
        log.info(json.dumps({"event": "feed_parsed", "shop": self.shop_slug, "bytes": len(resp.content), "offers": len(offers)}))
        yield from offers
