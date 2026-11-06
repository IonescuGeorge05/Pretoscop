import re
import secrets
import time
from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from statistics import median
from urllib.parse import quote_plus
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.config import settings
from app.families import families, family_slug
from app.db import get_session
from app.models import Click, DiscoveredShop, ManualMatch, Offer, Product, Shop, UnmatchedListing, UserReport
from app.services.ingest import offer_from_unmatched, record_offer
from app.services import ai_suggest, alerts, catalog, event_report, manual_import, reports, shop_trust
from app.services.pricing import compare as compare_breakdowns
from app.services import olx_email, web_search
from app.services.feed_import import import_feed
from app.services.shop_check import check_shop
from app.services.scrape_runner import ingest_offers, rematch_unmatched, run_shop
from recommender.calendar import events_between
from recommender.rules import DEAL_WINDOW_DAYS, FakeDiscount, Recommendation, days_until, point_at, real_drop, upcoming_events
from scrapers.olx import CATEGORY_URL as OLX_CATEGORY_URL
from scrapers.base import ScrapedOffer
from scrapers.jsonld import parse_price
from scrapers.matcher import title_family
from scrapers.olx import parse_olx_listing
from scrapers.registry import REGISTRY

router = APIRouter(prefix="/api")

SourceParam = Query(None, pattern="^(mock|real)$", description="Suprascrie DATA_MODE: mock | real")

# paginile de listă recalculează totul (oferte, istoric, recomandări pentru fiecare produs): ~0,7 s. Datele se schimbă
# doar la rulările scraperilor (ore), deci un rezultat vechi de câteva minute e la fel de bun.
CACHE_SECONDS = 300
_cache: dict[tuple, tuple[float, object]] = {}


def cached(key: tuple, build):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = build()
    _cache[key] = (time.monotonic(), value)
    return value


def shop_out(offer: Offer) -> schemas.ShopOut:
    s = offer.shop
    return schemas.ShopOut(slug=s.slug, name=s.name, status=s.status, shipping_verified=s.shipping_verified)


def offer_out(
    view: catalog.OfferView,
    fake: FakeDiscount | None = None,
    outlier: str | None = None,
    colors: list[str] | None = None,
    variants: int = 1,
) -> schemas.OfferOut:
    o, p = view.offer, view.point
    return schemas.OfferOut(
        id=o.id,
        shop=shop_out(o),
        title=o.title,
        out_url=f"/api/out/{o.id}",
        shop_url=o.affiliate_url or o.url,
        in_stock=p.in_stock,
        old_price=float(p.old_price) if p.old_price is not None else None,
        breakdown=schemas.PriceBreakdownOut(**{k: float(v) for k, v in asdict(view.breakdown).items()}),
        # produse noi de la magazine: 24 de luni sunt garantate prin lege (OUG 140/2021), deci nu e o estimare
        warranty_estimated=o.warranty_months is None and not (o.shop.kind == "retail" and o.condition == "new"),
        shipping_estimated=not o.shop.shipping_verified,
        is_bundle=o.is_bundle,
        seller=o.seller,
        is_marketplace=catalog.is_marketplace(o),
        suspicious_price=catalog.suspicious_price(o, p.price),
        condition=o.condition,
        grade=o.grade,
        location=o.location,
        posted_label=o.posted_label,
        source=o.source,
        last_seen_at=o.last_seen_at,
        price_since=p.ts,
        fake_discount=schemas.FakeDiscountOut(**asdict(fake)) if fake else None,
        price_outlier=outlier,
        preorder=o.preorder,
        gift=o.gift,
        is_affiliate=bool(o.affiliate_url),
        manual_checked_at=p.confirmed_at if p.origin == "manual" else None,
        colors=colors or [],
        variants=variants,
    )


def recommendation_out(rec: Recommendation) -> schemas.RecommendationOut:
    return schemas.RecommendationOut(
        verdict=rec.verdict,
        label=catalog.VERDICT_LABELS[rec.verdict],
        confidence=rec.confidence,
        reasons=rec.reasons,
        metrics=rec.metrics,
        fake_discount=rec.fake_discount,
        fake_discounts=[schemas.FakeDiscountOut(**asdict(f)) for f in rec.fake_discounts],
    )


def product_base(p: Product) -> dict:
    return schemas.ProductBase.model_validate(p, from_attributes=True).model_dump() | {"family_slug": family_slug(p.family)}


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


def _cheapest(views: list[catalog.OfferView], condition: str) -> float | None:
    prices = [
        float(v.breakdown.final_price)
        for v in views
        if v.offer.condition == condition and not v.offer.is_bundle and not catalog.suspicious_price(v.offer, v.point.price)
    ]
    return min(prices) if prices else None


def _asking_median(views: list[catalog.OfferView]) -> tuple[float | None, int]:
    """„Cât iei pe el”: mediana prețurilor cerute în anunțurile second hand active (fără pachete și prețuri suspecte).
    E preț cerut, nu preț de vânzare; cu sub 3 anunțuri nu spunem nimic."""
    prices = [
        float(v.point.price)
        for v in views
        if v.offer.condition == "used" and not v.offer.is_bundle and not catalog.suspicious_price(v.offer, v.point.price)
    ]
    return (median(prices), len(prices)) if len(prices) >= 3 else (None, len(prices))


def _top_cities(views: list[catalog.OfferView], n: int = 3) -> list[str]:
    """Orașele anunțurilor second hand, după număr (sectoarele -> București)."""
    counts: dict[str, int] = {}
    for v in views:
        loc = v.offer.location if v.offer.condition == "used" else None
        if not loc:
            continue
        parts = [x.strip() for x in loc.split(",") if x.strip()]
        city = "București" if any(x.lower().startswith("sector") for x in parts) or parts[0].lower() == "bucuresti" else parts[0]
        counts[city] = counts.get(city, 0) + 1
    return [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:n]]


