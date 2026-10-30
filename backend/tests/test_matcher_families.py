"""Familiile adăugate în 10.2026: Nintendo Switch 2, Xbox Series X|S, Samsung Galaxy S26 Ultra (titluri tipice de magazin)."""

import pytest

from scrapers.matcher import match_title


@pytest.mark.parametrize(
    "title, slug, bundle",
    [
        ("Consola Nintendo Switch 2", "nintendo-switch-2", False),
        ("Consola Nintendo Switch 2 + Mario Kart World (Bundle)", "nintendo-switch-2", True),
        ("Nintendo Switch 2 Pokémon Legends: Z-A Bundle", "nintendo-switch-2", True),
        ("Consola Microsoft Xbox Series X 1TB", "xbox-series-x-1tb", False),
        ("Consola Microsoft Xbox Series X Digital Edition 1TB, alb", "xbox-series-x-digital-1tb", False),
        ("Consola Xbox Series S 512GB", "xbox-series-s-512gb", False),
        ("Consola Microsoft Xbox Series S 1TB Carbon Black", "xbox-series-s-1tb", False),
        ("Telefon mobil Samsung Galaxy S26 Ultra, 12GB RAM, 256GB, 5G, Titanium Black", "galaxy-s26-ultra-256gb", False),
        ("Samsung Galaxy S26 Ultra 1TB Dual SIM", "galaxy-s26-ultra-1tb", False),
    ],
)
def test_new_families_match(title, slug, bundle):
    r = match_title(title)
    assert (r.kind, r.product_slug, r.is_bundle) == ("product", slug, bundle)


@pytest.mark.parametrize(
    "title",
    [
        "Joc The Legend of Zelda: Breath of the Wild - Nintendo Switch 2 Edition",
        "Controller Nintendo Switch 2 Pro Controller",
        "Set Joy-Con 2 Nintendo Switch 2",
        "Card microSD Express 256GB pentru Nintendo Switch 2",
        "Controller wireless Microsoft pentru Xbox Series X|S, Carbon Black",
        "Card de extindere Seagate 1TB pentru Xbox Series X|S",
        "Husa Samsung Galaxy S26 Ultra Silicone Case",
        "Folie sticla pentru Samsung Galaxy S26 Ultra",
        "Consola Nintendo Switch OLED",  # prima generație: neurmărită
    ],
)
def test_new_families_accessories_and_other_models(title):
    assert match_title(title).kind == "accessory"


def test_unclear_xbox_and_galaxy_go_to_manual_review():
    assert match_title("Consola Xbox Series S").kind == "unmatched"  # 512 GB sau 1 TB?
    assert match_title("Samsung Galaxy S26 Ultra Titanium Black").kind == "unmatched"
    assert match_title("Consola Xbox Series X 2TB Galaxy Black Special Edition").kind == "excluded"
    assert match_title("vand galaxy s26 ultra 512", allow_used=True).product_slug == "galaxy-s26-ultra-512gb"


def test_evomag_switch2_titles_with_game_names_are_bundles():
    base = "Consola Nintendo Switch 2, LCD HDR10 7.9, 256GB flash, Wi-Fi, Bluetooth, Light Blue/Light Red Joycon"
    assert match_title(f"{base}, Negru").is_bundle is False
    assert match_title(f"{base}, Hogwarts Legacy, Negru").is_bundle is True
    assert match_title("Consola Microsoft Xbox Series X Disc Edition 1TB, 1 controller, Negru").product_slug == "xbox-series-x-1tb"


def test_tera_in_listings_means_tb():
    r = match_title("Vând sau schimb Samsung s26 ultra memorie de 1 tera", allow_used=True)
    assert r.product_slug == "galaxy-s26-ultra-1tb"
