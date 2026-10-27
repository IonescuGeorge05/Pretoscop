from datetime import date, datetime

from pydantic import BaseModel


class ShopOut(BaseModel):
    slug: str
    name: str
    status: str
    shipping_verified: bool


class PriceBreakdownOut(BaseModel):
    price: float
    shipping: float
    warranty_months: int
    warranty_penalty: float
    final_price: float
    cost_per_warranty_month: float


class FakeDiscountOut(BaseModel):
    offer_id: int
    shop_name: str
    price: float
    old_price: float
    claimed_discount_pct: float
    explanation: list[str]


class OfferOut(BaseModel):
    id: int
    shop: ShopOut
    title: str | None
    out_url: str  # /api/out/{id} (redirect + logare click)
    shop_url: str  # link direct către magazin (afiliere dacă există); folosit de site-ul static
    in_stock: bool
    old_price: float | None
    breakdown: PriceBreakdownOut
    warranty_estimated: bool  # garanția vine din default-ul magazinului, nu din pagina produsului
    shipping_estimated: bool  # regulile de transport nu sunt verificate
    is_bundle: bool
    seller: str | None  # vânzătorul efectiv (marketplace / persoană fizică)
    is_marketplace: bool  # vândut de un terț -> nu intră în minimul pieței și în recomandare
    suspicious_price: bool  # second hand mult sub MSRP: posibil țeapă / defect / greșeală
    price_outlier: str | None = None  # ofertă nouă cu preț aberant (motivul); exclusă din minimul pieței
    condition: str  # new | refurbished | used
    grade: str | None  # gradul estetic (refurbished)
    location: str | None  # second hand: orașul din anunț
    posted_label: str | None  # second hand: data afișată în anunț
    source: str
    last_seen_at: datetime
    price_since: datetime
    fake_discount: FakeDiscountOut | None = None


class RecommendationOut(BaseModel):
    verdict: str
    label: str
    confidence: float
    reasons: list[str]
    metrics: dict
    fake_discount: bool
    fake_discounts: list[FakeDiscountOut]
    disclaimer: str = "Informativ — nu este sfat financiar."


class RecommendationBadge(BaseModel):
    verdict: str
    label: str
    confidence: float


class ProductBase(BaseModel):
    slug: str
    name: str
    family: str
    edition: str
    storage_gb: int
    model_code: str | None
    ean: str | None
    image_url: str | None
    msrp_ron: float | None
    msrp_verified: bool
    msrp_note: str | None


class NextEventOut(BaseModel):
    slug: str
    name: str
    start: date
    end: date
    days_until: int  # 0 = în desfășurare


class DealOut(BaseModel):
    product: "ProductWithFamily"
    offer: "OfferOut"
    reference_price: float
    real_drop_pct: float
    lowest_in_window: bool
    claimed_discount_pct: float | None  # reducerea afișată de magazin (preț tăiat), dacă există


class FakeDealOut(BaseModel):
    product: "ProductWithFamily"
    fake: "FakeDiscountOut"


class DealsOut(BaseModel):
    source: str
    is_demo: bool
    window_days: int
    next_event: NextEventOut | None
    deals: list[DealOut]
    fake: list[FakeDealOut]


class ProductWithFamily(ProductBase):
    family_slug: str  # pentru URL: /<family_slug>/<slug>


class ProductSummary(ProductWithFamily):
    best_offer: OfferOut | None
    offers_count: int
    refurbished_from: float | None  # cel mai mic preț final refurbished în stoc
    secondhand_from: float | None  # cel mai mic preț final second hand
    recommendation: RecommendationBadge


class FamilyOut(BaseModel):
    slug: str
    family: str
    title: str
    description: str


class ProductList(BaseModel):
    source: str
    is_demo: bool
    families: list[FamilyOut]
    products: list[ProductSummary]


class ProductDetail(ProductWithFamily):
    source: str
    is_demo: bool
    available_sources: list[str]
    offers: list[OfferOut]
    bundles: list[OfferOut]
    refurbished: list[OfferOut]
    secondhand: list[OfferOut]
    recommendation: RecommendationOut


class EventOut(BaseModel):
    slug: str
    name: str
    date: date
    start: date
    end: date


class HistoryShop(BaseModel):
    key: str
    name: str


class HistoryStats(BaseModel):
    min: float | None
    median: float | None
    max: float | None


class Coverage(BaseModel):
    days_with_data: int  # zile cu cel puțin un preț cunoscut
    days_total: int


class HistoryOut(BaseModel):
    product: str
    source: str
    is_demo: bool
    granularity: str
    range: str
    shops: list[HistoryShop]
    # rânduri plate pentru grafic: {"date": "...", "market_min": 2399.0, "<shop_slug>": 2410.0,
    #                              "<shop_slug>__wb": true dacă valoarea vine dintr-o captură din arhivă}
    points: list[dict]
    stats: HistoryStats
    events: list[EventOut]
    coverage: Coverage


class ComponentDiffOut(BaseModel):
    component: str
    label: str
    a: float
    b: float
    diff: float


class CompareOut(BaseModel):
    a: OfferOut
    b: OfferOut
    diffs: list[ComponentDiffOut]
    winner_offer_id: int | None
    explanation: str


class ScrapeStarted(BaseModel):
    shops: list[str]
    status: str = "started"


class UnmatchedOut(BaseModel):
    id: int
    shop: str
    shop_kind: str
    url: str
    title: str
    reason: str | None
    price: float | None
    in_stock: bool | None
    seller: str | None
    scraped_at: datetime


class ImportResult(BaseModel):
    listings: int
    matched: int
    bundles: int
    unmatched: int  # ajung în /admin pentru asociere manuală
    ignored: int  # accesorii, PS4 etc.


class AssignIn(BaseModel):
    product_slug: str
    is_bundle: bool = False


for _m in (DealOut, FakeDealOut, DealsOut):
    _m.model_rebuild()
