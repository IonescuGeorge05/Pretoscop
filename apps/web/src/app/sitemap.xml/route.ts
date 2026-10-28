import { sitemapIndexXml, type SitemapEntry } from '@pretoscop/core';
import { baseUrl, pagesSitemap, readManifest } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /sitemap.xml — the sitemap index (docs/03 §6.6): `pages.xml` from the web app plus the files
 * `sitemap.build` wrote (manifest in the blob store). Before the first build only pages.xml is listed.
 */
export async function GET(): Promise<Response> {
  const base = baseUrl();
  const [manifest, pages] = await Promise.all([readManifest(), pagesSitemap()]);
  const entries: SitemapEntry[] = [{ loc: `${base}/sitemaps/pages.xml`, lastmod: pages.lastmod }];
  for (const f of manifest?.files ?? []) entries.push({ loc: `${base}/sitemaps/${f.name}`, lastmod: f.lastmod });
  return new Response(sitemapIndexXml(entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' },
  });
}
