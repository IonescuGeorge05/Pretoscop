"""Scraper generic pentru magazinele pe platforme standard (Shopify, WooCommerce, Gomag, MerchantPro, PrestaShop …).

Un magazin nou = câteva rânduri în shops.yaml (`crawl: {type: sitemap}`), fără cod:
1. sitemap-urile din robots.txt (sau <site>/sitemap.xml), inclusiv indexuri de sitemap și .xml.gz;
2. doar URL-urile de produs ale familiilor urmărite (PS5, iPhone 18 Pro), fără accesorii evidente;
3. fiecare pagină de produs prin extractorii comuni (JSON-LD -> microdata -> OpenGraph).
Totul trece prin PoliteClient: robots.txt, 3-5 s între cereri, Retry-After la 429.
"""

import gzip
import json
import logging
import re
from collections.abc import Iterable

from scrapers.base import BaseScraper, PoliteClient

log = logging.getLogger("scrapers")

# URL-uri de produs din familiile urmărite. La PS5 cerem semne de consolă (altfel trec jocuri, volane,
# videoproiectoare „compatibile PS5”); la iPhone, modelul exact.
PS5_URL_RE = re.compile(
    r"(?i)(consol|console).*(play-?station-?5|ps-?5)|(play-?station-?5|ps-?5).*(consol|console)"
    r"|(play-?station-?5|ps-?5)-(slim|pro|digital|disc|disk|standard)"
)
IPHONE_URL_RE = re.compile(r"(?i)iphone-?18-?pro")
LOC_RE = re.compile(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*</loc>")  # Gomag pune adresele în CDATA
# accesorii / jocuri evidente după URL (economisim cereri; ce trece, filtrează oricum matcher-ul)
ACCESSORY_URL_RE = re.compile(
    r"(?i)(\bjoc-|jocuri|-joc-|game-|controller|dualsense|maneta|husa|husă|huse|folie|folii|carcasa|stand-|suport|incarcator|"
    r"cablu|casti|headset|volan|skin|sticla|protectie|portal|camera|telecomanda|cover|case-|magsafe|capac|"
    r"adaptor|adapter|hub-|dock|cooler|ventilator|optical-drive|unitate-optica|filter|filtru|for-ps5|for-iphone|"
    r"pentru-ps5|pentru-playstation|pentru-iphone|compatibil)"
)
SITEMAP_PRIORITY_RE = re.compile(r"(?i)(product|produs)")
MAX_SITEMAP_FILES = 30


class SitemapScraper(BaseScraper):
    def __init__(self, client: PoliteClient, shop_slug: str, base_url: str, crawl: dict):
        super().__init__(client)
        self.shop_slug = shop_slug
        self.base_url = base_url.rstrip("/")
        self.crawl = crawl
        self.max_products = int(crawl.get("max_products", 60))

    @staticmethod
    def relevant(url: str) -> bool:
        return bool(PS5_URL_RE.search(url) or IPHONE_URL_RE.search(url)) and not ACCESSORY_URL_RE.search(url)

    def _same_site(self, url: str) -> bool:
        def host(u: str) -> str:
            return re.sub(r"^www\.", "", re.sub(r"^https?://", "", u).split("/")[0].lower())

        return host(url) == host(self.base_url)

    def _fetch_xml(self, url: str) -> str:
        resp = self.client.get(url)
        data = resp.content
        if url.endswith(".gz") or data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        return data.decode("utf-8", errors="replace")

    def sitemap_roots(self) -> list[str]:
        if self.crawl.get("sitemap"):
            return [self.crawl["sitemap"]]
        robots = self.client._robots_for(self.base_url + "/")
        return robots.sitemaps or [self.base_url + "/sitemap.xml"]

    def discover_product_urls(self) -> Iterable[str]:
        queue, visited, products = list(self.sitemap_roots()), set(), []
        while queue and len(visited) < MAX_SITEMAP_FILES:
            sitemap = queue.pop(0).replace("&amp;", "&")
            if sitemap in visited:
                continue
            visited.add(sitemap)
            try:
                xml = self._fetch_xml(sitemap)
            except Exception as exc:  # un sitemap stricat nu oprește restul
                log.warning(json.dumps({"event": "sitemap_failed", "shop": self.shop_slug, "url": sitemap, "error": str(exc)}))
                continue
            locs = [loc.strip().replace("&amp;", "&") for loc in LOC_RE.findall(xml)]
            locs = [u for u in locs if self._same_site(u)]  # ex. gamers.ro listează paginile site-ului ungar
            if "<sitemapindex" in xml:
                # index: întâi sitemap-urile de produse, dacă există
                children = sorted(locs, key=lambda u: not SITEMAP_PRIORITY_RE.search(u))
                if any(SITEMAP_PRIORITY_RE.search(u) for u in children):
                    children = [u for u in children if SITEMAP_PRIORITY_RE.search(u)]
                queue.extend(children)
            else:
                products += [u for u in locs if self.relevant(u)]
        unique = list(dict.fromkeys(products))
        log.info(json.dumps({"event": "sitemap_discovered", "shop": self.shop_slug, "sitemaps": len(visited), "product_urls": len(unique)}))
        return unique
