import 'server-only';
import { legalDocuments } from '@pretoscop/config/legal-texts';
import { urlsetXml } from '@pretoscop/core';
import { getDeals, sql } from '@pretoscop/db';
import { createBlobStore } from '@pretoscop/storage';
import { PUBLISHED } from '@/content/reports';
import { db, serverEnv } from './db';
import { newestLastmod, pagesSitemapEntries } from './sitemap-pages';

/**
 * Sitemaps (M16). The worker's `sitemap.build` writes the data-driven files to the blob store
 * (products, categories, brands, shops + manifest.json); the web app serves them and adds
 * `pages.xml` (home, browse indexes, deals, trust and legal pages, approved reports), which only
 * the web app knows about.
 */
export const SITEMAP_FILE = /^(products-\d{1,4}|categories|brands|shops)\.xml$/;

export interface SitemapManifest {
  generatedAt: string;
  baseUrl: string;
  files: Array<{ name: string; urls: number; lastmod: string | null }>;
}

export function baseUrl(): string {
  return serverEnv().PUBLIC_BASE_URL.replace(/\/+$/, '');
}

export async function readManifest(): Promise<SitemapManifest | null> {
  try {
    const raw = await createBlobStore(serverEnv()).get('sitemaps/manifest.json');
    return raw ? (JSON.parse(Buffer.from(raw).toString('utf8')) as SitemapManifest) : null;
  } catch {
    return null;
  }
}

export async function readSitemapFile(name: string): Promise<string | null> {
  if (!SITEMAP_FILE.test(name)) return null;
  const raw = await createBlobStore(serverEnv()).get(`sitemaps/${name}`);
  return raw ? Buffer.from(raw).toString('utf8') : null;
}

/** `pages.xml`: the pages only the web app knows (rules in ./sitemap-pages), with their newest lastmod. */
export async function pagesSitemap(): Promise<{ xml: string; lastmod: string | null }> {
  const latest = await db()
    .execute<{ t: Date | string | null }>(sql`SELECT max(price_changed_at) AS t FROM offers WHERE active`)
    .then((r) => r.rows[0]?.t ?? null)
    .catch(() => null);
  // The same deals as /reduceri (7 days, every category): its tabs are indexable only with drops.
  const deals = await getDeals(db(), { windowDays: 7, limit: Infinity, lowsLimit: 0 }).catch(() => null);
  const urls = pagesSitemapEntries({
    base: baseUrl(),
    latestPriceChange: latest,
    dealRoots: deals ? deals.drops.map((d) => d.rootSlug).filter((s): s is string => !!s) : null,
    documents: Object.values(legalDocuments),
    reports: PUBLISHED,
  });
  return { xml: urlsetXml(urls), lastmod: newestLastmod(urls) };
}
