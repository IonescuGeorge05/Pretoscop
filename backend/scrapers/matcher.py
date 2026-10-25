"""Potrivire listare -> produs. Ordine: EAN, MPN, reguli pe titlu; altfel `unmatched` (nu ghicim)."""

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class MatchResult:
    kind: Literal["product", "accessory", "excluded", "unmatched"]
    product_slug: str | None = None
    is_bundle: bool = False
    reason: str = ""


@dataclass(frozen=True)
class ProductRef:
    slug: str
    ean: str | None
    model_code: str | None  # poate conține "x" ca wildcard: CFI-2xxx


SLUGS = {
    ("original", "disc"): "ps5-disc-825gb",
    ("original", "digital"): "ps5-digital-825gb",
    ("slim", "disc"): "ps5-slim-disc-1tb",
    ("slim", "digital"): "ps5-slim-digital-1tb",
    ("pro", None): "ps5-pro-2tb",
}

CONDITION_RE = re.compile(
    r"\b(refurbished|resigilat\w*|reconditionat\w*|second[ -]?hand|folosit\w*|utilizat\w*|renewed|open[ -]?box|ca nou)\b"
)
CONSOLE_RE = re.compile(r"\b(consola|console)\b")
ACCESSORY_RE = re.compile(
    r"\b(controller|dualsense|joystick|gamepad|joc|game|husa|skin|stand|suport|incarcator|incarcare|charging|"
    r"casti|headset|cablu|cover|capac|carcasa|faceplate|ssd (?:intern|nvme|m\.?2)|camera|telecomanda|remote|"
    r"volan|vr2?|geanta|ventilator|cooling|sticker|abonament|card|portal)\b|\b(pentru|for|compatibil\w*)\s+ps5\b"
)
BUNDLE_RE = re.compile(
    r"\+|\bbundle\b|\bpachet\b|\bcu (joc|jocul)\b|\bincluding\b|\blimited\b|\beditie limitata\b|"
    r"\b\d+ control+ere?\b|\bextra controller\b|\bcontroller suplimentar\b|\banniversary\b|\b30th\b|\bchroma\b|\bcamo\b|\bfortnite\b|\bcall of duty\b|\bfc ?2\d\b|\bfifa\b|"
    r"\bgran turismo\b|\bgod of war\b|\bspider-?man\b|\bastro bot\b|\bhorizon\b|\bvoucher\b"
)


def normalize(title: str) -> str:
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"play\s*station\s*5|\bps\s*5\b", "ps5", t)
    t = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1\2", t)
    return re.sub(r"\s+", " ", t).strip()


def _code_matches(pattern: str, mpn: str) -> bool:
    regex = "^" + re.escape(pattern.upper()).replace("X", r"\d") + r"[A-Z]?$"
    return re.match(regex, mpn.upper().replace(" ", "")) is not None


def match_title(title: str) -> MatchResult:
    t = normalize(title)

    if "ps5" not in t:
        return MatchResult("accessory", reason="nu este PS5")
    if CONDITION_RE.search(t):
        return MatchResult("excluded", reason="nu este nou (resigilat/refurbished/second hand)")
    console = CONSOLE_RE.search(t)
    accessory = ACCESSORY_RE.search(t)
    # "Husă pentru consola PS5" = accesoriu; "Consola PS5 + controller" = consolă (eventual pachet)
    if accessory and (not console or accessory.start() < console.start() or accessory.group(0) == "portal"):
        return MatchResult("accessory", reason=f"accesoriu ({accessory.group(0).strip()})")

    is_bundle = bool(BUNDLE_RE.search(t))
    code = re.search(r"cfi-?\s?(\d)\d{3}", t)
    gen_code = code.group(1) if code else None

    if re.search(r"\bps5 pro\b|\bpro\b", t) or gen_code == "7":
        if re.search(r"\b(1tb|825gb)\b", t):
            return MatchResult("unmatched", reason="Pro cu stocare neobișnuită")
        return MatchResult("product", SLUGS[("pro", None)], is_bundle)

    if "slim" in t or gen_code == "2" or "1tb" in t:
        gen = "slim"
    elif gen_code == "1" or "825gb" in t:
        gen = "original"
    else:
        return MatchResult("unmatched", is_bundle=is_bundle, reason="generație neclară (fără Slim/825GB/1TB/cod model)")

    digital = bool(re.search(r"\bdigital\b", t))
    disc = bool(re.search(r"\b(disc|disk|standard|blu-?ray|unitate optica|cu unitate)\b", t))
    if digital and disc and not is_bundle:
        return MatchResult("unmatched", is_bundle=is_bundle, reason="ediție ambiguă (și Digital, și Disc)")
    if digital:
        edition = "digital"
    elif disc:
        edition = "disc"
    else:
        return MatchResult("unmatched", is_bundle=is_bundle, reason="ediție neclară (Disc sau Digital?)")
    return MatchResult("product", SLUGS[(gen, edition)], is_bundle)


def match(
    title: str,
    products: list[ProductRef],
    ean: str | None = None,
    mpn: str | None = None,
    condition: str = "new",
) -> MatchResult:
    if condition != "new":
        return MatchResult("excluded", reason=f"stare: {condition}")
    by_title = match_title(title)
    if by_title.kind in ("excluded", "accessory"):
        return by_title

    if ean:
        for p in products:
            if p.ean and p.ean == ean:
                return MatchResult("product", p.slug, by_title.is_bundle, reason="EAN")
    if mpn:
        hits = [p for p in products if p.model_code and _code_matches(p.model_code, mpn)]
        if len(hits) == 1:
            return MatchResult("product", hits[0].slug, by_title.is_bundle, reason="MPN")
    return by_title
