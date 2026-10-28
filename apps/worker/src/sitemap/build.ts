import { BRAND_CATEGORY_MIN_PRODUCTS, isProductIndexable, SITEMAP_MAX_URLS, urlsetXml, w3cDate, type SitemapEntry } from '@pretoscop/core';
import { categoryPaths, coveredShops, sitemapProductRows, type Db } from '@pretoscop/db';
import type { BlobStore } from '@pretoscop/storage';

/**
 * `sitemap.build` (M16, docs/03 §6.6): the data-driven sitemaps, written to the blob store
 * (`sitemaps/…`, R2 in production, data/blobs in dev) and served by the web app:
 * - `products-{n}.xml`: indexable product pages only (core `isProductIndexable`), ≤ 50,000 per file,
 *   lastmod = the last price change of a live offer;
 * - `categories.xml`, `brands.xml` (brand pages and curated brand × category pages): only pages with
 *   indexable products, lastmod = the newest of them;
 * - `shops.xml`: covered shops;
 * - `manifest.json`: the files, URL counts and lastmods for the web app's /sitemap.xml index.
 * The web app adds `pages.xml` itself (home, legal and trust pages, reports).
 */
export const SITEMAP_PREFIX = 'sitemaps/';

export interface SitemapManifest {
  generatedAt: string;
  baseUrl: string;
  files: Array<{ name: string; urls: number; lastmod: string | null }>;
}

interface Agg {
  n: number;
  lastmod: number;
}

function bump(map: Map<string, Agg>, key: string | null, lastmod: number): void {
  if (!key) return;
  const a = map.get(key);
  if (a) {
    a.n++;
    a.lastmod = Math.max(a.lastmod, lastmod);
  } else map.set(key, { n: 1, lastmod });
}

const iso = (ms: number) => (ms > 0 ? w3cDate(new Date(ms)) : null);

export interface BuildSitemapsDeps {
  db: Db;
  blob: BlobStore;
  baseUrl: string;
  log?: { info(o: object, m?: string): void };
  /** URLs per products file (the protocol limit, 50,000; smaller only in tests). */
  maxUrlsPerFile?: number;
}

export async function buildSitemaps(deps: BuildSitemapsDeps): Promise<SitemapManifest> {
  const perFile = Math.min(deps.maxUrlsPerFile ?? SITEMAP_MAX_URLS, SITEMAP_MAX_URLS);
  const base = deps.baseUrl.replace(/\/+$/, '');
  const files: SitemapManifest['files'] = [];
  const write = async (name: string, urls: SitemapEntry[]) => {
    await deps.blob.put(`${SITEMAP_PREFIX}${name}`, urlsetXml(urls), 'application/xml');
    const newest = urls.reduce((m, u) => (u.lastmod && u.lastmod > m ? u.lastmod : m), '');
    files.push({ name, urls: urls.length, lastmod: newest || null });
  };

  const categories = new Map<string, Agg>();
  const brands = new Map<string, Agg>();
  const brandCategories = new Map<string, Agg>();
  let page: SitemapEntry[] = [];
  let part = 0;
  let after = 0;
  for (;;) {
    const rows = await sitemapProductRows(deps.db, { afterId: after, limit: 10_000 });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!isProductIndexable({ provisional: r.provisional, liveOffers: r.liveOffers, observationsDays: r.observationsDays })) continue;
      const lm = r.lastmod?.getTime() ?? 0;
      page.push({ loc: `${base}/p/${r.slug}`, lastmod: iso(lm) });
      bump(categories, r.categorySlug, lm);
      bump(categories, r.parentSlug, lm);
      bump(brands, r.brandSlug, lm);
      if (r.brandSlug && r.categorySlug) bump(brandCategories, `${r.brandSlug}/${r.categorySlug}`, lm);
      if (page.length === perFile) {
        await write(`products-${++part}.xml`, page);
        page = [];
      }
    }
    after = rows[rows.length - 1]!.id;
  }
  if (page.length) await write(`products-${++part}.xml`, page);

  const paths = await categoryPaths(deps.db);
  const catUrls = [...categories.entries()]
    .filter(([slug]) => paths.has(slug))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, a]) => ({ loc: `${base}/c/${paths.get(slug)}`, lastmod: iso(a.lastmod) }));
  if (catUrls.length) await write('categories.xml', catUrls);

  const brandUrls = [
    ...[...brands.entries()].map(([slug, a]) => ({ loc: `${base}/b/${slug}`, lastmod: iso(a.lastmod) })),
    ...[...brandCategories.entries()].filter(([, a]) => a.n >= BRAND_CATEGORY_MIN_PRODUCTS).map(([key, a]) => ({ loc: `${base}/b/${key}`, lastmod: iso(a.lastmod) })),
  ].sort((a, b) => a.loc.localeCompare(b.loc));
  if (brandUrls.length) await write('brands.xml', brandUrls);

  const shops = await coveredShops(deps.db);
  if (shops.length) await write('shops.xml', shops.map((s) => ({ loc: `${base}/magazin/${s.slug}`, lastmod: s.lastmod ? w3cDate(s.lastmod) : null })));

  // Remove files of an earlier, larger build (e.g. a products-3.xml that is no longer needed).
  const keep = new Set(files.map((f) => `${SITEMAP_PREFIX}${f.name}`));
  for (const old of await deps.blob.list(SITEMAP_PREFIX)) {
    if (old.key.endsWith('.xml') && !keep.has(old.key)) await deps.blob.delete(old.key);
  }
  const manifest: SitemapManifest = { generatedAt: new Date().toISOString(), baseUrl: base, files };
  await deps.blob.put(`${SITEMAP_PREFIX}manifest.json`, JSON.stringify(manifest, null, 2), 'application/json');
  deps.log?.info({ files: files.length, products: files.filter((f) => f.name.startsWith('products-')).reduce((s, f) => s + f.urls, 0) }, 'sitemaps built');
  return manifest;
}
