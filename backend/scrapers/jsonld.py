"""Extragere schema.org/Product din JSON-LD, microdata și meta tag-uri OpenGraph."""

import json
import re
from decimal import Decimal, InvalidOperation

from selectolax.parser import HTMLParser

# schema.org/ItemAvailability: precomanda se poate cumpăra acum (livrare ulterioară) -> disponibilă, marcată separat
PREORDER = ("PreOrder", "PreSale")
AVAILABLE = ("InStock", "LimitedAvailability", "OnlineOnly", *PREORDER)


def parse_price(value) -> Decimal | None:
    """Acceptă 3499.99, "3499.99", "3.499,99 RON", "3,499.99", "3 499 lei"."""
    if value is None:
        return None
    if isinstance(value, int | float | Decimal):
        return Decimal(str(value)).quantize(Decimal("0.01"))
    s = re.sub(r"[^\d,.]", "", str(value))
    if not s:
        return None
    if "," in s and "." in s:
        # separatorul zecimal e ultimul dintre cele două
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".") if len(s.split(",")[-1]) == 2 else s.replace(",", "")
    elif s.count(".") > 1 or (len(s.split(".")[-1]) == 3 and "." in s):
        s = s.replace(".", "")
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def _iter_nodes(data):
    if isinstance(data, list):
        for item in data:
            yield from _iter_nodes(item)
    elif isinstance(data, dict):
        yield data
        if "@graph" in data:
            yield from _iter_nodes(data["@graph"])


def _is_type(node: dict, name: str) -> bool:
    t = node.get("@type")
    return t == name or (isinstance(t, list) and name in t)


def _warranty_months(node: dict) -> int | None:
    w = node.get("warranty")
    if isinstance(w, list):
        w = w[0] if w else None
    if not isinstance(w, dict):
        return None
    d = w.get("durationOfWarranty") or {}
    try:
        value = int(float(d.get("value")))
    except (TypeError, ValueError):
        return None
    unit = str(d.get("unitCode", "MON")).upper()
    return value * 12 if unit in ("ANN", "YEAR") else value


def extract_product(html: str) -> dict | None:
    tree = HTMLParser(html)
    for script in tree.css('script[type="application/ld+json"]'):
        text = script.text(strip=True)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # unele magazine lasă virgule în plus / caractere de control
            try:
                data = json.loads(re.sub(r",\s*([}\]])", r"\1", text), strict=False)
            except json.JSONDecodeError:
                continue
        for node in _iter_nodes(data):
            if not _is_type(node, "Product"):
                continue
            offers = node.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            price = offers.get("price", offers.get("lowPrice"))
            currency = offers.get("priceCurrency", "RON")
            if currency not in ("RON", "LEI"):
                continue
            availability = str(offers.get("availability", ""))
            condition = str(offers.get("itemCondition") or node.get("itemCondition") or "NewCondition")
            ean = normalize_gtin(node.get("gtin13") or node.get("gtin") or node.get("ean") or offers.get("gtin13"))
            seller = offers.get("seller")
            seller_name = seller.get("name") if isinstance(seller, dict) else None
            return {
                "seller": seller_name.replace("™", "").strip() if seller_name else None,
                "title": node.get("name"),
                "price": parse_price(price),
                "in_stock": any(a in availability for a in AVAILABLE)
                if availability
                else None,
                "preorder": any(a in availability for a in PREORDER),
                "ean": ean,
                "mpn": str(node["mpn"]).strip() if node.get("mpn") else None,
                "warranty_months": _warranty_months(offers) or _warranty_months(node),
                "condition": "new"
                if "NewCondition" in condition
                else ("refurbished" if "Refurbished" in condition else "used"),
                "image": node.get("image"),
                "raw": node,
            }
    return None


def extract_opengraph(html: str) -> dict:
    tree = HTMLParser(html)
    meta = {}
    for node in tree.css("meta[property], meta[name]"):
        key = node.attributes.get("property") or node.attributes.get("name")
        if key and node.attributes.get("content") is not None:
            meta[key] = node.attributes["content"]
    out: dict = {}
    if "og:title" in meta:
        out["title"] = meta["og:title"]
    price = meta.get("product:price:amount") or meta.get("og:price:amount")
    if price:
        out["price"] = parse_price(price)
    avail = meta.get("product:availability") or meta.get("og:availability")
    if avail:
        out["in_stock"] = "out" not in avail.lower()
    return out


def normalize_gtin(value) -> str | None:
    """GTIN-12 (UPC) / GTIN-13 -> EAN-13 (zero-padded)."""
    digits = re.sub(r"\D", "", str(value or ""))
    return digits.zfill(13) if 12 <= len(digits) <= 13 else (digits or None)


def extract_microdata(html: str) -> dict | None:
    """schema.org/Product ca microdata (itemprop=...), folosit de unele magazine în loc de JSON-LD."""
    tree = HTMLParser(html)
    product = tree.css_first('[itemtype*="schema.org/Product"]')
    if product is None:
        return None

    def own_scope(node, scope) -> bool:
        # ignoră proprietățile din itemscope-uri imbricate (ex. brand.name)
        parent = node.parent
        while parent is not None and parent is not scope and parent.mem_id != scope.mem_id:
            if "itemscope" in parent.attributes:
                return False
            parent = parent.parent
        return True

    def prop(name: str, scope=product) -> str | None:
        node = next((n for n in scope.css(f'[itemprop="{name}"]') if own_scope(n, scope)), None)
        if node is None:
            return None
        for attr in ("content", "href"):
            if node.attributes.get(attr):
                return node.attributes[attr]
        return node.text(separator=" ", strip=True) or None

    offer = product.css_first('[itemprop="offers"]') or product
    availability = prop("availability", offer) or ""
    condition = prop("itemCondition", offer) or "NewCondition"
    title = prop("name")
    return {
        "title": re.sub(r"\s+", " ", title).strip() if title else None,
        "price": parse_price(prop("price", offer)),
        "in_stock": any(a in availability for a in AVAILABLE) if availability else None,
        "preorder": any(a in availability for a in PREORDER),
        "ean": normalize_gtin(prop("gtin13") or prop("gtin")),
        "mpn": prop("mpn"),
        "warranty_months": None,
        "condition": "new" if "NewCondition" in condition else ("refurbished" if "Refurbished" in condition else "used"),
        "raw": {"microdata": True},
    }
