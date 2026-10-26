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
