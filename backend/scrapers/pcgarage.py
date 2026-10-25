from collections.abc import Iterable

from scrapers.base import BaseScraper
from scrapers.util import ps5_link


class PcGarageScraper(BaseScraper):
    shop_slug = "pcgarage"
    listing_urls = ["https://www.pcgarage.ro/console-jocuri/sony/"]

    def discover_product_urls(self) -> Iterable[str]:
        for page in self.listing_urls:
            yield from (u for u in self.links(page, ".product_box_name a[href]") if ps5_link(u))