@router.get("/products", response_model=schemas.ProductList)
def list_products(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Toate produsele, grupabile pe familii, cu cel mai bun preț final curent (oferte noi, fără pachete, în stoc)."""
    src = catalog.resolve_source(source)
    return cached(("products", src), lambda: _list_products(src, session))


def _list_products(src: str, session: Session) -> schemas.ProductList:
    out = []
    for p in session.scalars(select(Product).order_by(Product.id)):
        offers = catalog.load_offers(session, p.id, src)
        views = [v for v in catalog.current_views(offers) if not v.offer.is_bundle]
        direct = set(map(id, catalog.comparable(offers)))
        # cel mai bun preț: întâi ofertele vândute de magazin; marketplace doar dacă nu există altele
        best = next((v for v in views if v.point.in_stock and id(v.offer) in direct), None) or next(
            (v for v in views if v.point.in_stock), None
        )
        all_used = catalog.current_views(catalog.load_offers(session, p.id, src, used=True))
        used = [v for v in all_used if v.point.in_stock]
        rec = catalog.product_recommendation(p, offers)
        out.append(
            schemas.ProductSummary(
                **product_base(p),
                best_offer=offer_out(best) if best else None,
                offers_count=len(views),
                refurbished_from=_cheapest(used, "refurbished"),
                secondhand_from=_cheapest(used, "used"),
                refurbished_count=sum(v.offer.condition == "refurbished" for v in all_used),
                refurbished_last=_cheapest(all_used, "refurbished"),
                secondhand_count=sum(v.offer.condition == "used" for v in used),
                secondhand_cities=_top_cities(used),
                secondhand_median=_asking_median(used)[0],
                recommendation=schemas.RecommendationBadge(
                    verdict=rec.verdict, label=catalog.VERDICT_LABELS[rec.verdict], confidence=rec.confidence
                ),
            )
        )
    present = {p.family for p in out}
    return schemas.ProductList(
        source=src,
        is_demo=src == "mock",
        families=[schemas.FamilyOut(**f) for f in families() if f["family"] in present],
        products=out,
    )


@router.get("/products/{slug}", response_model=schemas.ProductDetail)
def product_detail(slug: str, source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Detalii model + oferte sortate după preț final + recomandare."""
    p = catalog.get_product(session, slug)
    if p is None:
        raise HTTPException(404, "Produs inexistent")
    src = catalog.resolve_source(source)
    offers = catalog.load_offers(session, p.id, src)
    rec = catalog.product_recommendation(p, offers)
    fakes = {f.offer_id: f for f in rec.fake_discounts}
    outliers = catalog.price_outliers(offers)
    views = catalog.current_views(offers)
    used = catalog.current_views(catalog.load_offers(session, p.id, src, used=True))
    return schemas.ProductDetail(
        **product_base(p),
        source=src,
        is_demo=src == "mock",
        available_sources=catalog.available_sources(session, p.id),
        offers=[
            offer_out(v, fakes.get(v.offer.id), outliers.get(v.offer.id), colors, n)
            for v, colors, n in catalog.group_colors([v for v in views if not v.offer.is_bundle])
        ],
        bundles=[offer_out(v) for v in views if v.offer.is_bundle],
        refurbished=[
            offer_out(v, colors=colors, variants=n)
            for v, colors, n in catalog.group_colors([v for v in used if v.offer.condition == "refurbished"])
        ],
        secondhand=[offer_out(v) for v in used if v.offer.condition != "refurbished"],
        recommendation=recommendation_out(rec),
        missing_shops=[
            schemas.MissingShopOut(
                name=s.name,
                search_url=url,
                reason="nu permite citirea automată" if s.enabled else "oprit la cererea magazinului",
            )
            for s, url in catalog.missing_shops(session, p)
            if s.id not in {v.offer.shop_id for v in views}  # are deja un preț (ex. verificat manual)
        ],
        community_reports=[
            schemas.CommunityReportOut(domain=r.domain, url=r.url, price=float(r.price), reviewed_at=r.reviewed_at)
            for r in reports.visible(session, p)
        ],
        alerts_enabled=alerts.mail_enabled(),
    )


@router.get("/deals", response_model=schemas.DealsOut)
def deals(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Reduceri reale: oferte (noi, de la magazin) al căror preț de azi e sub mediana ultimelor 30 de zile,
    plus reducerile false (preț tăiat umflat) — separat, ca avertisment."""
    src = catalog.resolve_source(source)
    return cached(("deals", src), lambda: _deals(src, session))


def _deals(src: str, session: Session) -> schemas.DealsOut:
    today = date.today()
    found, fake = [], []
    for p in session.scalars(select(Product).order_by(Product.id)):
        base = schemas.ProductWithFamily(**product_base(p))
        offers = catalog.load_offers(session, p.id, src)
        views = {v.offer.id: v for v in catalog.current_views(offers)}
        rec = catalog.product_recommendation(p, offers, today)
        fakes = {f.offer_id: f for f in rec.fake_discounts}
        for o in catalog.comparable(offers):
            view = views.get(o.id)
            if view is None or o.id in fakes or (drop := real_drop(catalog.to_history(o), today)) is None:
                continue
            old = view.point.old_price
            claimed = round((1 - float(view.point.price) / float(old)) * 100, 1) if old and old > view.point.price else None
            found.append(schemas.DealOut(
                product=base, offer=offer_out(view), reference_price=drop.reference_price,
                real_drop_pct=drop.drop_pct, lowest_in_window=drop.lowest_in_window, claimed_discount_pct=claimed,
            ))
        fake += [schemas.FakeDealOut(product=base, fake=schemas.FakeDiscountOut(**asdict(f))) for f in rec.fake_discounts]
    # evenimentul mare următor (sau cel în desfășurare)
    nxt = next(iter(upcoming_events(catalog.calendar(), today)), None)
    return schemas.DealsOut(
        source=src,
        is_demo=src == "mock",
        window_days=DEAL_WINDOW_DAYS,
        next_event=schemas.NextEventOut(slug=nxt.slug, name=nxt.name, start=nxt.start, end=nxt.end, days_until=days_until(nxt, today))
        if nxt else None,
        deals=sorted(found, key=lambda d: -d.real_drop_pct),
        fake=fake,
    )


@router.get("/shops/trust", response_model=schemas.ShopTrustOut)
def shops_trust(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Pentru fiecare magazin: câte dintre reducerile afișate în ultimele 90 de zile au fost false (preț tăiat umflat
    sau preț „redus” care nu e sub mediana lunii). Doar oferte noi, vândute direct de magazin, fără pachete."""
    src = catalog.resolve_source(source)
    today = date.today()

    def build() -> schemas.ShopTrustOut:
        rows = [
            schemas.ShopTrustRow(**{k: getattr(s, k) for k in ("slug", "name", "status", "offers", "judged", "fake",
                                                               "unjudged", "fake_pct", "examples")})
            for s in shop_trust.shop_scores(session, src, today)
        ]
        return schemas.ShopTrustOut(source=src, is_demo=src == "mock", window_days=shop_trust.WINDOW_DAYS,
                                    min_judged=shop_trust.MIN_JUDGED, shops=rows)

    return cached(("trust", src, today), build)


@router.get("/events/{slug}/report", response_model=schemas.EventReportOut)
def event_report_view(slug: str, source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Raportul unui eveniment de reduceri (ex. black_friday): referința dinainte vs. cel mai mic preț din eveniment."""
    today = date.today()
    event = event_report.pick_occurrence(catalog.calendar(), slug, today)
    if event is None:
        raise HTTPException(404, "Eveniment necunoscut")
    src = catalog.resolve_source(source)
    return cached(("event", slug, src, today), lambda: _event_report(event, src, today, session))


def _event_report(event, src: str, today: date, session: Session) -> schemas.EventReportOut:
    rows = []
    for p in session.scalars(select(Product).where(Product.lifecycle != "retired").order_by(Product.id)):
        histories = [catalog.to_history(o) for o in catalog.comparable(catalog.load_offers(session, p.id, src))]
        r = event_report.event_row(histories, event, today)
        rows.append(schemas.EventReportRow(product=schemas.ProductWithFamily(**product_base(p)), **asdict(r)))
    status = "upcoming" if today < event.start else "running" if today <= event.end else "ended"
    return schemas.EventReportOut(
        source=src,
        is_demo=src == "mock",
        event=schemas.EventOut(slug=event.slug, name=event.name, date=event.date, start=event.start, end=event.end),
        status=status,
        days_until=max((event.start - today).days, 0),
        baseline_days=event_report.BASELINE_DAYS,
        rows=rows,
    )


# ---------- alerte pe email și „Am găsit mai ieftin” (formulare publice, cu plafon per IP)

ALERT_LIMIT = reports.RateLimit(per_hour=10)
REPORT_LIMIT = reports.RateLimit(per_hour=10)


def _client_ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()


@router.post("/alerts", status_code=202)
def create_alert(body: schemas.AlertIn, request: Request, session: Session = Depends(get_session)):
    if not alerts.mail_enabled():
        raise HTTPException(503, "Alertele pe email nu sunt încă active.")
    if not ALERT_LIMIT.allow(_client_ip(request)):
        raise HTTPException(429, "Prea multe cereri. Încearcă din nou peste o oră.")
    p = catalog.get_product(session, body.product_slug)
    if p is None:
        raise HTTPException(404, "Produs inexistent")
    target = Decimal(str(body.target_price)) if body.target_price is not None else None
    try:
        alerts.create(session, body.email, p, body.kind, target)
    except alerts.AlertError as exc:
        raise HTTPException(422, str(exc)) from None
    except OSError:  # SMTP indisponibil
        session.rollback()
        raise HTTPException(503, "Nu am putut trimite emailul de confirmare. Încearcă mai târziu.") from None
    return {"status": "confirmation_sent"}


@router.get("/alerts/confirm")
def confirm_alert(token: str, session: Session = Depends(get_session)):
    ok = alerts.confirm(session, token) is not None
    return RedirectResponse(settings.public_site_url.rstrip("/") + ("/alerte/confirmat" if ok else "/alerte/invalid"), 303)


@router.get("/alerts/unsubscribe")
def unsubscribe_alert(token: str, session: Session = Depends(get_session)):
    alerts.unsubscribe(session, token)
    return RedirectResponse(settings.public_site_url.rstrip("/") + "/alerte/dezabonat", 303)


@router.post("/reports", status_code=202)
def create_report(body: schemas.ReportIn, request: Request, session: Session = Depends(get_session)):
    if body.website:  # capcana pentru roboți: răspundem normal, dar nu salvăm
        return {"status": "received"}
    if not REPORT_LIMIT.allow(_client_ip(request)):
        raise HTTPException(429, "Prea multe semnalări. Încearcă din nou peste o oră.")
    p = catalog.get_product(session, body.product_slug)
    if p is None:
        raise HTTPException(404, "Produs inexistent")
    try:
        reports.create(session, p, body.url, body.price, body.note)
    except reports.ReportError as exc:
        raise HTTPException(422, str(exc)) from None
    return {"status": "received"}


# anunțurile second hand recente din familiile urmărite, la care vânzătorul n-a scris modelul exact
UNSPECIFIED_MAX_AGE = timedelta(days=7)


@router.get("/secondhand/unspecified", response_model=schemas.UnspecifiedOut)
def secondhand_unspecified(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Ex. „Vând PS5 slim 1TB” (Digital sau cu disc?): sigur e un PS5, dar nu-l putem pune la un model fără să ghicim.
    Apar separat, pe familii, fără să intre în prețurile vreunui model. Prețurile sub 40% din cel mai mic MSRP al
    familiei (țepe, piese, greșeli) sau peste 150% din cel mai mare nu apar."""
    src = catalog.resolve_source(source)
    if src != "real":
        return schemas.UnspecifiedOut(source=src, listings=[])
    return cached(("unspecified",), lambda: _secondhand_unspecified(session))


def _secondhand_unspecified(session: Session) -> schemas.UnspecifiedOut:
    msrps: dict[str, list[Decimal]] = {}
    for p in session.scalars(select(Product).where(Product.msrp_ron.is_not(None))):
        msrps.setdefault(p.family, []).append(p.msrp_ron)
    since = datetime.now(UTC) - UNSPECIFIED_MAX_AGE
    rows = session.execute(
        select(UnmatchedListing, Shop)
        .join(Shop, Shop.id == UnmatchedListing.shop_id)
        .where(Shop.kind == "secondhand", UnmatchedListing.scraped_at >= since)
        .order_by(UnmatchedListing.scraped_at.desc())
    ).all()
    out = []
    for row, shop in rows:
        family = title_family(row.title)
        price = Decimal(row.raw["price"]) if row.raw.get("price") else None
        if family is None or price is None or family not in msrps:
            continue
        low, high = min(msrps[family]), max(msrps[family])
        if not (low * Decimal(str(catalog.SUSPICIOUS_BELOW_MSRP)) <= price <= high * Decimal("1.5")):
            continue
        out.append(schemas.UnspecifiedListingOut(
            family=family, family_slug=family_slug(family), title=row.title, price=float(price),
            location=row.raw.get("location"), posted_label=row.raw.get("posted_label"), url=row.url,
            shop=shop.name, reason=row.reason or "",
        ))
    return schemas.UnspecifiedOut(source="real", listings=out)


RANGES = {"30d": 30, "90d": 90, "1y": 365}


@router.get("/products/{slug}/history", response_model=schemas.HistoryOut)
def product_history(
    slug: str,
    granularity: Literal["day", "week"] = "day",
    range: Literal["30d", "90d", "1y"] = "90d",
    source: str | None = SourceParam,
    session: Session = Depends(get_session),
):
    """Serii de preț final pe magazin + minimul pieței; min/median/max pe perioadă; evenimente din calendar."""
    p = catalog.get_product(session, slug)
    if p is None:
        raise HTTPException(404, "Produs inexistent")
    src = catalog.resolve_source(source)
    loaded = catalog.load_offers(session, p.id, src)
    offers = catalog.comparable(loaded)
    histories = [(o.shop.slug, catalog.to_history(o)) for o in offers]
    shops = {o.shop.slug: o.shop.name for o in offers}
    # marketplace (ex. eMAG la PS5, doar revânzători): serie separată, doar afișată — nu intră în minimul pieței
    market = [o for o in loaded if not o.is_bundle and catalog.is_marketplace(o)]
    mp_shops = {f"{o.shop.slug}_mp": f"{o.shop.name} (marketplace)" for o in market}
    histories += [(f"{o.shop.slug}_mp", catalog.to_history(o)) for o in market]

    today = date.today()
    start = today - timedelta(days=RANGES[range] - 1)
    rows: list[dict] = []
    days_with_data = 0
    d = start
    while d <= today:
        row: dict = {"date": d}
        known = False
        for key, h in histories:
            pt = point_at(h.points, d)
            known = known or pt is not None
            if pt and pt.in_stock:
                row[key] = min(row.get(key, pt.final_price), pt.final_price)
                if pt.origin == "wayback" and pt.ts == d:
                    row[f"{key}__wb"] = True  # zi cu captură din arhivă (punct pe grafic)
        values = [row[k] for k in shops if k in row]
        row["market_min"] = min(values) if values else None
        days_with_data += known
        rows.append(row)
        d += timedelta(days=1)

    if granularity == "week":
        weeks: dict[date, dict] = {}
        for row in rows:
            monday = row["date"] - timedelta(days=row["date"].weekday())
            w = weeks.setdefault(monday, {"date": max(monday, start)})
            for k, v in row.items():
                if k.endswith("__wb"):
                    w[k] = True
                elif k != "date" and v is not None:
                    w[k] = min(w.get(k, v), v)
        rows = list(weeks.values())
        for w in rows:
            w.setdefault("market_min", None)

    mins = [r["market_min"] for r in rows if r["market_min"] is not None]
    for r in rows:
        r["date"] = r["date"].isoformat()
    return schemas.HistoryOut(
        product=slug,
        source=src,
        is_demo=src == "mock",
        granularity=granularity,
        range=range,
        shops=[schemas.HistoryShop(key=k, name=n) for k, n in sorted(shops.items())]
        + [schemas.HistoryShop(key=k, name=n, marketplace=True) for k, n in sorted(mp_shops.items())],
        points=rows,
        stats=schemas.HistoryStats(
            min=min(mins) if mins else None,
            median=round(median(mins), 2) if mins else None,
            max=max(mins) if mins else None,
        ),
        events=[schemas.EventOut(**asdict(e)) for e in events_between(catalog.calendar(), start, today)],
        coverage=schemas.Coverage(days_with_data=days_with_data, days_total=RANGES[range]),
    )


COMPONENT_LABELS = {
    "price": "Preț",
    "shipping": "Transport",
    "warranty_months": "Garanție (luni)",
    "warranty_penalty": "Penalizare garanție",
    "final_price": "Preț final",
    "cost_per_warranty_month": "Cost / lună de garanție",
}


def _offer_view(session: Session, offer_id: int) -> catalog.OfferView:
    o = session.scalar(
        select(Offer)
        .where(Offer.id == offer_id)
        .options(selectinload(Offer.shop), selectinload(Offer.price_points))
    )
    if o is None or not o.price_points:
        raise HTTPException(404, f"Oferta {offer_id} nu există")
    return catalog.OfferView(o, o.price_points[-1], catalog.breakdown(o, o.price_points[-1].price))


@router.get("/compare", response_model=schemas.CompareOut)
def compare(offer_a: int, offer_b: int, session: Session = Depends(get_session)):
    """Diferențele pe fiecare componentă a prețului final și câștigătorul, cu explicație."""
    a, b = _offer_view(session, offer_a), _offer_view(session, offer_b)
    result = compare_breakdowns(a.breakdown, b.breakdown, a.offer.shop.name, b.offer.shop.name)
    return schemas.CompareOut(
        a=offer_out(a),
        b=offer_out(b),
        diffs=[
            schemas.ComponentDiffOut(
                component=d.component, label=COMPONENT_LABELS[d.component], a=float(d.a), b=float(d.b), diff=float(d.diff)
            )
            for d in result.diffs
        ],
        winner_offer_id={"a": a.offer.id, "b": b.offer.id}.get(result.winner),
        explanation=result.explanation,
    )


@router.get("/out/{offer_id}")
def out(offer_id: int, request: Request, session: Session = Depends(get_session)):
    """Redirect către pagina produsului din magazin (affiliate_url dacă există) + logare click."""
    o = session.get(Offer, offer_id)
    if o is None:
        raise HTTPException(404, "Ofertă inexistentă")
    target = o.affiliate_url or o.url
    if o.source == "mock":
        # ofertele demo nu au pagină proprie: folosim pagina reală a produsului la același magazin,
        # dacă scraperul a găsit-o (consolă simplă, cea mai recent văzută); altfel căutarea din magazin
        real = session.scalar(
            select(Offer)
            .where(
                Offer.product_id == o.product_id,
                Offer.shop_id == o.shop_id,
                Offer.source == "real",
                Offer.is_bundle.is_(False),
            )
            .order_by(Offer.last_seen_at.desc())
            .limit(1)
        )
        if real is not None:
            target = real.affiliate_url or real.url
    session.add(
        Click(
            offer_id=o.id,
            ts=datetime.now(UTC),
            target_url=target,
            referer=request.headers.get("referer"),
            user_agent=request.headers.get("user-agent"),
        )
    )
    session.commit()
    return RedirectResponse(target, status_code=307)


def require_admin(x_admin_token: str | None = Header(None)) -> None:
    if not settings.admin_token:
        raise HTTPException(503, "ADMIN_TOKEN nu este configurat")
    if not secrets.compare_digest((x_admin_token or "").encode(), settings.admin_token.encode()):
        raise HTTPException(401, "Token invalid")
    _cache.clear()  # o acțiune din admin (asociere, semnalare acceptată…) se vede imediat pe site


@router.post("/admin/scrape", response_model=schemas.ScrapeStarted, status_code=202, dependencies=[Depends(require_admin)])
def admin_scrape(background: BackgroundTasks, shop: str | None = None):
    """Pornește manual scraperul (un magazin sau toate). Header: X-Admin-Token."""
    from app.worker import all_scrapable_shops  # include magazinele cu `crawl` / `feed` din shops.yaml

    known = all_scrapable_shops()
    shops = [shop] if shop else known
    unknown = [s for s in shops if s not in known]
    if unknown:
        raise HTTPException(404, f"Nu există scraper pentru: {', '.join(unknown)}")
    for s in shops:
        background.add_task(run_shop, s)
    return schemas.ScrapeStarted(shops=shops)


@router.get("/admin/unmatched", response_model=list[schemas.UnmatchedOut], dependencies=[Depends(require_admin)])
def admin_unmatched(session: Session = Depends(get_session)):
    """Anunțurile pe care matcher-ul nu le-a putut asocia sigur unui model (pentru verificare manuală)."""
    rows = session.scalars(
        select(UnmatchedListing).options(selectinload(UnmatchedListing.shop)).order_by(UnmatchedListing.scraped_at.desc())
    )
    return [
        schemas.UnmatchedOut(
            id=r.id,
            shop=r.shop.name,
            shop_kind=r.shop.kind,
            url=r.url,
            title=r.title,
            reason=r.reason,
            price=float(r.raw["price"]) if r.raw.get("price") else None,
            in_stock=r.raw.get("in_stock"),
            seller=r.raw.get("seller"),
            scraped_at=r.scraped_at,
            ai=r.raw.get("ai"),
        )
        for r in rows
    ]


@router.post("/admin/unmatched/ai", dependencies=[Depends(require_admin)])
def admin_ai_suggest(session: Session = Depends(get_session)):
    """Cere acum sugestii AI pentru anunțurile care n-au încă una (altfel le cere worker-ul o dată pe oră)."""
    if not ai_suggest.enabled():
        raise HTTPException(503, "Sugestiile AI nu sunt pornite: lipsește ANTHROPIC_API_KEY în .env.")
    return ai_suggest.run_pending(session)


def _resolve_unmatched(session: Session, row_id: int, product: Product | None, is_bundle: bool, ignored: bool) -> None:
    row = session.get(UnmatchedListing, row_id)
    if row is None:
        raise HTTPException(404, "Anunț inexistent")
    mm = session.scalar(select(ManualMatch).where(ManualMatch.shop_id == row.shop_id, ManualMatch.url == row.url))
    if mm is None:
        mm = ManualMatch(shop_id=row.shop_id, url=row.url, created_at=datetime.now(UTC))
        session.add(mm)
    mm.product_id = product.id if product else None
    mm.is_bundle, mm.ignored = is_bundle, ignored
    if product is not None and row.raw.get("price"):
        # oferta apare imediat, din datele colectate deja; scrape-urile următoare o actualizează
        record_offer(session, session.get(Shop, row.shop_id), product, offer_from_unmatched(row), is_bundle)
    session.delete(row)
    session.commit()


@router.get("/admin/reports", response_model=list[schemas.AdminReportOut], dependencies=[Depends(require_admin)])
def admin_reports(session: Session = Depends(get_session)):
    """Prețurile semnalate de cititori: întâi cele noi, de verificat (deschizi linkul și compari)."""
    rows = session.scalars(select(UserReport).order_by((UserReport.status != "new"), UserReport.created_at.desc()).limit(200))
    out = []
    for r in rows:
        best, _ = alerts.best_now(session, r.product)
        out.append(schemas.AdminReportOut(
            id=r.id, product_slug=r.product.slug, product_name=r.product.name, url=r.url, domain=r.domain,
            price=float(r.price), note=r.note, status=r.status, created_at=r.created_at,
            best_price=float(best) if best is not None else None,
        ))
    return out


@router.post("/admin/reports/{row_id}/{action}", status_code=204, dependencies=[Depends(require_admin)])
def admin_review_report(row_id: int, action: Literal["accept", "reject"], session: Session = Depends(get_session)):
    r = session.get(UserReport, row_id)
    if r is None:
        raise HTTPException(404, "Semnalare inexistentă")
    r.status = "accepted" if action == "accept" else "rejected"
    r.reviewed_at = datetime.now(UTC)
    session.commit()


@router.post("/admin/unmatched/rematch", dependencies=[Depends(require_admin)])
def admin_rematch(session: Session = Depends(get_session)):
    """Reaplică regulile actuale ale matcher-ului pe toate anunțurile nepotrivite."""
    stats = rematch_unmatched(session)
    return {k: stats[k] for k in ("listings", "matched", "bundles", "matched_manual", "unmatched", "accessory", "excluded")}


@router.post("/admin/unmatched/{row_id}/assign", status_code=204, dependencies=[Depends(require_admin)])
def admin_assign(row_id: int, body: schemas.AssignIn, session: Session = Depends(get_session)):
    """Asociază anunțul cu un model; reținut pentru scrape-urile viitoare (tabelul manual_matches)."""
    product = catalog.get_product(session, body.product_slug)
    if product is None:
        raise HTTPException(404, "Produs inexistent")
    _resolve_unmatched(session, row_id, product, body.is_bundle, ignored=False)


@router.post("/admin/unmatched/{row_id}/ignore", status_code=204, dependencies=[Depends(require_admin)])
def admin_ignore(row_id: int, session: Session = Depends(get_session)):
    """Ignoră anunțul (ex. consolă modificată, PS4); nu mai apare la scrape-urile viitoare."""
    _resolve_unmatched(session, row_id, None, False, ignored=True)


@router.post("/admin/import/olx", response_model=schemas.ImportResult, dependencies=[Depends(require_admin)])
async def admin_import_olx(request: Request, session: Session = Depends(get_session)):
    """Import manual: corpul cererii e HTML-ul unei pagini de rezultate OLX salvate din browser (Ctrl+S).
    Nu face nicio cerere către OLX; anunțurile trec prin același matcher ca la scraping."""
    html = (await request.body()).decode("utf-8", errors="ignore")
    offers = parse_olx_listing(OLX_CATEGORY_URL, html)
    if not offers:
        raise HTTPException(422, "Nu am găsit anunțuri în fișier. Salvează pagina de rezultate OLX (Ctrl+S).")
    shop = session.scalar(select(Shop).where(Shop.slug == "olx"))
    stats = ingest_offers(session, shop, offers)
    session.commit()
    return schemas.ImportResult(
        listings=stats["listings"],
        matched=stats["matched"] + stats["matched_manual"],
        bundles=stats["bundles"],
        unmatched=stats["unmatched"],
        ignored=stats["accessory"] + stats["excluded"] + stats["ignored_manual"],
    )


@router.post("/admin/import/feed", response_model=dict, dependencies=[Depends(require_admin)])
async def admin_import_feed(request: Request, shop: str, vat_included: bool = True):
    """Import al unui feed de produse (XML/CSV) primit de la un magazin; corpul cererii = conținutul fișierului."""
    try:
        return import_feed(shop, await request.body(), vat_included=vat_included)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/admin/shops", response_model=list[dict], dependencies=[Depends(require_admin)])
def admin_shops(session: Session = Depends(get_session)):
    """Starea fiecărei surse: cum o citim, ultima rulare, câte oferte active și câte anunțuri așteaptă asociere."""
    fresh_after = datetime.now(UTC) - catalog.STALE_AFTER
    active = dict(
        session.execute(
            select(Offer.shop_id, func.count())
            .where(Offer.source == "real", Offer.last_seen_at >= fresh_after)
            .group_by(Offer.shop_id)
        ).all()
    )
    pending = dict(session.execute(select(UnmatchedListing.shop_id, func.count()).group_by(UnmatchedListing.shop_id)).all())

    def method(s: Shop) -> str:
        if s.feed and s.feed.get("url"):
            return "feed"
        if s.crawl:
            return "sitemap"
        if s.slug == "olx":
            return "email" if settings.imap_user else "import manual"
        return "scraper dedicat" if s.slug in REGISTRY else "—"

    return [
        {
            "slug": s.slug,
            "name": s.name,
            "kind": s.kind,
            # OLX blochează citirea directă, dar alertele pe email funcționează: sursa e activă
            "status": "active" if method(s) == "email" else s.status,
            "status_reason": None if method(s) == "email" else s.status_reason,
            "method": method(s),
            "has_feed": bool(s.feed and s.feed.get("url")),
            "feed_url": (s.feed or {}).get("url"),
            "last_scraped_at": s.last_scraped_at,
            "last_run": s.last_run,
            "active_offers": active.get(s.id, 0),
            "unmatched": pending.get(s.id, 0),
        }
        for s in session.scalars(select(Shop).order_by(Shop.id))
    ]


# ---------- prețuri verificate de mână (magazinele care nu ne lasă robotul: eMAG, Altex, Flanco, PC Garage…)


@router.post("/admin/manual-price", status_code=201, dependencies=[Depends(require_admin)])
def admin_manual_price(body: schemas.ManualPriceIn, session: Session = Depends(get_session)):
    """Preț citit de un om pe site-ul magazinului. Intră în comparație ca orice ofertă, marcat „verificat manual”, și
    expiră după 24 de ore dacă nu e reconfirmat."""
    p = catalog.get_product(session, body.product_slug)
    shop = session.scalar(select(Shop).where(Shop.slug == body.shop_slug))
    if p is None or shop is None:
        raise HTTPException(404, "Produs sau magazin inexistent")
    try:
        url, _, price = reports.parse_report(p, body.url, body.price)
    except reports.ReportError as exc:
        raise HTTPException(422, str(exc)) from None
    old = parse_price(body.old_price) if body.old_price else None
    gift_value = parse_price(body.gift_value) if body.gift_value else None
    gift = {"title": body.gift_title.strip(), "value": float(gift_value)} if body.gift_title and gift_value else None
    offer = _save_manual_price(session, shop, p, url, p.name, price, old, body.in_stock, body.preorder, False, gift)
    session.commit()
    return {"offer_id": offer.id}


def _save_manual_price(session, shop, p, url, title, price, old, in_stock, preorder, is_bundle, gift=None) -> Offer:
    offer, _ = record_offer(
        session, shop, p,
        ScrapedOffer(
            shop_slug=shop.slug, url=url, title=title, price=price,
            old_price=old if old and old > price else None, in_stock=in_stock or preorder,
            ean=None, mpn=None, warranty_months=None, condition="new", scraped_at=datetime.now(UTC),
            seller=shop.name, preorder=preorder, gift=gift,
        ),
        is_bundle=is_bundle, origin="manual",
    )
    return offer


@router.post("/admin/manual-import/preview", response_model=list[schemas.ManualImportRowOut],
             dependencies=[Depends(require_admin)])
def admin_manual_import_preview(body: schemas.ManualImportIn, session: Session = Depends(get_session)):
    """Pagina de magazin lipită în admin -> rânduri recunoscute (produs + preț), de bifat înainte de salvare."""
    shop = session.scalar(select(Shop).where(Shop.slug == body.shop_slug))
    if shop is None:
        raise HTTPException(404, "Magazin inexistent")
    products = {p.slug: p for p in session.scalars(select(Product))}
    rows = manual_import.build_rows(body.rows[:400], products, (body.page_url or "").strip() or None, shop.base_url)
    return [schemas.ManualImportRowOut(**asdict(r)) for r in rows]


@router.post("/admin/manual-import/save", dependencies=[Depends(require_admin)])
def admin_manual_import_save(body: schemas.ManualImportSaveIn, session: Session = Depends(get_session)):
    """Salvează rândurile bifate ca prețuri verificate manual (aceleași reguli: expiră după 24 de ore)."""
    shop = session.scalar(select(Shop).where(Shop.slug == body.shop_slug))
    if shop is None:
        raise HTTPException(404, "Magazin inexistent")
    saved, errors = 0, []
    for r in body.rows:
        p = catalog.get_product(session, r.product_slug)
        if p is None:
            errors.append(f"{r.title}: produs inexistent")
            continue
        try:
            url, _, price = reports.parse_report(p, r.url, r.price)
        except reports.ReportError as exc:
            errors.append(f"{r.title}: {exc}")
            continue
        old = parse_price(r.old_price) if r.old_price else None
        _save_manual_price(session, shop, p, url, r.title, price, old, r.in_stock, r.preorder, r.is_bundle)
        saved += 1
    session.commit()
    _cache.clear()
    return {"saved": saved, "errors": errors}


@router.get("/admin/manual-todo", dependencies=[Depends(require_admin)])
def admin_manual_todo(session: Session = Depends(get_session)):
    """Rutina zilnică: pentru fiecare magazin blocat, produsele în vânzare fără un preț valabil acum (de verificat de mână),
    cu linkul de căutare pe site-ul magazinului."""
    shops = list(session.scalars(select(Shop).where(Shop.kind == "retail", Shop.status == "blocked").order_by(Shop.name)))
    products = list(session.scalars(select(Product).where(Product.lifecycle != "retired").order_by(Product.id)))
    out = []
    for shop in shops:
        # magazinele specializate declară ce vând (`crawl.families` în shops.yaml, ex. iSTYLE doar iPhone); restul: tot
        sells = set((shop.crawl or {}).get("families") or [])
        shop_products = [p for p in products if not sells or p.family in sells]
        missing = []
        for p in shop_products:
            views = catalog.current_views([o for o in catalog.load_offers(session, p.id, "real") if o.shop_id == shop.id])
            if not any(not catalog.is_marketplace(v.offer) for v in views):
                url = shop.search_url_template.format(query=quote_plus(catalog.search_query(p))) if shop.search_url_template else shop.base_url
                missing.append({"product_slug": p.slug, "product_name": p.name, "family": p.family, "search_url": url})
        out.append({"shop_slug": shop.slug, "shop": shop.name, "missing": missing, "total": len(shop_products)})
    return out


@router.post("/admin/manual-price/{offer_id}/confirm", status_code=204, dependencies=[Depends(require_admin)])
def admin_manual_confirm(offer_id: int, session: Session = Depends(get_session)):
    """„Am verificat din nou: același preț” -> încă 24 de ore pe site."""
    offer = session.get(Offer, offer_id)
    if offer is None or not offer.price_points:
        raise HTTPException(404, "Ofertă inexistentă")
    now = datetime.now(UTC)
    offer.last_seen_at = now
    offer.price_points[-1].confirmed_at = now
    offer.price_points[-1].origin = "manual"
    session.commit()


@router.get("/admin/manual-prices", response_model=list[schemas.ManualPriceOut], dependencies=[Depends(require_admin)])
def admin_manual_prices(session: Session = Depends(get_session)):
    """Prețurile introduse de mână, cele expirate întâi (de reverificat)."""
    out = []
    for o in session.scalars(select(Offer).where(Offer.source == "real").options(selectinload(Offer.price_points), selectinload(Offer.shop), selectinload(Offer.product))):
        if not o.price_points or o.price_points[-1].origin != "manual":
            continue
        pt = o.price_points[-1]
        checked = pt.confirmed_at if pt.confirmed_at.tzinfo else pt.confirmed_at.replace(tzinfo=UTC)
        out.append(schemas.ManualPriceOut(
            offer_id=o.id, product_slug=o.product.slug, product_name=o.product.name, shop=o.shop.name, url=o.url,
            price=float(pt.price), in_stock=pt.in_stock, preorder=o.preorder, checked_at=checked,
            expired=datetime.now(UTC) - checked > catalog.MANUAL_VALID,
        ))
    return sorted(out, key=lambda m: (not m.expired, m.shop, m.product_name))


@router.post("/admin/shops/{slug}/feed", dependencies=[Depends(require_admin)])
def admin_set_feed(slug: str, body: schemas.FeedLinkIn, session: Session = Depends(get_session)):
    """Linkul permanent al feed-ului primit de la magazin (are prioritate față de citirea paginilor). Se citește la
    rulările programate; magazinul nou intră în program în cel mult 30 de minute."""
    shop = session.scalar(select(Shop).where(Shop.slug == slug))
    if shop is None:
        raise HTTPException(404, "Magazin inexistent")
    url = (body.url or "").strip()
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(422, "Linkul feed-ului trebuie să înceapă cu https://")
    # explicit_permission: feed-ul l-a dat chiar magazinul, deci îl citim fără restricțiile din robots.txt
    shop.feed = {"url": url, "vat_included": body.vat_included, "explicit_permission": True, "source": "admin"} if url else None
    if url:
        shop.status, shop.status_reason = "active", None
    session.commit()
    return {"slug": slug, "feed": shop.feed}


@router.post("/admin/shops", status_code=201, dependencies=[Depends(require_admin)])
def admin_new_shop(body: schemas.NewShopIn, session: Session = Depends(get_session)):
    """Magazin nou (de obicei unul care ne-a trimis un feed). Transportul rămâne „estimat” până îl verificăm."""
    base = body.base_url.strip().rstrip("/")
    if not base.startswith(("http://", "https://")):
        base = "https://" + base
    host = httpx.URL(base).host.removeprefix("www.")
    slug = re.sub(r"[^a-z0-9]+", "-", host.rsplit(".", 1)[0].lower()).strip("-")
    if not slug or not body.name.strip():
        raise HTTPException(422, "Numele și adresa site-ului sunt obligatorii")
    if session.scalar(select(Shop).where(Shop.slug == slug)) is not None:
        raise HTTPException(409, f"Magazinul „{slug}” există deja")
    session.add(Shop(
        slug=slug, name=body.name.strip(), base_url=base, kind="retail",
        shipping_rules={"free_over": None, "flat": 25}, shipping_verified=False, default_warranty_months=24,
    ))
    session.commit()
    return {"slug": slug}


# ---------- surse care cer configurare: alerte OLX pe email, căutare web (Brave)


@router.get("/admin/sources", response_model=dict, dependencies=[Depends(require_admin)])
def admin_sources():
    return {
        "email_configured": bool(settings.imap_user),
        "email_user": settings.imap_user or None,
        "search_configured": bool(settings.brave_api_key),
    }


@router.post("/admin/email/test", response_model=dict, dependencies=[Depends(require_admin)])
def admin_email_test():
    return olx_email.test_connection()


@router.post("/admin/email/preview", response_model=dict, dependencies=[Depends(require_admin)])
def admin_email_preview(days: int = 7):
    """Ce s-ar importa din emailurile OLX recente, fără a salva nimic."""
    return olx_email.preview(days)


@router.post("/admin/email/run", response_model=dict, dependencies=[Depends(require_admin)])
def admin_email_run():
    return olx_email.run()


@router.post("/admin/search/run", response_model=dict, dependencies=[Depends(require_admin)])
def admin_search_run(what: Literal["olx", "discovery"] = "olx"):
    try:
        return web_search.run_olx_search() if what == "olx" else web_search.run_discovery()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Brave Search a răspuns {exc.response.status_code}: verifică BRAVE_API_KEY") from exc


@router.get("/admin/discovered", response_model=list[dict], dependencies=[Depends(require_admin)])
def admin_discovered(session: Session = Depends(get_session)):
    rows = session.scalars(
        select(DiscoveredShop).where(DiscoveredShop.status == "new").order_by(DiscoveredShop.hits.desc())
    )
    return [
        {"id": r.id, "domain": r.domain, "example_url": r.example_url, "example_title": r.example_title,
         "query": r.query, "hits": r.hits, "last_seen": r.last_seen, "check": r.check}
        for r in rows
    ]


@router.post("/admin/discovered/{row_id}/check", response_model=dict, dependencies=[Depends(require_admin)])
def admin_discovered_check(row_id: int, session: Session = Depends(get_session)):
    row = session.get(DiscoveredShop, row_id)
    if row is None:
        raise HTTPException(404, "Inexistent")
    row.check = check_shop(row.example_url)
    session.commit()
    return row.check


@router.post("/admin/discovered/{row_id}/ignore", status_code=204, dependencies=[Depends(require_admin)])
def admin_discovered_ignore(row_id: int, session: Session = Depends(get_session)):
    row = session.get(DiscoveredShop, row_id)
    if row is None:
        raise HTTPException(404, "Inexistent")
    row.status = "ignored"
    session.commit()
