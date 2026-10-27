from datetime import date, timedelta

from recommender.calendar import Event, load_calendar
from recommender.rules import HistoryPoint, OfferHistory, detect_fake_discount, recommend

TODAY = date(2026, 10, 25)
NO_EVENTS: list[Event] = []


def flat_offer(days: int, price: float = 2500, offer_id: int = 1, shop: str = "Shop") -> OfferHistory:
    return OfferHistory(offer_id, shop, [HistoryPoint(TODAY - timedelta(days=days), price, price)])


def offer_from_changes(changes: list[tuple[int, float, float | None]], offer_id=1, shop="Flanco") -> OfferHistory:
    """changes: (zile_în_urmă, preț, preț_tăiat)"""
    pts = [HistoryPoint(TODAY - timedelta(days=d), p, p, old) for d, p, old in changes]
    return OfferHistory(offer_id, shop, sorted(pts, key=lambda p: p.ts))


def test_insufficient_data_under_14_days():
    rec = recommend([flat_offer(10)], TODAY, NO_EVENTS)
    assert rec.verdict == "INSUFFICIENT_DATA"
    assert rec.confidence == 0
    assert "11 zile" in rec.reasons[0]  # zile calendaristice cu date, inclusiv azi


def test_insufficient_data_without_any_history():
    assert recommend([], TODAY, NO_EVENTS).verdict == "INSUFFICIENT_DATA"


def test_buy_now_when_below_10th_percentile():
    offer = offer_from_changes([(120, 2500, None), (60, 2550, None), (30, 2480, None), (2, 2200, 2500)], shop="eMAG")
    rec = recommend([offer], TODAY, NO_EVENTS)
    assert rec.verdict == "BUY_NOW"
    assert "percentila 10" in rec.reasons[0]
    assert rec.metrics["current_min_final_price"] == 2200
    assert rec.reasons  # niciodată verdict fără motive


def test_upcoming_sale_when_price_high_and_event_close():
    cal = [
        Event("black_friday", "Black Friday", date(2025, 11, 28), date(2025, 11, 21), date(2025, 12, 1)),
        Event("black_friday", "Black Friday", date(2026, 11, 27), date(2026, 11, 20), date(2026, 11, 30)),
    ]
    # an trecut: 2500, la BF 2125 (-15%); acum scumpit la 2700
    offer = offer_from_changes(
        [(400, 2500, None), (338, 2125, 2500), (327, 2500, None), (20, 2700, None)], shop="eMAG"
    )
    rec = recommend([offer], TODAY, cal)
    assert rec.verdict == "UPCOMING_SALE"
    assert rec.metrics["days_to_next_event"] == 26
    assert rec.metrics["event_avg_drop_pct"]["black_friday"] == 15.0
    assert any("scăzut în medie cu 15.0%" in r for r in rec.reasons)


def test_upcoming_sale_says_explicitly_when_no_event_history():
    cal = [Event("singles_day", "Singles' Day", date(2026, 11, 11), date(2026, 11, 10), date(2026, 11, 12))]
    offer = offer_from_changes([(100, 2500, None), (20, 2700, None)])
    rec = recommend([offer], TODAY, cal)
    assert rec.verdict == "UPCOMING_SALE"
    assert any("nu avem încă istoric" in r for r in rec.reasons)


def test_neutral_with_usual_price():
    offer = offer_from_changes([(100, 2500, None), (60, 2450, None), (30, 2550, None), (10, 2500, None)])
    rec = recommend([offer], TODAY, NO_EVENTS)
    assert rec.verdict == "NEUTRAL"


def test_market_min_ignores_out_of_stock():
    cheap_oos = OfferHistory(2, "B", [HistoryPoint(TODAY - timedelta(days=100), 1000, 1000, None, False)])
    rec = recommend([flat_offer(100, 2500), cheap_oos], TODAY, NO_EVENTS)
    assert rec.metrics["current_min_final_price"] == 2500


def test_fake_discount_price_raised_before_sale():
    # 2400 -> scumpit la 2712 (+13%) cu 3 săptămâni înainte -> "redus" la 2399, tăiat 2712
    offer = offer_from_changes([(120, 2400, None), (28, 2712, None), (6, 2399, 2712)])
    fake = detect_fake_discount(offer, TODAY)
    assert fake is not None
    assert fake.claimed_discount_pct == 11.5
    assert any("crescut cu 13.0%" in e for e in fake.explanation)
    rec = recommend([offer], TODAY, NO_EVENTS)
    assert rec.fake_discount is True
    assert any("reducere suspectă" in r for r in rec.reasons)


def test_fake_discount_when_reduced_price_not_below_30d_median():
    offer = offer_from_changes([(120, 2400, None), (3, 2400, 2800)])
    fake = detect_fake_discount(offer, TODAY)
    assert fake is not None
    assert "mediana" in fake.explanation[0]


def test_real_discount_not_flagged():
    offer = offer_from_changes([(120, 2500, None), (5, 2200, 2500)])
    assert detect_fake_discount(offer, TODAY) is None


def test_confidence_lower_for_short_history():
    short = recommend([offer_from_changes([(20, 2500, None), (5, 2550, None)])], TODAY, NO_EVENTS)
    long = recommend([offer_from_changes([(200, 2500, None), (5, 2550, None)])], TODAY, NO_EVENTS)
    assert short.confidence < long.confidence


def test_calendar_file_loads_with_black_friday_2026():
    cal = load_calendar()
    assert any(e.slug == "black_friday" and e.date == date(2026, 11, 27) for e in cal)


