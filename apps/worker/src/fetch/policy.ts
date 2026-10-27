import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import { type Db, isFlagEnabled, sql } from '@pretoscop/db';

type ShopRow = {
  slug: string;
  domain: string;
  status: string;
  access_mode: string;
  crawl_policy: {
    min_interval_ms?: number;
    allowed_hours?: { start: string; end: string } | null;
    max_pages_per_day?: number | null;
    respect_crawl_delay?: boolean;
    assisted_render?: boolean;
  };
  live_sources: number;
};

/**
 * `policyFor(host)` for the fetch layer (M02 contract), from the database registry: the shop's crawl
 * policy, and `accessMode: 'off'` whenever a switch says stop (shop not active, access off, every
 * source killed, flag `crawl.enabled` off, eMAG's ADR-013 flag off). Unknown hosts (BNR, feeds on
 * network domains) get the default 5 s policy. Cached for 30 s.
 */
export function createPolicyResolver(db: Db, ttlMs = 30_000) {
  let cache: { at: number; shops: ShopRow[]; crawl: boolean; emag: boolean } | null = null;

  async function load() {
    if (cache && Date.now() - cache.at < ttlMs) return cache;
    const res = await db.execute<ShopRow>(sql`
      SELECT s.slug, s.domain, s.status, s.access_mode, s.crawl_policy,
        (SELECT count(*) FROM shop_sources x WHERE x.shop_id = s.id AND x.enabled AND NOT x.kill_switch)::int AS live_sources
      FROM shops s
    `);
    cache = { at: Date.now(), shops: res.rows, crawl: await isFlagEnabled(db, 'crawl.enabled'), emag: await isFlagEnabled(db, 'source.emag.enabled') };
    return cache;
  }

  return async function policyFor(host: string): Promise<DomainPolicy> {
    const c = await load();
    const h = host.toLowerCase();
    const shop = c.shops.find((s) => h === s.domain || h.endsWith(`.${s.domain}`));
    if (!shop) return defaultDomainPolicy(h, { accessMode: c.crawl ? 'direct' : 'off' });
    const p = shop.crawl_policy ?? {};
    const closed = !c.crawl || shop.status !== 'active' || shop.access_mode === 'off' || shop.live_sources === 0 || (shop.slug === 'emag' && !c.emag);
    return defaultDomainPolicy(h, {
      shopSlug: shop.slug,
      accessMode: closed ? 'off' : (shop.access_mode as DomainPolicy['accessMode']),
      minIntervalMs: Math.max(5000, p.min_interval_ms ?? 5000),
      allowedHours: p.allowed_hours ?? null,
      maxPagesPerDay: p.max_pages_per_day ?? null,
      respectCrawlDelay: p.respect_crawl_delay ?? true,
      assistedRender: p.assisted_render ?? false,
    });
  };
}
