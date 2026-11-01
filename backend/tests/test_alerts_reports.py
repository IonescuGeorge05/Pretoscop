"""Alerte pe email, „Am găsit mai ieftin” și raportul de eveniment (funcții pure + SQLite in-memory)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import PriceAlert, Product
from app.services.alerts import due
from app.services.event_report import event_row, pick_occurrence
from app.services.reports import ReportError, parse_report
from recommender.calendar import Event
from recommender.rules import HistoryPoint, OfferHistory

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)


def alert(**kw) -> PriceAlert:
    base = dict(kind="price", target_price=Decimal("3000"), confirmed_at=NOW - timedelta(days=1), last_sent_at=None, last_sent_price=None)
    return PriceAlert(**(base | kw))


def test_price_alert_fires_once_then_only_on_a_new_lower_price_a_day_later():
    assert due(alert(), Decimal("2999"), NOW)
    assert not due(alert(), Decimal("3001"), NOW)
    assert not due(alert(confirmed_at=None), Decimal("2000"), NOW)  # neconfirmată
    sent = dict(last_sent_at=NOW - timedelta(hours=2), last_sent_price=Decimal("2999"))
    assert not due(alert(**sent), Decimal("2899"), NOW)  # prea curând
    later = dict(last_sent_at=NOW - timedelta(days=2), last_sent_price=Decimal("2999"))
    assert due(alert(**later), Decimal("2899"), NOW)
    assert not due(alert(**later), Decimal("2999"), NOW)  # același preț: nu repetăm


def test_stock_alert_fires_when_anything_is_in_stock():
    assert due(alert(kind="stock", target_price=None), Decimal("4000"), NOW)
    assert not due(alert(kind="stock", target_price=None), None, NOW)


def test_report_parsing_and_sanity_checks():
    p = Product(slug="ps5-pro-2tb", name="PS5 Pro", msrp_ron=Decimal("4819"))
    assert parse_report(p, "https://www.altex.ro/consola-ps5-pro/cpd/X/", "3.999,99") == (
        "https://www.altex.ro/consola-ps5-pro/cpd/X/", "altex.ro", Decimal("3999.99")
    )
    for url, price in [("altex.ro/ps5", "3999"), ("https://altex.ro/ps5", "199"), ("https://altex.ro/ps5", "abc")]:
        with pytest.raises(ReportError):
            parse_report(p, url, price)


def history(prices: dict[date, float]) -> list[OfferHistory]:
    points = [
        HistoryPoint(ts=d, price=v, final_price=v, old_price=None, in_stock=True, until=d + timedelta(days=1), origin="scrape")
        for d, v in sorted(prices.items())
    ]
    return [OfferHistory(offer_id=1, shop_name="X", points=points)]


BF = Event(slug="black_friday", name="Black Friday", date=date(2026, 11, 27), start=date(2026, 11, 20), end=date(2026, 11, 30))


def test_event_report_baseline_before_and_verdict_during():
    days = {date(2026, 10, 21) + timedelta(days=i): 3000.0 for i in range(30)}
    days[date(2026, 11, 22)] = 2700.0  # -10% în Black Friday
    h = history(days)
    before = event_row(h, BF, date(2026, 11, 10))
    assert before.verdict == "pending" and before.baseline == 3000.0
    during = event_row(h, BF, date(2026, 11, 23))
    assert during.verdict == "real" and during.change_pct == -10.0
    flat = event_row(history({d: 3000.0 for d in days}), BF, date(2026, 11, 23))
    assert flat.verdict == "none"
    assert event_row([], BF, date(2026, 11, 23)).verdict == "no_data"


def test_pick_occurrence_prefers_running_or_recent_then_next():
    old = Event(slug="black_friday", name="BF", date=date(2025, 11, 28), start=date(2025, 11, 21), end=date(2025, 12, 1))
    assert pick_occurrence([old, BF], "black_friday", date(2026, 10, 30)) == BF
    assert pick_occurrence([old, BF], "black_friday", date(2025, 12, 20)) == old


def test_owner_is_emailed_only_on_status_changes(monkeypatch):
    from app.services import alerts
    from app.services.scrape_runner import _notify_change

    sent = []
    monkeypatch.setattr(alerts, "notify_owner", lambda subject, body: sent.append(subject))
    _notify_change("iSTYLE", "active", {"status": "blocked", "reason": "RateLimited: 429"})
    _notify_change("iSTYLE", "blocked", {"status": "blocked"})  # tot blocat: fără email nou
    _notify_change("iSTYLE", "blocked", {"status": "ok", "listings": 12})
    _notify_change("Anze", "active", {"status": "ok"})  # rulare normală: fără email
    assert sent == ["iSTYLE ne-a blocat", "iSTYLE merge din nou"]
