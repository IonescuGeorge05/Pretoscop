import { allTimeLowExplanation, dropBadgeText, dropExplanation, median, verdictText, type Verdict } from '@pretoscop/core';
import type { ExtMatchedBy, HistoryResponse } from '@pretoscop/db';
import type { ProductOffer, ProductPageData } from './product';
import { createRateLimiter, type RateLimitResult } from './rate-limit';

/**
 * Browser-extension lookup API (M26): `GET /api/ext/lookup?url=&gtin=&brand=&mpn=`. Public,
 * read-only data that our product page already shows, so CORS is `*` (no credentials, no cookies).
 * This module holds the pure parts (input validation, response shape, rate-limit policy, headers);
 * the route resolves identifiers with `resolveExtLookup` (@pretoscop/db) and loads the product
 * page's own cached data (`getProductPageData`, `getHistory`).
 *
 * Never in a response: Icecat data (specs, images), any image, GTINs or part numbers we hold, offer
 * URLs or ids, affiliate data, matching internals, anything about the requester.
 */

export const LOOKUP_LIMITS = { url: 2048, gtinDigits: [8, 14] as const, brand: 80, mpn: 64 };
export const MAX_BEST_OFFERS = 5;
export const MAX_HISTORY_DAYS = 180;
/** Per client (daily-salted IP hash), per web process: a short and a long window. */
export const RATE_LIMIT = { perMinute: 20, perHour: 300 };
/** Feature flag that turns the API on (off by default; config `{ "disabled_shops": ["emag"] }` switches single shops off). */
export const EXT_LOOKUP_FLAG = 'extension.lookup.enabled';

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // The extension reads Retry-After on 429 to back off; it is not a CORS-safelisted header.
  'access-control-expose-headers': 'retry-after',
  'access-control-max-age': '86400',
};

export interface LookupQuery {
  /** Origin + path of the shop page (query and fragment dropped). */
  url: string | null;
  gtin: string | null;
  brand: string | null;
  mpn: string | null;
}

export type ParseResult = { ok: true; query: LookupQuery } | { ok: false; error: string };

function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || (c >= 127 && c < 160)) return true;
  }
  return false;
}

const MPN_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._/+#()-]*$/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/** Validates the query string; anything malformed is a 400, never a guess. */
export function parseLookupQuery(params: URLSearchParams): ParseResult {
  const query: LookupQuery = { url: null, gtin: null, brand: null, mpn: null };
  for (const key of ['url', 'gtin', 'brand', 'mpn'] as const) {
    const all = params.getAll(key);
    if (all.length > 1) return { ok: false, error: `duplicate_${key}` };
    const v = all[0]?.trim();
    if (!v) continue;
    if (hasControlChars(v)) return { ok: false, error: `invalid_${key}` };
    query[key] = v;
  }
  if (query.url !== null) {
    if (query.url.length > LOOKUP_LIMITS.url) return { ok: false, error: 'invalid_url' };
    let u: URL;
    try {
      u = new URL(query.url);
    } catch {
      return { ok: false, error: 'invalid_url' };
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname.includes('.')) return { ok: false, error: 'invalid_url' };
    query.url = `${u.origin}${u.pathname}`;
  }
  if (query.gtin !== null) {
    const digits = query.gtin.replace(/[\s-]/g, '');
    const [min, max] = LOOKUP_LIMITS.gtinDigits;
    if (!/^\d+$/.test(digits) || digits.length < min || digits.length > max) return { ok: false, error: 'invalid_gtin' };
    query.gtin = digits;
  }
  if (query.brand !== null && (query.brand.length > LOOKUP_LIMITS.brand || !HAS_ALNUM.test(query.brand))) return { ok: false, error: 'invalid_brand' };
  if (query.mpn !== null && (query.mpn.length > LOOKUP_LIMITS.mpn || !MPN_RE.test(query.mpn))) return { ok: false, error: 'invalid_mpn' };
  if ((query.brand === null) !== (query.mpn === null)) return { ok: false, error: 'brand_and_mpn_go_together' };
  if (query.url === null && query.gtin === null && query.brand === null) return { ok: false, error: 'no_identifier' };
  return { ok: true, query };
}

/** Two fixed windows (per minute and per hour) over one key; refused when either is exhausted. */
export function createLookupLimiter(limits = RATE_LIMIT): { hit(key: string, now?: number): RateLimitResult } {
  const minute = createRateLimiter({ limit: limits.perMinute, windowMs: 60_000 });
  const hour = createRateLimiter({ limit: limits.perHour, windowMs: 3_600_000 });
  return {
    hit(key, now = Date.now()) {
      const a = minute.hit(key, now);
      const b = hour.hit(key, now);
      if (a.allowed && b.allowed) return { allowed: true, remaining: Math.min(a.remaining, b.remaining), retryAfterSec: 0 };
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(a.retryAfterSec, b.retryAfterSec) };
    },
  };
}

