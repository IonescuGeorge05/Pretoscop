import { w3cDate, type SitemapEntry } from '@pretoscop/core';

/**
 * Entries of `pages.xml` (M16), the sitemap of pages only the web app knows about. Pure: the I/O
 * wrapper (`pagesSitemap` in ./sitemap) loads the inputs.
 *
 * - home, /categorii and /magazine: lastmod = the latest price change we recorded;
 * - /reduceri and its category tabs only while they list verified drops (otherwise they are noindex);
 * - trust and legal pages: lastmod = the document's own date (packages/config legal-texts);
 * - /rapoarte, and each report a founder approved (`report:approve`, M23) with its approval date;
 *   planned or unapproved reports are never listed (their pages are noindex).
 */
export interface PagesSitemapInput {
  /** PUBLIC_BASE_URL. */
  base: string;
  /** Latest recorded price change (any active offer), or null. */
  latestPriceChange: Date | string | null;
  /** Root category slugs that have a verified drop on /reduceri now (empty: /reduceri is not listed). */
  dealRoots: string[] | null;
  /** Trust and legal documents: path and the date of their current version (YYYY-MM-DD). */
  documents: ReadonlyArray<{ path: string; updatedAt: string }>;
  /** Published reports (approved or not: only approved ones are listed). */
  reports: ReadonlyArray<{ id: string; approval: { approved: boolean; at: string | null } }>;
}

export function pagesSitemapEntries(i: PagesSitemapInput): SitemapEntry[] {
  const base = i.base.replace(/\/+$/, '');
  const latest = i.latestPriceChange ? w3cDate(i.latestPriceChange instanceof Date ? i.latestPriceChange : new Date(i.latestPriceChange)) : null;
  const urls: SitemapEntry[] = [
    { loc: `${base}/`, lastmod: latest },
    { loc: `${base}/categorii`, lastmod: latest },
    { loc: `${base}/magazine`, lastmod: latest },
  ];
  if (i.dealRoots && i.dealRoots.length > 0) {
    urls.push({ loc: `${base}/reduceri`, lastmod: latest });
    for (const root of [...new Set(i.dealRoots)].sort()) urls.push({ loc: `${base}/reduceri/${root}`, lastmod: latest });
  }
  for (const d of i.documents) urls.push({ loc: `${base}${d.path}`, lastmod: d.updatedAt });
  const approved = i.reports.filter((r) => r.approval.approved);
  const approvedAt = approved
    .map((r) => r.approval.at)
    .filter((x): x is string => !!x)
    .sort();
  urls.push({ loc: `${base}/rapoarte`, lastmod: approvedAt.length ? w3cDate(approvedAt.at(-1)!) : null });
  for (const r of approved) urls.push({ loc: `${base}/rapoarte/${r.id}`, lastmod: r.approval.at ? w3cDate(r.approval.at) : null });
  return urls;
}

/** The newest lastmod of a list of entries (the `pages.xml` lastmod in the sitemap index). */
export function newestLastmod(entries: SitemapEntry[]): string | null {
  // W3C dates of mixed precision (YYYY-MM-DD and full timestamps) compare correctly as instants.
  let best: { t: number; s: string } | null = null;
  for (const e of entries) {
    if (!e.lastmod) continue;
    const t = Date.parse(e.lastmod);
    if (!Number.isNaN(t) && (!best || t > best.t)) best = { t, s: e.lastmod };
  }
  return best?.s ?? null;
}
