import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent } from 'undici';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { ShopSchema, type ShopConfig } from '@pretoscop/config/shops';
import { setFlag, sql } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { MemoryDomainStateStore, type RequestLogEntry } from '@pretoscop/fetch';
import { PgDomainStateStore } from '../src/fetch/pg-state';
import { PROBE_FLAG } from '../src/registry/probe';
import { runProbe, spacedStateStore, type ProbeRunDeps } from '../src/registry/probe-run';

/**
 * shops:probe end to end without a network: the real polite fetcher, the database state store
 * shared with the recorder, and undici's MockAgent standing in for the shop.
 */

const shopConfig = (over: Partial<Record<string, unknown>> = {}): ShopConfig =>
  ShopSchema.parse({
    slug: 'proba',
    name: 'Proba',
    domain: 'proba.ro',
    website_url: 'https://www.proba.ro',
    status: 'blocked',
    access_mode: 'off',
    legal: {},
    sources: [
      { key: 'proba:listing:oprita', kind: 'listing', url: 'https://www.proba.ro/oprita/', parser_key: 'jsonld-product' },
      { key: 'proba:listing:laptopuri', kind: 'listing', url: 'https://www.proba.ro/laptopuri/', parser_key: 'jsonld-product' },
    ],
    ...over,
  });

let t: TestDatabase;
let agent: MockAgent;
let logged: RequestLogEntry[];
const log = createLogger('test', { level: 'silent' });
const ON = { ...getEnv({}), CRAWL_ENABLED: true };

