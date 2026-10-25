from decimal import Decimal

import pytest

from scrapers.jsonld import extract_opengraph, extract_product, parse_price

# fragment real (simplificat) de pe o pagină de produs PC Garage
PCGARAGE_HTML = """
<html><head>
<meta property="og:title" content="Consola Sony PlayStation 5 Slim Disk Edition 1TB">
<script type="application/ld+json">{"@context": "https://schema.org","@type": "WebPage","name": "x"}</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Consola Sony PlayStation 5 Slim Disk Edition 1TB White + EA Sports FC 26",
  "sku": "3386706",
  "mpn": "SO-1000049862",
  "offers": {
    "@type": "Offer",
    "price": 3123.98,
    "priceCurrency": "RON",
    "availability": "http://schema.org/OutOfStock",
    "itemCondition":"http://schema.org/NewCondition",
  }
}
</script></head></html>
"""


def test_extract_product_from_jsonld():
    d = extract_product(PCGARAGE_HTML)
    assert d["title"].startswith("Consola Sony PlayStation 5 Slim")
    assert d["price"] == Decimal("3123.98")
    assert d["in_stock"] is False
    assert d["condition"] == "new"
    assert d["mpn"] == "SO-1000049862"


def test_extract_graph_and_gtin_and_warranty():
    html = """<script type="application/ld+json">{"@graph":[{"@type":["Product"],"name":"PS5","gtin13":"0711719577294",
    "offers":[{"price":"2499.99","priceCurrency":"RON","availability":"https://schema.org/InStock",
    "itemCondition":"https://schema.org/RefurbishedCondition"}],
    "warranty":{"durationOfWarranty":{"value":2,"unitCode":"ANN"}}}]}</script>"""
    d = extract_product(html)
    assert d["ean"] == "0711719577294"
    assert d["in_stock"] is True
    assert d["condition"] == "refurbished"
    assert d["warranty_months"] == 24


def test_opengraph_fallback():
    html = '<meta property="og:title" content="PS5"><meta property="product:price:amount" content="2.499,99">'
    assert extract_opengraph(html) == {"title": "PS5", "price": Decimal("2499.99")}


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("3.499,99 RON", "3499.99"),
        ("3,499.99", "3499.99"),
        ("3499.99", "3499.99"),
        ("2.675,98 RON", "2675.98"),
        ("3 499 lei", "3499.00"),
        ("3.499", "3499.00"),
        (3123.98, "3123.98"),
    ],
)
def test_parse_price(raw, expected):
    assert parse_price(raw) == Decimal(expected)


def test_microdata_product_ignores_nested_brand_name_and_pads_gtin12():
    from scrapers.jsonld import extract_microdata

    html = """<div itemscope itemtype="http://schema.org/Product">
      <h1 itemprop="name"><span>Consola Sony PlayStation 5 Slim</span> <span>(PS5), 1TB, Digital Edition</span></h1>
      <div itemprop="brand" itemscope itemtype="http://schema.org/Brand"><span itemprop="name">Sony</span></div>
      <meta itemprop="gtin" content="711719577294"/><meta itemprop="mpn" content="PS5SLIMDIGWH"/>
      <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <meta itemprop="price" content="2499.99"><link itemprop="availability" href="http://schema.org/InStock">
      </div></div>"""
    d = extract_microdata(html)
    assert d["title"] == "Consola Sony PlayStation 5 Slim (PS5), 1TB, Digital Edition"
    assert d["price"] == Decimal("2499.99")
    assert d["ean"] == "0711719577294"
    assert d["in_stock"] is True
