import 'server-only';
import type { DiscountFact } from '@pretoscop/core';
import { isFlagEnabled, priceFactsFor, productOfferFacts, programsByShop, sql, type PriceFacts } from '@pretoscop/db';
import { unstable_cache } from 'next/cache';
import { affiliateLinkFor } from './affiliate';
import { db } from './db';
import { toBani } from './format';

export interface ProductOffer {
  id: number;
  shopSlug: string;
  shopName: string;
  shopKind: string;
  sellerName: string | null;
  sellerType: 'shop' | 'marketplace';
  url: string;
  hasAffiliate: boolean;
  price: string;
  oldPrice: string | null;
  shopLowest30d: string | null;
  shippingCost: string | null;
  shippingEstimated: boolean;
  shippingNote: string | null;
  shippingRulesNote: string | null;
  total: string;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  condition: 'new' | 'refurbished' | 'used';
  lastCheckedAt: string;
  freshnessSloHours: number;
  stale: boolean;
  facts: DiscountFact[];
}

export interface ProductPageData {
  id: number;
  slug: string;
  title: string;
  status: string;
  mergedIntoSlug: string | null;
  provisional: boolean;
  brand: { name: string; slug: string } | null;
  category: { slug: string; name: string; parent: { slug: string; name: string } | null } | null;
  mpn: string | null;
  gtins: string[];
  attributes: Record<string, unknown>;
  imageKey: string | null;
  /** Licensed source of the shown image (`feed`, `icecat`, `manual`, `merchant`). */
  imageSource: string | null;
  /** Icecat specs are stored for the product (the page must then credit Icecat, M11). */
  icecatSpecs: boolean;
  stats: {
    currentMinTotal: string | null;
    min30d: string | null;
    min30dAt: string | null;
    minAllTime: string | null;
    minAllTimeAt: string | null;
    median90d: string | null;
    verdict: 'good_price' | 'usual' | 'above_usual' | 'insufficient_data';
    observationsDays: number;
    historyStartedAt: string | null;
    dropPct7d: number | null;
  } | null;
  offers: ProductOffer[];
  variants: Array<{ id: number; slug: string; title: string; attributes: Record<string, unknown>; minTotal: string | null; current: boolean }>;
  notCovered: Array<{ slug: string; name: string; searchUrl: string }>;
  /** Verified drop, new all-time low, 30-day low (M15) on today's shop-sold minimum (see `load`); null for provisional products. */
  priceFacts: PriceFacts | null;
  updatedAt: string;
}

/** Id from a product slug `…-{id}`. */
export function idFromSlug(slug: string): number | null {
  const m = /-(\d+)$/.exec(slug);
  return m ? Number(m[1]) : null;
}

