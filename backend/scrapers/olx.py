"""OLX.ro — anunțuri second hand. Datele se iau direct din lista de rezultate (titlu, preț, link, locație),
fără a deschide fiecare anunț: mai puține cereri, iar anunțurile oricum nu au date structurate.
Se caută după mai multe forme ale numelui (ps5, playstation 5, playstation5); duplicatele se elimină după URL.

Atenție (testat 10.2026): CloudFront răspunde 403 clientului aplicației -> magazinul ajunge `blocked`.
Nu ocolim blocarea. Până la un acord cu OLX, datele se pot aduce prin importul manual din /admin:
utilizatorul salvează în browser pagina de rezultate, iar `parse_olx_listing` o citește din fișier."""

import re
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from scrapers.base import BaseScraper, ScrapedOffer
from scrapers.jsonld import parse_price

CATEGORY_URL = "https://www.olx.ro/electronice-si-electrocasnice/laptop-calculator-gaming/playstation/"
QUERIES = ["ps5", "playstation-5", "playstation5"]  # forma din URL a căutărilor „ps5”, „playstation 5”, „playstation5”
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
        location, posted = split_location(card.css_first('[data-testid="location-date"]'))
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
                raw={"negotiable": "negociabil" in price_node.text().lower()},
                seller="persoană fizică",
                location=location,
                posted_label=posted,
            )
        )
    return offers


def split_location(node) -> tuple[str | None, str | None]:
    """„Iasi - Azi la 16:59” -> („Iasi”, „Azi la 16:59”); „Bucuresti, Sectorul 1 - 02 octombrie 2026” idem."""
    if node is None:
        return None, None
    text = node.text(strip=True)
    place, sep, when = text.rpartition(" - ")
    return (place, when) if sep else (text, None)


class OlxScraper(BaseScraper):
    shop_slug = "olx"
    pages = 2  # pagini per căutare

    def discover_product_urls(self) -> Iterable[str]:
        for q in QUERIES:
            url = f"{CATEGORY_URL}q-{q}/"
            yield url
            for n in range(2, self.pages + 1):
                yield f"{url}?page={n}"

    def scrape(self) -> Iterator[ScrapedOffer]:
        seen = set()
        for page in self.discover_product_urls():
            for offer in parse_olx_listing(page, self.client.get(page).text):
                if offer.url not in seen:
                    seen.add(offer.url)
                    yield offer
