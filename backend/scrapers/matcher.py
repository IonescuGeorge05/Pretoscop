"""Potrivire listare -> produs. Ordine: EAN, MPN, reguli pe titlu; altfel `unmatched` (nu ghicim).

Regulile pe titlu sunt pe familii de produse (PS5, iPhone 18 Pro). Familie nouă: o funcție `_<familie>(t, allow_used)`
și o ramură în `match_title`."""

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


# ---------- comun

CONDITION_RE = re.compile(
    r"\b(refurbished|resigilat\w*|reconditionat\w*|second[ -]?hand|folosit\w*|utilizat\w*|renewed|open[ -]?box|ca nou)\b"
)
# anunțuri care nu sunt oferte de vânzare: cereri de cumpărare, servicii
NOT_FOR_SALE_RE = re.compile(r"^\W*(cumpar|caut|colectez)\b|\b(curatare|igienizare|reparatii|reparatie|service)\b")


USED_TITLE_RE = re.compile(r"\b(second[ -]?hand|sh|folosit\w*|utilizat\w*|ca nou[a]?)\b")
REFURB_TITLE_RE = re.compile(r"\b(resigilat\w*|refurbished|reconditionat\w*|renewed|open[ -]?box)\b")


def title_condition(title: str) -> str | None:
    """Starea dedusă din titlu, pentru magazinele care vând și produse noi, și second hand (ex. „Second-Hand SH”)."""
    t = normalize(title)
    if REFURB_TITLE_RE.search(t):
        return "refurbished"
    if USED_TITLE_RE.search(t):
        return "used"
    return None


def normalize(title: str) -> str:
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"play\s*station\s*5|\bps\s*5\b", "ps5", t)
    t = re.sub(r"\biphone\s*(\d+)\s*", r"iphone \1 ", t)  # iphone18pro -> iphone 18 pro
    t = re.sub(r"\bpro\s*max\b|\bpromax\b", "pro max", t)
    t = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1\2", t)
    return re.sub(r"\s+", " ", t).strip()


def _code_matches(pattern: str, mpn: str) -> bool:
    regex = "^" + re.escape(pattern.upper()).replace("X", r"\d") + r"[A-Z]?$"
    return re.match(regex, mpn.upper().replace(" ", "")) is not None


def match_title(title: str, allow_used: bool = False) -> MatchResult:
    """`allow_used=True` pentru surse second hand / refurbished, unde „ca nou”, „folosit” sunt normale."""
    t = normalize(title)
    if NOT_FOR_SALE_RE.search(t):
        return MatchResult("excluded", reason="nu e o ofertă de vânzare (cerere de cumpărare / serviciu)")
    if re.search(r"\biphone\b", t):
        return _iphone(t, allow_used)
    if "ps5" in t:
        return _ps5(t, allow_used)
    return MatchResult("accessory", reason="produs neurmărit")


# ---------- PlayStation 5

PS5_SLUGS = {
    ("original", "disc"): "ps5-disc-825gb",
    ("original", "digital"): "ps5-digital-825gb",
    ("slim", "disc"): "ps5-slim-disc-1tb",
    ("slim", "digital"): "ps5-slim-digital-1tb",
    ("slim-825", "digital"): "ps5-slim-digital-825gb",
    ("pro", None): "ps5-pro-2tb",
}
CONSOLE_RE = re.compile(r"\b(consola|console)\b")
PS5_ACCESSORY_RE = re.compile(
    r"\b(controller|dualsense|joystick|gamepad|joc|jocuri|game|games|husa|skin|stand|suport|incarcator|incarcare|charging|"
    r"surse?|sursa|monitor|setup|capac\w*|adaptor|adapter|hub|dock|cooler|optical drive|filtru|filter|"
    r"casti|headset|cablu|cover|capac|carcasa|faceplate|ssd (?:intern|nvme|m\.?2)|camera|telecomanda|remote|"
    r"volan|vr2?|geanta|ventilator|cooling|sticker|abonament|card|portal)\b|\b(pentru|for|compatibil\w*)\s+ps5\b"
)
PS5_BUNDLE_RE = re.compile(
    r"\+|\bbundle\b|\bpachet\b|\bcu (joc|jocul)\b|\bincluding\b|\blimited\b|\beditie limitata\b|"
    r"\b\d+ control+ere?\b|\bextra controller\b|\bcontroller suplimentar\b|\banniversary\b|\b30th\b|\bchroma\b|"
    r"\bcamo\b|\bfortnite\b|\bcall of duty\b|\bfc ?2\d\b|\bfifa\b|"
    r"\bgran turismo\b|\bgod of war\b|\bspider-?man\b|\bastro bot\b|\bhorizon\b|\bvoucher\b"
)


PS5_MODDED_RE = re.compile(r"\b(modat\w*|jailbreak|firmware|fw ?\d)")
# SSD mărit de revânzător (1.8 / 2 / 2.8 / 3 TB pe un PS5 care nu e Pro): nu e un model oficial
PS5_UPGRADED_SSD_RE = re.compile(r"\b(1\.8|2|2\.8|3|4)tb\b")


