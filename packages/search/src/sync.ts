import { createHash } from 'node:crypto';
import { sql, type Db } from '@pretoscop/db';
import { MeiliError, type EnqueuedTask, type Meili } from './client';
import { buildProductDocument, type ProductDocument, type ProductRow } from './document';
import { BRAND_SETTINGS, CATEGORY_SETTINGS, PRODUCT_SETTINGS, type IndexNames } from './settings';

/**
 * Database → Meilisearch (docs/03 §6.6). Three entry points, all idempotent:
 * - `rebuildAll`: blue/green full rebuild (fill `<index>_next`, swap, drop the old one); nightly and
 *   whenever the document schema or the settings change;
 * - `syncChanged`: every minute, re-indexes products changed since the last watermark (products,
 *   offers, stats, merges, images, GTINs) and removes the ones no longer active;
 * - `indexProductIds`: the same for an explicit list (CLI, tests).
 * The watermark lives in the `<prefix>pretoscop_sync` index, next to the data it describes: an empty
 * Meilisearch (new server, lost volume) has no watermark and gets a full rebuild.
 */

/** Bump DOC_VERSION when `buildProductDocument` changes shape; settings changes are detected by hash. */
export const DOC_VERSION = 2;
export const SCHEMA_VERSION = createHash('sha256')
  .update(JSON.stringify({ DOC_VERSION, PRODUCT_SETTINGS, CATEGORY_SETTINGS, BRAND_SETTINGS }))
  .digest('hex')
  .slice(0, 16);

export interface SyncLog {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface SyncDeps {
  db: Db;
  meili: Meili;
  names: IndexNames;
  log?: SyncLog;
}

export interface SyncMeta {
  id: 'products';
  schema: string;
  /** Incremented by every full rebuild; a sync that saw another generation does not move the watermark. */
  generation: number;
  /** Database time up to which changes are indexed (ISO). */
  watermark: string;
  last_full_at: string;
  documents: number;
}

const BATCH = 500;
/** Overlap with the previous run: covers transactions that committed after our snapshot. */
const OVERLAP_MS = 2 * 60_000;

// ---------------------------------------------------------------------------------------------
// Rows

type RawRow = {
  id: string; slug: string; title: string; title_ascii: string; mpn: string | null; mpn_norm: string | null;
  attributes: Record<string, unknown> | null; provisional: boolean; popularity: number | null;
  brand: string | null; brand_slug: string | null; brand_aliases: string[] | null;
  cat_slug: string | null; cat_name: string | null; cat_path: string | null; parent_slug: string | null; parent_name: string | null;
  family: string | null; family_id: string | null; image: string | null; gtins: string[] | null;
  observations_days: number | null; verdict: ProductRow['verdict']; history_started_at: string | null;
  offer_count: string | null; shop_count: string | null; shop_slugs: string[] | null; min_price: string | null; min_total: string | null;
  min_shop: string | null; in_stock_count: string | null; last_change: Date | string | null; updated_at: Date | string;
};

const bani = (v: string | null): number | null => {
  if (v === null) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
};
const date = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

/**
 * Active products with their live offers aggregated the way the product page counts them (M13):
 * live = active, matched, active shop, not blacklisted, checked within the shop's freshness SLO;
 * the minimum is over new, in-stock live offers (marketplace sellers included, as in "cel mai mic
 * preț total acum").
 */
export async function loadProductRows(db: Db, opts: { ids?: number[]; afterId?: number; limit?: number }): Promise<ProductRow[]> {
  const where = opts.ids
    ? sql`p.id = ANY(${sql.param(opts.ids)}::bigint[])`
    : sql`p.id > ${opts.afterId ?? 0}`;
  const res = await db.execute<RawRow>(sql`
    SELECT p.id::text, p.slug, p.title, p.title_ascii, p.mpn, p.mpn_norm, p.attributes, p.provisional, p.popularity,
      b.name AS brand, b.slug AS brand_slug, b.aliases AS brand_aliases,
      c.slug AS cat_slug, c.name_ro AS cat_name, c.path AS cat_path, pc.slug AS parent_slug, pc.name_ro AS parent_name,
      f.title AS family, p.family_id::text, img.storage_key AS image,
      (SELECT array_agg(g.gtin14 ORDER BY g.gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtins,
      ps.observations_days, ps.verdict, ps.history_started_at::text,
      live.offer_count::text, live.shop_count::text, live.shop_slugs, live.min_price::text, live.min_total::text, live.min_shop,
      live.in_stock_count::text, live.last_change, p.updated_at
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories pc ON pc.id = c.parent_id
    LEFT JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_stats ps ON ps.product_id = p.id
    LEFT JOIN LATERAL (SELECT i.storage_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.is_primary DESC, i.id LIMIT 1) img ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS offer_count,
        count(DISTINCT o.shop_id) AS shop_count,
        array_agg(DISTINCT s.slug) AS shop_slugs,
        min(o.price) FILTER (WHERE o.availability = 'in_stock' AND o.condition = 'new') AS min_price,
        min(o.total_price) FILTER (WHERE o.availability = 'in_stock' AND o.condition = 'new') AS min_total,
        (array_agg(s.name ORDER BY o.total_price, o.last_checked_at DESC) FILTER (WHERE o.availability = 'in_stock' AND o.condition = 'new'))[1] AS min_shop,
        count(*) FILTER (WHERE o.availability = 'in_stock') AS in_stock_count,
        max(o.price_changed_at) AS last_change
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id = p.id AND o.active AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
        AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
    ) live ON true
    WHERE p.status = 'active' AND ${where}
    ORDER BY p.id
    ${opts.ids ? sql`` : sql`LIMIT ${opts.limit ?? 1000}`}
  `);
  return res.rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    title: r.title,
    titleAscii: r.title_ascii,
    mpn: r.mpn,
    mpnNorm: r.mpn_norm,
    attributes: r.attributes ?? {},
    provisional: r.provisional,
    popularity: Number(r.popularity ?? 0),
    brand: r.brand,
    brandSlug: r.brand_slug,
    brandAliases: r.brand_aliases ?? [],
    categorySlug: r.cat_slug,
    categoryName: r.cat_name,
    categoryPath: r.cat_path,
    parentSlug: r.parent_slug,
    parentName: r.parent_name,
    family: r.family,
    familyId: r.family_id ? Number(r.family_id) : null,
    image: r.image,
    gtins: r.gtins ?? [],
    observationsDays: Number(r.observations_days ?? 0),
    verdict: r.verdict ?? null,
    historyStartedAt: r.history_started_at,
    offerCount: Number(r.offer_count ?? 0),
    shopCount: Number(r.shop_count ?? 0),
    shopSlugs: r.shop_slugs ?? [],
    minPriceBani: bani(r.min_price),
    minTotalBani: bani(r.min_total),
    minShop: r.min_shop,
    inStockCount: Number(r.in_stock_count ?? 0),
    lastChangeAt: date(r.last_change),
    updatedAt: date(r.updated_at) ?? new Date(),
  }));
}

