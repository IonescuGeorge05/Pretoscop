import { findBrand, normalizeGtin, normalizeMpn, slugify } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/**
 * Browser-extension lookup (M26): which of our products is the product page a user has open on a
 * shop? The extension sends only identifiers read from that page (its URL, a GTIN, brand + part
 * number); this resolves them, most specific first, and refuses to guess:
 *
 * 1. `url` — an offer we recorded at that shop for that page (matched by a rule or a human). eMAG
 *    pages are recognised by their product code (`/pd/<PNK>/`) whatever the slug; other shops by
 *    host + path (query, fragment, `www.` and a trailing slash ignored, case-insensitive).
 * 2. `gtin` — a valid GTIN (check digit, no placeholder or in-store code) in `product_gtins`, else on
 *    matched offers.
 * 3. `brand` + `mpn` — the part number (normalized like the matcher's) of a product of that brand
 *    (dictionary name, alias or slug), else of a matched offer whose product has that brand.
 *
 * Every step follows merges and keeps active products only. A step that names two different
 * products is ambiguous and resolves nothing (a wrong overlay is worse than none). Read-only.
 */

export type ExtMatchedBy = 'url' | 'gtin' | 'brand_mpn';

export interface ExtLookupIds {
  url?: string | null;
  gtin?: string | null;
  brand?: string | null;
  mpn?: string | null;
}

export interface ExtResolution {
  productId: number;
  matchedBy: ExtMatchedBy;
}

const MATCHED = sql`('auto','manual')`;
/** Merge chains longer than this are treated as broken (no product). */
const MAX_MERGE_HOPS = 5;

/** `https://www.emag.ro/…/pd/DF1MLR2BM/?ref=x` → `{ domain: 'emag.ro', path: '/…/pd/DF1MLR2BM' }`; null when not http(s). */
export function shopUrlParts(raw: string): { domain: string; path: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const domain = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return { domain, path };
}

/** eMAG's product code from a product URL path (`/…/pd/DF1MLR2BM/`). */
export function emagProductCode(path: string): string | null {
  return /\/pd\/([A-Z0-9]{6,12})(?:\/|$)/.exec(path)?.[1] ?? null;
}

/**
 * The distinct active products a set of product ids ends at after following merges (one query;
 * hidden products, broken or over-long chains end nowhere).
 */
export async function activeProductsOf(db: Db, ids: number[]): Promise<number[]> {
  const start = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (start.length === 0) return [];
  const r = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE chain AS (
      SELECT p.id, p.status, p.merged_into_id, 0 AS hop FROM products p WHERE p.id = ANY(${sql.param(start)}::bigint[])
      UNION ALL
      SELECT p.id, p.status, p.merged_into_id, c.hop + 1 FROM chain c JOIN products p ON p.id = c.merged_into_id
      WHERE c.status = 'merged' AND c.hop < ${MAX_MERGE_HOPS}
    )
    SELECT DISTINCT id::text FROM chain WHERE status = 'active' ORDER BY 1
  `);
  return r.rows.map((x) => Number(x.id));
}

/** Exactly one active product, or null (none or ambiguous). */
async function single(db: Db, ids: number[]): Promise<number | null> {
  const active = await activeProductsOf(db, ids);
  return active.length === 1 ? active[0]! : null;
}

async function byUrl(db: Db, raw: string): Promise<number | null> {
  const parts = shopUrlParts(raw);
  if (!parts) return null;
  const pnk = parts.domain === 'emag.ro' ? emagProductCode(parts.path) : null;
  // Host and path of the stored URL, compared without scheme, `www.`, query, fragment and trailing slash.
  const stored = sql`rtrim(regexp_replace(lower(split_part(split_part(o.url, '#', 1), '?', 1)), '^https?://(www\\.)?', ''), '/')`;
  const match = pnk
    ? sql`(o.url LIKE ${`%/pd/${pnk}/%`} OR o.url LIKE ${`%/pd/${pnk}`} OR o.url LIKE ${`%/pd/${pnk}?%`} OR o.url LIKE ${`%/pd/${pnk}#%`})`
    : sql`${stored} = ${`${parts.domain}${parts.path === '/' ? '' : parts.path}`.toLowerCase()}`;
  const r = await db.execute<{ product_id: string }>(sql`
    SELECT DISTINCT o.product_id::text AS product_id FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE s.domain = ${parts.domain} AND o.product_id IS NOT NULL AND o.match_status IN ${MATCHED} AND NOT o.blacklisted AND ${match}
  `);
  return single(db, r.rows.map((x) => Number(x.product_id)));
}

async function byGtin(db: Db, raw: string): Promise<number | null> {
  const gtin14 = normalizeGtin(raw);
  if (!gtin14) return null;
  const known = await db.execute<{ product_id: string }>(sql`SELECT product_id::text AS product_id FROM product_gtins WHERE gtin14 = ${gtin14}`);
  if (known.rows.length > 0) return single(db, known.rows.map((x) => Number(x.product_id)));
  const offered = await db.execute<{ product_id: string }>(sql`
    SELECT DISTINCT product_id::text AS product_id FROM offers
    WHERE gtin14 = ${gtin14} AND product_id IS NOT NULL AND match_status IN ${MATCHED} AND NOT blacklisted
  `);
  return single(db, offered.rows.map((x) => Number(x.product_id)));
}

/** Brand ids for a brand as a shop writes it: dictionary brand (name, alias, line), slug, name or alias in our table. */
async function brandIds(db: Db, raw: string): Promise<number[]> {
  const known = findBrand(raw);
  const slugs = [...new Set([known?.slug, slugify(raw)].filter((s): s is string => !!s))];
  const lower = raw.trim().toLowerCase();
  if (slugs.length === 0 && !lower) return [];
  const r = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM brands
    WHERE slug = ANY(${sql.param(slugs)}::text[]) OR lower(name) = ${lower}
      OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = ${lower})
  `);
  return r.rows.map((x) => Number(x.id));
}

