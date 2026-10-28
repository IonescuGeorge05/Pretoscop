import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, setFlag } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { createFetcher, createGuardedDispatcher } from '@pretoscop/fetch';
import { MemoryAssistedLedger } from '@pretoscop/fetch/assisted';
import { FsBlobStore } from '@pretoscop/storage';
import { createAssistedChannelFromEnv } from '../src/fetch/assisted';
import { PgAssistedLedger } from '../src/fetch/assisted-ledger';
import { createPolicyResolver } from '../src/fetch/policy';
import { PgDomainStateStore } from '../src/fetch/pg-state';
import { PgRequestLogSink } from '../src/fetch/request-log';
import { assistedMetricFamilies, assistedSloAlerts, autoPauseAssistedShops, bucharestDayOf } from '../src/ops/assisted';
import { renderMetrics } from '../src/ops/prometheus';
import { checkGates } from '../src/recorder/gates';
import { runSource } from '../src/recorder/run-source';
import { syncShops } from '../src/registry/sync';
import { createMerchantFetcher, createNormalize } from '../src/services';

// M05B end to end: a designated shop switched to access_mode=assisted, read through the Zyte
// client against a local mock of the Zyte API (no live vendor call), with the real fetch layer,
// the PostgreSQL state store, request log and cost ledger, and the real recorder pipeline.

const FIXTURE = readFileSync(fileURLToPath(new URL('../../../packages/extractors/fixtures/itgalaxy/product_2026-10-27.html', import.meta.url)));
const LISTING_URL = 'https://altex.ro/televizoare/cpl/';
// cel.ro's bot check with decoy products, as the vendor would relay it (reconstructed from the research notes).
const CELCAPTCHA = readFileSync(fileURLToPath(new URL('../../../packages/fetch/test/fixtures/blocks/cel_celcaptcha_decoy_from-research-notes.html', import.meta.url)));
const CEL_URL = 'https://www.cel.ro/placi-video/';

let t: TestDatabase;
let api: Server;
let apiUrl = '';
const vendorCalls: { url: string; body: Record<string, unknown> }[] = [];
let blobRoot = '';
const log = createLogger('test', { level: 'silent' });

function zyteAnswer(url: string): { status: number; body: unknown } {
  if (url.endsWith('/robots.txt')) {
    return { status: 200, body: { url, statusCode: 200, httpResponseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], httpResponseBody: Buffer.from('User-agent: *\nDisallow: /cos\n').toString('base64') } };
  }
  if (url === LISTING_URL) {
    return { status: 200, body: { url, statusCode: 200, httpResponseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], httpResponseBody: FIXTURE.toString('base64') } };
  }
  if (url === CEL_URL) {
    return { status: 200, body: { url, statusCode: 200, httpResponseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], httpResponseBody: CELCAPTCHA.toString('base64') } };
  }
  return { status: 520, body: { type: '/download/temporary-error', title: 'Temporary Download Error', status: 520 } };
}

