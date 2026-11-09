import { baniToLeiString } from '@pretoscop/core';
import type { B2bChange, B2bOffer, B2bPositionRow, HistoryResponse } from '@pretoscop/db';
import type { z } from 'zod';
import type { Change, History, Offer, Position, PositionDetail, Sku } from './b2b-api-schema';

/**
 * Row → API v1 JSON (M28). Every field is named explicitly: what is not listed here never reaches
 * a customer. Pure (no server-only imports), so the contract tests run it directly.
 */

const lei = (bani: number) => baniToLeiString(bani)!;
const leiOrNull = (bani: number | null) => (bani === null ? null : lei(bani));
const iso = (t: string) => new Date(t).toISOString();
const isoOrNull = (t: string | null) => (t === null ? null : iso(t));

export function apiSku(r: B2bPositionRow, baseUrl: string): z.infer<typeof Sku> {
  return {
    id: r.skuId,
    ref: r.ref,
    label: r.label,
    gtin: r.gtin,
    mpn: r.mpn,
    brand: r.brandRaw,
    status: r.status,
    reference_price: leiOrNull(r.referencePriceBani),
    product: r.product ? { id: r.product.id, title: r.product.title, brand: r.product.brand, category: r.product.category, url: `${baseUrl}/p/${r.product.slug}` } : null,
  };
}

export function apiOffer(o: B2bOffer): z.infer<typeof Offer> {
  return {
    shop: o.shopName,
    seller: o.sellerName,
    seller_type: o.sellerType,
    url: o.url,
    price: lei(o.priceBani),
    shipping: leiOrNull(o.shippingBani),
    total: lei(o.totalBani),
    availability: o.availability,
    condition: o.condition,
    last_checked_at: iso(o.lastCheckedAt),
    stale: o.stale,
    comparable: o.comparable,
  };
}

export function apiPosition(r: B2bPositionRow, baseUrl: string): z.infer<typeof Position> {
  return {
    sku: apiSku(r, baseUrl),
    own: r.ownTotalBani === null || r.ownBasis === null ? null : { basis: r.ownBasis, total: lei(r.ownTotalBani), offer: r.own ? apiOffer(r.own) : null },
    market: {
      min: leiOrNull(r.position.minBani),
      median: leiOrNull(r.position.medianBani),
      competitors: r.position.competitors,
      cheapest_shop: r.cheapest ? (r.cheapest.sellerName ? `${r.cheapest.shopName} (${r.cheapest.sellerName})` : r.cheapest.shopName) : null,
    },
    rank: r.position.rank,
    gap_to_min_pct: r.position.gapToMinPct,
    status: r.position.status,
    oldest_check_at: isoOrNull(r.oldestCheckAt),
    newest_check_at: isoOrNull(r.newestCheckAt),
  };
}

export function apiPositionDetail(r: B2bPositionRow, baseUrl: string): z.infer<typeof PositionDetail> {
  return { ...apiPosition(r, baseUrl), offers: r.offers.map(apiOffer) };
}

export function apiChange(c: B2bChange): z.infer<typeof Change> {
  return {
    sku_id: c.skuId,
    ref: c.ref,
    label: c.label,
    shop: c.shopName,
    seller: c.sellerName,
    own: c.own,
    observed_at: iso(c.observedAt),
    before: c.beforeTotalBani === null || c.beforeAvailability === null ? null : { total: lei(c.beforeTotalBani), availability: c.beforeAvailability },
    after: { total: lei(c.afterTotalBani), availability: c.afterAvailability },
  };
}

/** getHistory (lei as numbers from numeric columns) → decimal strings. */
export function apiHistory(h: HistoryResponse): z.infer<typeof History> {
  const series = (s: Array<[string, number]>): Array<[string, string]> => s.map(([d, v]) => [d, lei(Math.round(v * 100))]);
  return {
    data: {
      range: h.range,
      min: series(h.series.min),
      marketplace: series(h.series.marketplace),
      shops: Object.fromEntries(Object.entries(h.series.shops).map(([slug, s]) => [slug, { name: h.shops[slug]?.name ?? slug, series: series(s) }])),
    },
  };
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Same rule as the quota counter's day (`bucharestToday` in @pretoscop/db). */
const bucharestToday = (d: Date) => dayFmt.format(d);
const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The next Europe/Bucharest midnight (when the daily API quota starts over). */
export function nextBucharestMidnight(now = new Date()): Date {
  const tomorrow = addDaysIso(bucharestToday(now), 1);
  const utcMidnight = Date.parse(`${tomorrow}T00:00:00Z`);
  // Bucharest is UTC+2 or UTC+3: midnight there is 22:00 or 21:00 UTC the day before.
  for (const hours of [3, 2]) {
    const t = new Date(utcMidnight - hours * 3_600_000);
    if (bucharestToday(t) === tomorrow) return t;
  }
  return new Date(utcMidnight);
}
