import pytest

from scrapers.matcher import match_title

# titluri reale (eMAG, evoMAG, Publi24, 10.2026) + capcane
CASES = [
    ("Telefon mobil Apple iPhone 18 Pro, 256GB, 5G, Burgundy", False, "product", "iphone-18-pro-256gb", False),
    ("Telefon mobil Apple iPhone 18 Pro Max, 512GB, 5G, Glacier", False, "product", "iphone-18-pro-max-512gb", False),
    (
        "Telefon mobil Apple iPhone 18 Pro, LTPO Super Retina XDR OLED 6.3\", 2TB, Flash, Camera Tripla 48 + 48 + 48 MP, Wi-Fi, 5G, iOS (Albastru)",
        False, "product", "iphone-18-pro-2tb", False,
    ),
    ("iPhone18 Pro 256GB", True, "product", "iphone-18-pro-256gb", False),
    ("iphone 18 pro 256 gb Nou", True, "product", "iphone-18-pro-256gb", False),
    ("iPhone 18pro 256GB Sigilat", True, "product", "iphone-18-pro-256gb", False),
    ("Iphone 18 ProMax 1TB ca nou", True, "product", "iphone-18-pro-max-1tb", False),
    ("Telefon Apple iPhone 18 Pro Max 256GB + Husa MagSafe", False, "product", "iphone-18-pro-max-256gb", True),
    # capcane
    ("Iphone 18  Pro Max", True, "unmatched", None, False),  # fără stocare
    ("iPhone 17 Pro Max 256GB Cosmic Orange | 100% Baterie", True, "accessory", None, False),  # alt model
    ("Vand Iphone 16 pro max 265gb", True, "accessory", None, False),
    ("Apple iPhone 18 256GB Black", False, "accessory", None, False),  # iPhone 18 simplu, nu Pro
    ("Husa silicon MagSafe pentru Apple iPhone 18 Pro Max, Negru", False, "accessory", None, False),
    ("Folie sticla iPhone 18 Pro", False, "accessory", None, False),
    ("Telefon mobil Apple iPhone 18 Pro 256GB, Resigilat", False, "excluded", None, False),
    ("Cumpar iPhone 18 Pro Max", True, "excluded", None, False),
]


@pytest.mark.parametrize("title,used,kind,slug,bundle", CASES)
def test_iphone_titles(title, used, kind, slug, bundle):
    r = match_title(title, allow_used=used)
    assert (r.kind, r.product_slug) == (kind, slug), r.reason
    assert r.is_bundle == bundle


def test_ps5_rules_unchanged_by_iphone_dispatch():
    assert match_title("Consola Sony PlayStation 5 Slim PS5 E-Chassis 1TB Disc Edition Alb").product_slug == "ps5-slim-disc-1tb"
    assert match_title("Laptop Lenovo IdeaPad").reason == "produs neurmărit"
