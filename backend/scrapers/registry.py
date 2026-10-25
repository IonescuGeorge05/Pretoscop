"""Registrul scraperilor. Magazin nou: <magazin>.py cu o subclasă BaseScraper + o intrare aici.
Extragerea e comună (JSON-LD -> OpenGraph -> selectori CSS); fiecare magazin definește doar listările."""

from scrapers.altex import AltexScraper
from scrapers.base import BaseScraper
from scrapers.emag import EmagScraper
from scrapers.evomag import EvomagScraper
from scrapers.flanco import FlancoScraper
from scrapers.flip import FlipScraper
from scrapers.olx import OlxScraper
from scrapers.pcgarage import PcGarageScraper

REGISTRY: dict[str, type[BaseScraper]] = {
    cls.shop_slug: cls
    for cls in (PcGarageScraper, EmagScraper, FlancoScraper, EvomagScraper, AltexScraper, FlipScraper, OlxScraper)
}
