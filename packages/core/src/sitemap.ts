/**
 * Sitemaps (sitemaps.org protocol 0.9; docs/03 §6.6, M16). Pure XML builders and a structural
 * validator used by the tests and by `sitemap.build`. Limits per file: 50,000 URLs and 50 MB
 * uncompressed (docs/13 D15).
 */
export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export interface SitemapEntry {
  /** Absolute URL. */
  loc: string;
  /** W3C datetime: `YYYY-MM-DD` or a full ISO timestamp. */
  lastmod?: string | null;
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** `2026-10-27T20:54:56.775Z` → `2026-10-27T20:54:56Z` (seconds precision, UTC). */
export function w3cDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function entries(tag: 'url' | 'sitemap', list: SitemapEntry[]): string {
  return list
    .map((e) => `<${tag}><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : ''}</${tag}>`)
    .join('\n');
}

export function urlsetXml(urls: SitemapEntry[]): string {
  if (urls.length > SITEMAP_MAX_URLS) throw new Error(`a sitemap holds at most ${SITEMAP_MAX_URLS} URLs (got ${urls.length})`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n${entries('url', urls)}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: SitemapEntry[]): string {
  if (sitemaps.length > SITEMAP_MAX_URLS) throw new Error(`a sitemap index holds at most ${SITEMAP_MAX_URLS} sitemaps`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n${entries('sitemap', sitemaps)}\n</sitemapindex>\n`;
}

/** Splits URLs into files of at most `size` (default 50,000). */
export function chunk<T>(list: T[], size = SITEMAP_MAX_URLS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const W3C = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Protocol checks for one sitemap or sitemap index: XML declaration, root element and namespace,
 * one absolute http(s) `loc` per entry (≤ 2,048 characters, same host when `host` is given), valid
 * `lastmod`, escaped ampersands, limits. Returns the problems found (empty = valid).
 */
export function validateSitemapXml(xml: string, opts: { host?: string } = {}): string[] {
  const issues: string[] = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) issues.push('missing XML declaration');
  if (new TextEncoder().encode(xml).length > SITEMAP_MAX_BYTES) issues.push('larger than 50 MB');
  const root = /<(urlset|sitemapindex)\s+xmlns="([^"]+)"\s*>/.exec(xml);
  if (!root) return [...issues, 'no <urlset> or <sitemapindex> root'];
  if (root[2] !== NS) issues.push(`wrong namespace ${root[2]}`);
  const tag = root[1] === 'urlset' ? 'url' : 'sitemap';
  if (!xml.trimEnd().endsWith(`</${root[1]}>`)) issues.push(`unclosed <${root[1]}>`);
  if (/&(?!(amp|lt|gt|quot|apos);)/.test(xml)) issues.push('unescaped "&"');
  const items = [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
  const opened = (xml.match(new RegExp(`<${tag}>`, 'g')) ?? []).length;
  if (opened !== items.length) issues.push(`unbalanced <${tag}> elements`);
  if (items.length > SITEMAP_MAX_URLS) issues.push(`more than ${SITEMAP_MAX_URLS} entries`);
  const seen = new Set<string>();
  for (const [, body] of items) {
    const locs = [...body!.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
    if (locs.length !== 1) {
      issues.push(`an entry has ${locs.length} <loc> elements`);
      continue;
    }
    const loc = locs[0]!.replace(/&amp;/g, '&');
    if (loc.length > 2048) issues.push(`loc longer than 2048 characters: ${loc.slice(0, 60)}…`);
    let url: URL | null = null;
    try {
      url = new URL(loc);
    } catch {
      issues.push(`not an absolute URL: ${loc}`);
    }
    if (url && !/^https?:$/.test(url.protocol)) issues.push(`not http(s): ${loc}`);
    if (url && opts.host && url.host !== opts.host) issues.push(`other host: ${loc}`);
    if (seen.has(loc)) issues.push(`duplicate loc: ${loc}`);
    seen.add(loc);
    const lastmod = /<lastmod>([^<]*)<\/lastmod>/.exec(body!)?.[1];
    if (lastmod !== undefined && !W3C.test(lastmod)) issues.push(`invalid lastmod "${lastmod}" for ${loc}`);
  }
  return issues;
}
