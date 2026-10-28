import 'server-only';
import { sql } from '@pretoscop/db';
import { cache } from 'react';
import { db } from './db';

/** Catalogue lookups for the browse pages (M14): the category tree, brands and shop facts. */

export interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  /** `tv-audio/televizoare` */
  path: string;
  depth: number;
  parent: CategoryNode | null;
  children: CategoryNode[];
}

export interface CategoryTree {
  roots: CategoryNode[];
  bySlug: Map<string, CategoryNode>;
  byPath: Map<string, CategoryNode>;
}

export const getCategoryTree = cache(async (): Promise<CategoryTree> => {
  const res = await db().execute<{ id: string; slug: string; name_ro: string; path: string; depth: number; parent_id: string | null }>(sql`
    SELECT id::text, slug, name_ro, path, depth, parent_id::text FROM categories ORDER BY depth, sort_order, name_ro`);
  const byId = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const r of res.rows) {
    const node: CategoryNode = { id: Number(r.id), slug: r.slug, name: r.name_ro, path: r.path, depth: r.depth, parent: null, children: [] };
    byId.set(r.id, node);
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else roots.push(node);
  }
  const all = [...byId.values()];
  return { roots, bySlug: new Map(all.map((n) => [n.slug, n])), byPath: new Map(all.map((n) => [n.path, n])) };
});

/** `/c/tv-audio/televizoare` */
export function categoryHref(n: Pick<CategoryNode, 'path'>, page = 1): string {
  return `/c/${n.path}${page > 1 ? `/${page}` : ''}`;
}

export interface BrandInfo {
  slug: string;
  name: string;
}

export const getBrands = cache(async (): Promise<Map<string, BrandInfo>> => {
  const res = await db().execute<{ slug: string; name: string }>(sql`SELECT slug, name FROM brands`);
  return new Map(res.rows.map((b) => [b.slug, { slug: b.slug, name: b.name }]));
});

export type ShopStatus = 'active' | 'paused' | 'blocked' | 'removed';
export type AccessMode = 'direct' | 'assisted' | 'feed_only' | 'off';

export interface ShopFacts {
  slug: string;
  name: string;
  domain: string;
  websiteUrl: string;
  kind: 'retail' | 'marketplace_host';
  status: ShopStatus;
  accessMode: AccessMode;
  shipping: { verified: boolean; freeOver: number | null; flat: number | null; lockerFlat: number | null; notes: string | null };
  warrantyMonths: number | null;
  freshnessSloHours: number;
  /** Active, matched offers checked within the freshness SLO. */
  liveOffers: number;
  /** Distinct products behind the live offers. */
  products: number;
  /** Active offers (matched or not) and how many of them were checked in the last 24 hours. */
  activeOffers: number;
  checked24h: number;
  marketplaceOffers: number;
  lastCheckedAt: string | null;
  firstSeenAt: string | null;
}

type ShopRow = {
  slug: string; name: string; domain: string; website_url: string; kind: ShopFacts['kind']; status: ShopStatus; access_mode: AccessMode;
  shipping_rules: { free_over?: number | null; flat?: number | null; locker_flat?: number | null; notes?: string } | null; shipping_verified: boolean;
  warranty: number | null; slo: number; live: string; products: string; active: string; checked_24h: string; marketplace: string;
  last_checked: string | null; first_seen: string | null;
};

const SHOP_SQL = sql`
  SELECT s.slug, s.name, s.domain, s.website_url, s.kind, s.status, s.access_mode, s.shipping_rules, s.shipping_verified,
    s.warranty_months_default AS warranty, coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26) AS slo,
    coalesce(o.live, 0)::text AS live, coalesce(o.products, 0)::text AS products, coalesce(o.active, 0)::text AS active,
    coalesce(o.checked_24h, 0)::text AS checked_24h, coalesce(o.marketplace, 0)::text AS marketplace,
    o.last_checked::text AS last_checked, o.first_seen::text AS first_seen
  FROM shops s
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE x.matched AND x.fresh) AS live,
      count(DISTINCT x.product_id) FILTER (WHERE x.matched AND x.fresh) AS products,
      count(*) AS active,
      count(*) FILTER (WHERE x.last_checked_at > now() - interval '24 hours') AS checked_24h,
      count(*) FILTER (WHERE x.seller_type = 'marketplace' AND x.matched AND x.fresh) AS marketplace,
      max(x.last_checked_at) AS last_checked,
      min(x.first_seen_at) AS first_seen
    FROM (
      SELECT o.product_id, o.seller_type, o.last_checked_at, o.first_seen_at,
        (o.match_status IN ('auto','manual') AND o.product_id IS NOT NULL) AS matched,
        o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26)) AS fresh
      FROM offers o WHERE o.shop_id = s.id AND o.active AND NOT o.blacklisted
    ) x
  ) o ON true`;

function toFacts(r: ShopRow): ShopFacts {
  const rules = r.shipping_rules ?? {};
  return {
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    websiteUrl: r.website_url,
    kind: r.kind,
    status: r.status,
    accessMode: r.access_mode,
    shipping: {
      verified: r.shipping_verified,
      freeOver: typeof rules.free_over === 'number' ? rules.free_over : null,
      flat: typeof rules.flat === 'number' ? rules.flat : null,
      lockerFlat: typeof rules.locker_flat === 'number' ? rules.locker_flat : null,
      notes: rules.notes ?? null,
    },
    warrantyMonths: r.warranty,
    freshnessSloHours: r.slo,
    liveOffers: Number(r.live),
    products: Number(r.products),
    activeOffers: Number(r.active),
    checked24h: Number(r.checked_24h),
    marketplaceOffers: Number(r.marketplace),
    lastCheckedAt: r.last_checked,
    firstSeenAt: r.first_seen,
  };
}

export const getShop = cache(async (slug: string): Promise<ShopFacts | null> => {
  const res = await db().execute<ShopRow>(sql`${SHOP_SQL} WHERE s.slug = ${slug}`);
  return res.rows[0] ? toFacts(res.rows[0]) : null;
});

const collator = new Intl.Collator('ro', { sensitivity: 'base' });

export const listShops = cache(async (): Promise<ShopFacts[]> => {
  const res = await db().execute<ShopRow>(sql`${SHOP_SQL} WHERE s.status <> 'removed'`);
  return res.rows.map(toFacts).sort((a, b) => b.liveOffers - a.liveOffers || collator.compare(a.name, b.name));
});
