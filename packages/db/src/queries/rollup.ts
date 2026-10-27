import { computeVerdict, discountFacts, type DiscountFact, type OfferDay, type Verdict } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { numericToBani } from '../money';

/** Today's date in Europe/Bucharest (YYYY-MM-DD). */
export function bucharestToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDaysIso(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Recomputes product_daily for the products (null = all) and the inclusive day range. */
export async function rollupProducts(db: Db, opts: { productIds?: number[] | null; from: string; to: string }): Promise<number> {
  const ids = opts.productIds && opts.productIds.length > 0 ? opts.productIds : null;
  const res = await db.execute<{ n: number }>(
    sql`SELECT rollup_product_daily(${ids ? sql`${sql.param(ids)}::bigint[]` : sql`NULL::bigint[]`}, ${opts.from}::date, ${opts.to}::date) AS n`,
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Freshness window for "current" offers on product pages and in stats. */
export const CURRENT_OFFER_MAX_AGE_HOURS = 48;

type StatsRow = {
  product_id: string;
  cur_total: string | null;
  cur_offer: string | null;
  cur_shop: string | null;
  cur_price: string | null;
  offer_count: string;
  min_30d: string | null;
  min_30d_at: string | null;
  min_all: string | null;
  min_all_at: string | null;
  median_90d: string | null;
  last_change_ms: string | null;
  total_7d_ago: string | null;
  obs_days: string;
  first_day: string | null;
};

/**
 * Recomputes product_stats (and the denormalized minimums on products) for the products
 * (null = every product with offers). Numbers come from product_daily and current offers; the
 * verdict comes from @pretoscop/core so the rule lives in one place.
 */
export async function computeProductStats(db: Db, productIds: number[] | null, today = bucharestToday()): Promise<number> {
  const ids = productIds && productIds.length > 0 ? productIds : null;
  const filter = ids ? sql`AND p.id = ANY(${sql.param(ids)}::bigint[])` : sql``;
  const res = await db.execute<StatsRow>(sql`
    WITH p AS (
      SELECT p.id FROM products p
      WHERE p.status = 'active' ${filter}
    ),
    cur AS (
      SELECT DISTINCT ON (o.product_id) o.product_id, o.total_price, o.id, o.shop_id, o.price
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id IN (SELECT id FROM p) AND o.active AND o.availability = 'in_stock'
        AND o.match_status IN ('auto','manual') AND o.condition = 'new' AND NOT o.is_bundle
        AND NOT o.is_accessory AND NOT o.blacklisted AND o.seller_type = 'shop'
        AND s.trust_tier <= 2 AND s.status = 'active' AND o.source_tier <= 2
        AND o.last_checked_at > now() - make_interval(hours => ${CURRENT_OFFER_MAX_AGE_HOURS}::int)
      ORDER BY o.product_id, o.total_price ASC, o.last_checked_at DESC
    ),
    cnt AS (
      SELECT o.product_id, count(*) AS n, max(o.price_changed_at) AS last_change
      FROM offers o
      WHERE o.product_id IN (SELECT id FROM p) AND o.active AND o.match_status IN ('auto','manual')
        AND o.last_checked_at > now() - make_interval(hours => ${CURRENT_OFFER_MAX_AGE_HOURS}::int)
      GROUP BY o.product_id
    ),
    d AS (
      SELECT pd.product_id,
        min(pd.min_total_price) FILTER (WHERE pd.day >= ${today}::date - 29) AS min_30d,
        min(pd.min_total_price) AS min_all,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY pd.min_total_price) FILTER (WHERE pd.day >= ${today}::date - 89) AS median_90d,
        count(*) FILTER (WHERE pd.min_total_price IS NOT NULL) AS obs_days,
        min(pd.day) AS first_day,
        min(pd.min_total_price) FILTER (WHERE pd.day = ${today}::date - 7) AS total_7d_ago
      FROM product_daily pd
      WHERE pd.product_id IN (SELECT id FROM p)
      GROUP BY pd.product_id
    ),
    m30 AS (
      SELECT DISTINCT ON (pd.product_id) pd.product_id, pd.day
      FROM product_daily pd JOIN d ON d.product_id = pd.product_id AND pd.min_total_price = d.min_30d
      WHERE pd.day >= ${today}::date - 29
      ORDER BY pd.product_id, pd.day DESC
    ),
    mall AS (
      SELECT DISTINCT ON (pd.product_id) pd.product_id, pd.day
      FROM product_daily pd JOIN d ON d.product_id = pd.product_id AND pd.min_total_price = d.min_all
      ORDER BY pd.product_id, pd.day DESC
    )
    SELECT p.id::text AS product_id,
      cur.total_price::text AS cur_total, cur.id::text AS cur_offer, cur.shop_id::text AS cur_shop, cur.price::text AS cur_price,
      coalesce(cnt.n, 0)::text AS offer_count,
      d.min_30d::text, m30.day::text AS min_30d_at, d.min_all::text, mall.day::text AS min_all_at,
      round(d.median_90d::numeric, 2)::text AS median_90d,
      (extract(epoch FROM cnt.last_change) * 1000)::bigint::text AS last_change_ms,
      d.total_7d_ago::text, coalesce(d.obs_days, 0)::text AS obs_days, d.first_day::text
    FROM p
    LEFT JOIN cur ON cur.product_id = p.id
    LEFT JOIN cnt ON cnt.product_id = p.id
    LEFT JOIN d ON d.product_id = p.id
    LEFT JOIN m30 ON m30.product_id = p.id
    LEFT JOIN mall ON mall.product_id = p.id
  `);

  let n = 0;
  for (const r of res.rows) {
    const current = numericToBani(r.cur_total);
    // Today's live minimum also counts toward the 30-day and all-time lows.
    const min30 = [numericToBani(r.min_30d), current].filter((x): x is number => x !== null);
    const min30d = min30.length ? Math.min(...min30) : null;
    const median90 = numericToBani(r.median_90d);
    const obsDays = Number(r.obs_days);
    const verdict: Verdict = computeVerdict({ currentBani: current, min30dBani: min30d, median90dBani: median90, observationsDays: obsDays });
    const before = numericToBani(r.total_7d_ago);
    const drop = before && current !== null ? (before - current) / before : null;
    const minAll = [numericToBani(r.min_all), current].filter((x): x is number => x !== null);
    const toNum = (b: number | null) => (b === null ? null : (b / 100).toFixed(2));
    await db.execute(sql`
      INSERT INTO product_stats (product_id, current_min_total, current_min_offer_id, min_30d, min_30d_at, min_all_time,
        min_all_time_at, median_90d, last_change_at, drop_pct_7d, verdict, observations_days, history_started_at, updated_at)
      VALUES (${Number(r.product_id)}, ${r.cur_total}, ${r.cur_offer ? Number(r.cur_offer) : null}, ${toNum(min30d)},
        ${min30d !== null && current !== null && current <= min30d ? today : r.min_30d_at}, ${toNum(minAll.length ? Math.min(...minAll) : null)},
        ${current !== null && minAll.length && current <= Math.min(...minAll) ? today : r.min_all_at},
        ${r.median_90d}, ${r.last_change_ms ? new Date(Number(r.last_change_ms)) : null}, ${drop}, ${verdict}, ${obsDays}, ${r.first_day}, now())
      ON CONFLICT (product_id) DO UPDATE SET
        current_min_total = EXCLUDED.current_min_total, current_min_offer_id = EXCLUDED.current_min_offer_id,
        min_30d = EXCLUDED.min_30d, min_30d_at = EXCLUDED.min_30d_at, min_all_time = EXCLUDED.min_all_time,
        min_all_time_at = EXCLUDED.min_all_time_at, median_90d = EXCLUDED.median_90d, last_change_at = EXCLUDED.last_change_at,
        drop_pct_7d = EXCLUDED.drop_pct_7d, verdict = EXCLUDED.verdict, observations_days = EXCLUDED.observations_days,
        history_started_at = EXCLUDED.history_started_at, updated_at = now()
    `);
    await db.execute(sql`
      UPDATE products SET offer_count = ${Number(r.offer_count)}, min_price = ${r.cur_price}, min_total_price = ${r.cur_total},
        min_shop_id = ${r.cur_shop ? Number(r.cur_shop) : null}, updated_at = now()
      WHERE id = ${Number(r.product_id)}
    `);
    n++;
  }
  return n;
}

export type HistoryRange = '30d' | '90d' | '1y' | 'all';
export const HISTORY_RANGES: Record<HistoryRange, number | null> = { '30d': 30, '90d': 90, '1y': 365, all: null };

export interface HistoryResponse {
  range: HistoryRange;
  /** [day, lei] pairs; days without observations are absent (charts show gaps). */
  series: { min: Array<[string, number]>; marketplace: Array<[string, number]>; shops: Record<string, Array<[string, number]>> };
  shops: Record<string, { name: string }>;
  stats: {
    min30d: number | null;
    min30dAt: string | null;
    minAllTime: number | null;
    minAllTimeAt: string | null;
    median90d: number | null;
    observationsDays: number;
    historyStartedAt: string | null;
    verdict: Verdict;
    current: number | null;
  } | null;
}

const lei = (v: string | null): number | null => (v === null ? null : Number(v));

/**
 * History API payload (M08 contract, consumed by M13's chart): the daily minimum total across
 * shops, the marketplace series, and one series per shop (daily min in-stock total per shop).
 */
export async function getHistory(db: Db, productId: number, range: HistoryRange = '90d', today = bucharestToday()): Promise<HistoryResponse> {
  const days = HISTORY_RANGES[range];
  const from = days === null ? '2000-01-01' : addDaysIso(today, -(days - 1));
  const daily = await db.execute<{ day: string; min_total: string | null; mp: string | null }>(sql`
    SELECT day::text, min_total_price::text AS min_total, mp_min_total_price::text AS mp
    FROM product_daily WHERE product_id = ${productId} AND day >= ${from}::date AND day <= ${today}::date ORDER BY day
  `);
  const perShop = await db.execute<{ slug: string; name: string; day: string; total: string }>(sql`
    WITH o AS (
      SELECT o.id, s.slug, s.name,
        greatest((o.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date, ${from}::date) AS d0,
        least((o.last_checked_at AT TIME ZONE 'Europe/Bucharest')::date, ${today}::date) AS d1
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id = ${productId} AND o.match_status IN ('auto','manual') AND o.condition = 'new'
        AND NOT o.is_bundle AND o.seller_type = 'shop' AND s.trust_tier <= 2
    ),
    days AS (
      SELECT o.id, o.slug, o.name, d::date AS day FROM o
      CROSS JOIN LATERAL generate_series(o.d0, o.d1, interval '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM offer_gaps g WHERE g.offer_id = o.id
        AND (g.from_ts AT TIME ZONE 'Europe/Bucharest')::date < d::date AND (g.to_ts AT TIME ZONE 'Europe/Bucharest')::date > d::date)
    ),
    st AS (
      SELECT days.slug, days.name, days.day, e.price + coalesce(e.shipping_cost, 0) AS total, e.availability
      FROM days CROSS JOIN LATERAL (
        (SELECT price, shipping_cost, availability FROM price_events WHERE offer_id = days.id
          AND observed_at < (days.day::timestamp AT TIME ZONE 'Europe/Bucharest') ORDER BY observed_at DESC LIMIT 1)
        UNION ALL
        (SELECT price, shipping_cost, availability FROM price_events WHERE offer_id = days.id
          AND observed_at >= (days.day::timestamp AT TIME ZONE 'Europe/Bucharest')
          AND observed_at < ((days.day + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'))
      ) e
    )
    SELECT slug, name, day::text, min(total)::text AS total FROM st WHERE availability = 'in_stock'
    GROUP BY slug, name, day ORDER BY slug, day
  `);
  const stats = await db.execute<{
    min_30d: string | null; min_30d_at: string | null; min_all_time: string | null; min_all_time_at: string | null;
    median_90d: string | null; observations_days: number; history_started_at: string | null; verdict: Verdict; current_min_total: string | null;
  }>(sql`SELECT min_30d::text, min_30d_at::text, min_all_time::text, min_all_time_at::text, median_90d::text, observations_days,
           history_started_at::text, verdict, current_min_total::text FROM product_stats WHERE product_id = ${productId}`);

  const out: HistoryResponse = { range, series: { min: [], marketplace: [], shops: {} }, shops: {}, stats: null };
  for (const r of daily.rows) {
    if (r.min_total !== null) out.series.min.push([r.day, Number(r.min_total)]);
    if (r.mp !== null) out.series.marketplace.push([r.day, Number(r.mp)]);
  }
  for (const r of perShop.rows) {
    (out.series.shops[r.slug] ??= []).push([r.day, Number(r.total)]);
    out.shops[r.slug] = { name: r.name };
  }
  const s = stats.rows[0];
  if (s) {
    out.stats = {
      min30d: lei(s.min_30d),
      min30dAt: s.min_30d_at,
      minAllTime: lei(s.min_all_time),
      minAllTimeAt: s.min_all_time_at,
      median90d: lei(s.median_90d),
      observationsDays: s.observations_days,
      historyStartedAt: s.history_started_at,
      verdict: s.verdict,
      current: lei(s.current_min_total),
    };
  }
  return out;
}

/** One offer's observed daily minimum in-stock price (bani) between two days (gaps stay absent). */
export async function offerHistoryDays(db: Db, offerId: number, from: string, to: string): Promise<OfferDay[]> {
  const res = await db.execute<{ day: string; price: string }>(sql`
    WITH o AS (
      SELECT id, greatest((first_seen_at AT TIME ZONE 'Europe/Bucharest')::date, ${from}::date) AS d0,
             least((last_checked_at AT TIME ZONE 'Europe/Bucharest')::date, ${to}::date) AS d1
      FROM offers WHERE id = ${offerId}
    ),
    days AS (
      SELECT o.id, d::date AS day FROM o CROSS JOIN LATERAL generate_series(o.d0, o.d1, interval '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM offer_gaps g WHERE g.offer_id = o.id
        AND (g.from_ts AT TIME ZONE 'Europe/Bucharest')::date < d::date AND (g.to_ts AT TIME ZONE 'Europe/Bucharest')::date > d::date)
    )
    SELECT days.day::text, min(e.price)::text AS price
    FROM days CROSS JOIN LATERAL (
      (SELECT price, availability FROM price_events WHERE offer_id = days.id
        AND observed_at < (days.day::timestamp AT TIME ZONE 'Europe/Bucharest') ORDER BY observed_at DESC LIMIT 1)
      UNION ALL
      (SELECT price, availability FROM price_events WHERE offer_id = days.id
        AND observed_at >= (days.day::timestamp AT TIME ZONE 'Europe/Bucharest')
        AND observed_at < ((days.day + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'))
    ) e
    WHERE e.availability = 'in_stock'
    GROUP BY days.day ORDER BY days.day
  `);
  return res.rows.map((r) => ({ day: r.day, priceBani: numericToBani(r.price)! }));
}

/**
 * Discount-verification facts for the current offers of a product (M15 badges, M23 report).
 * The reduction start is the first day of the current price level (last change event).
 */
export async function productOfferFacts(db: Db, productId: number, today = bucharestToday()): Promise<Map<number, DiscountFact[]>> {
  const offers = await db.execute<{ id: string; price: string; old_price: string | null; first_ms: string; changed_day: string }>(sql`
    SELECT o.id::text, o.price::text, o.old_price::text,
      (extract(epoch FROM o.first_seen_at) * 1000)::bigint::text AS first_ms,
      (o.price_changed_at AT TIME ZONE 'Europe/Bucharest')::date::text AS changed_day
    FROM offers o WHERE o.product_id = ${productId} AND o.active AND o.match_status IN ('auto','manual') AND o.condition = 'new'
  `);
  const median = await db.execute<{ m: string | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total_price)::numeric(12,2)::text AS m
    FROM offers WHERE product_id = ${productId} AND active AND availability = 'in_stock' AND match_status IN ('auto','manual')
      AND condition = 'new' AND last_checked_at > now() - make_interval(hours => ${CURRENT_OFFER_MAX_AGE_HOURS}::int)
    HAVING count(DISTINCT shop_id) >= 2
  `);
  const crossShopMedian = numericToBani(median.rows[0]?.m ?? null);
  const out = new Map<number, DiscountFact[]>();
  for (const o of offers.rows) {
    const ageDays = Math.floor((Date.now() - Number(o.first_ms)) / 86_400_000);
    const history = await offerHistoryDays(db, Number(o.id), addDaysIso(today, -120), today);
    const facts = discountFacts({
      today,
      currentBani: numericToBani(o.price)!,
      referenceBani: numericToBani(o.old_price),
      reductionStartedOn: o.changed_day,
      history,
      offerAgeDays: ageDays,
      crossShopMedianBani: crossShopMedian,
    });
    if (facts.length > 0) out.set(Number(o.id), facts);
  }
  return out;
}
