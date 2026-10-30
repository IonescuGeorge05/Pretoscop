from collections.abc import Iterable

from scrapers.base import BaseScraper
from scrapers.util import galaxy_link, iphone17_link, iphone18pro_link, ps5_link, switch2_link, xbox_link


class EvomagScraper(BaseScraper):
    shop_slug = "evomag"
    listings = [
        ("https://www.evomag.ro/componente-pc-gaming-gaming-console/sony/", ps5_link),
        ("https://www.evomag.ro/telefoane-tablete-accesorii-telefoane/apple/", lambda u: iphone18pro_link(u) or iphone17_link(u)),
        ("https://www.evomag.ro/componente-pc-gaming-gaming-console/nintendo/", switch2_link),
        ("https://www.evomag.ro/componente-pc-gaming-gaming-console/microsoft/", xbox_link),
        ("https://www.evomag.ro/telefoane-tablete-accesorii-telefoane/samsung/", galaxy_link),
    ]
    # prețul curent vine din microdata; prețul tăiat apare doar vizual în blocul de preț.
    # TODO verify pe un produs redus (la testare, 10.2026, niciun PS5 nu avea reducere).
    css_old_price = ".price_ajax .tw-line-through"

    def discover_product_urls(self) -> Iterable[str]:
        for page, keep in self.listings:
            yield from (u for u in self.links(page, ".npi_image a[href]") if keep(u))
