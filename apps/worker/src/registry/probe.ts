import { parseShopYaml, type ShopConfig } from '@pretoscop/config/shops';

/**
 * Re-probe of a shop (M21; docs/12 §2 layer 1): at most three polite requests (robots.txt, the
 * home page, one public listing or product page from the registry), 5 s apart, with the honest
 * PretoscopBot identity, from the vantage point where the command runs. Run it from the
 * production IP and from a Romanian IP before a shop is classified as blocked; the outcome goes
 * into the shop's `probes:` list in the registry YAML.
 */

export type ProbeResult = 'served' | 'blocked' | 'challenge' | 'timeout' | 'robots_disallow' | 'error';

/** The parts of a `fetchPolite` result the classification needs. */
export interface ProbeFetch {
  url: string;
  status: number;
  ok: boolean;
  blocked: boolean;
  blockReason?: string;
  skipped?: string;
  errorCode?: string;
  error?: string;
  contentType?: string | null;
  bytes?: number;
}

const SEVERITY: ProbeResult[] = ['challenge', 'blocked', 'robots_disallow', 'timeout', 'error', 'served'];

export function classifyFetch(r: ProbeFetch): ProbeResult {
  if (r.blocked) return r.blockReason === 'challenge' || r.blockReason === 'captcha_redirect' ? 'challenge' : 'blocked';
  if (r.skipped === 'robots_disallowed') return 'robots_disallow';
  if (r.errorCode === 'robots_unavailable') return 'error';
  if (r.errorCode === 'timeout' || r.errorCode === 'connect_timeout') return 'timeout';
  if (r.skipped || r.errorCode || r.status === 0) return 'error';
  return r.ok ? 'served' : r.status === 403 || r.status === 429 ? 'blocked' : 'error';
}

function describe(r: ProbeFetch): string {
  const path = (() => {
    try {
      const u = new URL(r.url);
      return `${u.pathname}${u.search}`;
    } catch {
      return r.url;
    }
  })();
  if (r.skipped) return `${path} skipped (${r.skipped}${r.errorCode ? `, ${r.errorCode}` : ''})`;
  if (r.blocked) return `${path} ${r.status || ''} ${r.blockReason ?? 'blocked'}`.replace(/\s+/g, ' ');
  if (r.errorCode) return `${path} ${r.errorCode}`;
  const size = r.bytes !== undefined ? `, ${Math.round(r.bytes / 1024)} KB` : '';
  return `${path} ${r.status}${r.contentType ? ` (${r.contentType.split(';')[0]}${size})` : ''}`;
}

/** The worst outcome over the requests, and a short note listing each one. */
export function summarizeProbe(fetches: readonly ProbeFetch[]): { result: ProbeResult; note: string } {
  const results = fetches.map(classifyFetch);
  const result = SEVERITY.find((s) => results.includes(s)) ?? 'error';
  return { result, note: fetches.map(describe).join('; ') };
}

/** Public pages to probe: the home page, then the first listing / sitemap / product source URL (never internal search). */
export function probeTargets(shop: ShopConfig, extraUrl?: string): Array<{ url: string; purpose: 'probe' | 'listing' | 'sitemap' | 'product' }> {
  const targets: Array<{ url: string; purpose: 'probe' | 'listing' | 'sitemap' | 'product' }> = [{ url: shop.website_url, purpose: 'probe' }];
  if (extraUrl) {
    targets.push({ url: extraUrl, purpose: 'probe' });
    return targets;
  }
  const src = shop.sources.find((s) => s.kind === 'listing' || s.kind === 'sitemap' || s.kind === 'product_page');
  if (src) targets.push({ url: src.url, purpose: src.kind === 'product_page' ? 'product' : src.kind === 'sitemap' ? 'sitemap' : 'listing' });
  return targets;
}

function yamlString(s: string): string {
  return JSON.stringify(s); // a JSON string is a valid double-quoted YAML scalar
}

/** The registry entry for one probe, as YAML list item lines (two-space indent under `probes:`). */
export function probeYaml(entry: { date: string; vantage: string; result: ProbeResult; note: string }): string {
  return [`  - date: ${yamlString(entry.date)}`, `    vantage: ${yamlString(entry.vantage)}`, `    result: ${entry.result}`, `    note: ${yamlString(entry.note)}`].join('\n');
}

/**
 * Adds the entry to a shop YAML file's `probes:` list (first item; a list is created when the
 * key is missing) and re-parses the result: a file that would no longer load is never written.
 */
export function addProbeToYaml(text: string, entry: { date: string; vantage: string; result: ProbeResult; note: string }, file: string): string {
  const item = probeYaml(entry);
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^probes:\s*(\[\])?\s*$/.test(l));
  let out: string;
  if (at >= 0) {
    lines.splice(at, 1, 'probes:', item);
    out = lines.join('\n');
  } else {
    const before = lines.findIndex((l) => /^(notes|sources):/.test(l));
    if (before >= 0) lines.splice(before, 0, 'probes:', item);
    else lines.push('probes:', item);
    out = lines.join('\n');
  }
  parseShopYaml(out, file); // throws when the edit broke the file
  return out;
}
