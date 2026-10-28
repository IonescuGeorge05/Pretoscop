import 'server-only';
import { legalDocuments } from '@pretoscop/config/legal-texts';
import { urlsetXml } from '@pretoscop/core';
import { getDeals, sql } from '@pretoscop/db';
import { createBlobStore } from '@pretoscop/storage';
import { unstable_cache } from 'next/cache';
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

/**
 * The database facts behind `pages.xml`, cached for 15 minutes like /reduceri (ISR 15 min): the deals
 * computation is the costliest query of the site and /sitemap.xml is public, so a request never
 * runs it by itself.
 */
const pagesSitemapData = unstable_cache(
  async (): Promise<{ latest: string | null; dealRoots: string[] | null }> => {
    const latest = await db()
      .execute<{ t: Date | string | null }>(sql`SELECT max(price_changed_at) AS t FROM offers WHERE active`)
      .then((r) => (r.rows[0]?.t ? new Date(r.rows[0].t).toISOString() : null))
      .catch(() => null);
    // The same deals as /reduceri (7 days, every category): its tabs are indexable only with drops.
    const deals = await getDeals(db(), { windowDays: 7, limit: Infinity, lowsLimit: 0 }).catch(() => null);
    return { latest, dealRoots: deals ? [...new Set(deals.drops.map((d) => d.rootSlug).filter((s): s is string => !!s))] : null };
  },
  ['sitemap-pages'],
  { revalidate: 900, tags: ['sitemaps'] },
);

/** `pages.xml`: the pages only the web app knows (rules in ./sitemap-pages), with their newest lastmod. */
export async function pagesSitemap(): Promise<{ xml: string; lastmod: string | null }> {
  const { latest, dealRoots } = await pagesSitemapData();
  const urls = pagesSitemapEntries({
    base: baseUrl(),
    latestPriceChange: latest,
    dealRoots,
    documents: Object.values(legalDocuments),
    reports: PUBLISHED,
  });
  return { xml: urlsetXml(urls), lastmod: newestLastmod(urls) };
}
