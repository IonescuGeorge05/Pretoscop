import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAgent } from 'undici';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import type { RawOffer } from '@pretoscop/core';
import { setFlag, sql } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { createFetcher } from '@pretoscop/fetch';
import { PgDomainStateStore } from '../src/fetch/pg-state';
import { createPolicyResolver } from '../src/fetch/policy';
import { CANARY_FLAG, evaluateDrift, fieldStats, isoWeekKey, runExtractorCanary, selectCanaryTargets } from '../src/ops/canary';
import type { FetchLike } from '../src/recorder/types';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/', import.meta.url));
const fixture = (p: string) => readFileSync(FIX + p, 'utf8');
const LISTING_URL = 'https://www.emag.ro/telefoane-mobile/c';
const PRODUCT_URL = 'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/';

const raw = (over: Partial<RawOffer> = {}): RawOffer => ({
  shopSlug: 'm',
  externalId: 'A1',
  url: 'https://www.magazin.ro/p/a1',
  title: 'Telefon Samsung Galaxy S26 FE 128GB',
  price: '2.199,99 lei',
  priceFormat: 'ro',
  observedAt: '2026-10-28T10:00:00Z',
  raw: {},
  ...over,
});

describe('field rules', () => {
  it('counts presence and unusable values per field', () => {
    const s = fieldStats(
      [
        raw({ gtin: '4006381333931', availability: 'InStock', brand: 'Samsung' }),
        raw({ externalId: 'A2', price: 'la cerere', gtin: '4006381333932', url: 'https://alt-magazin.ro/p/a2', title: '<b>x</b>' }),
      ],
      'magazin.ro',
    );
    expect(s.offers).toBe(2);
    expect(s.present).toMatchObject({ externalId: 2, url: 2, title: 2, price: 2, gtin: 2, availability: 1, brand: 1 });
    expect(s.invalid).toEqual({ price: 1, gtin: 1, url: 1, title: 1 });
  });

  it('flags missing or unusable core fields on the first run, and disappearing fields against last week', () => {
    const now = { offers: 10, present: { externalId: 10, url: 10, title: 10, price: 9, brand: 2, gtin: 10 }, invalid: { gtin: 6 } };
    expect(evaluateDrift(now, null)).toEqual(['price: present in 9/10 offers']);
    const lastWeek = { offers: 20, present: { externalId: 20, url: 20, title: 20, price: 20, brand: 19, gtin: 20 }, invalid: { gtin: 0 } };
    expect(evaluateDrift(now, lastWeek)).toEqual([
      'price: present in 9/10 offers',
      'gtin: 60% of values unusable (last week 0%)',
      'brand: present in 20% of offers (last week 95%)',
    ]);
    expect(evaluateDrift({ offers: 0, present: {}, invalid: {} }, lastWeek)).toEqual([]);
  });

  it('keys runs by ISO week in Bucharest', () => {
    expect(isoWeekKey('2026-10-28')).toBe('2026-W44');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
  });
});

let t: TestDatabase;
let pages: Record<string, string | 'blocked'>;
const requested: string[] = [];
const fetcher: FetchLike = {
  async fetchPolite(url) {
    requested.push(url);
    const body = pages[url];
    if (body === 'blocked') return { status: 403, ok: false, blocked: true, blockReason: 'http_403', body: null, finalUrl: url, channel: 'direct' };
    return body
      ? { status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' }
      : { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};
const alert = vi.fn(async () => undefined);
const env = { ...getEnv({}), CRAWL_ENABLED: true };
const log = createLogger('test', { level: 'silent' });
const deps = () => ({ db: t.db, env, fetcher, alert, log, now: () => new Date('2026-10-28T03:30:00Z') });

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    INSERT INTO shops (slug, name, domain, website_url, status, access_mode) VALUES
      ('canary-emag', 'Canary eMAG', 'emag.ro', 'https://www.emag.ro', 'active', 'direct'),
      ('asistat', 'Asistat', 'asistat.ro', 'https://www.asistat.ro', 'active', 'assisted'),
      ('oprit', 'Oprit', 'oprit.ro', 'https://www.oprit.ro', 'active', 'direct')`);
  await t.db.execute(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, kill_switch)
    SELECT id, 'canary-emag:listing:telefoane', 'listing', ${LISTING_URL}, 'emag-listing', true, false FROM shops WHERE slug = 'canary-emag'
    UNION ALL SELECT id, 'canary-emag:product', 'product_page', 'https://www.emag.ro/', 'emag-product', true, false FROM shops WHERE slug = 'canary-emag'
    UNION ALL SELECT id, 'asistat:listing', 'listing', 'https://www.asistat.ro/c', 'jsonld-product', true, false FROM shops WHERE slug = 'asistat'
    UNION ALL SELECT id, 'oprit:listing', 'listing', 'https://www.oprit.ro/c', 'jsonld-product', true, true FROM shops WHERE slug = 'oprit'`);
  await t.db.execute(sql`
    INSERT INTO crawl_urls (shop_id, url, kind, last_status, last_fetched_at)
    SELECT id, ${PRODUCT_URL}, 'product', 200, now() FROM shops WHERE slug = 'canary-emag'
    UNION ALL SELECT id, 'https://www.emag.ro/disparut/pd/X/', 'product', 404, now() FROM shops WHERE slug = 'canary-emag'`);
  await setFlag(t.db, 'crawl.enabled', true);
}, 180_000);