function deps(over: Partial<ProbeRunDeps> = {}): ProbeRunDeps {
  return {
    db: t.db,
    env: ON,
    log,
    dispatcher: agent,
    stateStore: new PgDomainStateStore(t.db),
    requestLog: { write: (e) => void logged.push(e) },
    minGapMs: 20,
    sleep: async () => undefined,
    ...over,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    INSERT INTO shops (slug, name, domain, website_url, status, access_mode) VALUES
      ('proba', 'Proba', 'proba.ro', 'https://www.proba.ro', 'blocked', 'off'),
      ('scos', 'Scos', 'scos.ro', 'https://www.scos.ro', 'removed', 'off'),
      ('doarfeed', 'Doar feed', 'doarfeed.ro', 'https://www.doarfeed.ro', 'active', 'feed_only'),
      ('emag', 'eMAG', 'emag.ro', 'https://www.emag.ro', 'active', 'direct'),
      ('pauzat', 'Pauzat', 'pauzat.ro', 'https://www.pauzat.ro', 'paused', 'off'),
      ('oprit', 'Oprit', 'oprit.ro', 'https://www.oprit.ro', 'active', 'direct'),
      ('refuzat', 'Refuzat', 'refuzat.ro', 'https://www.refuzat.ro', 'blocked', 'off')`);
  // proba: one killed source (skipped as a target) and one that is not.
  await t.db.execute(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, kill_switch)
    SELECT id, 'proba:listing:oprita', 'listing', 'https://www.proba.ro/oprita/', 'jsonld-product', false, true FROM shops WHERE slug = 'proba'
    UNION ALL SELECT id, 'proba:listing:laptopuri', 'listing', 'https://www.proba.ro/laptopuri/', 'jsonld-product', false, false FROM shops WHERE slug = 'proba'`);
  // How the runbooks record a stop request: every source kill-switched. And a shop that said no.
  await t.db.execute(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, kill_switch)
    SELECT id, 'oprit:listing:a', 'listing', 'https://www.oprit.ro/a/', 'jsonld-product', false, true FROM shops WHERE slug = 'oprit'
    UNION ALL SELECT id, 'oprit:listing:b', 'listing', 'https://www.oprit.ro/b/', 'jsonld-product', false, true FROM shops WHERE slug = 'oprit'`);
  await t.db.execute(sql`
    INSERT INTO outreach (shop_id, purpose, channel, status, created_by, created_at)
    SELECT id, 'allowlist', 'email', 'sent', 'human:test', now() - interval '20 days' FROM shops WHERE slug = 'refuzat'
    UNION ALL SELECT id, 'allowlist', 'email', 'declined', 'human:test', now() - interval '5 days' FROM shops WHERE slug = 'refuzat'
    UNION ALL SELECT id, 'feed', 'email', 'declined', 'human:test', now() - interval '9 days' FROM shops WHERE slug = 'proba'
    UNION ALL SELECT id, 'feed', 'email', 'replied', 'human:test', now() - interval '2 days' FROM shops WHERE slug = 'proba'`);
  await setFlag(t.db, 'crawl.enabled', true);
}, 180_000);

afterAll(async () => {
  await t?.drop();
}, 120_000);

beforeEach(async () => {
  logged = [];
  agent = new MockAgent();
  agent.disableNetConnect();
  await setFlag(t.db, PROBE_FLAG, true);
  await t.db.execute(sql`DELETE FROM fetch_domain_state`);
  await t.db.execute(sql`DELETE FROM fetch_robots_cache`);
  await t.db.execute(sql`DELETE FROM fetch_domain_daily`);
});

afterEach(async () => {
  await agent.close();
});

describe('shops:probe gates', () => {
  it('sends nothing unless CRAWL_ENABLED, crawl.enabled and shops.probe.enabled are all on', async () => {
    expect(await runProbe(deps({ env: { ...ON, CRAWL_ENABLED: false } }), shopConfig(), { vantage: 'test' })).toMatchObject({
      status: 'refused',
      reason: expect.stringContaining('CRAWL_ENABLED'),
      requests: 0,
    });
    await setFlag(t.db, PROBE_FLAG, false);
    expect(await runProbe(deps(), shopConfig(), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining(PROBE_FLAG) });
    await setFlag(t.db, PROBE_FLAG, true);
    await setFlag(t.db, 'crawl.enabled', false);
    try {
      expect(await runProbe(deps(), shopConfig(), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: 'flag crawl.enabled is off' });
    } finally {
      await setFlag(t.db, 'crawl.enabled', true);
    }
    expect(logged).toEqual([]);
  });

  it('refuses removed and feed-only shops, eMAG without its flag, unknown shops and pages off the domain', async () => {
    const as = (slug: string, domain: string) => shopConfig({ slug, domain, website_url: `https://www.${domain}`, sources: [] });
    expect(await runProbe(deps(), as('scos', 'scos.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('removed') });
    expect(await runProbe(deps(), as('doarfeed', 'doarfeed.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('feed_only') });
    expect(await runProbe(deps(), as('emag', 'emag.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('ADR-013') });
    expect(await runProbe(deps(), as('necunoscut', 'necunoscut.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('shops:sync') });
    // A shop that asked us to stop or said no: paused, every source killed, latest outreach declined.
    expect(await runProbe(deps(), as('pauzat', 'pauzat.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('paused') });
    expect(await runProbe(deps(), as('oprit', 'oprit.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('kill-switched') });
    expect(await runProbe(deps(), as('refuzat', 'refuzat.ro'), { vantage: 'test' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('declined') });
    // Once the egress IPs are published, only from one of them, confirmed by the operator.
    const published = { ...ON, BOT_EGRESS_IPS: ['203.0.113.10'] };
    expect(await runProbe(deps({ env: published }), shopConfig(), { vantage: 'test' })).toMatchObject({
      status: 'refused',
      reason: expect.stringContaining('--from-published-ip'),
    });
    expect(await runProbe(deps(), shopConfig(), { vantage: 'test', url: 'https://alt-site.ro/p' })).toMatchObject({ status: 'refused', reason: expect.stringContaining('proba.ro') });
    expect(logged).toEqual([]);
  });
});

describe('shops:probe requests', () => {
  it('reads robots.txt, the home page and one registry page (skipping a killed source), 3 requests, identified and spaced', async () => {
    const pool = agent.get('https://www.proba.ro');
    const seen: Array<{ path: string; ua: string }> = [];
    const reply = (body: string) => (o: { path: string; headers?: unknown }) => {
      seen.push({ path: o.path, ua: String((o.headers as Record<string, string>)['user-agent'] ?? '') });
      return body;
    };
    pool.intercept({ path: '/robots.txt' }).reply(200, reply('User-agent: *\nDisallow: /cont/\n'), { headers: { 'content-type': 'text/plain' } });
    pool.intercept({ path: '/' }).reply(200, reply('<html><body>home</body></html>'), { headers: { 'content-type': 'text/html' } });
    pool.intercept({ path: '/laptopuri/' }).reply(200, reply('<html><body>listă</body></html>'), { headers: { 'content-type': 'text/html' } });

    const out = await runProbe(deps(), shopConfig(), { vantage: 'test runner' });
    expect(out).toMatchObject({ status: 'probed', result: 'served', requests: 3 });
    expect(seen.map((s) => s.path)).toEqual(['/robots.txt', '/', '/laptopuri/']);
    for (const s of seen) expect(s.ua).toMatch(/^Mozilla\/5\.0 \(compatible; PretoscopBot\/1\.0; \+https:\/\//);
    // The per-host interval of the polite fetcher (≥ 5 s) is reserved for every request after the first.
    const sent = logged.filter((e) => e.attempt > 0);
    expect(sent).toHaveLength(3);
    for (const e of sent.slice(1)) expect(e.waitMs).toBeGreaterThanOrEqual(4900);
    const audit = (await t.db.execute<{ after: { vantage: string; result: string; requests: number } }>(
      sql`SELECT after FROM audit_log WHERE action = 'shops.probe' AND entity_id = 'proba' ORDER BY id DESC LIMIT 1`,
    )).rows[0];
    expect(audit?.after).toMatchObject({ vantage: 'test runner', result: 'served', requests: 3 });
  });

  it('stops at a block, pauses the host for the recorder too, and never retries', async () => {
    const pool = agent.get('https://www.proba.ro');
    pool.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow:\n', { headers: { 'content-type': 'text/plain' } });
    pool.intercept({ path: '/' }).reply(403, 'Forbidden', { headers: { 'content-type': 'text/html' } });

    const out = await runProbe(deps(), shopConfig(), { vantage: 'test' });
    expect(out).toMatchObject({ status: 'probed', result: 'blocked', requests: 2 });
    const pause = (await t.db.execute<{ paused: boolean }>(sql`SELECT paused_until > now() AS paused FROM fetch_domain_state WHERE host = 'www.proba.ro'`)).rows[0];
    expect(pause?.paused).toBe(true);

    // While the host is paused, a second probe sends nothing and records nothing.
    expect(await runProbe(deps(), shopConfig(), { vantage: 'test' })).toEqual({ status: 'refused', reason: expect.stringContaining('skipped (paused'), requests: 0 });
  });

  it('obeys robots.txt: a disallowed home page is never requested', async () => {
    const pool = agent.get('https://www.proba.ro');
    pool.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: PretoscopBot\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
    const out = await runProbe(deps(), shopConfig(), { vantage: 'test' });
    expect(out).toMatchObject({ status: 'probed', result: 'robots_disallow', requests: 1 });
  });

  it('never sends a fourth request, even when a redirect leads to another host', async () => {
    const www = agent.get('https://www.proba.ro');
    www.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow:\n', { headers: { 'content-type': 'text/plain' } });
    www.intercept({ path: '/' }).reply(301, '', { headers: { location: 'https://proba.ro/' } });
    const apex = agent.get('https://proba.ro');
    let apexPage = 0;
    apex.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow:\n', { headers: { 'content-type': 'text/plain' } });
    apex
      .intercept({ path: '/' })
      .reply(200, () => {
        apexPage++;
        return '<html></html>';
      })
      .persist();

    const out = await runProbe(deps(), shopConfig(), { vantage: 'test' });
    expect(out.requests).toBe(3);
    expect(apexPage).toBe(0);
    expect(out).toMatchObject({ status: 'probed', result: 'error' });
    expect(out.status === 'probed' && out.note).toContain('request_cap');
    // The cap is ours, not the shop's: no pause, no cached "robots.txt unreachable".
    const state = (await t.db.execute<{ host: string; paused: boolean | null }>(sql`SELECT host, paused_until > now() AS paused FROM fetch_domain_state`)).rows;
    expect(state.filter((s) => s.paused)).toEqual([]);
  });
});

describe('spacing before the shared slot is reserved', () => {
  it('waits the gap between any two requests, whatever the host, before reserving the next slot', async () => {
    let clock = Date.parse('2026-10-28T10:00:00Z');
    const sleeps: number[] = [];
    const now = () => clock;
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    };
    const store = spacedStateStore(new MemoryDomainStateStore({ now }), { gapMs: 5000, now, sleep });
    const a = await store.reserveSlot('www.proba.ro', 5000);
    const b = await store.reserveSlot('proba.ro', 5000); // another host: its own slot is free
    expect(a.waitMs).toBe(0);
    expect(sleeps).toEqual([5000]);
    expect(b.startAt - a.startAt).toBeGreaterThanOrEqual(5000);
    // Everything else passes through untouched.
    expect(await store.getPause('proba.ro')).toBeNull();
  });
});
