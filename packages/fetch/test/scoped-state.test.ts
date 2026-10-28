import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import type { MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { PAUSE_BLOCK_MS, SLOT_SAFETY_MARGIN_MS as M } from '../src/fetcher';
import { bucharestDay, createFetcher, MemoryDomainStateStore, ScopedDomainStateStore } from '../src/index';
import { collectLog, fakeClock, mockAgent, ROBOTS_ALLOW_ALL } from './helpers';

const A = 'https://shop-a.test';
const HOST = 'shop-a.test';
const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body>${title}</body></html>`;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const XML = { 'content-type': 'application/xml' };

const agents: MockAgent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((a) => a.close()));
});

/** The crawler on the shared store and a merchant-check fetcher on a scoped view of it, one clock. */
function setup(policy: Partial<DomainPolicy> = {}) {
  const agent = mockAgent();
  agents.push(agent);
  const pool = agent.get(A);
  pool.intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: { 'content-type': 'text/plain' } }).persist();
  const clock = fakeClock();
  const shared = new MemoryDomainStateStore({ now: clock.now });
  const scoped = new ScopedDomainStateStore(shared, 'merchant');
  const log = collectLog();
  const common = {
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    crawlEnabled: true,
    requestLog: log.sink,
    dispatcher: agent,
    retry: { maxRetries: 0, baseDelayMs: 10_000 },
    policyFor: (host: string) => defaultDomainPolicy(host, policy),
  };
  return {
    pool,
    clock,
    shared,
    scoped,
    log,
    crawler: createFetcher({ ...common, stateStore: shared }),
    merchant: createFetcher({ ...common, stateStore: scoped }),
  };
}

describe('ScopedDomainStateStore (requests made for merchants)', () => {
  it('a 403 provoked through a merchant URL pauses the merchant scope only; the crawler keeps reading the shop', async () => {
    const s = setup();
    s.pool.intercept({ path: '/?q=%3Cscript%3E' }).reply(403, 'Forbidden', { headers: { 'content-type': 'text/plain' } });
    s.pool.intercept({ path: '/p/1' }).reply(200, html('produs'), { headers: HTML });

    const refused = await s.merchant.fetchPolite(`${A}/?q=<script>`, { purpose: 'feed' });
    expect(refused).toMatchObject({ blocked: true, blockReason: 'http_403' });
    expect(await s.shared.getPause(HOST)).toBeNull();
    expect(await s.shared.getPause(`merchant:${HOST}`)).toMatchObject({ blockReason: 'http_403' });
    const own = (await s.scoped.getPause(HOST))!;
    expect(own.until - own.setAt).toBe(PAUSE_BLOCK_MS);

    const page = await s.crawler.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(page).toMatchObject({ ok: true, status: 200 });

    // The merchant scope itself stays paused: no second request to a host that refused it.
    const again = await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    expect(again).toMatchObject({ skipped: 'paused', attempts: 0 });
  });

  it('shares the per-host start slots with the crawler (the minimum interval holds across both)', async () => {
    const s = setup();
    s.pool.intercept({ path: '/feed.xml' }).reply(200, '<rss/>', { headers: XML }).persist();
    s.pool.intercept({ path: /^\/p\// }).reply(200, html('produs'), { headers: HTML }).persist();
    await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    await s.crawler.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    const starts = s.log.network().map((e) => e.ts.getTime());
    expect(starts.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(5000 + M);
  });

  it("obeys the crawler's pauses", async () => {
    const s = setup();
    await s.shared.setPause(HOST, { until: s.clock.now() + 3_600_000, reason: 'http_403: test', setAt: s.clock.now(), source: 'auto', blockReason: 'http_403' }, 'extend');
    const res = await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    expect(res).toMatchObject({ skipped: 'paused', blocked: true, attempts: 0 });
    expect(s.log.network()).toHaveLength(0);
  });

  it("counts merchant requests and failures apart from the shop's daily budget and failure streak", async () => {
    const s = setup({ maxPagesPerDay: 3 });
    s.pool.intercept({ path: '/feed.xml' }).reply(500, 'down', { headers: { 'content-type': 'text/plain' } }).persist();
    s.pool.intercept({ path: /^\/p\// }).reply(200, html('produs'), { headers: HTML }).persist();
    await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    const day = bucharestDay(s.clock.now());
    expect(await s.shared.getDailyCount(HOST, day)).toBe(0);
    expect(await s.scoped.getDailyCount(HOST, day)).toBe(3); // robots.txt + two feed requests
    expect(await s.shared.getFailures(HOST)).toBe(0);
    expect(await s.scoped.getFailures(HOST)).toBe(2);
    // The shop's own budget is intact for the crawler.
    expect(await s.crawler.fetchPolite(`${A}/p/1`, { purpose: 'product' })).toMatchObject({ ok: true });
  });

  it('reads a robots.txt the crawler cached, and never writes its own into the shared cache', async () => {
    const s = setup();
    s.pool.intercept({ path: '/feed.xml' }).reply(200, '<rss/>', { headers: XML }).persist();
    s.pool.intercept({ path: /^\/p\// }).reply(200, html('produs'), { headers: HTML }).persist();

    await s.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    expect(await s.shared.getRobots(A)).toBeNull();
    expect(await s.shared.getRobots(`merchant:${A}`)).toMatchObject({ outcome: 'parsed' });

    const t = setup();
    t.pool.intercept({ path: '/feed.xml' }).reply(200, '<rss/>', { headers: XML }).persist();
    t.pool.intercept({ path: /^\/p\// }).reply(200, html('produs'), { headers: HTML }).persist();
    await t.crawler.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await t.merchant.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    expect(t.log.network().map((e) => new URL(e.url).pathname)).toEqual(['/robots.txt', '/p/1', '/feed.xml']);
  });

  it('returns the later of the two pauses, writes and clears only its own, and refuses odd namespaces', async () => {
    const shared = new MemoryDomainStateStore({ now: () => 1_000 });
    const scoped = new ScopedDomainStateStore(shared, 'merchant');
    await shared.setPause(HOST, { until: 5_000, reason: 'crawler', setAt: 1_000, source: 'auto' }, 'extend');
    expect(await scoped.setPause(HOST, { until: 9_000, reason: 'merchant', setAt: 1_000, source: 'auto' }, 'extend')).toMatchObject({ until: 9_000 });
    expect(await scoped.getPause(HOST)).toMatchObject({ until: 9_000, reason: 'merchant' });
    await scoped.clearPause(HOST);
    expect(await scoped.getPause(HOST)).toMatchObject({ until: 5_000, reason: 'crawler' });
    expect(await shared.getPause(HOST)).toMatchObject({ until: 5_000 });
    expect(() => new ScopedDomainStateStore(shared, 'Merchant:x')).toThrow(RangeError);
  });
});