const VERDICT_LABEL: Record<Verdict, string> = {
  good_price: 'Preț bun',
  usual: 'Preț obișnuit',
  above_usual: 'Peste obișnuit',
  insufficient_data: 'Istoric insuficient',
};

export interface ExtOffer {
  /** Our shop slug (e.g. `emag`), so the extension can tell "this shop" apart. */
  shop: string;
  shop_name: string;
  /** Marketplace seller named on the offer (null when sold by the shop or unnamed). */
  seller_name: string | null;
  marketplace: boolean;
  price: string;
  /** Delivery cost (null = not known; the shop states it at checkout). */
  shipping: string | null;
  total: string;
  checked_at: string;
}

export interface ExtLookupResponse {
  product_id: number;
  slug: string;
  title: string;
  /** Absolute product page URL on Pretoscop. */
  url: string;
  matched_by: ExtMatchedBy;
  /** Lowest daily total of the last 30 days (today included), from our observations. */
  low_30d: string | null;
  low_all_time: string | null;
  /** Median of the observed daily minimum totals of the last 30 days. */
  median_30d: string | null;
  verdict: { code: Verdict; label: string; text: string };
  observations_days: number;
  history_started_at: string | null;
  /** M15 badges, under the product page's rules (none for provisional products). */
  badges: Array<{ kind: 'drop' | 'all_time_low'; label: string; text: string }>;
  /** Cheapest new, in-stock offers checked within their shop's freshness window, ranked like the product page (≤ 5). */
  best_offers: ExtOffer[];
  /** [day, lowest total] for observed days of the last 180 days; days without observations are absent. */
  history: Array<[string, string]>;
  /** The newest check of any of the product's offers. */
  updated_at: string | null;
}

/** numeric(12,2) text or a number of lei → integer bani; null for anything else. */
export function toBani(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
}

/** Integer bani → "1234.56" (no floats). */
export function baniText(b: number): string {
  return `${Math.floor(b / 100)}.${String(b % 100).padStart(2, '0')}`;
}

const money = (v: string | number | null | undefined): string | null => {
  const b = toBani(v);
  return b === null ? null : baniText(b);
};

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function extOffer(o: ProductOffer): ExtOffer {
  return {
    shop: o.shopSlug,
    shop_name: o.shopName,
    seller_name: o.sellerType === 'marketplace' ? o.sellerName : null,
    marketplace: o.sellerType === 'marketplace',
    price: money(o.price)!,
    shipping: money(o.shippingCost),
    total: money(o.total)!,
    checked_at: new Date(o.lastCheckedAt).toISOString(),
  };
}

/** The response body, from the product page's own data (same offers, stats, verdict and badges). */
export function buildLookupResponse(
  p: ProductPageData,
  history: HistoryResponse,
  matchedBy: ExtMatchedBy,
  siteBase: string,
  today: string,
): ExtLookupResponse {
  const from = addDays(today, -(MAX_HISTORY_DAYS - 1));
  const series = history.series.min.filter(([day]) => day >= from && day <= today);
  const last30 = series.filter(([day]) => day >= addDays(today, -29)).map(([, v]) => toBani(v)).filter((b): b is number => b !== null);
  const med = median(last30);
  const best = p.offers.filter((o) => o.availability === 'in_stock' && !o.stale && o.condition === 'new').slice(0, MAX_BEST_OFFERS);
  const verdict: Verdict = p.stats?.verdict ?? 'insufficient_data';
  const days = p.stats?.observationsDays ?? 0;
  const badges: ExtLookupResponse['badges'] = [];
  if (p.priceFacts?.drop) {
    // Like the product page: the drop is measured on shop-sold offers, the best price may be a marketplace seller's.
    const prefix = best[0]?.sellerType === 'marketplace' ? 'La ofertele vândute direct de magazine: ' : '';
    badges.push({ kind: 'drop', label: dropBadgeText(p.priceFacts.drop), text: `${prefix}${dropExplanation(p.priceFacts.drop)}` });
  }
  if (p.priceFacts?.allTimeLow) badges.push({ kind: 'all_time_low', label: 'Minim istoric', text: allTimeLowExplanation(p.priceFacts.allTimeLow) });
  const checks = p.offers.map((o) => Date.parse(o.lastCheckedAt)).filter((t) => Number.isFinite(t));
  return {
    product_id: p.id,
    slug: p.slug,
    title: p.title,
    url: `${siteBase.replace(/\/+$/, '')}/p/${p.slug}`,
    matched_by: matchedBy,
    low_30d: money(p.stats?.min30d),
    low_all_time: money(p.stats?.minAllTime),
    median_30d: med === null ? null : baniText(med),
    verdict: { code: verdict, label: VERDICT_LABEL[verdict], text: verdictText(verdict, days) },
    observations_days: days,
    history_started_at: p.stats?.historyStartedAt?.slice(0, 10) ?? null,
    badges,
    best_offers: best.map(extOffer),
    history: series.map(([day, v]) => [day, baniText(toBani(v)!)]),
    updated_at: checks.length ? new Date(Math.max(...checks)).toISOString() : null,
  };
}
