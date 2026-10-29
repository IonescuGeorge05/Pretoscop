from decimal import Decimal

from app.services.pricing import compare, final_price, shipping_cost, warranty_penalty

FREE = {"free_over": 200, "flat": 19.99}
PAID = {"free_over": None, "flat": 29.99}


def test_required_example_24_months_free_shipping_beats_cheaper_offer():
    """3499 lei, transport 0, 24 luni bate 3449 lei + 29.99 transport + 12 luni."""
    a = final_price(Decimal("3499"), FREE, 24)
    b = final_price(Decimal("3449"), PAID, 12)
    assert a.final_price == Decimal("3499.00")
    assert b.shipping == Decimal("29.99")
    assert b.warranty_penalty == Decimal("206.94")  # 3449 * 0.005 * 12
    assert b.final_price == Decimal("3685.93")
    result = compare(a, b, "Magazin A", "Magazin B")
    assert result.winner == "a"
    assert "Magazin A câștigă" in result.explanation
    assert "transport" in result.explanation and "garanție 12 luni" in result.explanation


def test_shipping_free_threshold_is_inclusive():
    assert shipping_cost(Decimal("200"), FREE) == 0
    assert shipping_cost(Decimal("199.99"), FREE) == Decimal("19.99")


def test_shipping_without_rules_is_zero():
    assert shipping_cost(Decimal("100"), None) == 0
    assert shipping_cost(Decimal("100"), {}) == 0


def test_warranty_penalty_never_negative_for_longer_warranty():
    assert warranty_penalty(Decimal("3000"), 36) == 0
    assert warranty_penalty(Decimal("3000"), 24) == 0
    assert warranty_penalty(Decimal("3000"), 23) == Decimal("15.00")


def test_warranty_penalty_rate_configurable():
    assert warranty_penalty(Decimal("1000"), 12, rate=Decimal("0.01")) == Decimal("120.00")


def test_cost_per_warranty_month():
    b = final_price(Decimal("2400"), FREE, 24)
    assert b.cost_per_warranty_month == Decimal("100.00")


def test_compare_tie():
    a = final_price(Decimal("2000"), FREE, 24)
    result = compare(a, a)
    assert result.winner is None


def test_compare_diffs_are_b_minus_a():
    a = final_price(Decimal("3499"), FREE, 24)
    b = final_price(Decimal("3449"), PAID, 12)
    diffs = {d.component: d.diff for d in compare(a, b).diffs}
    assert diffs["price"] == Decimal("-50.00")
    assert diffs["shipping"] == Decimal("29.99")
    assert diffs["warranty_months"] == -12


def test_no_warranty_has_no_penalty_only_shorter_warranty_does():
    assert warranty_penalty(Decimal("2700"), 0) == 0  # anunț second hand: prețul rămâne cel din anunț
    assert final_price(Decimal("2700"), {"free_over": None, "flat": 0}, 0).final_price == Decimal("2700.00")
    assert warranty_penalty(Decimal("2700"), 12) == Decimal("162.00")  # garanție mai scurtă: penalizare


def test_color_of_reads_ro_and_en_names():
    from app.services.catalog import color_of

    assert color_of("Apple iPhone 18 Pro Telefon Mobil 256GB Negru") == "Negru"
    assert color_of("Telefon mobil Apple iPhone 18 Pro, 2TB, 5G, Silver") == "Argintiu"
    assert color_of("Apple iPhone 18 Pro Max 512GB - Glacier") == "Glacier"
    assert color_of("PlayStation 5 Slim 1TB") is None


def test_search_query_for_other_shops_drops_brackets_and_commas():
    from app.models import Product
    from app.services.catalog import search_query

    p = Product(name="PlayStation 5 Slim Digital Edition, 825 GB (E-Chassis)")
    assert search_query(p) == "PlayStation 5 Slim Digital Edition 825 GB"