/**
 * Hook for document enrichment that needs more than one row at a time (M15 adds the verified drop
 * from the daily series). Receives the documents of one batch and may mutate them.
 */
export type DocumentEnricher = (db: Db, docs: ProductDocument[]) => Promise<void>;
const enrichers: DocumentEnricher[] = [];
export function registerDocumentEnricher(e: DocumentEnricher): void {
  if (!enrichers.includes(e)) enrichers.push(e);
}

async function buildDocuments(db: Db, rows: ProductRow[]): Promise<ProductDocument[]> {
  const docs = rows.map(buildProductDocument);
  for (const e of enrichers) await e(db, docs);
  return docs;
}

// ---------------------------------------------------------------------------------------------
// Meilisearch helpers

async function indexExists(meili: Meili, uid: string): Promise<boolean> {
  try {
    await meili.request('GET', `/indexes/${uid}`);
    return true;
  } catch (e) {
    if (e instanceof MeiliError && e.status === 404) return false;
    throw e;
  }
}

async function dropIndex(meili: Meili, uid: string): Promise<void> {
  if (await indexExists(meili, uid)) await meili.waitForTask(await meili.request<EnqueuedTask>('DELETE', `/indexes/${uid}`));
}

async function freshIndex(meili: Meili, uid: string, settings: object): Promise<void> {
  await dropIndex(meili, uid);
  await meili.waitForTask(await meili.request<EnqueuedTask>('POST', '/indexes', { uid, primaryKey: 'id' }));
  await meili.waitForTask(await meili.request<EnqueuedTask>('PATCH', `/indexes/${uid}/settings`, settings));
}

/** Atomically replaces `live` with `next` (renaming when `live` does not exist yet), then drops the old data. */
async function swapIn(meili: Meili, live: string, next: string): Promise<void> {
  const rename = !(await indexExists(meili, live));
  // With `rename`, the first index is renamed to the second (which must not exist).
  const swap = rename ? { indexes: [next, live], rename: true } : { indexes: [live, next] };
  await meili.waitForTask(await meili.request<EnqueuedTask>('POST', '/swap-indexes', [swap]));
  if (!rename) await dropIndex(meili, next);
}

async function ensureMetaIndex(meili: Meili, uid: string): Promise<void> {
  if (!(await indexExists(meili, uid))) await meili.waitForTask(await meili.request<EnqueuedTask>('POST', '/indexes', { uid, primaryKey: 'id' }));
}

