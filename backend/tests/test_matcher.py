import pytest

from scrapers.matcher import ProductRef, match, match_title

PRODUCTS = [
    ProductRef("ps5-disc-825gb", None, "CFI-1xxx"),
    ProductRef("ps5-digital-825gb", None, "CFI-1xxx"),
    ProductRef("ps5-slim-disc-1tb", "5940000000001", "CFI-2xxx"),
    ProductRef("ps5-slim-digital-1tb", None, "CFI-2xxx"),
    ProductRef("ps5-pro-2tb", None, "CFI-7xxx"),
]

# (titlu, kind, slug, is_bundle) — multe sunt titluri reale de pe eMAG / Flanco / PC Garage / evoMAG
CASES = [
    # consolă simplă
    ("Consola PlayStation 5 Digital Edition (PS5) Slim, 825GB SSD, E-Chassis", "product", "ps5-slim-digital-1tb", False),
    ("Consola Sony PS5 (PlayStation 5), E-Chassis, Slim, DIGITAL Edition 825GB, Alb", "product", "ps5-slim-digital-1tb", False),
    ("Consola Sony PlayStation 5 Slim PS5 E-Chassis 1TB Disc Edition Alb", "product", "ps5-slim-disc-1tb", False),
    ("Consola PlayStation 5 Pro Digital Edition (PS5), 2TB SSD, White", "product", "ps5-pro-2tb", False),
    ("Consola Sony PlayStation 5 Standard Edition 825GB", "product", "ps5-disc-825gb", False),
    ("Consola Sony PlayStation 5 Digital Edition 825GB, CFI-1116A", "product", "ps5-digital-825gb", False),
    ("Sony PlayStation 5 Slim Digital 1TB SSD", "product", "ps5-slim-digital-1tb", False),
    ("Consolă Sony PlayStation 5 Slim cu unitate disc Blu-ray, 1 TB", "product", "ps5-slim-disc-1tb", False),
    # pachete -> marcate is_bundle
    ("Consola PlayStation 5 Digital Edition (PS5) Slim, 825GB SSD, E-Chassis + Fortnite Flowering Chaos Bundle",
     "product", "ps5-slim-digital-1tb", True),
    ("Consola Sony PlayStation 5 Slim Disk Edition 1TB White + EA Sports FC 26", "product", "ps5-slim-disc-1tb", True),
    ("Consola Sony PlayStation 5 Slim PS5 1TB Disc Edition Alb Extra Controller", "product", "ps5-slim-disc-1tb", True),
    ("Consola Sony PlayStation 5 Digital Edition 825GB SSD joc NBA 2K26 CFI-2116B + voucher",
     "product", "ps5-slim-digital-1tb", True),
    ("Consola Sony PlayStation 5 Pro 2TB + DualSense Edge", "product", "ps5-pro-2tb", True),
    # capcane: accesorii cu "PS5" în titlu
    ("Controller wireless Sony DualSense pentru PS5, Midnight Black", "accessory", None, False),
    ("Joc PS5 Sony Ghost of Yotei Standard Edition", "accessory", None, False),
    ("PlayStation Portal Remote Player pentru PS5", "accessory", None, False),
    ("Unitate disc Blu-ray pentru PS5 Digital Edition (Slim)", "accessory", None, False),
    ("Husa protectie consola PS5 Slim Digital", "accessory", None, False),
    ("Consola Sony PlayStation 4 Slim 1TB + Horizon Zero Dawn", "accessory", None, False),
    # capcane: stare != nou
    ("Consola PlayStation 5 Slim Digital 1TB - Resigilat", "excluded", None, False),
    ("Sony PlayStation 5 Slim Disc 1TB Refurbished", "excluded", None, False),
    # capcane: nu e clar -> unmatched (nu ghicim)
    ("Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis", "unmatched", None, False),  # disc sau digital?
    ("Consola Sony PlayStation 5 Digital Edition si 2 controlere DualSense White", "unmatched", None, True),  # generație?
]


@pytest.mark.parametrize("title,kind,slug,bundle", CASES)
def test_match_title(title, kind, slug, bundle):
    r = match_title(title)
    assert r.kind == kind, r.reason
    assert r.product_slug == slug
    assert r.is_bundle == bundle


def test_ean_wins_over_unclear_title():
    r = match("Consola Sony PS5 1TB D-Chassis", PRODUCTS, ean="5940000000001")
    assert (r.kind, r.product_slug, r.reason) == ("product", "ps5-slim-disc-1tb", "EAN")


def test_mpn_unique_pattern_matches():
    r = match("Sony PS5 console", PRODUCTS, mpn="CFI-7016")
    assert (r.kind, r.product_slug) == ("product", "ps5-pro-2tb")


def test_ambiguous_mpn_falls_back_to_title():
    # CFI-2xxx e comun pentru Slim Disc și Slim Digital -> decide titlul
    r = match("Consola PS5 Slim Digital Edition", PRODUCTS, mpn="CFI-2016")
    assert r.product_slug == "ps5-slim-digital-1tb"
    assert match("Consola PS5 Slim", PRODUCTS, mpn="CFI-2016").kind == "unmatched"


def test_non_new_condition_excluded_even_with_ean():
    r = match("Consola PS5 Slim Disc 1TB", PRODUCTS, ean="5940000000001", condition="refurbished")
    assert r.kind == "excluded"


@pytest.mark.parametrize(
    "title,slug",
    [
        ("Sony PlayStation 5 Slim Digital Edition, 1 TB, White, Ca nou", "ps5-slim-digital-1tb"),  # Flip
        ("Sony PlayStation 5 Disc Edition, 825 GB, White, Foarte bun", "ps5-disc-825gb"),  # Flip
        ("Vand ps5 slim digital edition", "ps5-slim-digital-1tb"),  # OLX
        ("Playstation 5, Digital Edition 825 GB, folosita putin", "ps5-digital-825gb"),  # OLX
    ],
)
def test_used_sources_accept_condition_words(title, slug):
    assert match_title(title).kind in ("excluded", "product")  # pe sursele noi, „ca nou”/„folosit” exclud
    r = match_title(title, allow_used=True)
    assert (r.kind, r.product_slug) == ("product", slug)


def test_used_condition_passes_only_when_allowed():
    assert match("PS5 Slim Digital 1TB", PRODUCTS, condition="refurbished").kind == "excluded"
    r = match("PS5 Slim Digital 1TB", PRODUCTS, condition="refurbished", allow_used=True)
    assert r.product_slug == "ps5-slim-digital-1tb"


@pytest.mark.parametrize(
    "title",
    [
        "Cumpar Playstation in Timisoara PS4 PS5. Doar in Timisoara",  # titluri reale Publi24
        "cumpar ps5 slim",
        "Colectez Cumpar Console Defecte Playstation 4 5 Xbox",
        "Curatare si Igienizare PlayStation 5 4 Xbox",
    ],
)
def test_wanted_ads_and_services_are_not_offers(title):
    assert match_title(title, allow_used=True).kind in ("excluded", "accessory")  # oricum nu devine ofertă


def test_for_sale_ad_still_matches():
    r = match_title("Vând PS5 Slim Digital Edițion", allow_used=True)
    assert (r.kind, r.product_slug) == ("product", "ps5-slim-digital-1tb")
