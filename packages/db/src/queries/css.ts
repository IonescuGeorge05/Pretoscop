import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/**
 * CSS readiness (M29, docs/playbooks/css-readiness.md). An offer is "shown" the way product pages,
 * the search index and the sitemaps count a live offer: active, matched to an active product, from
 * an active shop, checked within the shop's freshness SLO, not blacklisted. E2E fixtures never count.
 */
const LIVE = sql`o.active AND o.match_status IN ('auto','manual') AND NOT o.blacklisted AND s.status = 'active'
  AND p.status = 'active' AND o.external_id NOT LIKE 'e2e-fixture-%'
  AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))`;

export interface MerchantDomainRow {
  slug: string;
  name: string;
  domain: string;
  accessMode: string;
  liveOffers: number;
  products: number;
}

/** Shops with at least one shown offer, by domain (a marketplace's sellers share its domain). */
export async function merchantDomainsShown(db: Db): Promise<MerchantDomainRow[]> {
  const r = await db.execute<{ slug: string; name: string; domain: string; access_mode: string; live: string; products: string }>(sql`
    SELECT s.slug, s.name, s.domain, s.access_mode, count(*)::text AS live, count(DISTINCT o.product_id)::text AS products
    FROM offers o JOIN shops s ON s.id = o.shop_id JOIN products p ON p.id = o.product_id
    WHERE ${LIVE}
    GROUP BY s.slug, s.name, s.domain, s.access_mode
    ORDER BY count(*) DESC, s.slug`);
  return r.rows.map((x) => ({ slug: x.slug, name: x.name, domain: x.domain, accessMode: x.access_mode, liveOffers: Number(x.live), products: Number(x.products) }));
}

export interface CategoryCoverageRow {
  /** Root category slug (null: products without a category). */
  root: string | null;
  products: number;
  /** Products with at least 2 shown offers (the M29 acceptance measure, as the index rule counts). */
  withTwoOffers: number;
  /** Products with shown offers from at least 2 shops (a real comparison). */
  withTwoShops: number;
  /** Products with shown offers from at least 3 shops (CSS: a filter must not leave fewer than 3 merchants). */
  withThreeShops: number;
}

/** Shown products per root category, and how many are compared across 2 and 3 shops. */
export async function categoryCoverage(db: Db): Promise<CategoryCoverageRow[]> {
  const r = await db.execute<{ root: string | null; products: string; two_offers: string; two: string; three: string }>(sql`
    WITH per AS (
      SELECT p.id, split_part(c.path, '/', 1) AS root, count(*) AS offers, count(DISTINCT o.shop_id) AS shops
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN offers o ON o.product_id = p.id JOIN shops s ON s.id = o.shop_id
      WHERE ${LIVE}
      GROUP BY p.id, c.path
    )
    SELECT root, count(*)::text AS products, count(*) FILTER (WHERE offers >= 2)::text AS two_offers, count(*) FILTER (WHERE shops >= 2)::text AS two, count(*) FILTER (WHERE shops >= 3)::text AS three
    FROM per GROUP BY root ORDER BY count(*) DESC`);
  return r.rows.map((x) => ({ root: x.root || null, products: Number(x.products), withTwoOffers: Number(x.two_offers), withTwoShops: Number(x.two), withThreeShops: Number(x.three) }));
}
