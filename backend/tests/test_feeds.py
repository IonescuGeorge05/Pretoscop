"""Feed-uri de produse: compari.ro (XML), Google Merchant (RSS), 2Performant/Profitshare (CSV)."""

from decimal import Decimal

from scrapers.feeds import parse_feed
from scrapers.matcher import match_title

COMPARI_XML = """<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <Identifier>12345</Identifier>
    <Manufacturer>Sony</Manufacturer>
    <Name>Consola Sony PlayStation 5 Slim Digital Edition 1TB</Name>
    <Category>Console</Category>
    <ProductUrl>https://www.magazin.ro/ps5-slim-digital</ProductUrl>
    <Price>2.899,99</Price>
    <ProductNumber>CFI-2016B</ProductNumber>
    <DeliveryCost>0</DeliveryCost>
  </product>
  <product>
    <Identifier>999</Identifier>
    <Name>Mașină de spălat rufe Arctic 8kg</Name>
    <ProductUrl>https://www.magazin.ro/masina</ProductUrl>
    <Price>1499</Price>
  </product>
</products>"""

GOOGLE_RSS = """<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>Magazin</title>
  <item>
    <g:id>A1</g:id>
    <title>Telefon mobil Apple iPhone 18 Pro, 256GB, 5G, Black</title>
    <link>https://www.magazin.ro/iphone-18-pro-256</link>
    <g:price>7999.99 RON</g:price>
    <g:sale_price>7499.99 RON</g:sale_price>
    <g:availability>in stock</g:availability>
    <g:gtin>195950000000</g:gtin>
    <g:condition>new</g:condition>
    <g:shipping><g:country>RO</g:country><g:price>19.99 RON</g:price></g:shipping>
  </item>
  <item>
    <g:id>A2</g:id>
    <title>Telefon mobil Apple iPhone 18 Pro Max, 512GB, 5G, Silver</title>
    <link>https://www.magazin.ro/iphone-18-pro-max-512</link>
    <g:price>9499.99 RON</g:price>
    <g:availability>out of stock</g:availability>
  </item>
</channel>
</rss>"""

PERFORMANT_CSV = (
    "title;description;price;old_price;category;url;aff_link;active\n"
    "Consola PlayStation 5 Pro 2TB;Consola;3785,12;4132,23;Console;https://www.magazin.ro/ps5-pro;"
    "https://event.2performant.com/events/click?ad_type=product_store&unique=abc;1\n"
    "Husa protectie PS5 Pro;Husa;99;;Accesorii;https://www.magazin.ro/husa;https://event.2performant.com/x;1\n"
)


def test_compari_xml_filters_irrelevant_rows_and_parses_ro_price():
    offers = parse_feed(COMPARI_XML.encode(), "magazin")
    assert len(offers) == 1  # mașina de spălat nu e familie urmărită
    o = offers[0]
    assert (o.price, o.mpn, o.url) == (Decimal("2899.99"), "CFI-2016B", "https://www.magazin.ro/ps5-slim-digital")
    assert match_title(o.title).product_slug == "ps5-slim-digital-1tb"


def test_google_merchant_sale_price_availability_nested_shipping():
    offers = {o.url: o for o in parse_feed(GOOGLE_RSS.encode(), "magazin")}
    pro = offers["https://www.magazin.ro/iphone-18-pro-256"]
    assert pro.price == Decimal("7499.99") and pro.old_price == Decimal("7999.99")  # g:sale_price + g:price
    assert pro.ean == "0195950000000" and pro.in_stock and pro.condition == "new"
    assert pro.raw["shipping"] == "19.99"
    assert not offers["https://www.magazin.ro/iphone-18-pro-max-512"].in_stock
    assert match_title(pro.title).product_slug == "iphone-18-pro-256gb"


def test_2performant_csv_without_vat_and_affiliate_link():
    offers = parse_feed(PERFORMANT_CSV.encode(), "magazin", vat_included=False)
    assert len(offers) == 2  # filtrul de familie lasă și husa; matcher-ul o exclude
    ps5 = offers[0]
    assert ps5.price == Decimal("4580.00")  # 3785,12 + 21% TVA
    assert ps5.old_price == Decimal("5000.00")
    assert ps5.raw["affiliate_url"].startswith("https://event.2performant.com/")
    assert match_title(offers[1].title).kind == "accessory"