async function byBrandMpn(db: Db, brand: string, mpn: string): Promise<number | null> {
  const mpnNorm = normalizeMpn(mpn);
  if (!mpnNorm) return null;
  const brands = await brandIds(db, brand);
  if (brands.length === 0) return null;
  const ids = sql.param(brands);
  const products = await db.execute<{ id: string; field: boolean }>(sql`
    SELECT id::text, coalesce(mpn_source, '') = 'field' AS field FROM products
    WHERE mpn_norm = ${mpnNorm} AND brand_id = ANY(${ids}::bigint[]) AND status IN ('active','merged')
  `);
  if (products.rows.length > 0) {
    const all = await activeProductsOf(db, products.rows.map((x) => Number(x.id)));
    if (all.length === 1) return all[0]!;
    // Several: a part number the shop states beats one we guessed from a title.
    const stated = await activeProductsOf(db, products.rows.filter((x) => x.field).map((x) => Number(x.id)));
    return stated.length === 1 ? stated[0]! : null;
  }
  const offered = await db.execute<{ product_id: string }>(sql`
    SELECT DISTINCT o.product_id::text AS product_id FROM offers o JOIN products p ON p.id = o.product_id
    WHERE o.mpn_norm = ${mpnNorm} AND o.match_status IN ${MATCHED} AND NOT o.blacklisted AND p.brand_id = ANY(${ids}::bigint[])
  `);
  return single(db, offered.rows.map((x) => Number(x.product_id)));
}

/** Resolves page identifiers to one active product (see the module comment), or null. */
export async function resolveExtLookup(db: Db, ids: ExtLookupIds): Promise<ExtResolution | null> {
  if (ids.url) {
    const p = await byUrl(db, ids.url);
    if (p !== null) return { productId: p, matchedBy: 'url' };
  }
  if (ids.gtin) {
    const p = await byGtin(db, ids.gtin);
    if (p !== null) return { productId: p, matchedBy: 'gtin' };
  }
  if (ids.brand && ids.mpn) {
    const p = await byBrandMpn(db, ids.brand, ids.mpn);
    if (p !== null) return { productId: p, matchedBy: 'brand_mpn' };
  }
  return null;
}

/**
 * The lowest daily total of the default chart series (`product_daily.min_total_price`: new,
 * in-stock offers sold by shops; marketplace sellers are a separate series) for the observed days
 * between `from` and `to`, as numeric text (no floats). Days we did not observe are absent.
 */
export async function extDailyLows(db: Db, productId: number, from: string, to: string): Promise<Array<[string, string]>> {
  const r = await db.execute<{ day: string; total: string }>(sql`
    SELECT day::text, min_total_price::text AS total FROM product_daily
    WHERE product_id = ${productId} AND day >= ${from}::date AND day <= ${to}::date AND min_total_price IS NOT NULL
    ORDER BY day
  `);
  return r.rows.map((x) => [x.day, x.total]);
}

