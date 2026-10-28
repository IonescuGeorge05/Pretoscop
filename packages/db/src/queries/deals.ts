import {
  atThirtyDayLow,
  DROP_LOOKBACK_DAYS,
  newAllTimeLow,
  verifiedDrop,
  VERDICT_MIN_DAYS,
  type AllTimeLow,
  type DailyMin,
  type PriceDrop,
} from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { numericToBani } from '../money';
import { addDaysIso, bucharestToday } from './rollup';

/**
 * Verified drops, new all-time lows and 30-day lows (M15) from our own daily series: the shop-sold
 * daily minimum total of product_daily (the default chart series) against the current shop-sold
 * minimum in product_stats. The rules live in @pretoscop/core (`verifiedDrop`, `newAllTimeLow`,
 * `atThirtyDayLow`); this module only loads the numbers.
 */

/** Daily minimum totals per product between two days (inclusive), ascending; unobserved days absent. */
export async function dailySeries(db: Db, productIds: number[], from: string, to: string): Promise<Map<number, DailyMin[]>> {
  const out = new Map<number, DailyMin[]>();
  if (productIds.length === 0) return out;
  const res = await db.execute<{ product_id: string; day: string; v: string }>(sql`
    SELECT product_id::text, day::text, min_total_price::text AS v FROM product_daily
    WHERE product_id = ANY(${sql.param(productIds)}::bigint[]) AND day BETWEEN ${from}::date AND ${to}::date AND min_total_price IS NOT NULL
    ORDER BY product_id, day`);
  for (const r of res.rows) {
    const id = Number(r.product_id);
    let list = out.get(id);
    if (!list) out.set(id, (list = []));
    list.push({ day: r.day, bani: numericToBani(r.v)! });
  }
  return out;
}

/** Lowest daily minimum and the number of observed days before `before`, per product. */
export async function olderLows(db: Db, productIds: number[], before: string): Promise<Map<number, { lowBani: number | null; days: number }>> {
  const out = new Map<number, { lowBani: number | null; days: number }>();
  if (productIds.length === 0) return out;
  const res = await db.execute<{ product_id: string; low: string | null; days: string }>(sql`
    SELECT product_id::text, min(min_total_price)::text AS low, count(*)::text AS days FROM product_daily
    WHERE product_id = ANY(${sql.param(productIds)}::bigint[]) AND day < ${before}::date AND min_total_price IS NOT NULL
    GROUP BY product_id`);
  for (const r of res.rows) out.set(Number(r.product_id), { lowBani: numericToBani(r.low), days: Number(r.days) });
  return out;
}

export interface PriceFacts {
  /** Today's best shop-sold total (product_stats.current_min_total). */
  currentBani: number | null;
  drop: PriceDrop | null;
  allTimeLow: AllTimeLow | null;
  thirtyDayLow: { lowBani: number; highBani: number; days: number } | null;
}

const NONE: PriceFacts = { currentBani: null, drop: null, allTimeLow: null, thirtyDayLow: null };

/**
 * Price facts for products, given their current shop-sold minimum (null = no current offer).
 * Loads DROP_LOOKBACK_DAYS of series plus the older low in two queries for the whole batch.
 */
export async function priceFactsFor(db: Db, current: Map<number, number | null>, today = bucharestToday()): Promise<Map<number, PriceFacts>> {
  const ids = [...current.entries()].filter(([, v]) => v !== null).map(([id]) => id);
  const out = new Map<number, PriceFacts>([...current.keys()].map((id) => [id, NONE]));
  if (ids.length === 0) return out;
  const from = addDaysIso(today, -DROP_LOOKBACK_DAYS);
  const [series, older] = await Promise.all([dailySeries(db, ids, from, today), olderLows(db, ids, from)]);
  for (const id of ids) {
    const currentBani = current.get(id)!;
    const s = series.get(id) ?? [];
    const input = { today, currentBani: currentBani!, series: s };
    out.set(id, {
      currentBani,
      drop: verifiedDrop(input),
      allTimeLow: newAllTimeLow({ ...input, older: older.get(id) ?? null }),
      thirtyDayLow: atThirtyDayLow(input),
    });
  }
  return out;
}

/** The product page's facts (current from product_stats). */
export async function productPriceFacts(db: Db, productId: number, today = bucharestToday()): Promise<PriceFacts> {
  const r = await db.execute<{ v: string | null }>(sql`SELECT current_min_total::text AS v FROM product_stats WHERE product_id = ${productId}`);
  const current = numericToBani(r.rows[0]?.v ?? null);
  return (await priceFactsFor(db, new Map([[productId, current]]), today)).get(productId) ?? NONE;
}

export interface DealItem {
  id: number;
  slug: string;
  title: string;
  brand: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  rootSlug: string | null;
  image: string | null;
  currentBani: number;
  shopName: string | null;
  shopCount: number;
  observationsDays: number;
  drop: PriceDrop | null;
  allTimeLow: AllTimeLow | null;
  thirtyDayLow: PriceFacts['thirtyDayLow'];
}

export interface DealsResult {
  today: string;
  /** Verified drops that started within the window, biggest first. */
  drops: DealItem[];
  /** Not in `drops` but still at a low: the 30-day low with a real range, or a verified drop older than the window. */
  lows30: DealItem[];
  /** Products with at least 14 days of history (the population a deal can come from). */
  eligibleProducts: number;
  /** First day of our history (any product), for the empty state. */
  historyStartedAt: string | null;
}

/**
 * `getDeals(window, category)` (M15 contract): verified drops that started in the last `windowDays`
 * days (1 = today), new all-time lows flagged on them, and the 30-day lows, optionally under one
 * category (a root includes its leaves). Provisional products are left out: an unverified match
 * could turn a different product's price into a "drop".
 */
