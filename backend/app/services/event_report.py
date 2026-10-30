"""Raportul unui eveniment de reduceri (ex. Black Friday): a scăzut prețul cu adevărat sau doar s-a scris „reducere”?

Referința = mediana minimului zilnic al pieței în cele 30 de zile dinaintea evenimentului (ce plăteai normal).
În timpul / după eveniment: cel mai mic preț final din fereastra evenimentului, comparat cu referința.
Înainte de eveniment raportul arată doar referința, „fotografiată” din timp — exact ce trebuie ca să nu ne păcălească
scumpirile de dinainte de reduceri. Funcție pură, testată; datele vin din catalog."""

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median

from recommender.calendar import Event
from recommender.rules import OfferHistory, market_min_series

BASELINE_DAYS = 30
MIN_BASELINE_DAYS = 7  # sub atâtea zile cu preț în stoc, nu avem o referință
REAL_DROP = 0.05  # cel puțin 5% sub referință = reducere reală


@dataclass(frozen=True)
class EventRow:
    baseline: float | None  # mediana prețului din cele 30 de zile dinainte
    baseline_days: int  # zile cu preț în stoc în fereastra de referință
    event_low: float | None  # cel mai mic preț final în fereastra evenimentului (până azi)
    change_pct: float | None  # event_low față de referință (negativ = mai ieftin)
    verdict: str  # pending | real | small | none | no_data


def pick_occurrence(events: list[Event], slug: str, today: date) -> Event | None:
    """Ediția relevantă azi: cea în curs, cea încheiată de cel mult 60 de zile, altfel următoarea."""
    mine = sorted((e for e in events if e.slug == slug), key=lambda e: e.start)
    for e in mine:
        if e.start <= today <= e.end + timedelta(days=60):
            return e
    return next((e for e in mine if e.start > today), mine[-1] if mine else None)


def event_row(history: list[OfferHistory], event: Event, today: date) -> EventRow:
    base_start, base_end = event.start - timedelta(days=BASELINE_DAYS), event.start - timedelta(days=1)
    base_end = min(base_end, today)
    base = [v for v in market_min_series(history, base_start, base_end).values() if v is not None] if base_start <= base_end else []
    baseline = median(base) if len(base) >= MIN_BASELINE_DAYS else None
    if today < event.start:
        return EventRow(baseline, len(base), None, None, "pending" if baseline is not None else "no_data")
    during = [v for v in market_min_series(history, event.start, min(event.end, today)).values() if v is not None]
    low = min(during) if during else None
    if baseline is None or low is None:
        return EventRow(baseline, len(base), low, None, "no_data")
    change = (low / baseline - 1) * 100
    verdict = "real" if change <= -REAL_DROP * 100 else "small" if change < 0 else "none"
    return EventRow(baseline, len(base), low, round(change, 1), verdict)
