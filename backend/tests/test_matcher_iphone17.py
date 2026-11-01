"""Gama iPhone 17 (17, 17e, Air, 17 Pro, 17 Pro Max): titluri tipice de magazin și anunțuri."""

import pytest

from scrapers.matcher import match_title


@pytest.mark.parametrize(
    "title, used, slug",
    [
        ("Telefon mobil Apple iPhone 17, 256GB, 5G, Lavender", False, "iphone-17-256gb"),
        ("Apple iPhone 17 512GB Sage", False, "iphone-17-512gb"),
        ("Telefon mobil Apple iPhone Air, 1TB, Sky Blue", False, "iphone-air-1tb"),
        ("Apple iPhone 17e 256GB Soft Pink", False, "iphone-17e-256gb"),
        ("Telefon mobil Apple iPhone 17 Pro, 512GB, Cosmic Orange", False, "iphone-17-pro-512gb"),
        ("Apple iPhone 17 Pro Max 2TB Deep Blue", False, "iphone-17-pro-max-2tb"),
        ("vand iphone 17 256 ca nou", True, "iphone-17-256gb"),
        ("iPhone Air 512 GB, impecabil", True, "iphone-air-512gb"),
    ],
)
def test_iphone17_family_matches(title, used, slug):
    r = match_title(title, allow_used=used)
    assert (r.kind, r.product_slug) == ("product", slug)


def test_iphone17_traps():
    assert match_title("Husa MagSafe pentru Apple iPhone 17 Pro, transparenta").kind == "accessory"
    assert match_title("Apple iPhone 17 1TB").kind == "unmatched"  # iPhone 17 simplu nu are 1 TB
    assert match_title("iPhone 17 Pro Max ca nou", allow_used=True).kind == "unmatched"  # fără stocare
    assert match_title("Apple iPhone 16 Pro 256GB").kind == "accessory"  # generație neurmărită


@pytest.mark.parametrize(
    "title, kind, slug",
    [
        ("iPhone 17 Pro Max Blue 256 Neverlocked 1 Incarcare Nou", "product", "iphone-17-pro-max-256gb"),
        ("Telefon SAMSUNG Galaxy S26 Ultra 5G, 1T, 16GB RAM, Dual SIM, Black", "product", "galaxy-s26-ultra-1tb"),
        ("iPhone 17 replica 1tb", "excluded", None),
        ("iphone 17 pro max 1 la 1", "excluded", None),
        ("iPhone 17 pro max are android merge foarte bine", "excluded", None),
        ("Huse Pitaka IPhone 17 Pro, Pro max", "accessory", None),
        ("Iphone 17 Pro Max Sigilat", "unmatched", None),  # fără stocare: rămâne la verificare
    ],
)
def test_listing_rules_from_real_ads(title, kind, slug):
    r = match_title(title, allow_used=True)
    assert (r.kind, r.product_slug) == (kind, slug)
