from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from statistics import median
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.config import settings
from app.families import families, family_slug
from app.db import get_session
from app.models import Click, DiscoveredShop, ManualMatch, Offer, Product, Shop, UnmatchedListing
from app.services.ingest import record_offer
from scrapers.base import ScrapedOffer
from app.services import catalog
from app.services.pricing import compare as compare_breakdowns
from app.services import olx_email, web_search
from app.services.feed_import import import_feed
from app.services.shop_check import check_shop
from app.services.scrape_runner import ingest_offers, run_shop
from recommender.calendar import events_between
from recommender.rules import FakeDiscount, Recommendation, point_at
from scrapers.olx import CATEGORY_URL as OLX_CATEGORY_URL
from scrapers.olx import parse_olx_listing
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


@router.get("/products", response_model=schemas.ProductList)
def list_products(source: str | None = SourceParam, session: Session = Depends(get_session)):
    """Toate produsele, grupabile pe familii, cu cel mai bun preț final curent (oferte noi, fără pachete, în stoc)."""
    src = catalog.resolve_source(source)
    out = []
    for p in session.scalars(select(Product).order_by(Product.id)):
        offers = catalog.load_offers(session, p.id, src)
        views = [v for v in catalog.current_views(offers) if not v.offer.is_bundle]
        direct = set(map(id, catalog.comparable(offers)))
        # cel mai bun preț: întâi ofertele vândute de magazin; marketplace doar dacă nu există altele
        best = next((v for v in views if v.point.in_stock and id(v.offer) in direct), None) or next(
            (v for v in views if v.point.in_stock), None
        )
        used = [v for v in catalog.current_views(catalog.load_offers(session, p.id, src, used=True)) if v.point.in_stock]
        rec = catalog.product_recommendation(p, offers)
        out.append(
            schemas.ProductSummary(
                **product_base(p),
                best_offer=offer_out(best) if best else None,
                offers_count=len(views),
                refurbished_from=_cheapest(used, "refurbished"),
                secondhand_from=_cheapest(used, "used"),
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
    views = catalog.current_views(offers)
    used = catalog.current_views(catalog.load_offers(session, p.id, src, used=True))
    return schemas.ProductDetail(
        **product_base(p),
        source=src,
        is_demo=src == "mock",
        available_sources=catalog.available_sources(session, p.id),
        offers=[offer_out(v, fakes.get(v.offer.id)) for v in views if not v.offer.is_bundle],
        bundles=[offer_out(v) for v in views if v.offer.is_bundle],
        refurbished=[offer_out(v) for v in used if v.offer.condition == "refurbished"],
        secondhand=[offer_out(v) for v in used if v.offer.condition != "refurbished"],
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
    offers = catalog.comparable(catalog.load_offers(session, p.id, src))
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


def require_admin(x_admin_token: str | None = Header(None)) -> None:
    if not settings.admin_token:
        raise HTTPException(503, "ADMIN_TOKEN nu este configurat")
    if x_admin_token != settings.admin_token:
        raise HTTPException(401, "Token invalid")


@router.post("/admin/scrape", response_model=schemas.ScrapeStarted, status_code=202, dependencies=[Depends(require_admin)])
def admin_scrape(background: BackgroundTasks, shop: str | None = None):
    """Pornește manual scraperul (un magazin sau toate). Header: X-Admin-Token."""
    shops = [shop] if shop else list(REGISTRY)
    unknown = [s for s in shops if s not in REGISTRY]
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
        )
        for r in rows
    ]


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
        raw = row.raw
        record_offer(
            session,
            session.get(Shop, row.shop_id),
            product,
            ScrapedOffer(
                shop_slug="",
                url=row.url,
                title=row.title,
                price=Decimal(raw["price"]),
                old_price=Decimal(raw["old_price"]) if raw.get("old_price") else None,
                in_stock=bool(raw.get("in_stock", True)),
                ean=None,
                mpn=raw.get("mpn"),
                warranty_months=raw.get("warranty_months"),
                condition=raw.get("condition") or "new",
                scraped_at=row.scraped_at,
                seller=raw.get("seller"),
                grade=raw.get("grade"),
                location=raw.get("location"),
            ),
            is_bundle,
        )
    session.delete(row)
    session.commit()


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
    return [
        {"slug": s.slug, "name": s.name, "kind": s.kind, "status": s.status, "has_feed": bool(s.feed and s.feed.get("url"))}
        for s in session.scalars(select(Shop).order_by(Shop.id))
    ]


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