async function shopId(slug: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = ${slug}`);
  return Number(r.rows[0]!.id);
}

function testEnv(overrides: Record<string, unknown> = {}) {
  return { ...getEnv({}), CRAWL_ENABLED: true, ASSISTED_VENDOR: 'zyte' as const, ZYTE_API_KEY: 'test-key', ZYTE_API_URL: apiUrl, ...overrides };
}

const sinks: PgRequestLogSink[] = [];

function deps(env: ReturnType<typeof testEnv>) {
  const { channel } = createAssistedChannelFromEnv(env, t.db, log);
  const requestLog = new PgRequestLogSink(t.db, log, 1000, 60_000);
  sinks.push(requestLog);
  const fetcher = createFetcher({
    policyFor: createPolicyResolver(t.db, 0),
    stateStore: new PgDomainStateStore(t.db),
    requestLog,
    ...(channel ? { assisted: channel } : {}),
    crawlEnabled: true,
    sleep: async () => undefined, // the interval itself is proven in packages/fetch (fake clock)
    logger: log,
  });
  return { db: t.db, env, log, blob: new FsBlobStore(blobRoot), fetcher, normalize: createNormalize(() => null), alert: async () => undefined };
}

let sourceId = 0;

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-m05b-'));
  api = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const body = JSON.parse(raw) as { url: string };
      vendorCalls.push({ url: body.url, body: body as unknown as Record<string, unknown> });
      const a = zyteAnswer(body.url);
      res.writeHead(a.status, { 'content-type': 'application/json' }).end(JSON.stringify(a.body));
    });
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}/v1/extract`;

  await syncShops(t.db);
  await setFlag(t.db, 'crawl.enabled', true);
  const altex = await shopId('altex');
  // What the founders' YAML change would do (access_mode: assisted, legal basis, active, a source).
  await t.db.execute(sql`
    UPDATE shops SET status = 'active', access_mode = 'assisted', legal_basis_ref = 'infra/legal/2026-10-27-opinion.pdf',
      crawl_policy = crawl_policy || '{"assisted_tier": 3}'::jsonb WHERE id = ${altex}`);
  const src = await t.db.execute<{ id: string }>(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, config)
    VALUES (${altex}, 'altex:listing:televizoare', 'listing', ${LISTING_URL}, 'jsonld-product', true, '{"max_pages": 1}'::jsonb)
    RETURNING id::text`);
  sourceId = Number(src.rows[0]!.id);
});

afterAll(async () => {
  api?.close();
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
});

describe('assisted shop: gates', () => {
  it('stays off without the flag, without a vendor, and for shops not designated', async () => {
    const shop = { slug: 'altex', status: 'active', accessMode: 'assisted' };
    const source = { enabled: true, killSwitch: false };
    expect(await checkGates(t.db, testEnv(), { shop, source })).toMatchObject({ ok: false, reason: expect.stringMatching(/assisted\.enabled/) });
    await setFlag(t.db, 'assisted.enabled', true);
    expect(await checkGates(t.db, testEnv({ ASSISTED_VENDOR: 'none' }), { shop, source })).toMatchObject({ ok: false, reason: expect.stringMatching(/no assisted-access vendor/) });
    expect(await checkGates(t.db, testEnv(), { shop: { ...shop, slug: 'dedeman' }, source })).toMatchObject({ ok: false, reason: expect.stringMatching(/not designated/) });
    expect(await checkGates(t.db, testEnv(), { shop: { ...shop, slug: 'emag' }, source })).toMatchObject({ ok: false, reason: expect.stringMatching(/not designated/) });
    expect(await checkGates(t.db, testEnv(), { shop, source })).toEqual({ ok: true });
  });

  it('the fetch layer refuses a shop set to assisted that the founders did not designate', async () => {
    const dedeman = await shopId('dedeman');
    await t.db.execute(sql`UPDATE shops SET access_mode = 'assisted' WHERE id = ${dedeman}`);
    const policy = await createPolicyResolver(t.db, 0)('www.dedeman.ro');
    expect(policy.accessMode).toBe('off');
    await t.db.execute(sql`UPDATE shops SET access_mode = 'direct' WHERE id = ${dedeman}`);
    expect((await createPolicyResolver(t.db, 0)('altex.ro')).accessMode).toBe('assisted');
    // The flag closes every assisted shop at the fetch layer too, not only at the run gate.
    await setFlag(t.db, 'assisted.enabled', false);
    expect((await createPolicyResolver(t.db, 0)('altex.ro')).accessMode).toBe('off');
    await setFlag(t.db, 'assisted.enabled', true);
  });

  it('no vendor, no channel: ASSISTED_VENDOR=none (the default) or a vendor without its key', () => {
    expect(createAssistedChannelFromEnv(testEnv({ ASSISTED_VENDOR: 'none' }), t.db, log)).toEqual({ channel: null, reason: 'ASSISTED_VENDOR=none' });
    expect(createAssistedChannelFromEnv(testEnv({ ZYTE_API_KEY: undefined }), t.db, log).channel).toBeNull();
    expect(createAssistedChannelFromEnv(getEnv({}), t.db, log).channel).toBeNull();
  });
});

describe('assisted shop: a recorder run through the vendor', () => {
  it('records offers (source tier 1, channel assisted), the robots.txt read through the channel, and the cost', async () => {
    const r = await runSource(deps(testEnv()), sourceId, { trigger: 'manual' });
    expect(r.status).toBe('success');
    expect(r.stats.parsed).toBeGreaterThanOrEqual(1);
    expect(vendorCalls.map((c) => c.url)).toEqual(['https://altex.ro/robots.txt', LISTING_URL]);
    // We never send headers or IP types to the vendor.
    for (const c of vendorCalls) expect(Object.keys(c.body).sort()).toEqual(['followRedirect', 'httpResponseBody', 'httpResponseHeaders', 'url']);

    const run = await t.db.execute<{ channel: string }>(sql`SELECT channel FROM ingest_runs WHERE id = ${r.runId}`);
    expect(run.rows[0]!.channel).toBe('assisted');
    const offers = await t.db.execute<{ n: string; tiers: number[] }>(sql`
      SELECT count(*)::text n, array_agg(DISTINCT source_tier)::int[] tiers FROM offers WHERE source_id = ${sourceId}`);
    expect(Number(offers.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    expect(offers.rows[0]!.tiers).toEqual([1]);
    const ledger = await t.db.execute<{ vendor: string; requests: number; rendered_requests: number; successes: number; cost_cents: number }>(sql`
      SELECT vendor, requests, rendered_requests, successes, cost_cents FROM access_costs WHERE shop_id = ${await shopId('altex')}`);
    expect(ledger.rows).toEqual([{ vendor: 'zyte', requests: 2, rendered_requests: 0, successes: 2, cost_cents: 1 }]);
    for (const sink of sinks) await sink.flush();
    const logRows = await t.db.execute<{ channel: string; n: string }>(sql`
      SELECT channel, count(*)::text n FROM request_log WHERE shop_slug = 'altex' AND attempt > 0 GROUP BY channel`);
    expect(logRows.rows).toEqual([{ channel: 'assisted', n: '2' }]);
  });

  it('the kill switch of the shop stops it: no run, no vendor call, the ledger does not grow', async () => {
    const before = vendorCalls.length;
    await t.db.execute(sql`UPDATE shop_sources SET kill_switch = true WHERE shop_id = ${await shopId('altex')}`);
    const r = await runSource(deps(testEnv()), sourceId, { trigger: 'manual' });
    expect(r).toMatchObject({ status: 'gated', reason: expect.stringMatching(/kill switch/) });
    expect(vendorCalls.length).toBe(before);
    await t.db.execute(sql`UPDATE shop_sources SET kill_switch = false WHERE shop_id = ${await shopId('altex')}`);
  });

  it('at the monthly cap the run is gated, and the fetch layer refuses mid-run too', async () => {
    const before = vendorCalls.length;
    // The first run cost 1 cent; a cap of 1 cent is reached.
    const env = testEnv({ ASSISTED_MONTHLY_CAP_EUR: 0.01 });
    expect(await runSource(deps(env), sourceId, { trigger: 'manual' })).toMatchObject({ status: 'gated', reason: expect.stringMatching(/monthly cap/) });
    const fetcher = deps(env).fetcher;
    const res = await fetcher.fetchPolite(LISTING_URL, { purpose: 'listing', shopSlug: 'altex' });
    expect(res).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_cap', attempts: 0 });
    expect(vendorCalls.length).toBe(before);
  });

  it('the ledger arithmetic matches the shared formula (rendered tier, unbilled calls given back)', async () => {
    const ledger = new PgAssistedLedger(t.db);
    const memory = new MemoryAssistedLedger();
    const pricing = { httpCentsPer1k: 115, renderCentsPer1k: 1448 };
    const entry = { day: '2026-11-03', shopSlug: 'flanco', vendor: 'zyte', rendered: true, pricing };
    for (const l of [ledger, memory]) {
      for (let i = 0; i < 3; i++) {
        expect(await l.reserve(entry, '2026-11-01', 100_00)).toBe(true);
        if (i === 2) await l.release(entry); // the vendor did not bill the third call
      }
    }
    const row = await t.db.execute<{ requests: number; rendered_requests: number; successes: number; cost_cents: number }>(sql`
      SELECT requests, rendered_requests, successes, cost_cents FROM access_costs WHERE day = '2026-11-03'`);
    expect(row.rows[0]).toEqual({ requests: 3, rendered_requests: 3, successes: 2, cost_cents: 3 });
    expect([...memory.rows.values()][0]).toMatchObject({ requests: 3, renderedRequests: 3, successes: 2, costCents: 3 });
    expect(await ledger.monthToDateCents('2026-11-01')).toBe(3);
    // A booking that would pass the cap books nothing.
    expect(await ledger.reserve(entry, '2026-11-01', 4)).toBe(false);
    expect(await ledger.monthToDateCents('2026-11-01')).toBe(3);
    await expect(ledger.reserve({ ...entry, shopSlug: 'no-such-shop' }, '2026-11-01', 100_00)).rejects.toThrow(/unknown shop/);
    await t.db.execute(sql`DELETE FROM access_costs WHERE day = '2026-11-03'`);
  });

  it('concurrent bookings from several connections never pass the cap together (advisory lock)', async () => {
    const pools = Array.from({ length: 4 }, () => createPool(t.url, 4));
    try {
      const ledgers = pools.map((p) => new PgAssistedLedger(createDb(p)));
      // One cent per call (rounded up), cap 7 cents: exactly 7 of 24 simultaneous bookings fit.
      const pricing = { httpCentsPer1k: 1000, renderCentsPer1k: 1000 };
      const shops = ['altex', 'flanco', 'cel', 'pcgarage'];
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, i) => ledgers[i % 4]!.reserve({ day: '2026-11-04', shopSlug: shops[i % 4]!, vendor: 'zyte', rendered: false, pricing }, '2026-11-04', 7)),
      );
      expect(results.filter(Boolean)).toHaveLength(7);
      expect(await ledgers[0]!.monthToDateCents('2026-11-04')).toBe(7);
    } finally {
      await Promise.all(pools.map((p) => p.end()));
      await t.db.execute(sql`DELETE FROM access_costs WHERE day = '2026-11-04'`);
    }
  });
});

describe('assisted shop: scope and composition in the worker', () => {
  it('eMAG set to assisted in the database is still off for the fetch layer, and the channel refuses it', async () => {
    const emag = await shopId('emag');
    const before = await t.db.execute<{ access_mode: string }>(sql`SELECT access_mode FROM shops WHERE id = ${emag}`);
    await t.db.execute(sql`UPDATE shops SET access_mode = 'assisted' WHERE id = ${emag}`);
    try {
      expect((await createPolicyResolver(t.db, 0)('www.emag.ro')).accessMode).toBe('off');
      const { channel } = createAssistedChannelFromEnv(testEnv(), t.db, log);
      expect(await channel!.check({ shopSlug: 'emag', host: 'www.emag.ro', purpose: 'listing', url: 'https://www.emag.ro/telefoane/c' })).toMatchObject({
        code: 'assisted_refused',
        detail: expect.stringMatching(/ADR-013/),
      });
    } finally {
      await t.db.execute(sql`UPDATE shops SET access_mode = ${before.rows[0]!.access_mode} WHERE id = ${emag}`);
    }
  });

  it('only the shop\'s own web host: an internal API subdomain is refused before any vendor call', async () => {
    const before = vendorCalls.length;
    const res = await deps(testEnv()).fetcher.fetchPolite('https://fenrir.altex.ro/catalog/products', { purpose: 'listing', shopSlug: 'altex' });
    expect(res).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_refused', attempts: 0 });
    expect(vendorCalls.length).toBe(before);
  });

  it('the merchant fetcher never reaches an assisted shop (no vendor call, no direct request)', async () => {
    const before = vendorCalls.length;
    const merchant = createMerchantFetcher(testEnv(), t.db, log, {
      dispatcher: createGuardedDispatcher({ allowPrivate: false }),
      requestLog: { write: () => undefined },
      stateStore: new PgDomainStateStore(t.db),
    });
    const res = await merchant.fetchPolite('https://altex.ro/feed.xml', { purpose: 'feed' });
    expect(res).toMatchObject({ skipped: 'assisted_unavailable', attempts: 0 });
    expect(vendorCalls.length).toBe(before);
  });

  it('a challenge page relayed by the vendor (cel.ro\'s "Verificare rapida" with decoy products) records nothing', async () => {
    const cel = await shopId('cel');
    await t.db.execute(sql`UPDATE shops SET status = 'active', access_mode = 'assisted', legal_basis_ref = 'opinion' WHERE id = ${cel}`);
    const src = await t.db.execute<{ id: string }>(sql`
      INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, config)
      VALUES (${cel}, 'cel:listing:placi-video', 'listing', ${CEL_URL}, 'jsonld-product', true, '{"max_pages": 1}'::jsonb)
      RETURNING id::text`);
    const r = await runSource(deps(testEnv()), Number(src.rows[0]!.id), { trigger: 'manual' });
    expect(r.stats.parsed).toBe(0);
    expect(r.stats.blocked).toBeGreaterThanOrEqual(1);
    const offers = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM offers WHERE shop_id = ${cel}`);
    expect(offers.rows[0]!.n).toBe('0');
    await t.db.execute(sql`UPDATE shop_sources SET kill_switch = true WHERE shop_id = ${cel}`);
  });
});