afterAll(async () => {
  await t?.drop();
}, 120_000);

beforeEach(() => {
  alert.mockClear();
  requested.length = 0;
  pages = { [LISTING_URL]: fixture('emag/listing_2026-10-27.html'), [PRODUCT_URL]: fixture('emag/product_2026-10-27.html') };
});

describe('extractor canary', () => {
  it('does nothing while its flag is off', async () => {
    await setFlag(t.db, CANARY_FLAG, false);
    expect(await runExtractorCanary(deps())).toMatchObject({ ran: false, reason: `flag ${CANARY_FLAG} is off` });
    expect(requested).toEqual([]);
  });

  it('picks listing pages and product pages that answered 200, only for active, directly crawled, unkilled sources', async () => {
    const shops = await selectCanaryTargets(t.db);
    expect(shops.map((s) => s.shop.slug)).toEqual(['canary-emag']);
    expect(shops[0]!.targets.map((x) => [x.purpose, x.parserKey, x.url])).toEqual([
      ['listing', 'emag-listing', LISTING_URL],
      ['product', 'emag-product', PRODUCT_URL],
    ]);
  });

  it('records healthy pages without alerting, and is idempotent within the week', async () => {
    await setFlag(t.db, CANARY_FLAG, true);
    const first = await runExtractorCanary(deps(), { runKey: '2026-W43' });
    expect(first).toMatchObject({ ran: true, shops: 1, checked: 2, ok: 2, drift: 0, failed: 0, alerts: 0 });
    expect(requested).toEqual([LISTING_URL, PRODUCT_URL]);
    const rows = (await t.db.execute<{ purpose: string; status: string; offers: number }>(sql`SELECT purpose, status, offers FROM extractor_canaries WHERE run_key = '2026-W43' ORDER BY id`)).rows;
    expect(rows).toEqual([
      { purpose: 'listing', status: 'ok', offers: 60 },
      { purpose: 'product', status: 'ok', offers: 9 },
    ]);
    requested.length = 0;
    expect(await runExtractorCanary(deps(), { runKey: '2026-W43' })).toMatchObject({ checked: 0, ok: 2, alerts: 0 });
    expect(requested).toEqual([]);
  });

  it('alerts once when a page stops yielding offers or a field disappears compared with last week', async () => {
    await setFlag(t.db, CANARY_FLAG, true);
    // Last week (the run just before this one) every listing offer had a brand; this week's real page has none.
    await t.db.execute(sql`
      INSERT INTO extractor_canaries (run_key, shop_id, url, parser_key, purpose, status, offers, fields)
      SELECT '2026-W49', id, ${LISTING_URL}, 'emag-listing', 'listing', 'ok', 60,
             '{"offers":60,"present":{"externalId":60,"url":60,"title":60,"price":60,"brand":60},"invalid":{}}'::jsonb
        FROM shops WHERE slug = 'canary-emag'`);
    pages[PRODUCT_URL] = '<!doctype html><html><body><main>Pagina a fost reproiectată</main></body></html>';
    const summary = await runExtractorCanary(deps(), { runKey: '2026-W50' });
    expect(summary).toMatchObject({ checked: 2, alerts: 2, drift: 2 });
    expect(alert).toHaveBeenCalledWith('Extractor drift: canary-emag (emag-listing)', expect.objectContaining({ issues: ['brand: present in 0% of offers (last week 100%)'] }));
    expect(alert).toHaveBeenCalledWith(
      'Extractor drift: canary-emag (emag-product)',
      expect.objectContaining({ issues: [`${PRODUCT_URL}: no offers parsed (layout change?)`] }),
    );
    alert.mockClear();
    await runExtractorCanary(deps(), { runKey: '2026-W50' });
    expect(alert).not.toHaveBeenCalled();
  });

  it('records a block and stops asking the shop', async () => {
    await setFlag(t.db, CANARY_FLAG, true);
    pages[LISTING_URL] = 'blocked';
    const summary = await runExtractorCanary(deps(), { runKey: '2026-W51' });
    expect(summary).toMatchObject({ checked: 1, failed: 1, alerts: 1 });
    expect(alert).toHaveBeenCalledWith('Extractor canary blocked: canary-emag', expect.objectContaining({ url: LISTING_URL, status: 403 }));
    expect(requested).toEqual([LISTING_URL]);
    const row = (await t.db.execute<{ status: string; detail: string; http_status: number }>(sql`SELECT status, detail, http_status FROM extractor_canaries WHERE run_key = '2026-W51'`)).rows[0];
    expect(row).toEqual({ status: 'fetch_failed', detail: 'blocked: http_403', http_status: 403 });
  });

  it('respects the shop gates (crawl.enabled off: nothing fetched)', async () => {
    await setFlag(t.db, CANARY_FLAG, true);
    await setFlag(t.db, 'crawl.enabled', false);
    const summary = await runExtractorCanary(deps(), { runKey: '2026-W52' });
    await setFlag(t.db, 'crawl.enabled', true);
    expect(summary).toMatchObject({ ran: true, shops: 0, checked: 0 });
    expect(requested).toEqual([]);
  });
});