def _ps5(t: str, allow_used: bool) -> MatchResult:
    if not allow_used and CONDITION_RE.search(t):
        return MatchResult("excluded", reason="nu este nou (resigilat/refurbished/second hand)")
    if PS5_MODDED_RE.search(t):
        return MatchResult("excluded", reason="consolă modificată (firmware / jailbreak)")
    console = CONSOLE_RE.search(t)
    accessory = PS5_ACCESSORY_RE.search(t)
    # "Husă pentru consola PS5" = accesoriu; "Consola PS5 + controller" = consolă (eventual pachet)
    if accessory and (not console or accessory.start() < console.start() or accessory.group(0) == "portal"):
        return MatchResult("accessory", reason=f"accesoriu ({accessory.group(0).strip()})")

    is_bundle = bool(PS5_BUNDLE_RE.search(t))
    code = re.search(r"cfi-?\s?(\d)\d{3}", t)
    gen_code = code.group(1) if code else None

    if re.search(r"\bps5 pro\b|\bpro\b", t) or gen_code == "7":
        if re.search(r"\b(1tb|825gb)\b", t):
            return MatchResult("unmatched", reason="Pro cu stocare neobișnuită")
        return MatchResult("product", PS5_SLUGS[("pro", None)], is_bundle)
    if PS5_UPGRADED_SSD_RE.search(t):
        return MatchResult("excluded", reason="SSD mărit de revânzător (nu e un model oficial PS5)")

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
    elif gen == "slim" and "1tb" in t and re.search(r"\b[de]-?chassis\b", t):
        # convenția magazinelor (eMAG, anze, premiumbrand…): „PS5 Slim, 1TB, D/E-Chassis” fără „Digital” = ediția cu
        # disc; varianta digitală e mereu numită explicit. Doar titluri de magazin (cu șasiu), nu anunțuri vagi.
        edition = "disc"
    else:
        return MatchResult("unmatched", is_bundle=is_bundle, reason="ediție neclară (Disc sau Digital?)")
    if gen == "slim" and "1tb" not in t and ("825gb" in t or re.search(r"\be-?chassis\b", t) or re.search(r"cfi-?\s?21\d\d", t)):
        # șasiul E (2025, CFI-21xx): Slim Digital cu 825 GB. Slim cu disc are mereu 1 TB în UE -> „825 GB cu disc” e o greșeală.
        if edition == "disc":
            return MatchResult("unmatched", is_bundle=is_bundle, reason="Slim cu disc și 825 GB (nu există în UE: Slim cu disc are 1 TB)")
        gen = "slim-825"
    return MatchResult("product", PS5_SLUGS[(gen, edition)], is_bundle)


# ---------- iPhone 18 Pro / Pro Max

PHONE_RE = re.compile(r"\b(telefon|smartphone)\b")
IPHONE_ACCESSORY_RE = re.compile(
    r"\b(husa|carcasa|folie|sticla|protectie|cablu|incarcator|adaptor|magsafe|case|cover|lentil\w*|suport|curea|"
    r"baterie externa|powerbank|stylus|skin|dummy|macheta)\b|\b(pentru|for|compatibil\w*)\s+(apple )?iphone\b"
)
IPHONE_BUNDLE_RE = re.compile(r"\+|\bbundle\b|\bpachet\b|\bcu (husa|airpods|apple watch|ceas)\b")
IPHONE_MODEL_RE = re.compile(r"\biphone (\d+)\s*(pro max|pro|plus|air|mini|e)?\b")


def _iphone(t: str, allow_used: bool) -> MatchResult:
    m = IPHONE_MODEL_RE.search(t)
    if not m or m.group(1) != "18":
        return MatchResult("accessory", reason="alt model de iPhone (urmărim doar iPhone 18 Pro / Pro Max)")
    variant = m.group(2)
    if variant not in ("pro", "pro max"):
        return MatchResult("accessory", reason=f"iPhone 18 {variant or ''} (urmărim doar Pro / Pro Max)".replace("  ", " "))
    if not allow_used and CONDITION_RE.search(t):
        return MatchResult("excluded", reason="nu este nou (resigilat/refurbished/second hand)")
    phone = PHONE_RE.search(t)
    accessory = IPHONE_ACCESSORY_RE.search(t)
    # "Husă pentru iPhone 18 Pro" = accesoriu; "Telefon mobil Apple iPhone 18 Pro ... + husă" = telefon (pachet)
    if accessory and (not phone or accessory.start() < phone.start()):
        return MatchResult("accessory", reason=f"accesoriu ({accessory.group(0).strip()})")
    # „Camera Tripla 48 + 48 + 48 MP” nu e pachet
    is_bundle = bool(IPHONE_BUNDLE_RE.search(re.sub(r"\d+\s*\+\s*(?=\d)", " ", t)))
    storages = set(re.findall(r"\b(256gb|512gb|1tb|2tb)\b", t))
    if len(storages) != 1:
        reason = "stocare neclară (lipsește 256GB/512GB/1TB/2TB)" if not storages else "mai multe stocări în titlu"
        return MatchResult("unmatched", is_bundle=is_bundle, reason=reason)
    model = "pro-max" if variant == "pro max" else "pro"
    return MatchResult("product", f"iphone-18-{model}-{storages.pop()}", is_bundle)


# ---------- potrivire completă


def match(
    title: str,
    products: list[ProductRef],
    ean: str | None = None,
    mpn: str | None = None,
    condition: str = "new",
    allow_used: bool = False,
) -> MatchResult:
    if condition != "new" and not allow_used:
        return MatchResult("excluded", reason=f"stare: {condition}")
    by_title = match_title(title, allow_used)
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