async function load(id: number): Promise<ProductPageData | null> {
  const d = db();
  const p = await d.execute<{
    id: string; slug: string; title: string; status: string; merged_slug: string | null; provisional: boolean; brand: string | null; brand_slug: string | null;
    cat_slug: string | null; cat_name: string | null; parent_slug: string | null; parent_name: string | null; mpn: string | null;
    attributes: Record<string, unknown>; family_id: string | null; image_key: string | null; image_source: string | null; icecat_specs: boolean; gtins: string[] | null;
  }>(sql`
    SELECT p.id::text, p.slug, p.title, p.status, m.slug AS merged_slug, p.provisional, b.name AS brand, b.slug AS brand_slug,
      c.slug AS cat_slug, c.name_ro AS cat_name, pc.slug AS parent_slug, pc.name_ro AS parent_name, p.mpn, p.attributes,
      p.family_id::text, img.storage_key AS image_key, img.source AS image_source,
      EXISTS (SELECT 1 FROM product_specs s WHERE s.product_id = p.id AND s.source = 'icecat') AS icecat_specs,
      (SELECT array_agg(gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtins
    FROM products p
    LEFT JOIN products m ON m.id = p.merged_into_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories pc ON pc.id = c.parent_id
    LEFT JOIN LATERAL (SELECT storage_key, source FROM product_images i WHERE i.product_id = p.id ORDER BY is_primary DESC, id LIMIT 1) img ON true
    WHERE p.id = ${id}
  `);
  const row = p.rows[0];
  if (!row) return null;

  const [stats, offers, variants, notCovered, facts] = await Promise.all([
    d.execute<Record<string, unknown>>(sql`
      SELECT current_min_total::text AS "currentMinTotal", min_30d::text AS "min30d", min_30d_at::text AS "min30dAt",
        min_all_time::text AS "minAllTime", min_all_time_at::text AS "minAllTimeAt", median_90d::text AS "median90d", verdict,
        observations_days AS "observationsDays", history_started_at::text AS "historyStartedAt", drop_pct_7d AS "dropPct7d"
      FROM product_stats WHERE product_id = ${id}
    `),
    d.execute<{
      id: string; shop_id: string; shop_slug: string; shop_name: string; shop_domain: string; shop_kind: string; seller_name: string | null; seller_type: 'shop' | 'marketplace'; url: string;
      affiliate_url: string | null; price: string; old_price: string | null; lowest: string | null; shipping_cost: string | null; shipping_estimated: boolean;
      shipping_note: string | null; rules_note: string | null; total: string; availability: ProductOffer['availability']; condition: ProductOffer['condition'];
      last_checked_at: string; slo: number;
    }>(sql`
      SELECT o.id::text, s.id::text AS shop_id, s.slug AS shop_slug, s.name AS shop_name, s.domain AS shop_domain, s.kind AS shop_kind, o.seller_name, o.seller_type, o.url,
        o.affiliate_url, o.price::text, o.old_price::text, o.shop_lowest_30d::text AS lowest,
        o.shipping_cost::text, o.shipping_estimated, o.shipping_note, s.shipping_rules->>'notes' AS rules_note, o.total_price::text AS total,
        o.availability, o.condition, o.last_checked_at::text,
        coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26) AS slo
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id = ${id} AND o.active AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
        AND o.last_checked_at > now() - interval '30 days'
    `),
    row.family_id
      ? d.execute<{ id: string; slug: string; title: string; attributes: Record<string, unknown>; min_total: string | null }>(sql`
          SELECT id::text, slug, title, attributes, min_total_price::text AS min_total FROM products
          WHERE family_id = ${Number(row.family_id)} AND status = 'active' ORDER BY min_total_price NULLS LAST LIMIT 24`)
      : Promise.resolve({ rows: [] as { id: string; slug: string; title: string; attributes: Record<string, unknown>; min_total: string | null }[] }),
    d.execute<{ slug: string; name: string; tpl: string }>(sql`
      SELECT slug, name, search_url_template AS tpl FROM shops WHERE status = 'blocked' AND search_url_template IS NOT NULL ORDER BY name`),
    productOfferFacts(d, id).catch(() => new Map<number, DiscountFact[]>()),
  ]);

  // Same decision as the click-out route (M24), so the "Link afiliat" label never lies.
  const affiliateOn = await isFlagEnabled(d, 'affiliate.links.enabled');
  const programs = affiliateOn ? await programsByShop(d, [...new Set(offers.rows.map((o) => Number(o.shop_id)))]) : new Map();
  const now = Date.now();
  const q = encodeURIComponent([row.brand, row.title.split(',')[0]?.replace(/^(telefon mobil|laptop|televizor|tableta)\s+/i, '')].filter(Boolean).join(' ').slice(0, 80));
  const rank = (o: ProductOffer) => (o.availability === 'in_stock' ? (o.stale ? 1 : 0) : 2);
  const mapped: ProductOffer[] = offers.rows.map((o) => {
    const ageH = (now - new Date(o.last_checked_at).getTime()) / 3_600_000;
    return {
      id: Number(o.id),
      shopSlug: o.shop_slug,
      shopName: o.shop_name,
      shopKind: o.shop_kind,
      sellerName: o.seller_name,
      sellerType: o.seller_type,
      url: o.url,
      hasAffiliate: affiliateLinkFor(affiliateOn, programs.get(Number(o.shop_id)), { url: o.url, shopSlug: o.shop_slug, shopDomain: o.shop_domain, feedAffiliateUrl: o.affiliate_url }, 'c0') !== null,
      price: o.price,
      oldPrice: o.old_price,
      shopLowest30d: o.lowest,
      shippingCost: o.shipping_cost,
      shippingEstimated: o.shipping_estimated,
      shippingNote: o.shipping_note,
      shippingRulesNote: o.rules_note,
      total: o.total,
      availability: o.availability,
      condition: o.condition,
      lastCheckedAt: o.last_checked_at,
      freshnessSloHours: o.slo,
      stale: ageH > o.slo,
      facts: facts.get(Number(o.id)) ?? [],
    };
  });
  // Ranking (published on /cum-functioneaza): fresh in-stock first, then stale, then unavailable;
  // within a group by total price, then by the most recent check.
  mapped.sort((a, b) => rank(a) - rank(b) || Number(a.total) - Number(b.total) || b.lastCheckedAt.localeCompare(a.lastCheckedAt));
  // Like with like: the drop compares today's shop-sold minimum as the rollup computes it
  // (product_stats.current_min_total: new, in-stock, shop-sold, no bundles or accessories, trusted
  // shops and sources) with the daily series built the same way — the numbers /reduceri and the
  // listings use. Shown only while a fresh offer on this page sells at exactly that total, and never
  // for a provisional product (an unverified match must not turn another product's price into a drop).
  const statsRow = stats.rows[0] as ProductPageData['stats'] | undefined;
  const currentBani = toBani(statsRow?.currentMinTotal ?? null);
  const buyable = currentBani !== null && mapped.some((o) => o.sellerType === 'shop' && o.condition === 'new' && o.availability === 'in_stock' && !o.stale && toBani(o.total) === currentBani);
  const priceFacts =
    row.provisional || !buyable ? null : ((await priceFactsFor(d, new Map([[id, currentBani]])).catch(() => null))?.get(id) ?? null);

  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    status: row.status,
    mergedIntoSlug: row.merged_slug,
    provisional: row.provisional,
    brand: row.brand && row.brand_slug ? { name: row.brand, slug: row.brand_slug } : null,
    category: row.cat_slug && row.cat_name ? { slug: row.cat_slug, name: row.cat_name, parent: row.parent_slug && row.parent_name ? { slug: row.parent_slug, name: row.parent_name } : null } : null,
    mpn: row.mpn,
    gtins: row.gtins ?? [],
    attributes: row.attributes ?? {},
    imageKey: row.image_key,
    imageSource: row.image_source,
    icecatSpecs: row.icecat_specs === true,
    stats: (stats.rows[0] as ProductPageData['stats']) ?? null,
    offers: mapped,
    variants: variants.rows.map((v) => ({ id: Number(v.id), slug: v.slug, title: v.title, attributes: v.attributes ?? {}, minTotal: v.min_total, current: Number(v.id) === id })),
    notCovered: notCovered.rows.map((s) => ({ slug: s.slug, name: s.name, searchUrl: s.tpl.replace('{q}', q) })),
    priceFacts,
    updatedAt: new Date().toISOString(),
  };
}

/** Lowest total among new, in-stock, recently checked offers (`offers` is already ranked by total). */
export function bestOffer(offers: ProductOffer[], opts: { shopSoldOnly?: boolean } = {}): ProductOffer | null {
  return offers.find((o) => o.availability === 'in_stock' && !o.stale && o.condition === 'new' && (!opts.shopSoldOnly || o.sellerType === 'shop')) ?? null;
}

/** Product page data, cached per product and invalidated by tags `product:{id}` / `products` (worker → /api/revalidate). */
export function getProductPageData(id: number): Promise<ProductPageData | null> {
  return unstable_cache(() => load(id), ['product-page', String(id)], { tags: [`product:${id}`, 'products'], revalidate: 3600 })();
}
