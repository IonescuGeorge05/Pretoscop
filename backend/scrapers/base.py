"""Interfața comună a scraperilor + client HTTP politicos (robots.txt, rate limit, retry, detecție blocare)."""

import json
import logging
import random
import time
from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.parser import HTMLParser

from app.config import settings
from scrapers import jsonld
from scrapers.robots import Robots

log = logging.getLogger("scrapers")


@dataclass
class ScrapedOffer:
    shop_slug: str
    url: str
    title: str
    price: Decimal  # prețul curent în RON
    old_price: Decimal | None  # prețul "tăiat" afișat de magazin
    in_stock: bool
    ean: str | None
    mpn: str | None
    warranty_months: int | None
    condition: str  # "new" | "refurbished" | ...
    scraped_at: datetime
    raw: dict = field(default_factory=dict)
    seller: str | None = None  # vânzătorul efectiv (marketplace); None = magazinul însuși
    grade: str | None = None  # gradul estetic la refurbished
    location: str | None = None  # second hand: orașul din anunț
    posted_label: str | None = None  # second hand: data afișată în anunț


class BlockedError(Exception):
    """Magazinul ne blochează (403 / Cloudflare / CAPTCHA). Nu încercăm să ocolim."""


class RobotsDisallowed(Exception):
    pass


def agent_token() -> str:
    """Numele robotului, cum apare în `User-agent:` din robots.txt."""
    return f"{settings.app_name}Bot"


def user_agent() -> str:
    return f"{agent_token()}/0.1 (+price comparison prototype; contact: {settings.scraper_contact})"


BLOCK_MARKERS = ("captcha", "cf-challenge", "challenge-platform", "attention required", "access denied")


