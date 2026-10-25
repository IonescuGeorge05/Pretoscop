from collections.abc import Iterable

from scrapers.base import BaseScraper
from scrapers.util import ps5_link


class AltexScraper(BaseScraper):
    """Altex refuză conexiunile non-browser (testat 10.2026) -> va fi marcat `blocked`.
    Lista e randată client-side, deci ar cere Playwright; nu încercăm să ocolim protecțiile."""

    shop_slug = "altex"
    listing_urls = ["https://altex.ro/cauta/?q=consola%20playstation%205"]

    def discover_product_urls(self) -> Iterable[str]:
        for page in self.listing_urls:
            yield from (u for u in self.links(page, 'a[href*="/cpd/"]') if ps5_link(u))
