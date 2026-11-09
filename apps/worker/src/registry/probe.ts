import { parseShopYaml, type ShopConfig } from '@pretoscop/config/shops';

/**
 * Re-probe of a shop (M21; docs/12 §2 layer 1): at most three polite requests (robots.txt, the
 * home page, one public listing or product page from the registry), at least 5 s apart, with the
 * honest PretoscopBot identity, from the vantage point where the command runs. Run it from the
 * production IP and from a Romanian IP before a shop is classified as blocked; the outcome goes
 * into the shop's `probes:` list in the registry YAML.
 *
 * Off by default like everything that touches a shop: env CRAWL_ENABLED, the flags `crawl.enabled`
 * and `shops.probe.enabled`, eMAG's ADR-013 flag. A shop that asked us to stop or said no is never
 * probed (status `paused` or `removed`, every source kill-switched, the latest outreach declined),
 * nor one read only through its feed; once egress IPs are published, only from one of them.
 * robots.txt, domain pauses, allowed hours and daily budgets apply.
 */

export const PROBE_FLAG = 'shops.probe.enabled';
/** Network requests per probe, robots.txt and redirect hops included. */
export const PROBE_MAX_REQUESTS = 3;
/** Minimum time between the starts of two probe requests, whatever the host. */
export const PROBE_MIN_GAP_MS = 5000;

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

export interface ProbeGates {
  /** env CRAWL_ENABLED */
  crawlEnv: boolean;
  /** flag `crawl.enabled` */
  crawlFlag: boolean;
  /** flag `shops.probe.enabled` */
  probeFlag: boolean;
  /** flag `source.emag.enabled` (ADR-013) */
  emagFlag: boolean;
}

/** What the shop told us, from the database. */
export interface ProbeShopState {
  slug: string;
  status: string;
  accessMode: string;
  /** The shop has sources and every one of them is kill-switched (how a stop request is recorded). */
  allSourcesKilled: boolean;
  /** The latest outreach entry for the shop is a refusal. */
  declined: boolean;
}

/** BOT_EGRESS_IPS is published, and whether the operator confirmed the probe runs from one of them. */
export interface ProbeEgress {
  published: boolean;
  confirmed: boolean;
}

/**
 * Why a shop must not be probed now, or null. The probe exists to re-test blocked shops, so a
 * `blocked` status or `access_mode: off` is no reason to refuse. A shop that asked us to stop
 * (the runbooks record it as status `paused` with every source killed, or `removed`), that
 * declined our request, or that we read only through its feed is; so is a probe from an address
 * the bot page does not list, once the list is published (/bot says other addresses are not ours).
 */
export function probeRefusal(shop: ProbeShopState, gates: ProbeGates, egress: ProbeEgress = { published: false, confirmed: false }): string | null {
  if (!gates.crawlEnv) return 'env CRAWL_ENABLED is false (no request to any shop)';
  if (!gates.crawlFlag) return 'flag crawl.enabled is off';
  if (!gates.probeFlag) return `flag ${PROBE_FLAG} is off (a founder switches it on in /admin/flaguri for a probe session)`;
  if (shop.status === 'removed') return 'the shop is removed from Pretoscop (stop request or out of scope): never probed';
  if (shop.status === 'paused') return 'the shop is paused (a stop request or our own pause): not probed until it is active or blocked again';
  if (shop.allSourcesKilled) return 'every source of the shop is kill-switched (how a stop request is recorded): not probed';
  if (shop.declined) return 'the shop declined our request (latest entry in /admin/contactari): not probed';
  if (shop.accessMode === 'feed_only') return 'the shop is read only through its feed (access_mode feed_only): its pages are never requested';
  if (shop.slug === 'emag' && !gates.emagFlag) return 'eMAG requests need the flag source.emag.enabled (ADR-013)';
  if (egress.published && !egress.confirmed) {
    return 'BOT_EGRESS_IPS is published: probe only from one of those addresses, and confirm it with --from-published-ip';
  }
  return null;
}

/**
 * Public pages to probe: the home page, then one registry page (a listing, sitemap or product
 * source that is not kill-switched), preferring one on the home page's host so robots.txt is read
 * once; never the shop's internal search. `extraUrl` replaces the registry page.
 */
export function probeTargets(
  shop: ShopConfig,
  extraUrl?: string,
  killedSourceKeys: ReadonlySet<string> = new Set(),
): Array<{ url: string; purpose: 'probe' | 'listing' | 'sitemap' | 'product' }> {
  const targets: Array<{ url: string; purpose: 'probe' | 'listing' | 'sitemap' | 'product' }> = [{ url: shop.website_url, purpose: 'probe' }];
  if (extraUrl) {
    targets.push({ url: extraUrl, purpose: 'probe' });
    return targets;
  }
  const homeHost = new URL(shop.website_url).host;
  const candidates = shop.sources.filter((s) => (s.kind === 'listing' || s.kind === 'sitemap' || s.kind === 'product_page') && !killedSourceKeys.has(s.key));
  const src = candidates.find((s) => new URL(s.url).host === homeHost) ?? candidates[0];
  if (src && src.url !== shop.website_url) {
    targets.push({ url: src.url, purpose: src.kind === 'product_page' ? 'product' : src.kind === 'sitemap' ? 'sitemap' : 'listing' });
  }
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
