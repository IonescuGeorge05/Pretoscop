import { coverage, MIN_COVERAGE, type OfferDay } from '@pretoscop/core';
import { REPORT_SCHEMA, type ChangeClass, type GroupStats, type ProductDrop, type RaiseThenCutCase, type ReportData, type ReportOfferRow } from './schema';

/**
 * Event analysis (M23). Pure and deterministic: the same input always gives the same output.
 * The rules are the product-page rules of M08 (docs/03 §6.4) applied to an event window:
 *   - an offer's "real drop" compares its lowest in-stock price during the event with its own
 *     lowest in-stock price in the 30 days before (≥ 2% lower = real drop, within ±2% = no real
 *     drop, > 2% higher = higher), and only when we observed ≥ 70% of those 30 days;
 *   - a "claim" is a reduction the shop displayed (a crossed reference price above the price);
 *   - raise-then-cut: the peak in [start−30, start−3] is ≥ 115% of the median in [start−60,
 *     start−31] and the event price is still ≥ 97% of that median (needs 60 days of history).
 * Product drops use shop-sold offers only, like the history chart's main series.
 */

export interface ReportInputDay extends OfferDay {
  /** The shop's crossed reference price that day, when shown. */
  oldPriceBani: number | null;
}

export interface ReportInputOffer {
  offerId: number;
  shop: string;
  sellerType: 'shop' | 'marketplace';
  productId: number | null;
  productTitle: string | null;
  category: string | null;
  /** Observed in-stock days, ascending; gaps stay absent (never filled). */
  days: ReportInputDay[];
}

export interface ReportInput {
  id: string;
  title: string;
  window: { from: string; to: string };
  generatedAt: string;
  categories: string[] | null;
  shopNames: Record<string, string>;
  categoryNames: Record<string, string>;
  offers: ReportInputOffer[];
}

const DAY_MS = 86_400_000;
export const REAL_DROP = 0.02;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function minDay(days: ReportInputDay[]): ReportInputDay | null {
  let best: ReportInputDay | null = null;
  for (const d of days) if (!best || d.priceBani < best.priceBani) best = d;
  return best;
}

function classify(change: number | null): ChangeClass {
  if (change === null) return 'insufficient_history';
  if (change <= -REAL_DROP) return 'real_drop';
  if (change < REAL_DROP) return 'no_real_drop';
  return 'higher';
}

export function analyzeOffer(o: ReportInputOffer, window: { from: string; to: string }): ReportOfferRow | null {
  const event = o.days.filter((d) => d.day >= window.from && d.day <= window.to);
  const eventMin = minDay(event);
  if (!eventMin) return null; // not in stock during the event
  const bFrom = addDays(window.from, -30);
  const bTo = addDays(window.from, -1);
  const before = o.days.filter((d) => d.day >= bFrom && d.day <= bTo);
  const cov = coverage(before, bFrom, bTo);
  const min30 = cov >= MIN_COVERAGE ? (minDay(before)?.priceBani ?? null) : null;
  const change = min30 !== null ? (eventMin.priceBani - min30) / min30 : null;
  const claimed = event.some((d) => d.oldPriceBani !== null && d.oldPriceBani > d.priceBani);
  const reference = eventMin.oldPriceBani !== null && eventMin.oldPriceBani > eventMin.priceBani ? eventMin.oldPriceBani : null;
  return {
    offerId: o.offerId,
    shop: o.shop,
    sellerType: o.sellerType,
    productId: o.productId,
    productTitle: o.productTitle,
    category: o.category,
    min30Bani: min30,
    coverage30: r4(cov),
    eventMinBani: eventMin.priceBani,
    eventMinDay: eventMin.day,
    referenceBani: reference,
    discountClaimed: claimed,
    changePct: change === null ? null : r4(change),
    class: classify(change),
    referenceAboveMin30: reference !== null && min30 !== null && reference > min30 * (1 + REAL_DROP),
  };
}

export function raiseThenCut(o: ReportInputOffer, window: { from: string; to: string }): RaiseThenCutCase | null | 'insufficient' {
  const event = o.days.filter((d) => d.day >= window.from && d.day <= window.to);
  const eventMin = minDay(event);
  if (!eventMin) return null;
  const recentFrom = addDays(window.from, -30);
  const recentTo = addDays(window.from, -3);
  const earlierFrom = addDays(window.from, -60);
  const earlierTo = addDays(window.from, -31);
  const recent = o.days.filter((d) => d.day >= recentFrom && d.day <= recentTo);
  const earlier = o.days.filter((d) => d.day >= earlierFrom && d.day <= earlierTo);
  if (coverage(recent, recentFrom, recentTo) < MIN_COVERAGE || coverage(earlier, earlierFrom, earlierTo) < MIN_COVERAGE) return 'insufficient';
  const earlierMedian = median(earlier.map((d) => d.priceBani))!;
  let peak = recent[0]!;
  for (const d of recent) if (d.priceBani > peak.priceBani) peak = d;
  if (peak.priceBani >= earlierMedian * 1.15 && eventMin.priceBani >= earlierMedian * 0.97) {
    return {
      offerId: o.offerId,
      shop: o.shop,
      productTitle: o.productTitle,
      earlierMedianBani: Math.round(earlierMedian),
      peakBani: peak.priceBani,
      peakDay: peak.day,
      eventMinBani: eventMin.priceBani,
      eventMinDay: eventMin.day,
      raisePct: r4(peak.priceBani / earlierMedian - 1),
    };
  }
  return null;
}

