from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from statistics import median
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.config import settings
from app.db import get_session
from app.models import Click, Offer, Product
from app.services import catalog
from app.services.pricing import compare as compare_breakdowns
from app.services.scrape_runner import run_shop
from recommender.calendar import events_between
from recommender.rules import FakeDiscount, Recommendation, point_at
from scrapers.registry import REGISTRY

router = APIRouter(prefix="/api")

SourceParam = Query(None, pattern="^(mock|real)$", description="Suprascrie DATA_MODE: mock | real")


def shop_out(offer: Offer) -> schemas.ShopOut:
    s = offer.shop
    return schemas.ShopOut(slug=s.slug, name=s.name, status=s.status, shipping_verified=s.shipping_verified)


def offer_out(view: catalog.OfferView, fake: FakeDiscount | None = None) -> schemas.OfferOut:
    o, p = view.offer, view.point
    return schemas.OfferOut(
        id=o.id,
        shop=shop_out(o),
        title=o.title,
        out_url=f"/api/out/{o.id}",
        in_stock=p.in_stock,
        old_price=float(p.old_price) if p.old_price is not None else None,
        breakdown=schemas.PriceBreakdownOut(**{k: float(v) for k, v in asdict(view.breakdown).items()}),
        warranty_estimated=o.warranty_months is None,
        shipping_estimated=not o.shop.shipping_verified,
        is_bundle=o.is_bundle,
        source=o.source,
        last_seen_at=o.last_seen_at,
        price_since=p.ts,
        fake_discount=schemas.FakeDiscountOut(**asdict(fake)) if fake else None,
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
    return schemas.ProductBase.model_validate(p, from_attributes=True).model_dump()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


@router.get("/products", response_model=schemas.ProductList)
def list_products(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Modelele PS5 cu cel mai bun preț final curent (doar oferte noi, fără pachete, în stoc)."""
    src = catalog.resolve_source(source)
    out = []
    for p in session.scalars(select(Product).order_by(Product.id)):
        offers = catalog.load_offers(session, p.id, src)
        views = [v for v in catalog.current_views(offers) if not v.offer.is_bundle]
        best = next((v for v in views if v.point.in_stock), None)
        rec = catalog.product_recommendation(p, offers)
        out.append(
            schemas.ProductSummary(
                **product_base(p),
                best_offer=offer_out(best) if best else None,
                offers_count=len(views),
                recommendation=schemas.RecommendationBadge(
                    verdict=rec.verdict, label=catalog.VERDICT_LABELS[rec.verdict], confidence=rec.confidence
                ),
            )
        )
    return schemas.ProductList(source=src, is_demo=src == "mock", products=out)


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
    views = catalog.current_views(offers)
    return schemas.ProductDetail(
        **product_base(p),
        source=src,
        is_demo=src == "mock",
        available_sources=catalog.available_sources(session, p.id),
        offers=[offer_out(v, fakes.get(v.offer.id)) for v in views if not v.offer.is_bundle],
        bundles=[offer_out(v) for v in views if v.offer.is_bundle],
        recommendation=recommendation_out(rec),
    )


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
    offers = [o for o in catalog.load_offers(session, p.id, src) if not o.is_bundle]
    histories = [(o.shop.slug, catalog.to_history(o)) for o in offers]
    shops = {o.shop.slug: o.shop.name for o in offers}

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
        shops=[schemas.HistoryShop(key=k, name=n) for k, n in sorted(shops.items())],
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


@router.post("/admin/scrape", response_model=schemas.ScrapeStarted, status_code=202)
def admin_scrape(
    background: BackgroundTasks,
    shop: str | None = None,
    x_admin_token: str | None = Header(None),
):
    """Pornește manual scraperul (un magazin sau toate). Header: X-Admin-Token."""
    if not settings.admin_token:
        raise HTTPException(503, "ADMIN_TOKEN nu este configurat")
    if x_admin_token != settings.admin_token:
        raise HTTPException(401, "Token invalid")
    shops = [shop] if shop else list(REGISTRY)
    unknown = [s for s in shops if s not in REGISTRY]
    if unknown:
        raise HTTPException(404, f"Nu există scraper pentru: {', '.join(unknown)}")
    for s in shops:
        background.add_task(run_shop, s)
    return schemas.ScrapeStarted(shops=shops)
