import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/**
 * Inputs of `sitemap.build` (M16). Live offers are counted exactly as on the product page and in the
 * search index (active, matched, active shop, not blacklisted, checked within the shop's freshness
 * SLO), so the index policy (`isProductIndexable` in @pretoscop/core) decides the same everywhere.
 */
export interface SitemapProductRow {
  id: number;
  slug: string;
  brandSlug: string | null;
  categorySlug: string | null;
  parentSlug: string | null;
  provisional: boolean;
  liveOffers: number;
  observationsDays: number;
  /** Last price change of a live offer (docs/03 §6.6: lastmod = last price change). */
  lastmod: Date | null;
}

const date = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

/** Active products in id order, one page at a time. */
export async function sitemapProductRows(db: Db, opts: { afterId: number; limit: number }): Promise<SitemapProductRow[]> {
  const res = await db.execute<{
    id: string; slug: string; brand_slug: string | null; cat_slug: string | null; parent_slug: string | null; provisional: boolean;
    n: string; days: number | null; last_change: Date | string | null; updated_at: Date | string;
  }>(sql`
    SELECT p.id::text, p.slug, b.slug AS brand_slug, c.slug AS cat_slug, pc.slug AS parent_slug, p.provisional,
      coalesce(live.n, 0)::text AS n, ps.observations_days AS days, live.last_change, p.updated_at
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories pc ON pc.id = c.parent_id
    LEFT JOIN product_stats ps ON ps.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, max(o.price_changed_at) AS last_change
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id = p.id AND o.active AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
        AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
    ) live ON true
    WHERE p.status = 'active' AND p.id > ${opts.afterId}
    ORDER BY p.id
    LIMIT ${opts.limit}
  `);
  return res.rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    brandSlug: r.brand_slug,
    categorySlug: r.cat_slug,
    parentSlug: r.parent_slug,
    provisional: r.provisional,
    liveOffers: Number(r.n),
    observationsDays: Number(r.days ?? 0),
    lastmod: date(r.last_change) ?? date(r.updated_at),
  }));
}

/** Category paths by slug (for `/c/{path}` URLs). */
export async function categoryPaths(db: Db): Promise<Map<string, string>> {
  const res = await db.execute<{ slug: string; path: string }>(sql`SELECT slug, path FROM categories`);
  return new Map(res.rows.map((r) => [r.slug, r.path]));
}

/** Shops with at least one live offer (the "covered" shops of /magazine) and their last price change. */
export async function coveredShops(db: Db): Promise<Array<{ slug: string; lastmod: Date | null }>> {
  const res = await db.execute<{ slug: string; last_change: Date | string | null }>(sql`
    SELECT s.slug, max(o.price_changed_at) AS last_change
    FROM shops s JOIN offers o ON o.shop_id = s.id
    WHERE s.status = 'active' AND o.active AND o.match_status IN ('auto','manual') AND o.product_id IS NOT NULL AND NOT o.blacklisted
      AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
    GROUP BY s.slug ORDER BY s.slug`);
  return res.rows.map((r) => ({ slug: r.slug, lastmod: date(r.last_change) }));
}