describe('extractor canary through the real polite fetcher (no network: undici MockAgent)', () => {
  let agent: MockAgent;
  let sent: Array<{ url: string; ua: string }>;
  const realDeps = () => {
    const fetcher = createFetcher({
      dispatcher: agent,
      stateStore: new PgDomainStateStore(t.db),
      policyFor: createPolicyResolver(t.db, 0),
      crawlEnabled: true,
      retry: { maxRetries: 0 },
      sleep: async () => undefined,
      signer: null,
    });
    return { db: t.db, env, fetcher, alert, log, now: () => new Date('2026-10-28T03:30:00Z') };
  };
  const answer = (body: string) => (o: { origin?: unknown; path: string; headers?: unknown }) => {
    sent.push({ url: `https://www.emag.ro${o.path}`, ua: String((o.headers as Record<string, string>)['user-agent'] ?? '') });
    return body;
  };

  beforeEach(async () => {
    sent = [];
    agent = new MockAgent();
    agent.disableNetConnect();
    await setFlag(t.db, CANARY_FLAG, true);
    await t.db.execute(sql`DELETE FROM fetch_domain_state`);
    await t.db.execute(sql`DELETE FROM fetch_robots_cache`);
    await t.db.execute(sql`DELETE FROM fetch_domain_daily`);
  });

  afterEach(async () => {
    await agent.close();
  });

  it('reads robots.txt first, identifies itself as PretoscopBot and parses the live pages', async () => {
    const shop = agent.get('https://www.emag.ro');
    shop.intercept({ path: '/robots.txt' }).reply(200, answer(fixture('emag/robots_2026-10-27.txt')), { headers: { 'content-type': 'text/plain' } });
    shop.intercept({ path: new URL(LISTING_URL).pathname }).reply(200, answer(fixture('emag/listing_2026-10-27.html')), { headers: { 'content-type': 'text/html' } });
    shop.intercept({ path: new URL(PRODUCT_URL).pathname }).reply(200, answer(fixture('emag/product_2026-10-27.html')), { headers: { 'content-type': 'text/html' } });

    const summary = await runExtractorCanary(realDeps(), { runKey: 'real-1' });
    expect(summary).toMatchObject({ ran: true, shops: 1, checked: 2, ok: 2, failed: 0 });
    expect(sent.map((s) => s.url)).toEqual(['https://www.emag.ro/robots.txt', LISTING_URL, PRODUCT_URL]);
    for (const s of sent) expect(s.ua).toMatch(/^Mozilla\/5\.0 \(compatible; PretoscopBot\/1\.0; \+https:\/\//);
  });

  it('stops at a block and leaves the host paused for every other job', async () => {
    const shop = agent.get('https://www.emag.ro');
    shop.intercept({ path: '/robots.txt' }).reply(200, answer(fixture('emag/robots_2026-10-27.txt')), { headers: { 'content-type': 'text/plain' } });
    shop.intercept({ path: new URL(LISTING_URL).pathname }).reply(403, answer('<html><body>Access denied</body></html>'), { headers: { 'content-type': 'text/html' } });

    const summary = await runExtractorCanary(realDeps(), { runKey: 'real-2' });
    expect(summary).toMatchObject({ checked: 1, failed: 1 });
    expect(sent.map((s) => s.url)).toEqual(['https://www.emag.ro/robots.txt', LISTING_URL]);
    const pause = (await t.db.execute<{ paused: boolean }>(sql`SELECT paused_until > now() AS paused FROM fetch_domain_state WHERE host = 'www.emag.ro'`)).rows[0];
    expect(pause?.paused).toBe(true);

    // Next week, while the pause lasts: nothing is sent at all.
    sent.length = 0;
    expect(await runExtractorCanary(realDeps(), { runKey: 'real-3' })).toMatchObject({ checked: 1, skipped: 1 });
    expect(sent).toEqual([]);
  });

  it('sends nothing while CRAWL_ENABLED is false, even with its flag on', async () => {
    const summary = await runExtractorCanary({ ...realDeps(), env: { ...env, CRAWL_ENABLED: false } }, { runKey: 'real-4' });
    expect(summary).toMatchObject({ ran: true, shops: 0, checked: 0 });
    expect(sent).toEqual([]);
  });
});
