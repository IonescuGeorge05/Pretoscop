from collections.abc import Iterable

from scrapers.base import BaseScraper
from scrapers.util import ps5_link


class EmagScraper(BaseScraper):
    shop_slug = "emag"
    listing_urls = ["https://www.emag.ro/search/consola+playstation+5"]

    def discover_product_urls(self) -> Iterable[str]:
        for page in self.listing_urls:
            yield from (
                u for u in self.links(page, 'a[href*="/pd/"]') if "consola" in u.lower() and ps5_link(u)
            )
