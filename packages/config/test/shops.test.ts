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