def test_msrp_context_in_reasons_and_metrics():
    offer = offer_from_changes([(100, 2500, None), (60, 2450, None), (30, 2550, None), (10, 2500, None)])
    rec = recommend([offer], TODAY, NO_EVENTS, msrp=2549)
    assert rec.verdict == "NEUTRAL"  # MSRP e doar context, nu schimbă verdictul
    assert rec.metrics["vs_msrp_pct"] == -1.9
    assert any("1.9% sub prețul recomandat" in r for r in rec.reasons)


def test_insufficient_data_still_reports_msrp_and_shop_spread():
    a = flat_offer(3, 4449.99, offer_id=1, shop="evoMAG")
    b = flat_offer(3, 4499.0, offer_id=2, shop="eMAG")
    rec = recommend([a, b], TODAY, NO_EVENTS, msrp=2549)
    assert rec.verdict == "INSUFFICIENT_DATA"
    assert rec.metrics["vs_msrp_pct"] == 74.6
    assert any("74.6% peste" in r for r in rec.reasons)
    assert any("49 lei" in r and "2 oferte" in r for r in rec.reasons)


def test_gaps_are_not_filled_and_count_against_history():
    # o captură veche din arhivă (valabilă o zi) + 5 zile de scraping recent => 6 zile de date, nu 400
    old = HistoryPoint(TODAY - timedelta(days=400), 2370, 2370, until=TODAY - timedelta(days=399), origin="wayback")
    recent = HistoryPoint(TODAY - timedelta(days=4), 2500, 2500)
    rec = recommend([OfferHistory(1, "evoMAG", [old, recent])], TODAY, NO_EVENTS)
    assert rec.verdict == "INSUFFICIENT_DATA"
    assert rec.metrics["history_days"] == 7  # 2 zile captură + 5 zile recente
    assert any("lipsesc date" in r for r in rec.reasons)


def test_no_recent_confirmation_is_not_reported_as_out_of_stock():
    p = HistoryPoint(TODAY - timedelta(days=60), 2500, 2500, until=TODAY - timedelta(days=5))
    rec = recommend([OfferHistory(1, "eMAG", [p])], TODAY, NO_EVENTS)
    assert rec.verdict == "INSUFFICIENT_DATA"
    assert "nu a rulat" in rec.reasons[0]


def test_missing_days_reduce_confidence():
    full = OfferHistory(1, "A", [HistoryPoint(TODAY - timedelta(days=120), 2500, 2500)])
    gappy = OfferHistory(
        1,
        "A",
        [
            HistoryPoint(TODAY - timedelta(days=120), 2500, 2500, until=TODAY - timedelta(days=60)),
            HistoryPoint(TODAY - timedelta(days=30), 2500, 2500),
        ],
    )
    a, b = recommend([full], TODAY, NO_EVENTS), recommend([gappy], TODAY, NO_EVENTS)
    assert b.confidence < a.confidence
    assert b.metrics["missing_days_90d"] == 29
    assert any("Lipsesc date pentru 29" in r for r in b.reasons)


def test_new_product_still_falling_is_not_buy_now():
    # lansat acum 40 de zile, se ieftinește cu ~1% pe săptămână -> minimul de azi nu e „preț excelent”
    pts = [HistoryPoint(TODAY - timedelta(days=d), 8000 * (1 + d / 700), 8000 * (1 + d / 700)) for d in range(40, -1, -5)]
    rec = recommend([OfferHistory(1, "eMAG", sorted(pts, key=lambda p: p.ts))], TODAY, NO_EVENTS)
    assert rec.verdict == "NEUTRAL"
    assert rec.metrics["trend_30d_pct"] <= -3
    assert "se ieftinește constant" in rec.reasons[0]


def test_old_product_at_minimum_is_still_buy_now():
    # istoric lung: aceeași regulă de trend nu se aplică (nu mai e produs nou)
    pts = [HistoryPoint(TODAY - timedelta(days=200), 2500, 2500), HistoryPoint(TODAY - timedelta(days=20), 2400, 2400),
           HistoryPoint(TODAY - timedelta(days=2), 2200, 2200)]
    assert recommend([OfferHistory(1, "eMAG", pts)], TODAY, NO_EVENTS).verdict == "BUY_NOW"


def test_new_product_with_shown_discount_is_buy_now_not_trend():
    # produs nou, preț stabil, apoi promoție de 7% cu preț tăiat -> e reducere, nu trend
    pts = [HistoryPoint(TODAY - timedelta(days=40), 8000, 8000), HistoryPoint(TODAY - timedelta(days=3), 7440, 7440, 8000)]
    rec = recommend([OfferHistory(1, "Altex", pts)], TODAY, NO_EVENTS)
    assert rec.verdict == "BUY_NOW"


def test_real_drop_against_last_month_median():
    from recommender.rules import real_drop

    today = date(2026, 11, 20)
    steady = OfferHistory(1, "A", [HistoryPoint(today - timedelta(days=40), 3000, 3000),
                                   HistoryPoint(today, 2700, 2700, old_price=3500)])
    d = real_drop(steady, today)
    assert d.reference_price == 3000 and d.drop_pct == 10.0 and d.lowest_in_window
    # prețul tăiat afișat nu contează; fără scădere față de lună -> nimic
    flat = OfferHistory(2, "B", [HistoryPoint(today - timedelta(days=40), 3000, 3000, old_price=4000)])
    assert real_drop(flat, today) is None
    # istoric prea scurt
    young = OfferHistory(3, "C", [HistoryPoint(today - timedelta(days=3), 3000, 3000), HistoryPoint(today, 2500, 2500)])
    assert real_drop(young, today) is None