export async function readMeta(meili: Meili, names: IndexNames): Promise<SyncMeta | null> {
  try {
    return await meili.request<SyncMeta>('GET', `/indexes/${names.meta}/documents/products`);
  } catch (e) {
    if (e instanceof MeiliError && e.status === 404) return null;
    throw e;
  }
}

async function writeMeta(meili: Meili, names: IndexNames, meta: SyncMeta): Promise<void> {
  await ensureMetaIndex(meili, names.meta);
  await meili.waitForTask(await meili.request<EnqueuedTask>('PUT', `/indexes/${names.meta}/documents`, [meta]));
}

async function dbNow(db: Db): Promise<Date> {
  const r = await db.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
  return date(r.rows[0]!.now)!;
}

// ---------------------------------------------------------------------------------------------
// Categories and brands (small indexes for autocomplete and the category tree)

async function rebuildSmallIndexes(deps: SyncDeps): Promise<{ categories: number; brands: number }> {
  const { db, meili, names } = deps;
  const counts = await meili.request<{ facetDistribution?: Record<string, Record<string, number>> }>('POST', `/indexes/${names.products}/search`, {
    q: '',
    limit: 0,
    facets: ['category_slugs', 'brand_slug'],
  });
  const perCategory = counts.facetDistribution?.category_slugs ?? {};
  const perBrand = counts.facetDistribution?.brand_slug ?? {};

  const cats = await db.execute<{ slug: string; path: string; name_ro: string; depth: number; parent_name: string | null; sort_order: number }>(sql`
    SELECT c.slug, c.path, c.name_ro, c.depth, pc.name_ro AS parent_name, c.sort_order FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id`);
  const categoryDocs = cats.rows.map((c) => ({
    id: c.slug,
    slug: c.slug,
    path: c.path,
    name: c.name_ro,
    parent_name: c.parent_name,
    depth: c.depth,
    terms: [] as string[],
    product_count: perCategory[c.slug] ?? 0,
  }));
  const brands = await db.execute<{ slug: string; name: string; aliases: string[] | null }>(sql`SELECT slug, name, aliases FROM brands`);
  const brandDocs = brands.rows.map((b) => ({ id: b.slug, slug: b.slug, name: b.name, aliases: b.aliases ?? [], product_count: perBrand[b.slug] ?? 0 }));

  for (const [live, settings, docs] of [
    [names.categories, CATEGORY_SETTINGS, categoryDocs],
    [names.brands, BRAND_SETTINGS, brandDocs],
  ] as const) {
    const next = `${live}_next`;
    await freshIndex(meili, next, settings);
    if (docs.length) await meili.waitForTask(await meili.request<EnqueuedTask>('POST', `/indexes/${next}/documents`, docs));
    await swapIn(meili, live, next);
  }
  return { categories: categoryDocs.length, brands: brandDocs.length };
}

// ---------------------------------------------------------------------------------------------
// Entry points

/** Blue/green rebuild of the products index (and the category and brand indexes). */
export async function rebuildAll(deps: SyncDeps): Promise<{ documents: number; categories: number; brands: number; ms: number }> {
  const { db, meili, names, log } = deps;
  const started = Date.now();
  const startedAt = await dbNow(db);
  const previous = await readMeta(meili, names);
  const next = `${names.products}_next`;
  await freshIndex(meili, next, PRODUCT_SETTINGS);
  let after = 0;
  let documents = 0;
  const tasks: EnqueuedTask[] = [];
  for (;;) {
    const rows = await loadProductRows(db, { afterId: after, limit: 1000 });
    if (rows.length === 0) break;
    const docs = await buildDocuments(db, rows);
    tasks.push(await meili.request<EnqueuedTask>('POST', `/indexes/${next}/documents`, docs));
    documents += docs.length;
    after = rows[rows.length - 1]!.id;
  }
  for (const t of tasks) await meili.waitForTask(t, { timeoutMs: 15 * 60_000 });
  await swapIn(meili, names.products, next);
  const small = await rebuildSmallIndexes(deps);
  await writeMeta(meili, names, {
    id: 'products',
    schema: SCHEMA_VERSION,
    generation: (previous?.generation ?? 0) + 1,
    watermark: startedAt.toISOString(),
    last_full_at: new Date().toISOString(),
    documents,
  });
  const ms = Date.now() - started;
  log?.info({ documents, ...small, duration_ms: ms }, 'search index rebuilt');
  return { documents, ...small, ms };
}

