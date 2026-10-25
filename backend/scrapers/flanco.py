from collections.abc import Iterable

from scrapers.base import BaseScraper


class FlancoScraper(BaseScraper):
    shop_slug = "flanco"
    listing_urls = ["https://www.flanco.ro/gaming/console-hardware/playstation-5.html"]
    css_title = "h1.page-title"
    css_price = ".product-info-main .special-price .price, .product-info-main .price"
    css_old_price = ".product-info-main .old-price .price"

    def discover_product_urls(self) -> Iterable[str]:
        for page in self.listing_urls:
            yield from (u for u in self.links(page, "a.product-item-link") if "consola" in u.lower())
