from collections.abc import Iterable

from scrapers.base import BaseScraper
from scrapers.util import ps5_link


class EvomagScraper(BaseScraper):
    shop_slug = "evomag"
    listing_urls = ["https://www.evomag.ro/componente-pc-gaming-gaming-console/sony/"]
    # prețul curent vine din microdata; prețul tăiat apare doar vizual în blocul de preț.
    # TODO verify pe un produs redus (la testare, 10.2026, niciun PS5 nu avea reducere).
    css_old_price = ".price_ajax .tw-line-through"

    def discover_product_urls(self) -> Iterable[str]:
        for page in self.listing_urls:
            yield from (u for u in self.links(page, ".npi_image a[href]") if ps5_link(u))
