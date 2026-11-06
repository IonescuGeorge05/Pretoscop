"""Import de prețuri manuale dintr-o pagină de magazin lipită în admin (Ctrl+A, Ctrl+C pe pagina de căutare din
browserul proprietarului, apoi lipit). Pentru magazinele care nu ne lasă robotul (eMAG, Altex, Flanco, PC Garage…):
pagina o deschide și o citește un om; noi doar recunoaștem produsele și prețurile, iar omul bifează ce salvează.

Browserul trimite rândurile: titlul unui produs, linkul (dacă a fost copiat HTML) și textele de preț din cardul lui.
Aici: matcher-ul decide produsul (ce nu e clar rămâne nebifat), iar dintre prețuri le păstrăm doar pe cele plauzibile
pentru produs (fără rate lunare, accesorii, transport)."""

import re
from dataclasses import dataclass
from decimal import Decimal
from urllib.parse import urljoin

from scrapers.jsonld import parse_price
from scrapers.matcher import match_title

PRICE_LOW, PRICE_HIGH = Decimal("0.3"), Decimal("3")  # față de MSRP, ca la „Am găsit mai ieftin”
OUT_OF_STOCK_RE = re.compile(r"(?i)stoc epuizat|indisponibil|nu (?:mai )?este [iî]n stoc|out of stock|epuizat")
PREORDER_RE = re.compile(r"(?i)precomand")


@dataclass
class ImportRow:
    title: str
    url: str | None
    product_slug: str | None
    product_name: str | None
    price: Decimal | None
    old_price: Decimal | None
    in_stock: bool
    preorder: bool
    is_bundle: bool
    selected: bool  # bifat implicit: produs recunoscut + preț plauzibil
    note: str | None  # de ce nu e bifat


def pick_prices(texts: list[str], msrp: Decimal | None) -> tuple[Decimal | None, Decimal | None]:
    """(prețul curent, prețul tăiat) din textele de preț ale unui card. Curent = cel mai mic preț plauzibil; tăiat =
    cel mai mare, dacă e cel mult cu 60% peste (altfel e alt preț din card, nu o reducere)."""
    values = [v for t in texts if (v := parse_price(t)) is not None and v > 0]
    if msrp:
        values = [v for v in values if msrp * PRICE_LOW <= v <= msrp * PRICE_HIGH]
    if not values:
        return None, None
    low, high = min(values), max(values)
    return low, (high if low < high <= low * Decimal("1.6") else None)


def build_rows(raw: list[dict], products: dict, page_url: str | None, base_url: str) -> list[ImportRow]:
    """`raw`: [{title, url, prices: [text], context}], `products`: slug -> Product."""
    out: list[ImportRow] = []
    seen: set[tuple[str | None, str]] = set()
    for r in raw:
        title = re.sub(r"\s+", " ", str(r.get("title") or "")).strip()
        if len(title) < 10:
            continue
        url = urljoin(base_url + "/", r["url"]) if r.get("url") else page_url
        context = str(r.get("context") or "")
        m = match_title(title)
        product = products.get(m.product_slug) if m.kind == "product" else None
        price, old = pick_prices([str(p) for p in r.get("prices") or []], product.msrp_ron if product else None)
        note = None
        if product is None:
            note = m.reason or "produs nerecunoscut"
        elif price is None:
            note = "niciun preț plauzibil pentru produs în card"
        elif not url:
            note = "lipsește linkul (pune adresa paginii lipite)"
        elif m.is_bundle:
            note = "pachet: verifică dacă vrei să-l salvezi"
        key = (url, title)
        if key in seen:
            continue
        seen.add(key)
        out.append(ImportRow(
            title=title, url=url, product_slug=product.slug if product else None,
            product_name=product.name if product else None, price=price, old_price=old,
            in_stock=not OUT_OF_STOCK_RE.search(context), preorder=bool(PREORDER_RE.search(context)),
            is_bundle=m.is_bundle, selected=note is None, note=note,
        ))
    # recunoscutele întâi, ca lista de bifat să fie sus
    return sorted(out, key=lambda r: (r.product_slug is None, r.product_name or "", r.price or 0))
