"""Motor de recomandări pe bază de reguli (fără ML). Funcții pure, fără acces la DB."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean, median, pstdev

from recommender.calendar import Event


@dataclass(frozen=True)
class Thresholds:
    """Toate pragurile într-un singur loc."""

    min_history_days: int = 14
    lookback_days: int = 90
    buy_now_percentile: float = 10
    upcoming_sale_percentile: float = 70
    wait_percentile: float = 90
    event_horizon_days: int = 45
    median_window_days: int = 30
    fake_rise_pct: float = 8.0
    fake_rise_window_days: int = 30
    fake_min_history_days: int = 14
    base_confidence: float = 0.9
    volatility_free_cv: float = 0.04  # coef. de variație tolerat fără penalizare


DEFAULT_THRESHOLDS = Thresholds()


@dataclass(frozen=True)
class HistoryPoint:
    """Un punct de schimbare: de la `ts` oferta are aceste valori, până la următorul punct sau până la `until`
    (ultima confirmare + toleranță). După `until` nu știm prețul -> gol în istoric, nu îl extrapolăm."""

    ts: date
    price: float  # prețul afișat
    final_price: float  # preț + transport + penalizare garanție
    old_price: float | None = None
    in_stock: bool = True
    until: date | None = None  # None = valabil până la următorul punct
    origin: str = "scrape"  # scrape | wayback (captură din arhivă)


@dataclass
class OfferHistory:
    offer_id: int
    shop_name: str
    points: list[HistoryPoint]  # sortate după ts


@dataclass
class FakeDiscount:
    offer_id: int
    shop_name: str
    price: float
    old_price: float
    claimed_discount_pct: float
    explanation: list[str]


@dataclass
class Recommendation:
    verdict: str  # BUY_NOW | WAIT | UPCOMING_SALE | NEUTRAL | INSUFFICIENT_DATA
    confidence: float
    reasons: list[str]
    metrics: dict = field(default_factory=dict)
    fake_discount: bool = False
    fake_discounts: list[FakeDiscount] = field(default_factory=list)


# ---------- utilitare ----------


def lei(v: float) -> str:
    return f"{v:,.0f}".replace(",", ".") + " lei"


def percentile(values: list[float], p: float) -> float:
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def percentile_rank(values: list[float], x: float) -> float:
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100 * (below + 0.5 * equal) / len(values)


def point_at(points: list[HistoryPoint], d: date) -> HistoryPoint | None:
    current = None
    for p in points:
        if p.ts > d:
            break
        current = p
    if current is not None and current.until is not None and d > current.until:
        return None  # gol: prețul nu mai e confirmat
    return current


def covered_days(history: list[OfferHistory], start: date, end: date) -> int:
    """Câte zile din interval au cel puțin o ofertă cu preț cunoscut (în stoc sau nu)."""
    n, d = 0, start
    while d <= end:
        if any(point_at(oh.points, d) for oh in history):
            n += 1
        d += timedelta(days=1)
    return n


def market_min_series(history: list[OfferHistory], start: date, end: date) -> dict[date, float | None]:
    """Minimul zilnic al prețului final, doar oferte în stoc (forward-fill între schimbări)."""
    series: dict[date, float | None] = {}
    d = start
    while d <= end:
        prices = [p.final_price for oh in history if (p := point_at(oh.points, d)) and p.in_stock]
        series[d] = min(prices) if prices else None
        d += timedelta(days=1)
    return series


def _values(series: dict[date, float | None], start: date, end: date) -> list[float]:
    return [v for d, v in series.items() if start <= d <= end and v is not None]


# ---------- reducere falsă ----------


def detect_fake_discount(
    offer: OfferHistory, today: date, t: Thresholds = DEFAULT_THRESHOLDS
) -> FakeDiscount | None:
    """Întoarce FakeDiscount dacă oferta are acum un preț tăiat care nu e o reducere reală."""
    pts = [p for p in offer.points if p.ts <= today]
    if not pts:
        return None
    cur = pts[-1]
    if cur.old_price is None or cur.old_price <= cur.price:
        return None
    if (today - pts[0].ts).days < t.fake_min_history_days:
        return None

    # începutul "reducerii" = primul punct din șirul final de puncte cu preț tăiat
    start = cur.ts
    for p in reversed(pts):
        if p.old_price is None:
            break
        start = p.ts

    explanation: list[str] = []
    window = [point_at(pts, today - timedelta(days=i)) for i in range(1, t.median_window_days + 1)]
    window_prices = [p.price for p in window if p is not None]
    if window_prices:
        med = median(window_prices)
        if cur.price >= med:
            explanation.append(
                f"Prețul „redus” de {lei(cur.price)} nu e sub mediana ultimelor {t.median_window_days} de zile ({lei(med)})."
            )

    before = start - timedelta(days=t.fake_rise_window_days)
    baseline = point_at(pts, before)
    if baseline is not None:
        pre = [point_at(pts, start - timedelta(days=i)) for i in range(1, t.fake_rise_window_days + 1)]
        peak = max(p.price for p in pre if p is not None)
        rise = (peak / baseline.price - 1) * 100
        if rise > t.fake_rise_pct:
            explanation.append(
                f"Prețul a crescut cu {rise:.1f}% (de la {lei(baseline.price)} la {lei(peak)}) "
                f"în cele {t.fake_rise_window_days} de zile dinainte de „reducere” (începută pe {start:%d.%m})."
            )
            real = (cur.price / baseline.price - 1) * 100
            explanation.append(
                f"Față de prețul de dinainte de scumpire, reducerea reală e de {-real:.1f}%, "
                f"nu {(1 - cur.price / cur.old_price) * 100:.0f}% cât se afișează."
            )

    if not explanation:
        return None
    return FakeDiscount(
        offer_id=offer.offer_id,
        shop_name=offer.shop_name,
        price=cur.price,
        old_price=cur.old_price,
        claimed_discount_pct=round((1 - cur.price / cur.old_price) * 100, 1),
        explanation=explanation,
    )


# ---------- evenimente ----------


def event_drop_history(series: dict[date, float | None], calendar: list[Event], today: date, t: Thresholds) -> dict:
    """Scăderea medie (%) a minimului de piață în ferestrele anterioare ale fiecărui eveniment."""
    if not series:
        return {}
    first = min(series)
    drops: dict[str, list[float]] = {}
    for ev in calendar:
        if ev.end >= today or ev.start <= first:
            continue
        base = _values(series, ev.start - timedelta(days=t.median_window_days), ev.start - timedelta(days=1))
        during = _values(series, ev.start, ev.end)
        if len(base) < 7 or not during:
            continue
        b = median(base)
        drops.setdefault(ev.slug, []).append((b - min(during)) / b * 100)
    return {slug: round(mean(v), 1) for slug, v in drops.items()}


def upcoming_events(calendar: list[Event], today: date) -> list[Event]:
    return sorted((e for e in calendar if e.end >= today), key=lambda e: e.start)


def days_until(e: Event, today: date) -> int:
    return max(0, (e.start - today).days)


# ---------- recomandarea ----------


def msrp_reason(current: float, msrp: float) -> str:
    pct = (current / msrp - 1) * 100
    if abs(pct) < 1:
        return f"Cel mai bun preț final ({lei(current)}) e practic egal cu prețul recomandat de producător ({lei(msrp)})."
    side = "peste" if pct > 0 else "sub"
    return f"Cel mai bun preț final ({lei(current)}) e cu {abs(pct):.1f}% {side} prețul recomandat de producător ({lei(msrp)})."


def recommend(
    price_history: list[OfferHistory],
    today: date,
    calendar: list[Event],
    t: Thresholds = DEFAULT_THRESHOLDS,
    msrp: float | None = None,
) -> Recommendation:
    """`msrp` (opțional): prețul recomandat de producător — context în motive, nu schimbă verdictul."""
    starts = [oh.points[0].ts for oh in price_history if oh.points]
    fakes = [f for oh in price_history if (f := detect_fake_discount(oh, today, t))]
    fake_kw = {"fake_discount": bool(fakes), "fake_discounts": fakes}

    span_days = (today - min(starts)).days if starts else 0
    # zilele cu date reale contează, nu intervalul: cu goluri (calculator oprit, capturi rare) avem mai puțin
    history_days = covered_days(price_history, min(starts), today) if starts else 0
    if history_days < t.min_history_days:
        # fără verdict, dar spunem ce știm deja: prețul de azi față de MSRP și între magazine
        reasons = [
            f"Avem date de preț pentru doar {history_days} zile; e nevoie de minimum {t.min_history_days} "
            "pentru o recomandare."
        ]
        if span_days > history_days + 1:
            reasons.append(
                f"Prima observație e de acum {span_days} zile, dar între observații lipsesc date "
                "(scraper oprit sau capturi rare în arhivă) — nu completăm golurile prin presupuneri."
            )
        metrics: dict = {"history_days": history_days, "span_days": span_days}
        today_prices = sorted(
            p.final_price for oh in price_history if (p := point_at(oh.points, today)) and p.in_stock
        )
        if today_prices:
            metrics["current_min_final_price"] = round(today_prices[0], 2)
            if msrp:
                metrics["vs_msrp_pct"] = round((today_prices[0] / msrp - 1) * 100, 1)
                reasons.append(msrp_reason(today_prices[0], msrp))
            if len(today_prices) > 1:
                reasons.append(
                    f"Diferența dintre cel mai ieftin și cel mai scump magazin azi: "
                    f"{lei(today_prices[-1] - today_prices[0])} ({len(today_prices)} oferte în stoc)."
                )
        return Recommendation(
            verdict="INSUFFICIENT_DATA", confidence=0.0, reasons=reasons, metrics=metrics, **fake_kw
        )

    series = market_min_series(price_history, min(starts), today)
    current = series[today]
    if current is None:
        known_today = any(point_at(oh.points, today) for oh in price_history)
        last_known = max((d for d, v in series.items() if v is not None), default=None)
        reason = (
            "Niciun magazin urmărit nu are acum produsul în stoc."
            if known_today
            else "Nu avem prețuri confirmate recent"
            + (f" (ultimele date: {last_known:%d.%m.%Y})" if last_known else "")
            + " — scraperul nu a rulat între timp."
        )
        return Recommendation(
            verdict="NEUTRAL" if known_today else "INSUFFICIENT_DATA",
            confidence=0.2 if known_today else 0.0,
            reasons=[reason],
            metrics={"history_days": history_days, "span_days": span_days},
            **fake_kw,
        )

    window = _values(series, today - timedelta(days=t.lookback_days), today)
    p10 = percentile(window, t.buy_now_percentile)
    p70 = percentile(window, t.upcoming_sale_percentile)
    p90 = percentile(window, t.wait_percentile)
    med30 = median(_values(series, today - timedelta(days=t.median_window_days), today) or window)
    rank = percentile_rank(window, current)
    cv = pstdev(window) / mean(window) if len(window) > 1 else 0.0
    upcoming = upcoming_events(calendar, today)
    ev = upcoming[0] if upcoming else None
    days_to_event = days_until(ev, today) if ev else None
    soon = [e for e in upcoming if days_until(e, today) <= t.event_horizon_days]
    drops = event_drop_history(series, calendar, today, t)
    span = min(span_days, t.lookback_days)
    missing_90d = (span + 1) - len(window)

    metrics = {
        "current_min_final_price": round(current, 2),
        "percentile_10_90d": round(p10, 2),
        "percentile_70_90d": round(p70, 2),
        "percentile_90_90d": round(p90, 2),
        "percentile_rank_90d": round(rank, 1),
        "median_30d": round(med30, 2),
        "vs_median_30d_pct": round((current / med30 - 1) * 100, 1),
        "min_90d": round(min(window), 2),
        "max_90d": round(max(window), 2),
        "volatility_cv": round(cv, 4),
        "history_days": history_days,
        "span_days": span_days,
        "missing_days_90d": missing_90d,
        "next_event": ev.name if ev else None,
        "next_event_date": ev.date.isoformat() if ev else None,
        "days_to_next_event": days_to_event,
        "event_avg_drop_pct": drops,
        "vs_msrp_pct": round((current / msrp - 1) * 100, 1) if msrp else None,
    }

    vs_med = metrics["vs_median_30d_pct"]
    context = (
        f"Cel mai bun preț final acum: {lei(current)} "
        f"({'+' if vs_med > 0 else ''}{vs_med:.1f}% față de mediana pe 30 de zile, {lei(med30)})."
    )

    def event_reason(e: Event) -> str:
        d = days_until(e, today)
        when = "este în desfășurare" if d == 0 else f"începe în {d} zile ({e.start:%d.%m.%Y})"
        if e.slug in drops:
            return f"{e.name} {when}; în perioadele anterioare, prețul minim a scăzut în medie cu {drops[e.slug]:.1f}%."
        return f"{e.name} {when}; nu avem încă istoric pentru acest eveniment, deci nu putem estima scăderea."

    reasons: list[str]
    if current <= p10:
        verdict = "BUY_NOW"
        reasons = [
            f"Preț excelent: {lei(current)} e sub percentila 10 din ultimele {span} de zile ({lei(p10)}).",
            context,
        ]
        if soon:
            reasons.append(event_reason(soon[0]) + " Prețul actual e deja printre cele mai mici observate.")
    elif rank >= t.upcoming_sale_percentile and soon:
        verdict = "UPCOMING_SALE"
        reasons = [
            f"Prețul actual e mai mare decât {rank:.0f}% din prețurile ultimelor {span} de zile "
            f"(percentila 70: {lei(p70)}).",
            *[event_reason(e) for e in soon],
            context,
        ]
    elif rank >= t.wait_percentile:
        verdict = "WAIT"
        reasons = [
            f"Prețul e în zona maximă: peste percentila 90 din ultimele {span} de zile ({lei(p90)}).",
            f"Minimul observat în aceeași perioadă a fost {lei(min(window))}.",
            context,
        ]
    else:
        verdict = "NEUTRAL"
        reasons = [
            f"Prețul e în zona obișnuită: percentila {rank:.0f} din ultimele {span} de zile "
            f"(interval {lei(min(window))} – {lei(max(window))}).",
            context,
        ]
        reasons.extend(event_reason(e) for e in soon)

    # încrederea scade cu istoric scurt și volatilitate mare
    confidence = t.base_confidence
    if history_days < t.lookback_days:
        confidence *= 0.5 + 0.5 * history_days / t.lookback_days
    if missing_90d > 0:
        confidence *= 1 - 0.5 * missing_90d / (span + 1)
    if cv > t.volatility_free_cv:
        confidence *= max(0.4, 1 - (cv - t.volatility_free_cv) * 5)
    if verdict == "UPCOMING_SALE" and not any(e.slug in drops for e in soon):
        confidence *= 0.7
    confidence = round(min(0.95, max(0.05, confidence)), 2)

    if msrp:
        reasons.append(msrp_reason(current, msrp))
    if missing_90d > 0:
        reasons.append(
            f"Lipsesc date pentru {missing_90d} din ultimele {span + 1} zile (scraper oprit) — încrederea e redusă."
        )
    if history_days < t.lookback_days:
        reasons.append(f"Istoric de doar {history_days} zile — încrederea e redusă.")
    if cv > t.volatility_free_cv:
        reasons.append(f"Prețul a fost volatil (variație {cv * 100:.1f}%) — încrederea e redusă.")
    if fakes:
        reasons.append(
            "Atenție: reducere suspectă la " + ", ".join(f.shop_name for f in fakes) + " (vezi detaliile)."
        )

    return Recommendation(verdict=verdict, confidence=confidence, reasons=reasons, metrics=metrics, **fake_kw)
