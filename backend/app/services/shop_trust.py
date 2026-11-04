"""Cât de cinstite sunt reducerile fiecărui magazin: din istoricul nostru, câte dintre reducerile afișate (preț tăiat)
în ultimele 90 de zile au fost false după aceeași regulă ca pe pagina produsului (`detect_fake_discount`).

O „reducere” = o perioadă continuă în care oferta a avut preț tăiat. O judecăm doar dacă aveam destul istoric când a
început (altfel nu știm ce era normal); e falsă dacă regula o prinde în oricare zi a perioadei."""

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Offer, Shop
from app.services import catalog
from recommender.rules import DEFAULT_THRESHOLDS, OfferHistory, Thresholds, detect_fake_discount

WINDOW_DAYS = 90
MIN_JUDGED = 3  # sub atâtea reduceri judecate nu dăm un procent


@dataclass(frozen=True)
class Episode:
    start: date
    end: date  # ultima zi cu preț tăiat (sau azi, dacă durează)
    claimed_pct: float  # reducerea afișată la început
    judged: bool  # aveam destul istoric înainte ca să o putem judeca
    fake: bool


def discount_episodes(offer: OfferHistory, since: date, today: date, t: Thresholds = DEFAULT_THRESHOLDS) -> list[Episode]:
    """Perioadele cu preț tăiat ale unei oferte care se suprapun cu [since, today]. Funcție pură."""
    pts = [p for p in offer.points if p.ts <= today]
    out: list[Episode] = []
    i = 0
    while i < len(pts):
        p = pts[i]
        if p.old_price is None or p.old_price <= p.price:
            i += 1
            continue
        j = i
        while j + 1 < len(pts) and pts[j + 1].old_price is not None and pts[j + 1].old_price > pts[j + 1].price:
            j += 1
        start = p.ts
        end = pts[j + 1].ts - timedelta(days=1) if j + 1 < len(pts) else min(today, pts[j].until or today)
        if end >= since:
            judged = bool(pts) and (start - pts[0].ts).days >= t.fake_min_history_days
            # verificăm la fiecare schimbare din perioadă și în ultima ei zi (mediana pe 30 de zile se mișcă zilnic)
            days = {q.ts for q in pts[i : j + 1]} | {end}
            fake = judged and any(detect_fake_discount(offer, d, t) for d in sorted(days))
            out.append(Episode(start, end, round((1 - p.price / p.old_price) * 100, 1), judged, fake))
        i = j + 1
    return out


@dataclass
class ShopScore:
    slug: str
    name: str
    status: str
    offers: int = 0  # oferte noi, vândute direct, urmărite în fereastră
    judged: int = 0
    fake: int = 0
    unjudged: int = 0
    examples: list[dict] = field(default_factory=list)  # ultimele reduceri false (produs, dată, % afișat)

    @property
    def fake_pct(self) -> float | None:
        return round(self.fake / self.judged * 100) if self.judged >= MIN_JUDGED else None


def shop_scores(session: Session, source: str, today: date) -> list[ShopScore]:
    since = today - timedelta(days=WINDOW_DAYS)
    offers = session.scalars(
        select(Offer)
        .join(Shop)
        .where(Offer.source == source, Offer.condition == "new", Shop.kind == "retail", Offer.is_bundle.is_(False))
        .options(selectinload(Offer.shop), selectinload(Offer.price_points), selectinload(Offer.product))
    )
    scores: dict[str, ShopScore] = {}
    for o in offers:
        if catalog.is_marketplace(o) or not o.price_points or catalog._aware(o.last_seen_at).date() < since:
            continue
        s = scores.setdefault(o.shop.slug, ShopScore(o.shop.slug, o.shop.name, o.shop.status))
        s.offers += 1
        for e in discount_episodes(catalog.to_history(o), since, today):
            if not e.judged:
                s.unjudged += 1
                continue
            s.judged += 1
            if e.fake:
                s.fake += 1
                s.examples.append({"product": o.product.name, "product_slug": o.product.slug, "start": e.start,
                                   "claimed_pct": e.claimed_pct})
    for s in scores.values():
        s.examples = sorted(s.examples, key=lambda x: x["start"], reverse=True)[:3]
    # cele cu procent întâi (cele mai cinstite sus), apoi cele fără destule date
    return sorted(scores.values(), key=lambda s: (s.fake_pct is None, s.fake_pct or 0, -s.judged, s.name))