export async function getDeals(
  db: Db,
  opts: { windowDays?: number; category?: string | null; limit?: number; lowsLimit?: number } = {},
  today = bucharestToday(),
): Promise<DealsResult> {
  const windowDays = Math.max(1, Math.min(opts.windowDays ?? 7, 30));
  // `limit` caps the drops (default 120), `lowsLimit` the 30-day lows (default min(limit, 48)); pass
  // Infinity to get every one (the /reduceri page filters per category tab and slices itself).
  const limit = opts.limit ?? 120;
  const lowsLimit = opts.lowsLimit ?? Math.min(limit, 48);
  const cat = opts.category ?? null;
  const catFilter = cat ? sql`AND (c.slug = ${cat} OR c.parent_id = (SELECT id FROM categories WHERE slug = ${cat}))` : sql``;
  const lookbackFrom = addDaysIso(today, -DROP_LOOKBACK_DAYS);
  const cand = await db.execute<{ id: string; cur: string }>(sql`
    SELECT p.id::text, ps.current_min_total::text AS cur
    FROM products p
    JOIN product_stats ps ON ps.product_id = p.id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' AND NOT p.provisional AND ps.current_min_total IS NOT NULL
      AND ps.observations_days >= ${VERDICT_MIN_DAYS} ${catFilter}
      AND EXISTS (
        SELECT 1 FROM product_daily pd WHERE pd.product_id = p.id AND pd.day >= ${lookbackFrom}::date
          AND pd.min_total_price * 100 >= ps.current_min_total * 103)`);
  const current = new Map(cand.rows.map((r) => [Number(r.id), numericToBani(r.cur)]));
  const facts = new Map<number, PriceFacts>();
  const ids = [...current.keys()];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = new Map(ids.slice(i, i + 1000).map((id) => [id, current.get(id)!]));
    for (const [id, f] of await priceFactsFor(db, chunk, today)) facts.set(id, f);
  }
  const since = addDaysIso(today, -(windowDays - 1));
  const dropIds = ids.filter((id) => facts.get(id)?.drop && facts.get(id)!.drop!.since >= since);
  // Everything else still at a low: the 30-day low with a real range, or an older verified drop.
  const listed = new Set(dropIds);
  const lowIds = ids.filter((id) => !listed.has(id) && (facts.get(id)?.thirtyDayLow || facts.get(id)?.drop));

  const meta = await db.execute<{ eligible: string; started: string | null }>(sql`
    SELECT (SELECT count(*) FROM product_stats WHERE observations_days >= ${VERDICT_MIN_DAYS})::text AS eligible,
      (SELECT min(history_started_at)::text FROM product_stats) AS started`);
  const wanted = [...dropIds, ...lowIds];
  const info = new Map<number, Omit<DealItem, 'drop' | 'allTimeLow' | 'thirtyDayLow' | 'currentBani'>>();
  if (wanted.length) {
    const res = await db.execute<{
      id: string; slug: string; title: string; brand: string | null; cat_slug: string | null; cat_name: string | null; root_slug: string | null;
      image: string | null; shop: string | null; shops: string; days: number;
    }>(sql`
      SELECT p.id::text, p.slug, p.title, b.name AS brand, c.slug AS cat_slug, c.name_ro AS cat_name, coalesce(pc.slug, c.slug) AS root_slug,
        img.storage_key AS image, s.name AS shop, ps.observations_days AS days,
        (SELECT count(DISTINCT o.shop_id) FROM offers o JOIN shops sh ON sh.id = o.shop_id
          WHERE o.product_id = p.id AND o.active AND o.match_status IN ('auto','manual') AND sh.status = 'active' AND NOT o.blacklisted
            AND o.last_checked_at > now() - interval '48 hours')::text AS shops
      FROM products p
      JOIN product_stats ps ON ps.product_id = p.id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      LEFT JOIN offers o ON o.id = ps.current_min_offer_id
      LEFT JOIN shops s ON s.id = o.shop_id
      LEFT JOIN LATERAL (SELECT i.storage_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.is_primary DESC, i.id LIMIT 1) img ON true
      WHERE p.id = ANY(${sql.param(wanted)}::bigint[])`);
    for (const r of res.rows) {
      info.set(Number(r.id), {
        id: Number(r.id), slug: r.slug, title: r.title, brand: r.brand, categorySlug: r.cat_slug, categoryName: r.cat_name, rootSlug: r.root_slug,
        image: r.image, shopName: r.shop, shopCount: Number(r.shops), observationsDays: r.days,
      });
    }
  }
  const item = (id: number): DealItem | null => {
    const i = info.get(id);
    const f = facts.get(id);
    return i && f && f.currentBani !== null ? { ...i, currentBani: f.currentBani, drop: f.drop, allTimeLow: f.allTimeLow, thirtyDayLow: f.thirtyDayLow } : null;
  };
  const drops = dropIds
    .map(item)
    .filter((d): d is DealItem => d !== null)
    .sort((a, b) => b.drop!.pct - a.drop!.pct || b.drop!.savedBani - a.drop!.savedBani || a.id - b.id)
    .slice(0, limit);
  const range = (d: DealItem) => d.drop?.pct ?? (d.thirtyDayLow!.highBani - d.currentBani) / d.thirtyDayLow!.highBani;
  const lows30 = lowIds
    .map(item)
    .filter((d): d is DealItem => d !== null)
    .sort((a, b) => range(b) - range(a) || a.id - b.id)
    .slice(0, lowsLimit);
  return { today, drops, lows30, eligibleProducts: Number(meta.rows[0]?.eligible ?? 0), historyStartedAt: meta.rows[0]?.started ?? null };
}
