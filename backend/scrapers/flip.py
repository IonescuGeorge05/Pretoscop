"""Flip.ro — console refurbished. O pagină de model conține toate gradele estetice (Bun / Foarte bun /
Excelent / Ca nou), fiecare cu preț și stoc, în JSON-ul `__NEXT_DATA__`; fiecare grad devine o ofertă."""

import json
import re
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from decimal import Decimal

from selectolax.parser import HTMLParser

from scrapers.base import BaseScraper, ScrapedOffer

GRADES = {"BUN": "Bun", "FOARTE_BUN": "Foarte bun", "EXCELENT": "Excelent", "CA_NOU": "Ca nou", "UZAT": "Uzat"}


def parse_flip_page(url: str, html: str) -> list[ScrapedOffer]:
    node = HTMLParser(html).css_first("script#__NEXT_DATA__")
    if node is None:
        return []
    props = json.loads(node.text())["props"]["pageProps"]
    warranty = props.get("warrantyAndReturnData", {}).get("defaultWarrantyPeriodYears")
    now = datetime.now(UTC)
    seen: dict[str, ScrapedOffer] = {}
    for spec in props.get("product", {}).get("relatedSpecs", []):
        for item in spec.get("items", []):
            p = item.get("product") or {}
            grade = GRADES.get((p.get("spec") or {}).get("shape", ""))
            if not grade or not p.get("pdpUrl") or p.get("price") is None:
                continue
            price = Decimal(str(p["price"])).quantize(Decimal("0.01"))
            previous = Decimal(str(p.get("previousPrice") or 0)).quantize(Decimal("0.01"))
            seen[p["pdpUrl"]] = ScrapedOffer(
                shop_slug="flip",
                url=p["pdpUrl"],
                title=(p.get("naming") or {}).get("title") or url,
                price=price,
                old_price=previous if previous > price else None,
                in_stock=(p.get("stock") or 0) > 0,
                ean=None,
                mpn=None,
                warranty_months=int(warranty) * 12 if warranty else None,
                condition="refurbished",
                scraped_at=now,
                raw={"flip_id": p.get("id"), "retail_price": p.get("retailPrice")},
                seller="Flip",
                grade=grade,
            )
    return list(seen.values())


class FlipScraper(BaseScraper):
    shop_slug = "flip"
    sitemap_url = "https://flip.ro/sitemap.xml"  # căutarea (?search=) e interzisă în robots.txt

    def discover_product_urls(self) -> Iterable[str]:
        xml = self.client.get(self.sitemap_url).text
        for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
            if "/magazin/" in loc and "playstation-5" in loc:
                yield loc

    def scrape(self) -> Iterator[ScrapedOffer]:
        for url in list(self.discover_product_urls())[: self.max_products]:
            resp = self.client.get(url)
            yield from parse_flip_page(str(resp.url), resp.text)
