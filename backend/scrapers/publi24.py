"""Publi24.ro — anunțuri second hand. robots.txt permite listările din categorii (doar `/anunturi/?` și
`/Search/` sunt interzise), iar site-ul răspunde clientului aplicației. Datele se iau din cardurile listei
(titlu, preț, locație, dată), fără a deschide fiecare anunț."""

import re
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime

from selectolax.parser import HTMLParser

from scrapers.base import BaseScraper, ScrapedOffer
from scrapers.jsonld import parse_price

LISTING_URL = "https://www.publi24.ro/anunturi/electronice/console-jocuri/console/"
QUERIES = ["ps5", "playstation+5", "playstation5"]


def parse_publi24_listing(html: str) -> list[ScrapedOffer]:
    now = datetime.now(UTC)
    offers = []
    for card in HTMLParser(html).css("div.article-item"):
        link = card.css_first("h2.article-title a")
        price_node = card.css_first(".article-price")
        if not (link and price_node and link.attributes.get("href")):
            continue
        m = re.search(r"([\d][\d .]*(?:,\d{1,2})?)\s*(?:RON|lei)", price_node.text(strip=True), re.I)
        if not m:
            continue  # „Schimb”, preț negociabil fără sumă etc.
        location = card.css_first(".article-location span")
        date = card.css_first(".article-date span")
        offers.append(
            ScrapedOffer(
                shop_slug="publi24",
                url=link.attributes["href"].split("?")[0],
                title=link.text(strip=True),
                price=parse_price(m.group(1)),
                old_price=None,
                in_stock=True,
                ean=None,
                mpn=None,
                warranty_months=0,  # persoane fizice: fără garanție
                condition="used",
                scraped_at=now,
                seller="persoană fizică",
                location=location.text(strip=True) if location else None,
                posted_label=date.text(strip=True) if date else None,
            )
        )
    return offers


class Publi24Scraper(BaseScraper):
    shop_slug = "publi24"
    pages = 3  # pagini per căutare (se oprește mai devreme dacă o pagină e goală)

    def discover_product_urls(self) -> Iterable[str]:
        for q in QUERIES:
            for n in range(1, self.pages + 1):
                yield f"{LISTING_URL}?q={q}" + (f"&pag={n}" if n > 1 else "")

    def scrape(self) -> Iterator[ScrapedOffer]:
        seen: set[str] = set()
        empty_query: str | None = None
        for page in self.discover_product_urls():
            query = page.split("?q=")[1].split("&")[0]
            if query == empty_query:
                continue  # căutarea asta nu mai are pagini
            offers = parse_publi24_listing(self.client.get(page).text)
            if not offers:
                empty_query = query
            for offer in offers:
                if offer.url not in seen:
                    seen.add(offer.url)
                    yield offer
