from datetime import date, timedelta

from app.services.shop_trust import discount_episodes
from recommender.rules import HistoryPoint, OfferHistory

TODAY = date(2026, 11, 4)


def offer(changes: list[tuple[int, float, float | None]]) -> OfferHistory:
    """changes: (zile_în_urmă, preț, preț_tăiat)"""
    pts = [HistoryPoint(TODAY - timedelta(days=d), p, p, old) for d, p, old in changes]
    return OfferHistory(1, "Shop", sorted(pts, key=lambda p: p.ts))


def test_real_then_fake_discount_episodes():
    o = offer([
        (120, 2500, None),
        (80, 2200, 2500),  # reducere reală, 10 zile
        (70, 2500, None),
        (30, 2800, None),  # scumpit cu +12%…
        (5, 2499, 2800),  # …apoi „redus”: falsă
    ])
    eps = discount_episodes(o, TODAY - timedelta(days=90), TODAY)
    assert [(e.judged, e.fake) for e in eps] == [(True, False), (True, True)]
    assert eps[0].end == TODAY - timedelta(days=71) and eps[1].end == TODAY
    assert eps[1].claimed_pct == 10.8


def test_discount_too_early_to_judge_and_outside_window():
    early = offer([(10, 2500, None), (5, 2400, 2600)])  # doar 5 zile de istoric la început
    assert [(e.judged, e.fake) for e in discount_episodes(early, TODAY - timedelta(days=90), TODAY)] == [(False, False)]
    old = offer([(200, 2500, None), (150, 2200, 2500), (140, 2500, None)])  # s-a terminat înainte de fereastră
    assert discount_episodes(old, TODAY - timedelta(days=90), TODAY) == []
