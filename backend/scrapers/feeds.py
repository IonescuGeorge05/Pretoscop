"""Citire de feed-uri de produse (XML / CSV) trimise de magazine sau din rețelele de afiliere.

Formate suportate (detectate automat):
- compari.ro: <products><product><Name>, <ProductUrl>, <Price>, <ProductNumber> …
- Google Merchant (RSS 2.0 / Atom cu prefix g:): <item><title>, <link>, <g:price>123.45 RON</g:price>, <g:gtin> …
- 2Performant / Profitshare: CSV sau XML cu coloane title, url, price, old_price, aff_link …
- orice CSV/XML cu nume de câmpuri uzuale (vezi FIELD_ALIASES).

Feed-urile pot avea zeci de mii de produse: se citesc în flux și se păstrează doar rândurile care par să fie
din familiile urmărite (PS5, iPhone 18 Pro); restul filtrării o face matcher-ul, ca la scraping.
"""

import csv
import io
import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal

from scrapers.base import ScrapedOffer
from scrapers.jsonld import normalize_gtin, parse_price

# denumiri de câmpuri întâlnite în feed-uri -> câmpul nostru (comparate fără majuscule, prefix g:, _ și -)
FIELD_ALIASES = {
    "title": ["title", "name", "productname", "product_name", "denumire", "nume"],
    "url": ["url", "link", "producturl", "product_url", "productlink", "deeplink"],
    "affiliate_url": ["aff_link", "affiliate_link", "affiliateurl", "afflink", "tracking_link"],
    "price": ["sale_price", "saleprice", "price_discounted", "pret_redus", "price", "pret", "price_vat"],
    "old_price": ["old_price", "oldprice", "regular_price", "list_price", "pret_vechi", "price_old"],
    "availability": ["availability", "stock", "in_stock", "instock", "stoc", "active", "status"],
    "ean": ["gtin", "ean", "ean13", "gtin13", "barcode"],
    "mpn": ["mpn", "productnumber", "part_number", "cod_producator", "model"],
    "condition": ["condition", "stare"],
    "shipping": ["shipping", "delivery_cost", "deliverycost", "shipping_cost", "transport"],
    "warranty": ["warranty", "garantie", "warranty_months"],
}
# rânduri relevante înainte de matcher (feed-urile au tot catalogul magazinului)
VAT = Decimal("1.21")  # TVA România (din 08.2025)
RELEVANT_RE = re.compile(r"(?i)\b(ps ?5|playstation ?5|iphone ?18)")


def _key(name: str) -> str:
    name = name.rsplit("}", 1)[-1]  # namespace XML
    return re.sub(r"[^a-z0-9]", "", name.lower().removeprefix("g:"))


ALIAS_LOOKUP = {_key(alias): field for field, aliases in FIELD_ALIASES.items() for alias in aliases}


def _pick(record: dict[str, str]) -> dict[str, str]:
    """Mapează un rând brut pe câmpurile noastre; primul alias găsit (în ordinea din FIELD_ALIASES) câștigă."""
    out: dict[str, str] = {}
    for field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            value = record.get(_key(alias))
            if value not in (None, ""):
                out[field] = value.strip()
                break
    return out


def _in_stock(value: str | None) -> bool:
    if value is None:
        return True
    v = value.strip().lower()
    return not (v in ("0", "false", "no", "nu", "inactive", "inactiv") or "out" in v or "indisponibil" in v or "epuizat" in v)


def _condition(value: str | None) -> str:
    v = (value or "new").lower()
    if v in ("new", "nou", "noua", "nou/a"):
        return "new"
    return "refurbished" if "refurb" in v or "resigilat" in v else "used"


def _warranty_months(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"(\d+)\s*(luni|months?|ani|years?|an)?", value.lower())
    if not m:
        return None
    n = int(m.group(1))
    return n * 12 if m.group(2) and m.group(2).startswith(("an", "year")) else n


def _records_xml(data: bytes) -> Iterator[dict[str, str]]:
    """Un element „produs” = un element ale cărui copii sunt doar text (title/url/price …)."""
    for _, elem in ET.iterparse(io.BytesIO(data), events=("end",)):
        children = list(elem)
        if not children:
            continue
        record: dict[str, str] = {}
        for c in children:
            key = _key(c.tag)
            if len(c) == 0:
                record.setdefault(key, c.text or "")
            elif key == "shipping":  # Google: <g:shipping><g:country/><g:price>19.99 RON</g:price></g:shipping>
                nested = next((n.text for n in c if _key(n.tag) == "price"), None)
                record.setdefault("shipping", nested or "")
        if record.keys() & {"title", "name", "productname"} and record.keys() & {"price", "saleprice", "pret"}:
            yield record
            elem.clear()


def _records_csv(data: bytes) -> Iterator[dict[str, str]]:
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:5000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    for row in csv.DictReader(io.StringIO(text), dialect=dialect):
        yield {_key(k or ""): (v or "") for k, v in row.items()}


def parse_feed(
    data: bytes, shop_slug: str, relevant_only: bool = True, vat_included: bool = True
) -> list[ScrapedOffer]:
    """Feed brut (XML sau CSV) -> oferte. Rândurile fără titlu, URL sau preț valid se ignoră."""
    head = data.lstrip()[:200].lower()
    records = _records_xml(data) if head.startswith((b"<?xml", b"<")) else _records_csv(data)
    now = datetime.now(UTC)
    offers: list[ScrapedOffer] = []
    for record in records:
        f = _pick(record)
        title, url = f.get("title"), f.get("url")
        if not title or not url or (relevant_only and not RELEVANT_RE.search(title)):
            continue
        price = parse_price(f.get("price"))
        if not price:
            continue
        old_price = parse_price(f.get("old_price"))
        if old_price is None and record.get("saleprice"):  # Google: g:sale_price = preț redus, g:price = preț vechi
            old_price = parse_price(record.get("price"))
        if not vat_included:  # unele feed-uri de afiliere au prețuri fără TVA
            price = (price * VAT).quantize(Decimal("0.01"))
            old_price = (old_price * VAT).quantize(Decimal("0.01")) if old_price else None
        offers.append(
            ScrapedOffer(
                shop_slug=shop_slug,
                url=url,
                title=title,
                price=price,
                old_price=old_price if old_price and old_price > price else None,
                in_stock=_in_stock(f.get("availability")),
                ean=normalize_gtin(f.get("ean")) if f.get("ean") else None,
                mpn=f.get("mpn"),
                warranty_months=_warranty_months(f.get("warranty")),
                condition=_condition(f.get("condition")),
                scraped_at=now,
                raw={
                    "source": "feed",
                    "affiliate_url": f.get("affiliate_url"),
                    "shipping": str(parse_price(f["shipping"])) if f.get("shipping") and parse_price(f["shipping"]) is not None else None,
                },
            )
        )
    return offers

