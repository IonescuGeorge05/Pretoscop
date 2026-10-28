import { describe, expect, it } from 'vitest';
import { isKnownParserKey } from '@pretoscop/extractors';
import { getDomainPolicy, loadShops, parseShopYaml, ShopRegistryError } from '../src/shops/index';

const shops = loadShops();

describe('shop registry', () => {
  it('loads every YAML file', () => {
    expect(shops.length).toBeGreaterThanOrEqual(28);
    expect(shops.map((s) => s.slug)).toEqual(expect.arrayContaining(['emag', 'itgalaxy', 'altex', 'pcgarage', 'olx']));
  });

  it('every source names a parser that exists in the extractors registry', () => {
    const missing = shops.flatMap((s) => s.sources).filter((src) => !isKnownParserKey(src.parser_key));
    expect(missing.map((m) => `${m.key} → ${m.parser_key}`)).toEqual([]);
  });

  it('sitemap sources name a product-page parser that exists too', () => {
    const bad = shops
      .flatMap((s) => s.sources)
      .filter((src) => src.kind === 'sitemap')
      .map((src) => ({ key: src.key, parser: src.config.productParser }))
      .filter((x) => x.parser !== undefined && !(typeof x.parser === 'string' && isKnownParserKey(x.parser)));
    expect(bad).toEqual([]);
  });

  it('enabled listing sources bound their pagination and state a freshness SLO (M10)', () => {
    const listings = shops.flatMap((s) => s.sources.filter((x) => x.kind === 'listing' && x.enabled).map((x) => ({ shop: s, src: x })));
    for (const { shop, src } of listings) {
      expect(typeof src.config.max_pages, src.key).toBe('number');
      expect(src.freshness_slo_hours ?? shop.crawl_policy.freshness_slo_hours, src.key).toBeLessThanOrEqual(26);
    }
    // Worst case of one day's listing runs stays within each shop's daily request budget.
    for (const s of shops.filter((x) => x.sources.some((y) => y.kind === 'listing' && y.enabled))) {
      const pages = s.sources.filter((y) => y.kind === 'listing' && y.enabled).reduce((a, y) => a + Number(y.config.max_pages), 0);
      expect(pages, s.slug).toBeLessThanOrEqual(s.crawl_policy.max_pages_per_day ?? Infinity);
    }
  });

  it('M10 permissive shops have listing sources; their superseded sitemap sweeps are off', () => {
    const enabledListings = (slug: string) => shops.find((s) => s.slug === slug)!.sources.filter((x) => x.kind === 'listing' && x.enabled);
    for (const slug of ['itgalaxy', 'forit', 'dedeman', 'carrefour', 'auchan', 'bonami']) expect(enabledListings(slug).length, slug).toBeGreaterThan(0);
    for (const key of ['itgalaxy:sitemap:produse', 'forit:sitemap:produse', 'dedeman:sitemap:produse']) {
      expect(shops.flatMap((s) => s.sources).find((x) => x.key === key)?.enabled, key).toBe(false);
    }
    expect(shops.find((s) => s.slug === 'flip')!.sources[0]!.config.productParser).toBe('flip-product');
  });

  it('blocked placeholders never have an enabled source', () => {
    for (const s of shops.filter((x) => x.status !== 'active')) {
      expect(s.sources.filter((x) => x.enabled), s.slug).toEqual([]);
    }
  });

  it('every crawled shop keeps the politeness floor (≥5 s, concurrency 1)', () => {
    for (const s of shops) {
      expect(s.crawl_policy.min_interval_ms, s.slug).toBeGreaterThanOrEqual(5000);
      expect(s.crawl_policy.max_concurrency).toBe(1);
    }
  });

  it('eMAG is isolated and carries its legal basis (ADR-013)', () => {
    const emag = shops.find((s) => s.slug === 'emag')!;
    expect(emag.legal.basis_ref).toMatch(/ADR-013/);
    expect(emag.affiliate?.comparator_policy).toBe('forbidden');
    expect(emag.sources.filter((s) => s.kind === 'listing').length).toBeGreaterThanOrEqual(30);
  });

  it('domain policy resolves hosts to shops, unknown hosts get the default', () => {
    expect(getDomainPolicy('www.emag.ro', shops)).toMatchObject({ shopSlug: 'emag', minIntervalMs: 5000, maxConcurrency: 1, accessMode: 'direct', maxPagesPerDay: 3500 });
    expect(getDomainPolicy('flip.ro', shops)).toMatchObject({ shopSlug: 'flip' });
    expect(getDomainPolicy('www.altex.ro', shops)).toMatchObject({ shopSlug: 'altex', accessMode: 'off' });
    const unknown = getDomainPolicy('unknown.example', shops);
    expect(unknown.shopSlug).toBeUndefined();
    expect(unknown).toMatchObject({ minIntervalMs: 5000, accessMode: 'direct' });
  });
});

describe('validation errors are readable', () => {
  const base = `slug: demo
name: Demo
domain: demo.ro
website_url: https://www.demo.ro
status: active
access_mode: direct
legal: {}
sources:
  - key: demo:listing:x
    kind: listing
    url: https://www.demo.ro/x
    parser_key: jsonld-product
    schedule: "0 3 * * *"
`;

  it('accepts a minimal valid shop with defaults', () => {
    const s = parseShopYaml(base, 'demo.yaml');
    expect(s.crawl_policy).toMatchObject({ min_interval_ms: 5000, max_concurrency: 1, allowed_hours: null });
    expect(s.sources[0]).toMatchObject({ enabled: false, kill_switch: false, source_tier: 1 });
  });

  it.each([
    [base.replace('schedule: "0 3 * * *"', 'schedule: "every day"'), /sources\.0\.schedule: invalid cron/],
    [base.replace('kind: listing', 'kind: scrape'), /sources\.0\.kind/],
    [base.replace('key: demo:listing:x', 'key: other:listing:x'), /must start with "demo:"/],
    [base.replace('access_mode: direct', 'access_mode: stealth'), /access_mode/],
    [base.replace('legal: {}', 'legal: {}\ncrawl_policy:\n  min_interval_ms: 200'), /crawl_policy\.min_interval_ms/],
    [base.replace('legal: {}', 'legal: {}\ncrawl_policy:\n  max_concurrency: 4'), /crawl_policy\.max_concurrency/],
    [base + 'unexpected: 1\n', /Unrecognized key|unexpected/],
    ['slug: [unclosed', /YAML syntax error/],
  ])('rejects invalid input #%#', (yaml, message) => {
    expect(() => parseShopYaml(yaml, 'demo.yaml')).toThrow(ShopRegistryError);
    expect(() => parseShopYaml(yaml, 'demo.yaml')).toThrow(message);
  });

  it('requires a legal basis for assisted access (ADR-015)', () => {
    expect(() => parseShopYaml(base.replace('access_mode: direct', 'access_mode: assisted'), 'demo.yaml')).toThrow(/legal\.basis_ref/);
  });

  it('refuses enabled sources on a blocked shop', () => {
    expect(() =>
      parseShopYaml(base.replace('status: active', 'status: blocked').replace('schedule: "0 3 * * *"', 'schedule: "0 3 * * *"\n    enabled: true'), 'demo.yaml'),
    ).toThrow(/shop status is blocked/);
  });
});