export function groupStats(key: string, label: string, rows: ReportOfferRow[]): GroupStats {
  const hist = rows.filter((r) => r.class !== 'insufficient_history');
  const claims = hist.filter((r) => r.discountClaimed);
  const without = claims.filter((r) => r.class !== 'real_drop').length;
  const med = median(hist.map((r) => r.changePct!));
  return {
    key,
    label,
    offers: rows.length,
    withHistory: hist.length,
    claims: claims.length,
    claimsWithoutRealDrop: without,
    claimsWithoutRealDropShare: claims.length ? r4(without / claims.length) : null,
    realDrop: hist.filter((r) => r.class === 'real_drop').length,
    noRealDrop: hist.filter((r) => r.class === 'no_real_drop').length,
    higher: hist.filter((r) => r.class === 'higher').length,
    medianChangePct: med === null ? null : r4(med),
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export function productDrops(input: ReportInput): ProductDrop[] {
  const bFrom = addDays(input.window.from, -30);
  const bTo = addDays(input.window.from, -1);
  const out: ProductDrop[] = [];
  const offers = input.offers.filter((o) => o.productId !== null && o.sellerType === 'shop');
  for (const [pid, list] of groupBy(offers, (o) => String(o.productId))) {
    // Product series = per day, the lowest shop-sold in-stock price across its offers.
    const daily = new Map<string, number>();
    for (const o of list) for (const d of o.days) daily.set(d.day, Math.min(daily.get(d.day) ?? Infinity, d.priceBani));
    const days = [...daily.entries()].map(([day, priceBani]) => ({ day, priceBani })).sort((a, b) => (a.day < b.day ? -1 : 1));
    const before = days.filter((d) => d.day >= bFrom && d.day <= bTo);
    if (coverage(before, bFrom, bTo) < MIN_COVERAGE) continue;
    const event = days.filter((d) => d.day >= input.window.from && d.day <= input.window.to);
    if (event.length === 0) continue;
    const min30 = Math.min(...before.map((d) => d.priceBani));
    let e = event[0]!;
    for (const d of event) if (d.priceBani < e.priceBani) e = d;
    const drop = (min30 - e.priceBani) / min30;
    if (drop < REAL_DROP) continue;
    const first = list[0]!;
    out.push({
      productId: Number(pid),
      title: first.productTitle ?? `#${pid}`,
      category: first.category,
      min30Bani: min30,
      eventMinBani: e.priceBani,
      eventMinDay: e.day,
      dropPct: r4(drop),
      shops: new Set(list.map((o) => o.shop)).size,
    });
  }
  return out.sort((a, b) => b.dropPct - a.dropPct || a.productId - b.productId);
}

export function analyzeReport(input: ReportInput): ReportData {
  const rows: ReportOfferRow[] = [];
  const cases: RaiseThenCutCase[] = [];
  let evaluatedRtc = 0;
  const offers = [...input.offers].sort((a, b) => a.offerId - b.offerId);
  for (const o of offers) {
    const row = analyzeOffer(o, input.window);
    if (!row) continue;
    rows.push(row);
    const rtc = raiseThenCut(o, input.window);
    if (rtc !== 'insufficient') evaluatedRtc++;
    if (rtc && rtc !== 'insufficient') cases.push(rtc);
  }
  const shopLabel = (s: string) => input.shopNames[s] ?? s;
  const byShop = [...groupBy(rows, (r) => r.shop)].map(([k, v]) => groupStats(k, shopLabel(k), v)).sort(byKey);
  const bySeller = [...groupBy(rows, (r) => r.sellerType)]
    .map(([k, v]) => groupStats(k, k === 'shop' ? 'Vândute de magazine' : 'Vânzători din marketplace', v))
    .sort(byKey);
  const byCategory = [...groupBy(rows, (r) => r.category ?? 'necategorizat')]
    .map(([k, v]) => groupStats(k, input.categoryNames[k] ?? k, v))
    .sort(byKey);
  const drops = productDrops(input);
  const notes: string[] = [];
  const headline = groupStats('all', 'Toate ofertele', rows);
  if (headline.withHistory < rows.length) {
    notes.push(`${rows.length - headline.withHistory} din ${rows.length} oferte nu au istoric suficient (observate în mai puțin de 70% din cele 30 de zile dinaintea evenimentului) și nu intră în procente.`);
  }
  if (evaluatedRtc === 0) {
    notes.push('Regula „preț crescut înainte, apoi redus” cere 60 de zile de istoric înaintea evenimentului; nu a putut fi evaluată pentru nicio ofertă.');
  }
  notes.push('Numele vânzătorilor din marketplace nu sunt publicate; apar doar agregat.');
  return {
    schema: REPORT_SCHEMA,
    id: input.id,
    title: input.title,
    window: input.window,
    baselineDays: { realDrop: 30, raiseThenCut: 60 },
    generatedAt: input.generatedAt,
    categories: input.categories,
    approval: { approved: false, by: null, at: null },
    headline,
    byShop,
    bySeller,
    byCategory,
    biggestDrops: drops.slice(0, 25),
    raiseThenCut: {
      evaluated: evaluatedRtc,
      cases: cases.sort((a, b) => b.raisePct - a.raisePct || a.offerId - b.offerId).slice(0, 50),
      note: evaluatedRtc === 0 ? 'insufficient history (60 days needed)' : null,
    },
    offers: rows,
    notes,
  };
}