/** Indexes the given products (adds/replaces active ones, removes the others). */
export async function indexProductIds(deps: SyncDeps, ids: number[]): Promise<{ indexed: number; removed: number }> {
  const { db, meili, names } = deps;
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  let indexed = 0;
  let removed = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const rows = await loadProductRows(db, { ids: chunk });
    const docs = await buildDocuments(db, rows);
    const keep = new Set(rows.map((r) => r.id));
    const gone = chunk.filter((id) => !keep.has(id));
    if (docs.length) await meili.waitForTask(await meili.request<EnqueuedTask>('POST', `/indexes/${names.products}/documents`, docs));
    if (gone.length) await meili.waitForTask(await meili.request<EnqueuedTask>('POST', `/indexes/${names.products}/documents/delete-batch`, gone));
    indexed += docs.length;
    removed += gone.length;
  }
  return { indexed, removed };
}

/** Products touched since `since`: their row, an offer, the stats, a merge, an image or a GTIN changed. */
export async function changedProductIds(db: Db, since: Date): Promise<number[]> {
  const s = since.toISOString();
  const res = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM products WHERE updated_at > ${s}::timestamptz
    UNION SELECT product_id::text FROM offers WHERE updated_at > ${s}::timestamptz AND product_id IS NOT NULL
    UNION SELECT product_id::text FROM product_stats WHERE updated_at > ${s}::timestamptz
    UNION SELECT from_product_id::text FROM product_merges WHERE created_at > ${s}::timestamptz OR undone_at > ${s}::timestamptz
    UNION SELECT into_product_id::text FROM product_merges WHERE created_at > ${s}::timestamptz OR undone_at > ${s}::timestamptz
    UNION SELECT product_id::text FROM product_images WHERE created_at > ${s}::timestamptz
    UNION SELECT product_id::text FROM product_gtins WHERE created_at > ${s}::timestamptz
  `);
  return res.rows.map((r) => Number(r.id));
}

/**
 * Incremental sync (every minute). Without a watermark or with an outdated schema, it rebuilds.
 * The watermark only moves when no full rebuild ran in between (generation check).
 */
export async function syncChanged(deps: SyncDeps): Promise<{ mode: 'full' | 'incremental'; indexed: number; removed: number }> {
  const { db, meili, names, log } = deps;
  const meta = await readMeta(meili, names);
  if (!meta || meta.schema !== SCHEMA_VERSION || !(await indexExists(meili, names.products))) {
    log?.info({ reason: meta ? 'schema changed' : 'no watermark' }, 'search sync: full rebuild');
    const r = await rebuildAll(deps);
    return { mode: 'full', indexed: r.documents, removed: 0 };
  }
  const startedAt = await dbNow(db);
  const ids = await changedProductIds(db, new Date(Date.parse(meta.watermark) - OVERLAP_MS));
  const r = await indexProductIds(deps, ids);
  const now = await readMeta(meili, names);
  if (now && now.generation === meta.generation) await writeMeta(meili, names, { ...now, watermark: startedAt.toISOString() });
  if (ids.length) log?.info({ changed: ids.length, ...r }, 'search sync done');
  return { mode: 'incremental', ...r };
}

/**
 * Nightly popularity (docs/03 §6.6): decayed click-outs and product views (half-life 14 days, last
 * 90 days) plus the number of shops with a live offer. Rows change only when the value does, and
 * `updated_at` is left alone so this never triggers a re-index by itself.
 *   popularity = 3 × clicks + 1 × views + 2 × shops
 */
export async function recomputePopularity(db: Db): Promise<number> {
  const res = await db.execute(sql`
    WITH c AS (
      SELECT product_id, sum(power(0.5, extract(epoch FROM now() - ts) / 86400.0 / 14)) AS s
      FROM clicks WHERE ts > now() - interval '90 days' AND product_id IS NOT NULL GROUP BY product_id
    ),
    v AS (
      SELECT (props->>'product')::bigint AS product_id, sum(power(0.5, extract(epoch FROM now() - ts) / 86400.0 / 14)) AS s
      FROM events WHERE name = 'product_view' AND ts > now() - interval '90 days' AND props->>'product' ~ '^[0-9]{1,15}$' GROUP BY 1
    ),
    sh AS (
      SELECT o.product_id, count(DISTINCT o.shop_id) AS n
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.product_id IS NOT NULL AND o.active AND o.match_status IN ('auto','manual') AND s.status = 'active' AND NOT o.blacklisted
        AND o.last_checked_at > now() - interval '48 hours'
      GROUP BY o.product_id
    ),
    score AS (
      SELECT p.id, round((3 * coalesce(c.s, 0) + coalesce(v.s, 0) + 2 * coalesce(sh.n, 0))::numeric, 3)::real AS value
      FROM products p LEFT JOIN c ON c.product_id = p.id LEFT JOIN v ON v.product_id = p.id LEFT JOIN sh ON sh.product_id = p.id
      WHERE p.status = 'active'
    )
    UPDATE products p SET popularity = score.value FROM score
    WHERE p.id = score.id AND p.popularity IS DISTINCT FROM score.value
  `);
  return res.rowCount ?? 0;
}
