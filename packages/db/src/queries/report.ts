import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { numericToBani } from '../money';
import { addDaysIso } from './rollup';

/**
 * Input for an event report (M23): every new, non-bundle offer of a trusted shop (tier ≤ 2) seen
 * during [from, to], with its observed in-stock price and displayed reference price per day from
 * 60 days before `from` (gap days stay absent: no interpolation). Shapes match
 * `@pretoscop/report`'s ReportInput without importing it (packages/db stays independent of it).
 */
export interface ReportOfferDays {
  offerId: number;
  shop: string;
  sellerType: 'shop' | 'marketplace';
  productId: number | null;
  productTitle: string | null;
  category: string | null;
  days: Array<{ day: string; priceBani: number; oldPriceBani: number | null }>;
}

export async function reportOffers(db: Db, opts: { from: string; to: string; categories?: string[] | null }): Promise<ReportOfferDays[]> {
  const histFrom = addDaysIso(opts.from, -60);
  const cats = opts.categories?.length ? opts.categories : null;
  const res = await db.execute<{
    id: string; shop: string; seller_type: 'shop' | 'marketplace'; product_id: string | null; product_title: string | null; category: string | null;
    day: string; price: string; old_price: string | null;
  }>(sql`
    WITH o AS (
      SELECT o.id, s.slug AS shop, o.seller_type, o.product_id, p.title AS product_title, coalesce(c.slug, o.category_slug) AS category,
        greatest((o.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date, ${histFrom}::date) AS d0,
        least((o.last_checked_at AT TIME ZONE 'Europe/Bucharest')::date, ${opts.to}::date) AS d1
      FROM offers o JOIN shops s ON s.id = o.shop_id
      LEFT JOIN products p ON p.id = o.product_id AND p.status = 'active'
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE o.condition = 'new' AND NOT o.is_bundle AND NOT o.is_accessory AND NOT o.blacklisted AND s.trust_tier <= 2
        AND o.external_id NOT LIKE 'e2e-fixture-%'
        AND o.last_checked_at >= (${opts.from}::date::timestamp AT TIME ZONE 'Europe/Bucharest')
        AND o.first_seen_at < ((${opts.to}::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest')
        ${cats ? sql`AND coalesce(c.slug, o.category_slug) = ANY(${sql.param(cats)}::text[])` : sql``}
    ),
    days AS (
      SELECT o.*, d::date AS day FROM o CROSS JOIN LATERAL generate_series(o.d0, o.d1, interval '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM offer_gaps g WHERE g.offer_id = o.id
        AND (g.from_ts AT TIME ZONE 'Europe/Bucharest')::date < d::date AND (g.to_ts AT TIME ZONE 'Europe/Bucharest')::date > d::date)
    )
    SELECT days.id::text, days.shop, days.seller_type, days.product_id::text, days.product_title, days.category, days.day::text,
      min(e.price)::text AS price, (array_agg(e.old_price::text ORDER BY e.price))[1] AS old_price
    FROM days CROSS JOIN LATERAL (
      (SELECT price, old_price, availability FROM price_events WHERE offer_id = days.id
        AND observed_at < (days.day::timestamp AT TIME ZONE 'Europe/Bucharest') ORDER BY observed_at DESC LIMIT 1)
      UNION ALL
      (SELECT price, old_price, availability FROM price_events WHERE offer_id = days.id
        AND observed_at >= (days.day::timestamp AT TIME ZONE 'Europe/Bucharest')
        AND observed_at < ((days.day + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'))
    ) e
    WHERE e.availability = 'in_stock'
    GROUP BY days.id, days.shop, days.seller_type, days.product_id, days.product_title, days.category, days.day
    ORDER BY days.id, days.day
  `);
  const out = new Map<number, ReportOfferDays>();
  for (const r of res.rows) {
    const id = Number(r.id);
    let o = out.get(id);
    if (!o) {
      o = { offerId: id, shop: r.shop, sellerType: r.seller_type, productId: r.product_id ? Number(r.product_id) : null, productTitle: r.product_title, category: r.category, days: [] };
      out.set(id, o);
    }
    o.days.push({ day: r.day, priceBani: numericToBani(r.price)!, oldPriceBani: numericToBani(r.old_price) });
  }
  return [...out.values()];
}

export async function reportLabels(db: Db): Promise<{ shopNames: Record<string, string>; categoryNames: Record<string, string> }> {
  const shops = await db.execute<{ slug: string; name: string }>(sql`SELECT slug, name FROM shops`);
  const cats = await db.execute<{ slug: string; name: string }>(sql`SELECT slug, name_ro AS name FROM categories`);
  return {
    shopNames: Object.fromEntries(shops.rows.map((r) => [r.slug, r.name])),
    categoryNames: Object.fromEntries(cats.rows.map((r) => [r.slug, r.name])),
  };
}
