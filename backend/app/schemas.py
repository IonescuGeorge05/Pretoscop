from datetime import date, datetime
from typing import Literal

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
    preorder: bool = False  # se poate comanda acum, livrare ulterioară
    gift: dict | None = None  # {"title", "value"}: cadou inclus; „efectiv” = preț final - valoare, doar afișat
    is_affiliate: bool = False
    manual_checked_at: datetime | None = None  # prețul l-a verificat un om pe site-ul magazinului (nu robotul)  # butonul duce printr-un link de afiliere (marcat pe site)
    colors: list[str] = []  # culorile găsite la același magazin (unite într-un rând)
    variants: int = 1  # câte pagini (culori) are magazinul pentru produs
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
    lifecycle: str = "current"  # current | retired
    successor: str | None = None


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
    refurbished_count: int = 0  # oferte refurbished (inclusiv epuizate)
    refurbished_last: float | None = None  # cel mai mic preț refurbished, chiar dacă e epuizat acum
    secondhand_count: int = 0
    secondhand_cities: list[str] = []  # orașele cu cele mai multe anunțuri
    secondhand_median: float | None = None  # mediana prețurilor cerute second hand (min. 3 anunțuri): „cât iei pe el”
    recommendation: RecommendationBadge


class FamilyOut(BaseModel):
    slug: str
    family: str
    category: str = "altele"  # console | telefoane (meniu și prima pagină)
    title: str
    description: str


class ProductList(BaseModel):
    source: str
    is_demo: bool
    families: list[FamilyOut]
    products: list[ProductSummary]


class MissingShopOut(BaseModel):
    name: str
    search_url: str  # căutarea produsului pe site-ul magazinului (preț neverificat de noi)
    reason: str


class ProductDetail(ProductWithFamily):
    source: str
    is_demo: bool
    available_sources: list[str]
    offers: list[OfferOut]
    bundles: list[OfferOut]
    refurbished: list[OfferOut]
    secondhand: list[OfferOut]
    recommendation: RecommendationOut
    missing_shops: list[MissingShopOut] = []
    community_reports: list["CommunityReportOut"] = []  # „Am găsit mai ieftin”, verificate de mână
    alerts_enabled: bool = False  # serverul poate trimite emailuri (SMTP configurat)


class EventOut(BaseModel):
    slug: str
    name: str
    date: date
    start: date
    end: date


class HistoryShop(BaseModel):
    key: str
    name: str
    marketplace: bool = False  # serie afișată, dar exclusă din minimul pieței


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
    ai: dict | None = None  # sugestia AI: {product_slug, is_bundle, confidence, reason}; doar propunere


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


class CommunityReportOut(BaseModel):
    domain: str
    url: str
    price: float
    reviewed_at: datetime  # când l-am verificat de mână


class ManualPriceIn(BaseModel):
    product_slug: str
    shop_slug: str
    url: str  # pagina produsului pe site-ul magazinului (butonul „Mergi la magazin”)
    price: str
    old_price: str | None = None
    in_stock: bool = True
    preorder: bool = False
    gift_title: str | None = None
    gift_value: str | None = None


class ManualPriceOut(BaseModel):
    offer_id: int
    product_slug: str
    product_name: str
    shop: str
    url: str
    price: float
    in_stock: bool
    preorder: bool
    checked_at: datetime
    expired: bool  # mai vechi de 24 de ore: nu mai apare pe site până nu e reconfirmat


class FeedLinkIn(BaseModel):
    url: str | None = None  # gol = scoate feed-ul
    vat_included: bool = True


class NewShopIn(BaseModel):
    name: str
    base_url: str


class UnspecifiedListingOut(BaseModel):
    family: str
    family_slug: str
    title: str
    price: float
    location: str | None
    posted_label: str | None
    url: str
    shop: str
    reason: str  # ce lipsește din anunț (ediția, stocarea, generația)


class UnspecifiedOut(BaseModel):
    source: str
    listings: list[UnspecifiedListingOut]


class AlertIn(BaseModel):
    email: str
    product_slug: str
    kind: Literal["price", "stock"]
    target_price: float | None = None


class ReportIn(BaseModel):
    product_slug: str
    url: str
    price: str
    note: str | None = None
    website: str | None = None  # câmp ascuns (capcană pentru roboți); oamenii îl lasă gol


class AdminReportOut(BaseModel):
    id: int
    product_slug: str
    product_name: str
    url: str
    domain: str
    price: float
    note: str | None
    status: str
    created_at: datetime
    best_price: float | None  # cel mai mic preț al nostru acum, pentru comparație


class EventReportRow(BaseModel):
    product: ProductWithFamily
    baseline: float | None
    baseline_days: int
    event_low: float | None
    change_pct: float | None
    verdict: Literal["pending", "real", "small", "none", "no_data"]


class EventReportOut(BaseModel):
    source: str
    is_demo: bool
    event: EventOut
    status: Literal["upcoming", "running", "ended"]
    days_until: int
    baseline_days: int  # lungimea ferestrei de referință (30)
    rows: list[EventReportRow]


ProductDetail.model_rebuild()  # community_reports e definit mai jos


class FakeExampleOut(BaseModel):
    product: str
    product_slug: str
    start: date
    claimed_pct: float


class ShopTrustRow(BaseModel):
    slug: str
    name: str
    status: str
    offers: int
    judged: int  # reduceri afișate pe care le-am putut verifica
    fake: int
    unjudged: int  # reduceri începute înainte să avem destul istoric
    fake_pct: float | None  # None = prea puține reduceri judecate
    examples: list[FakeExampleOut]


class ShopTrustOut(BaseModel):
    source: str
    is_demo: bool
    window_days: int
    min_judged: int
    shops: list[ShopTrustRow]


class ManualImportIn(BaseModel):
    shop_slug: str
    page_url: str | None = None  # adresa paginii lipite (pentru rândurile fără link)
    rows: list[dict]  # [{title, url, prices: [text], context}] extrase în browser


class ManualImportRowOut(BaseModel):
    title: str
    url: str | None
    product_slug: str | None
    product_name: str | None
    price: float | None
    old_price: float | None
    in_stock: bool
    preorder: bool
    is_bundle: bool
    selected: bool
    note: str | None


class ManualImportSaveRow(BaseModel):
    title: str
    product_slug: str
    url: str
    price: str
    old_price: str | None = None
    in_stock: bool = True
    preorder: bool = False
    is_bundle: bool = False


class ManualImportSaveIn(BaseModel):
    shop_slug: str
    rows: list[ManualImportSaveRow]
