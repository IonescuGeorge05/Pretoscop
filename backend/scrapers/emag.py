import json
import re
from collections.abc import Iterable
from decimal import Decimal

from scrapers.base import BaseScraper, ScrapedOffer
from scrapers.util import iphone18pro_link, ps5_link

# obiectul de preț din pagină: {"current":4999.99, ..., "lowest_price_30_days":{"amount":..,"is_visible":..}, "initial":..}
PRICE_BLOCK_RE = re.compile(r'"price":\{"current":([\d.]+).*?"lowest_price_30_days":(\{[^}]*\}),"initial":([\d.]+)\}')


def old_price_from_page(html: str, current: Decimal) -> Decimal | None:
    """Prețul tăiat afișat de eMAG. Conform directivei Omnibus, când există o reducere eMAG taie
    cel mai mic preț din ultimele 30 de zile (`lowest_price_30_days`); altfel prețul inițial."""
    for m in PRICE_BLOCK_RE.finditer(html):
        if Decimal(m.group(1)) != current:
            continue  # alte oferte/produse din pagină
        lowest = json.loads(m.group(2))
        if lowest.get("is_visible") and Decimal(str(lowest.get("amount") or 0)) > current:
            return Decimal(str(lowest["amount"])).quantize(Decimal("0.01"))
        initial = Decimal(m.group(3))
        return initial.quantize(Decimal("0.01")) if initial > current else None
    return None


class EmagScraper(BaseScraper):
    shop_slug = "emag"
    # (pagina de căutare, filtrul pe URL-ul produsului) per familie
    listings = [
        ("https://www.emag.ro/search/consola+playstation+5", lambda u: "consola" in u.lower() and ps5_link(u)),
        ("https://www.emag.ro/search/iphone+18+pro", lambda u: "telefon-mobil" in u.lower() and iphone18pro_link(u)),
    ]

    def discover_product_urls(self) -> Iterable[str]:
        for page, keep in self.listings:
            yield from (u for u in self.links(page, 'a[href*="/pd/"]') if keep(u))

    def parse_product(self, url: str, html: str) -> ScrapedOffer | None:
        offer = super().parse_product(url, html)
        if offer is not None:
            offer.old_price = old_price_from_page(html, offer.price) or offer.old_price
        return offer
