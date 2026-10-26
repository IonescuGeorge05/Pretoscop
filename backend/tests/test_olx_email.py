from decimal import Decimal

from app.services.olx_email import parse_olx_email

# structură tipică de email-alertă (tabele, link pe imagine și pe titlu, preț în bloc)
EMAIL = """
<table>
  <tr><td>
    <a href="https://www.olx.ro/d/oferta/ps5-slim-digital-IDabc.html?utm_source=email"><img src="x.jpg"></a>
    <a href="https://www.olx.ro/d/oferta/ps5-slim-digital-IDabc.html?utm_source=email">PS5 Slim Digital 1TB, ca nou</a>
    <p>2 300 lei</p><p>Iasi</p>
  </td></tr>
  <tr><td>
    <a href="https://www.olx.ro/d/oferta/iphone-18-pro-IDdef.html">iPhone 18 Pro 256GB sigilat</a>
    <span>Preț: 6 900 lei</span>
  </td></tr>
  <tr><td><a href="https://www.olx.ro/cont/setari">Dezabonare</a></td></tr>
</table>
"""


def test_parses_listings_from_alert_email():
    offers = {o.url: o for o in parse_olx_email(EMAIL)}
    assert set(offers) == {
        "https://www.olx.ro/d/oferta/ps5-slim-digital-IDabc.html",
        "https://www.olx.ro/d/oferta/iphone-18-pro-IDdef.html",
    }
    ps5 = offers["https://www.olx.ro/d/oferta/ps5-slim-digital-IDabc.html"]
    assert ps5.title == "PS5 Slim Digital 1TB, ca nou" and ps5.price == Decimal("2300.00")
    assert offers["https://www.olx.ro/d/oferta/iphone-18-pro-IDdef.html"].price == Decimal("6900.00")
    assert all(o.condition == "used" and o.shop_slug == "olx" for o in offers.values())


# structura reală a alertei „Anunțuri noi în filtrele tale” (10.2026), cu valori inventate
ALERT = """
<html><head><style>.x{color:red}</style></head><body><table>
<tr><td>Au apărut anunțuri noi care corespund criteriilor tale de căutare:</td></tr>
<tr><td>Cuvinte cheie</td><td>: playstation 5</td></tr>
<tr><td><a href="https://clicks.marketing.olx.ro/f/a/AAA">Toate</a> <span>196</span></td></tr>
<tr><td><p>anunț selectat</p><p>PlayStation 5 Slim Digital Edition 825GB + 2 Co...</p><p>Bucuresti</p><p>2 700 lei</p>
<a href="https://clicks.marketing.olx.ro/f/a/BBB">Explorează</a></td></tr>
<tr><td><p>Mai multe anunțuri în criterii</p></td></tr>
<tr><td><p>Playstation 5 Pro 2TB</p><p>7 800 lei</p><p>Cluj-Napoca</p><a href="https://clicks.marketing.olx.ro/f/a/CCC">Explorează</a></td></tr>
<tr><td><a href="https://clicks.marketing.olx.ro/f/uni/DDD">Mergi la căutări →</a></td></tr>
</table></body></html>
"""


def test_real_alert_format_cards_without_tracking_links():
    from datetime import UTC, datetime

    from app.services.olx_email import parse_email

    offers = parse_email("Anunțuri noi în filtrele tale - total 196", ALERT, datetime(2026, 10, 26, tzinfo=UTC))
    assert [(o.title, o.price, o.location) for o in offers] == [
        ("PlayStation 5 Slim Digital Edition 825GB + 2 Co...", Decimal("2700.00"), "Bucuresti"),
        ("Playstation 5 Pro 2TB", Decimal("7800.00"), "Cluj-Napoca"),
    ]
    assert all("clicks.marketing" not in o.url and o.url.startswith("https://www.olx.ro/oferte/q-") for o in offers)
    assert offers[0].posted_label == "din alerta OLX (26.10.2026)"


def test_non_alert_emails_ignored():
    from app.services.olx_email import parse_email

    assert parse_email("Ai primit un mesaj nou", ALERT) == []
    assert parse_email("Descoperă acum noutățile din categoria Electronice", ALERT) == []
