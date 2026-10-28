import 'server-only';
import { legalDocuments } from '@pretoscop/config/legal-texts';
import { urlsetXml, w3cDate, type SitemapEntry } from '@pretoscop/core';
import { getDeals, sql } from '@pretoscop/db';
import { createBlobStore } from '@pretoscop/storage';
import { PUBLISHED } from '@/content/reports';
import { db, serverEnv } from './db';

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

/** The pages only the web app knows, with honest lastmods (document dates, latest price change). */
export async function pagesSitemap(): Promise<{ xml: string; lastmod: string | null }> {
  const base = baseUrl();
  const latest = await db()
    .execute<{ t: Date | string | null }>(sql`SELECT max(price_changed_at) AS t FROM offers WHERE active`)
    .then((r) => (r.rows[0]?.t ? w3cDate(new Date(r.rows[0].t)) : null))
    .catch(() => null);
  const deals = await getDeals(db(), { windowDays: 7 }).catch(() => null);
  const urls: SitemapEntry[] = [
    { loc: `${base}/`, lastmod: latest },
    { loc: `${base}/categorii`, lastmod: latest },
    { loc: `${base}/magazine`, lastmod: latest },
  ];
  if (deals && deals.drops.length) {
    urls.push({ loc: `${base}/reduceri`, lastmod: latest });
    for (const root of new Set(deals.drops.map((d) => d.rootSlug).filter((s): s is string => !!s))) urls.push({ loc: `${base}/reduceri/${root}`, lastmod: latest });
  }
  for (const d of Object.values(legalDocuments)) urls.push({ loc: `${base}${d.path}`, lastmod: d.updatedAt });
  const reports = PUBLISHED.filter((r) => r.approval.approved);
  urls.push({ loc: `${base}/rapoarte`, lastmod: reports.map((r) => r.approval.at).filter((x): x is string => !!x).sort().at(-1)?.slice(0, 10) ?? null });
  for (const r of reports) urls.push({ loc: `${base}/rapoarte/${r.id}`, lastmod: r.approval.at ? w3cDate(r.approval.at) : null });
  const lastmod = urls.map((u) => u.lastmod ?? '').sort().at(-1) || null;
  return { xml: urlsetXml(urls), lastmod };
}