export interface ExtResolutionReport {
  shop: string;
  offers: number;
  /** Offers whose page the extension would resolve (any identifier). */
  resolved: number;
  byMethod: Record<ExtMatchedBy, number>;
  /** Resolved to the product the offer is matched to (sanity: a different one would be a wrong overlay). */
  sameProduct: number;
  /** Resolved to another product than the one the offer is matched to: each would be a wrong overlay (expected 0). */
  otherProduct: number;
  /** Resolved although the offer itself is not matched (by GTIN or brand + part number). */
  unmatchedOffer: number;
  /** Resolved products with live offers (checked in the last 48 h) at two or more shops: "cheaper elsewhere" can be shown. */
  withOtherShops: number;
  /** Resolved products with at least 14 observed days (a verdict instead of "Istoric insuficient"). */
  withVerdict: number;
  /** The same pages without the URL (GTIN or brand + part number only), as for a shop we have no offers from. */
  identifiersOnly: number;
}

/**
 * Release-gate measurement (M26): for every active offer of a shop, the identifiers its product
 * page gives the extension (the offer URL, the GTIN and the stated part number with the brand, as
 * recorded) are resolved like `/api/ext/lookup` does. The shop's listings are its popular products,
 * so this approximates "top SKUs resolve". Read-only.
 */
export async function extResolutionReport(db: Db, shopSlug: string): Promise<ExtResolutionReport> {
  const offers = await db.execute<{ url: string; gtin: string | null; brand: string | null; mpn: string | null; product_id: string | null }>(sql`
    SELECT o.url, o.gtin_raw AS gtin, coalesce(o.brand_raw, o.brand_name) AS brand,
      CASE WHEN o.mpn_source = 'field' THEN o.mpn_raw END AS mpn, o.product_id::text AS product_id
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE s.slug = ${shopSlug} AND o.active
    ORDER BY o.id
  `);
  const report: ExtResolutionReport = {
    shop: shopSlug,
    offers: offers.rows.length,
    resolved: 0,
    byMethod: { url: 0, gtin: 0, brand_mpn: 0 },
    sameProduct: 0,
    otherProduct: 0,
    unmatchedOffer: 0,
    withOtherShops: 0,
    withVerdict: 0,
    identifiersOnly: 0,
  };
  const resolvedIds: number[] = [];
  for (const o of offers.rows) {
    const r = await resolveExtLookup(db, { url: o.url, gtin: o.gtin, brand: o.brand, mpn: o.mpn });
    if (r) {
      report.resolved++;
      report.byMethod[r.matchedBy]++;
      resolvedIds.push(r.productId);
      const own = o.product_id ? ((await activeProductsOf(db, [Number(o.product_id)]))[0] ?? null) : null;
      if (own === null) report.unmatchedOffer++;
      else if (own === r.productId) report.sameProduct++;
      else report.otherProduct++;
    }
    if (await resolveExtLookup(db, { gtin: o.gtin, brand: o.brand, mpn: o.mpn })) report.identifiersOnly++;
  }
  if (resolvedIds.length > 0) {
    const facts = await db.execute<{ id: string; shops: string; days: number | null }>(sql`
      SELECT p.id::text,
        (SELECT count(DISTINCT o.shop_id) FROM offers o JOIN shops s ON s.id = o.shop_id
          WHERE o.product_id = p.id AND o.active AND o.match_status IN ${MATCHED} AND NOT o.blacklisted AND s.status = 'active'
            AND o.availability = 'in_stock' AND o.last_checked_at > now() - interval '48 hours')::text AS shops,
        ps.observations_days AS days
      FROM products p LEFT JOIN product_stats ps ON ps.product_id = p.id
      WHERE p.id = ANY(${sql.param([...new Set(resolvedIds)])}::bigint[])
    `);
    const byId = new Map(facts.rows.map((f) => [Number(f.id), f]));
    for (const id of resolvedIds) {
      const f = byId.get(id);
      if (f && Number(f.shops) >= 2) report.withOtherShops++;
      if (f && (f.days ?? 0) >= 14) report.withVerdict++;
    }
  }
  return report;
}
