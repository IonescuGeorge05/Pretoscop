"""OLX.ro — anunțuri second hand. Datele se iau direct din lista de rezultate (titlu, preț, link),
fără a deschide fiecare anunț: mai puține cereri, iar anunțurile oricum nu au date structurate.

Atenție (testat 10.2026): CloudFront răspunde 403 clientului aplicației -> magazinul ajunge `blocked`.
Nu ocolim blocarea; parserul e gata pentru momentul în care avem acces (ex. acord cu OLX)."""

import re
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from scrapers.base import BaseScraper, ScrapedOffer
from scrapers.jsonld import parse_price

LISTING_URL = "https://www.olx.ro/electronice-si-electrocasnice/laptop-calculator-gaming/playstation/q-playstation-5/"
PRICE_RE = re.compile(r"([\d][\d .]*(?:,\d{1,2})?)\s*lei", re.I)


def parse_olx_listing(page_url: str, html: str) -> list[ScrapedOffer]:
    now = datetime.now(UTC)
    offers = []
    for card in HTMLParser(html).css('div[data-cy="l-card"]'):
        link = card.css_first("a[href]")
        title = card.css_first("h4") or card.css_first("h6")
        price_node = card.css_first('[data-testid="ad-price"]')
        if not (link and title and price_node):
            continue
        # nodul de preț conține și CSS inline; luăm doar primul „<număr> lei”
        m = PRICE_RE.search(price_node.text(separator=" "))
        if not m:
            continue  # „Schimb”, „Gratuit” etc.
        location = card.css_first('[data-testid="location-date"]')
        offers.append(
            ScrapedOffer(
                shop_slug="olx",
                url=urljoin(page_url, link.attributes["href"]).split("?")[0],
                title=title.text(strip=True),
                price=parse_price(m.group(1)),
                old_price=None,
                in_stock=True,
                ean=None,
                mpn=None,
                warranty_months=0,  # persoane fizice: fără garanție
                condition="used",
                scraped_at=now,
                raw={
                    "negotiable": "negociabil" in price_node.text().lower(),
                    "location": location.text(strip=True) if location else None,
                },
                seller="persoană fizică",
            )
        )
    return offers


class OlxScraper(BaseScraper):
    shop_slug = "olx"
    pages = 3

    def discover_product_urls(self) -> Iterable[str]:
        yield LISTING_URL
        for n in range(2, self.pages + 1):
            yield f"{LISTING_URL}?page={n}"

    def scrape(self) -> Iterator[ScrapedOffer]:
        seen = set()
        for page in self.discover_product_urls():
            for offer in parse_olx_listing(page, self.client.get(page).text):
                if offer.url not in seen:
                    seen.add(offer.url)
                    yield offer
