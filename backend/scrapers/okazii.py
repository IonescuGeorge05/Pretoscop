"""Okazii.ro — marketplace cu multe produse second hand și resigilate (vânzători profesioniști și persoane fizice).
robots.txt permite paginile de căutare (`/cautare/<termen>.html`); datele se iau din cardurile listei (titlu, preț,
„Stare:”), fără a deschide fiecare anunț. Produsele noi de la vânzătorii Okazii nu le luăm: nu știm cine le vinde
și ar intra în comparația magazinelor."""

import re
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from urllib.parse import quote_plus

from selectolax.parser import HTMLParser

from scrapers.base import BaseScraper, ScrapedOffer
from scrapers.jsonld import parse_price

SEARCHES = (
    "ps5 slim",
    "ps5 pro",
    "playstation 5",
    "nintendo switch 2",
    "xbox series x",
    "xbox series s",
    "iphone 17",
    "iphone 17 pro",
    "iphone air",
    "iphone 18 pro",
    "galaxy s26 ultra",
)

# „Stare:” din atributele cardului -> starea noastră; „nou” nu se ia (vezi docstring)
CONDITIONS = {
    "second hand": "used",
    "folosit": "used",
    "utilizat": "used",
    "resigilat": "refurbished",
    "reconditionat": "refurbished",
    "refurbished": "refurbished",
}


def _attributes(card) -> dict[str, str]:
    names = [n.text(strip=True).rstrip(":").lower() for n in card.css(".list-seo-attribute")]
    values = [v.text(strip=True).lower() for v in card.css(".list-seo-attribute-value")]
    return dict(zip(names, values))


def parse_okazii_listing(html: str) -> list[ScrapedOffer]:
    now = datetime.now(UTC)
    offers = []
    for card in HTMLParser(html).css(".item-data"):
        link = card.css_first(".item-title h2 a")
        condition = CONDITIONS.get(_attributes(card).get("stare", ""))
        if not (link and link.attributes.get("href") and condition):
            continue
        # prețul curent e ultimul din blocul de preț (primul poate fi cel tăiat, în <del>)
        prices = [
            parse_price(re.sub(r"\s+", "", s.text()).replace("Lei", ""))
            for s in card.css(".fixed-price .main-cost .prSup")
            if not s.css_first("del")
        ]
        old = card.css_first(".fixed-price .main-cost del")
        price = prices[-1] if prices else None
        if not price:
            continue  # licitații fără preț fix etc.
        old_price = parse_price(re.sub(r"\s+", "", old.text()).replace("Lei", "")) if old else None
        offers.append(
            ScrapedOffer(
                shop_slug="okazii",
                url=link.attributes["href"].split("?")[0],
                title=(link.attributes.get("title") or link.text(strip=True)).strip(),
                price=price,
                old_price=old_price if old_price and old_price > price else None,
                in_stock=True,
                ean=None,
                mpn=None,
                warranty_months=None,  # depinde de vânzător; garanția implicită a sursei (0) se aplică
                condition=condition,
                scraped_at=now,
                seller="vânzător Okazii",
            )
        )
    return offers


class OkaziiScraper(BaseScraper):
    shop_slug = "okazii"

    def discover_product_urls(self) -> Iterable[str]:
        for q in SEARCHES:
            yield f"https://www.okazii.ro/cautare/{quote_plus(q)}.html"

    def scrape(self) -> Iterator[ScrapedOffer]:
        seen: set[str] = set()
        for page in self.discover_product_urls():
            for offer in parse_okazii_listing(self.client.get(page).text):
                if offer.url not in seen:
                    seen.add(offer.url)
                    yield offer