class PoliteClient:
    def __init__(
        self,
        min_delay: float = 3.0,
        max_delay: float = 5.0,
        timeout: float = 20.0,
        retries: int = 3,
        transport: httpx.BaseTransport | None = None,
    ):
        self.min_delay, self.max_delay, self.retries = min_delay, max_delay, retries
        self.http = httpx.Client(
            headers={"User-Agent": user_agent(), "Accept-Language": "ro-RO,ro;q=0.9"},
            timeout=timeout,
            follow_redirects=True,
            transport=transport,
        )
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, Robots] = {}

    def close(self) -> None:
        self.http.close()

    def _wait(self, domain: str) -> None:
        last = self._last_request.get(domain)
        if last is not None:
            delay = random.uniform(self.min_delay, self.max_delay) - (time.monotonic() - last)
            if delay > 0:
                time.sleep(delay)
        self._last_request[domain] = time.monotonic()

    def _robots_for(self, url: str) -> Robots:
        parts = urlparse(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            self._wait(parts.netloc)
            try:
                resp = self.http.get(origin + "/robots.txt")
                if resp.status_code in (401, 403):
                    robots = Robots(disallow_all=True)
                elif resp.status_code >= 400:
                    robots = Robots(allow_all=True)  # RFC 9309: robots.txt lipsă = totul permis
                else:
                    robots = Robots(resp.text)
            except httpx.HTTPError:
                robots = Robots(disallow_all=True)  # fără robots.txt lizibil nu riscăm
            self._robots[origin] = robots
        return self._robots[origin]

    def get(self, url: str) -> httpx.Response:
        if not self._robots_for(url).allowed(agent_token(), url):
            raise RobotsDisallowed(url)
        domain = urlparse(url).netloc
        for attempt in range(self.retries + 1):
            self._wait(domain)
            started = time.monotonic()
            try:
                resp = self.http.get(url)
            except httpx.TransportError as exc:
                log.warning(json.dumps({"event": "http_error", "url": url, "error": str(exc), "attempt": attempt}))
                if attempt == self.retries:
                    raise
                time.sleep(2**attempt * 2)
                continue
            log.info(
                json.dumps(
                    {
                        "event": "http_get",
                        "url": url,
                        "status": resp.status_code,
                        "ms": round((time.monotonic() - started) * 1000),
                    }
                )
            )
            if resp.status_code in (403, 401) or "cf-mitigated" in resp.headers:
                raise BlockedError(f"HTTP {resp.status_code} la {url}")
            if resp.status_code in (429, 500, 502, 503, 504):
                if resp.status_code == 503 and "cf-ray" in resp.headers:
                    raise BlockedError(f"Cloudflare 503 la {url}")
                if attempt == self.retries:
                    resp.raise_for_status()
                time.sleep(2**attempt * 3)
                continue
            if resp.status_code == 200 and len(resp.text) < 20000:
                head = resp.text[:5000].lower()
                if any(m in head for m in BLOCK_MARKERS):
                    raise BlockedError(f"Pagină de verificare anti-bot la {url}")
            return resp
        raise RuntimeError("unreachable")


class BaseScraper(ABC):
    """Un scraper per magazin. Implementează `discover_product_urls`; extragerea are fallback-uri comune:
    1) JSON-LD Product (sau microdata Product)  2) OpenGraph  3) selectori CSS ai magazinului."""

    shop_slug: str
    max_products: int = 40
    # selectori CSS de rezervă (pasul 3), specifici magazinului
    css_title: str | None = None
    css_price: str | None = None
    css_old_price: str | None = None

    def __init__(self, client: PoliteClient):
        self.client = client

    @abstractmethod
    def discover_product_urls(self) -> Iterable[str]: ...

    def links(self, page_url: str, selector: str) -> list[str]:
        tree = HTMLParser(self.client.get(page_url).text)
        urls = []
        for node in tree.css(selector):
            href = node.attributes.get("href")
            if href:
                full = urljoin(page_url, href).split("#")[0]
                if full not in urls:
                    urls.append(full)
        return urls

    def parse_product(self, url: str, html: str) -> ScrapedOffer | None:
        data = jsonld.extract_product(html) or jsonld.extract_microdata(html) or {}
        og = jsonld.extract_opengraph(html)
        tree = HTMLParser(html)

        title = data.get("title") or og.get("title") or self._css_text(tree, self.css_title)
        price = data.get("price") or og.get("price") or jsonld.parse_price(self._css_text(tree, self.css_price))
        if not title or price is None:
            log.warning(json.dumps({"event": "parse_failed", "shop": self.shop_slug, "url": url}))
            return None
        old_price = jsonld.parse_price(self._css_text(tree, self.css_old_price))
        in_stock = data.get("in_stock")
        if in_stock is None:
            in_stock = og.get("in_stock", True)
        return ScrapedOffer(
            shop_slug=self.shop_slug,
            url=url,
            title=title.strip(),
            price=price,
            old_price=old_price if old_price and old_price > price else None,
            in_stock=in_stock,
            ean=data.get("ean"),
            mpn=data.get("mpn"),
            warranty_months=data.get("warranty_months"),
            condition=data.get("condition") or "new",
            scraped_at=datetime.now(UTC),
            raw={"jsonld": data.get("raw"), "og": og},
            seller=data.get("seller"),
        )

    @staticmethod
    def _css_text(tree: HTMLParser, selector: str | None) -> str | None:
        if not selector:
            return None
        node = tree.css_first(selector)
        return node.text(strip=True) if node else None

    def scrape(self) -> Iterator[ScrapedOffer]:
        for url in list(self.discover_product_urls())[: self.max_products]:
            try:
                resp = self.client.get(url)
            except RobotsDisallowed:
                log.info(json.dumps({"event": "robots_skip", "shop": self.shop_slug, "url": url}))
                continue
            except httpx.HTTPError as exc:
                log.warning(json.dumps({"event": "product_failed", "shop": self.shop_slug, "url": url, "error": str(exc)}))
                continue
            offer = self.parse_product(str(resp.url), resp.text)
            if offer:
                yield offer