describe('assisted shop: health, alerts, auto-pause', () => {
  async function fakeDays(slug: string, perDay: { attempts: number; ok: number }[]) {
    // Synthetic request_log rows at noon Bucharest of each of the last days (1 = yesterday).
    for (let i = 0; i < perDay.length; i++) {
      const { attempts, ok } = perDay[i]!;
      await t.db.execute(sql`
        INSERT INTO request_log (ts, host, url, method, status, purpose, shop_slug, channel, blocked, attempt, hop)
        SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest') - make_interval(days => ${i + 1}) + interval '12 hours') AT TIME ZONE 'Europe/Bucharest',
          'synthetic.test', 'https://synthetic.test/', 'GET', CASE WHEN g <= ${ok} THEN 200 ELSE 0 END, 'listing', ${slug}, 'assisted',
          g > ${ok}, 1, 0
        FROM generate_series(1, ${attempts}) g`);
    }
  }

  it('pauses a shop below 80% on each of the last 7 days (kill switches + audit row), not one with a good day', async () => {
    const flanco = await shopId('flanco');
    await t.db.execute(sql`UPDATE shops SET status = 'active', access_mode = 'assisted', legal_basis_ref = 'opinion' WHERE id = ${flanco}`);
    await t.db.execute(sql`
      INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled) VALUES (${flanco}, 'flanco:listing:x', 'listing', 'https://www.flanco.ro/x', 'jsonld-product', true)`);
    await fakeDays('flanco', Array.from({ length: 7 }, () => ({ attempts: 30, ok: 15 })));
    await fakeDays('altex', [{ attempts: 30, ok: 10 }, { attempts: 30, ok: 29 }, ...Array.from({ length: 5 }, () => ({ attempts: 30, ok: 10 }))]);

    const decisions = await autoPauseAssistedShops(t.db);
    expect(decisions.find((d) => d.shop === 'flanco')).toMatchObject({ paused: true, sources: [expect.any(Number)] });
    expect(decisions.find((d) => d.shop === 'altex')).toMatchObject({ paused: false });
    const killed = await t.db.execute<{ kill_switch: boolean }>(sql`SELECT kill_switch FROM shop_sources WHERE shop_id = ${flanco}`);
    expect(killed.rows.every((r) => r.kill_switch)).toBe(true);
    const audit = await t.db.execute<{ actor: string; action: string }>(sql`SELECT actor, action FROM audit_log WHERE entity = 'shops' AND entity_id = ${String(flanco)}`);
    expect(audit.rows).toContainEqual({ actor: 'system:assisted.health', action: 'assisted.auto_pause' });
    // Once paused it has no live source: the next run of the job leaves it alone.
    expect((await autoPauseAssistedShops(t.db)).find((d) => d.shop === 'flanco')).toBeUndefined();
  });

  it('alerts on yesterday below 90% and on spend at 80% / 100% of the cap; exports metrics', async () => {
    const env = testEnv({ ASSISTED_MONTHLY_CAP_EUR: 1 });
    const today = bucharestDayOf(new Date());
    await t.db.execute(sql`
      INSERT INTO access_costs (day, shop_id, vendor, requests, rendered_requests, successes, cost_cents)
      VALUES (${today}::date, ${await shopId('cel')}, 'zyte', 100, 0, 100, 84)
      ON CONFLICT (day, shop_id, vendor) DO UPDATE SET cost_cents = 84`);
    let keys = (await assistedSloAlerts(t.db, env)).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining([`assisted-spend-80:${today.slice(0, 8)}01`, 'assisted-success:altex']));
    await t.db.execute(sql`UPDATE access_costs SET cost_cents = 200 WHERE day = ${today}::date AND vendor = 'zyte' AND shop_id = ${await shopId('cel')}`);
    keys = (await assistedSloAlerts(t.db, env)).map((a) => a.key);
    expect(keys).toContain(`assisted-spend-100:${today.slice(0, 8)}01`);
    expect(keys.some((k) => k.startsWith('assisted-spend-80'))).toBe(false);

    const text = renderMetrics(await assistedMetricFamilies(t.db, env));
    expect(text).toContain('pretoscop_assisted_vendor_configured 1');
    expect(text).toContain('pretoscop_assisted_cap_cents 100');
    expect(text).toMatch(/pretoscop_assisted_spend_month_cents \d+/);
    expect(text).toMatch(/pretoscop_assisted_success_ratio_7d\{shop="flanco"\} 0\.5/);
  });
});
