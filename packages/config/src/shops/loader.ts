import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { type DomainPolicy, defaultDomainPolicy } from '../policy';
import { ShopSchema, type ShopConfig } from './schema';

export const SHOPS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shops');

export class ShopRegistryError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Shop registry is invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ShopRegistryError';
  }
}

/** Parses and validates one shop YAML document; `file` is used in error messages. */
export function parseShopYaml(text: string, file = 'shop.yaml'): ShopConfig {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new ShopRegistryError([`${file}: YAML syntax error: ${(err as Error).message.split('\n')[0]}`]);
  }
  const res = ShopSchema.safeParse(doc);
  if (!res.success) {
    throw new ShopRegistryError(
      res.error.issues.map((i) => `${file}: ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
    );
  }
  const expected = basename(file).replace(/\.ya?ml$/, '');
  if (file.endsWith('.yaml') && res.data.slug !== expected) {
    throw new ShopRegistryError([`${file}: slug "${res.data.slug}" must match the file name "${expected}"`]);
  }
  return res.data;
}

/** Loads every `*.yaml` in the registry directory, sorted by slug. Throws with all problems at once. */
export function loadShops(dir: string = SHOPS_DIR): ShopConfig[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  const shops: ShopConfig[] = [];
  const problems: string[] = [];
  for (const f of files) {
    try {
      shops.push(parseShopYaml(readFileSync(join(dir, f), 'utf8'), f));
    } catch (err) {
      if (err instanceof ShopRegistryError) problems.push(...err.problems);
      else throw err;
    }
  }
  const seenKeys = new Map<string, string>();
  const seenDomains = new Map<string, string>();
  for (const s of shops) {
    const d = seenDomains.get(s.domain);
    if (d) problems.push(`${s.slug}.yaml: domain ${s.domain} already used by ${d}`);
    seenDomains.set(s.domain, s.slug);
    for (const src of s.sources) {
      const other = seenKeys.get(src.key);
      if (other) problems.push(`${s.slug}.yaml: source key ${src.key} also in ${other}`);
      seenKeys.set(src.key, s.slug);
    }
  }
  if (problems.length > 0) throw new ShopRegistryError(problems);
  return shops.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function shopHosts(shop: ShopConfig): string[] {
  return (shop.hosts ?? [`www.${shop.domain}`, shop.domain]).map((h) => h.toLowerCase());
}

/** The shop owning `host` (exact host, listed host, or a subdomain of the shop's domain). */
export function shopForHost(shops: ShopConfig[], host: string): ShopConfig | undefined {
  const h = host.toLowerCase();
  return (
    shops.find((s) => shopHosts(s).includes(h)) ??
    shops.find((s) => h === s.domain || h.endsWith(`.${s.domain}`))
  );
}

/** Crawl policy for a host; unknown hosts get the default (5 s, concurrency 1). */
export function getDomainPolicy(host: string, shops: ShopConfig[] = loadShops()): DomainPolicy {
  const shop = shopForHost(shops, host);
  if (!shop) return defaultDomainPolicy(host);
  const p = shop.crawl_policy;
  return defaultDomainPolicy(host, {
    shopSlug: shop.slug,
    accessMode: shop.access_mode,
    minIntervalMs: p.min_interval_ms,
    allowedHours: p.allowed_hours,
    maxPagesPerDay: p.max_pages_per_day,
    respectCrawlDelay: p.respect_crawl_delay,
    assistedRender: p.assisted_render,
  });
}
