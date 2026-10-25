export type Verdict = "BUY_NOW" | "WAIT" | "UPCOMING_SALE" | "NEUTRAL" | "INSUFFICIENT_DATA";

export interface Shop {
  slug: string;
  name: string;
  status: string;
  shipping_verified: boolean;
}

export interface Breakdown {
  price: number;
  shipping: number;
  warranty_months: number;
  warranty_penalty: number;
  final_price: number;
  cost_per_warranty_month: number;
}

export interface FakeDiscount {
  offer_id: number;
  shop_name: string;
  price: number;
  old_price: number;
  claimed_discount_pct: number;
  explanation: string[];
}

export interface Offer {
  id: number;
  shop: Shop;
  title: string | null;
  out_url: string;
  in_stock: boolean;
  old_price: number | null;
  breakdown: Breakdown;
  warranty_estimated: boolean;
  shipping_estimated: boolean;
  is_bundle: boolean;
  seller: string | null;
  is_marketplace: boolean;
  condition: "new" | "refurbished" | "used";
  grade: string | null;
  source: "real" | "mock";
  last_seen_at: string;
  price_since: string;
  fake_discount: FakeDiscount | null;
}

export interface Recommendation {
  verdict: Verdict;
  label: string;
  confidence: number;
  reasons: string[];
  metrics: Record<string, unknown>;
  fake_discount: boolean;
  fake_discounts: FakeDiscount[];
  disclaimer: string;
}

export interface ProductBase {
  slug: string;
  name: string;
  family: string;
  edition: string;
  storage_gb: number;
  model_code: string | null;
  ean: string | null;
  image_url: string | null;
  msrp_ron: number | null;
  msrp_verified: boolean;
  msrp_note: string | null;
}

export interface ProductSummary extends ProductBase {
  best_offer: Offer | null;
  offers_count: number;
  refurbished_from: number | null;
  secondhand_from: number | null;
  recommendation: { verdict: Verdict; label: string; confidence: number };
}

export interface ProductList {
  source: string;
  is_demo: boolean;
  products: ProductSummary[];
}

export interface ProductDetail extends ProductBase {
  source: string;
  is_demo: boolean;
  available_sources: string[];
  offers: Offer[];
  bundles: Offer[];
  refurbished: Offer[];
  secondhand: Offer[];
  recommendation: Recommendation;
}

export interface CalendarEvent {
  slug: string;
  name: string;
  date: string;
  start: string;
  end: string;
}

export interface History {
  product: string;
  source: string;
  is_demo: boolean;
  granularity: "day" | "week";
  range: "30d" | "90d" | "1y";
  shops: { key: string; name: string }[];
  points: Array<{ date: string; market_min: number | null } & Record<string, number | string | null>>;
  stats: { min: number | null; median: number | null; max: number | null };
  events: CalendarEvent[];
  coverage: { days_with_data: number; days_total: number };
}

export interface Compare {
  a: Offer;
  b: Offer;
  diffs: { component: string; label: string; a: number; b: number; diff: number }[];
  winner_offer_id: number | null;
  explanation: string;
}

export interface Unmatched {
  id: number;
  shop: string;
  shop_kind: string;
  url: string;
  title: string;
  reason: string | null;
  price: number | null;
  in_stock: boolean | null;
  seller: string | null;
  scraped_at: string;
}
