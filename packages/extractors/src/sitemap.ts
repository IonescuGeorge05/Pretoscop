import type { SitemapEntry, SitemapParseResult } from './types';

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Parses a sitemap index or urlset (sitemaps.org protocol). Gzip must be inflated by the caller.
 * Regex-based on purpose: sitemaps are flat, can hold 50,000 URLs, and this stays fast and
 * namespace-agnostic (`image:loc` inside `<url>` is ignored).
 */
export function parseSitemap(xml: string): SitemapParseResult {
  const urls: SitemapEntry[] = [];
  const children: string[] = [];
  const block = /<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = block.exec(xml))) {
    const kind = (m[1] ?? '').toLowerCase();
    const inner = m[2] ?? '';
    const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(inner)?.[1];
    if (!loc) continue;
    const value = decode(loc);
    if (!value) continue;
    if (kind === 'sitemap') children.push(value);
    else {
      const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(inner)?.[1];
      urls.push(lastmod ? { loc: value, lastmod: decode(lastmod) } : { loc: value });
    }
  }
  return { urls, children };
}
