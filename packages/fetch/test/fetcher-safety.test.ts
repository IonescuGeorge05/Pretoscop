// Regression tests for the independent review of M02: every request re-checks what may have
// changed while it queued, host identity is canonical, and no caller choice can skip robots.txt.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import type { MockAgent } from 'undici';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { FAILURE_PAUSE_THRESHOLD, ROBOTS_TTL_MS, SLOT_SAFETY_MARGIN_MS as M, createFetcher } from '../src/fetcher';
import { FileDomainStateStore } from '../src/state/file';
import { MemoryDomainStateStore } from '../src/state/memory';
import type { DomainStateStore } from '../src/state/types';
import type { AssistedChannel, AssistedFetchRequest } from '../src/types';
import { ROBOTS_ALLOW_ALL, mockAgent, readFixture, startServer, testFetcher, type TestServer } from './helpers';

const A = 'https://shop-a.test';
const HOST = 'shop-a.test';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const TEXT = { 'content-type': 'text/plain' };
const page = '<!doctype html><html><head><title>Produs</title></head><body>ok</body></html>';

const agents: MockAgent[] = [];
const cleanups: Array<() => Promise<unknown>> = [];
const newAgent = () => {
  const created = mockAgent();
  agents.push(created);
  return created;
};
afterEach(async () => {
  await Promise.all(agents.splice(0).map((a) => a.close()));
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

function shop(agent: MockAgent, robots = ROBOTS_ALLOW_ALL) {
  const pool = agent.get(A);
  pool.intercept({ path: '/robots.txt' }).reply(200, robots, { headers: TEXT }).persist();
  return pool;
}

describe('every request re-checks pause, kill switch and window', () => {
  it('concurrent callers stop at the first block: one 403, then nothing more is sent', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: /^\/p\// }).reply(403, readFixture('blocks', 'akamai_access_denied_403_synthetic.html'), {
      headers: { ...HTML, server: 'AkamaiGHost' },
    }).persist();
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const results = await Promise.all([1, 2, 3].map((i) => fetcher.fetchPolite(`${A}/p/${i}`, { purpose: 'product' })));
    expect(log.network().filter((e) => e.purpose === 'product')).toHaveLength(1);
    expect(results.filter((r) => r.blockReason === 'http_403')).toHaveLength(1);
    expect(results.filter((r) => r.skipped === 'paused')).toHaveLength(2);
  });

  it('a pause set by another process during the slot wait cancels the request', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    const t = testFetcher({ dispatcher: agent });
    const sleep = t.clock.sleep;
    let armed = true;
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      stateStore: t.store,
      now: t.clock.now,
      sleep: async (ms, signal) => {
        await sleep(ms, signal);
        if (armed && ms > 0) {
          armed = false;
          await t.store.setPause(HOST, { until: t.clock.t + 3_600_000, reason: 'other process: challenge', setAt: t.clock.t, source: 'auto' }, 'extend');
        }
      },
    });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'paused', blocked: true, blockReason: 'paused', attempts: 0 });
    expect(log.network().filter((e) => e.purpose === 'product')).toHaveLength(0);
  });

  it('a pause set during the retry back-off stops the next attempt', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: '/p/1' }).reply(500, 'down').persist();
    const base = testFetcher({ dispatcher: agent });
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      stateStore: base.store,
      now: base.clock.now,
      sleep: async (ms, signal) => {
        await base.clock.sleep(ms, signal);
        if (ms === 10_000) {
          await base.store.setPause(HOST, { until: base.clock.t + 3_600_000, reason: 'manual', setAt: base.clock.t, source: 'manual' }, 'replace');
        }
      },
    });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    // Only the first attempt sent a request; the second was cancelled before sending.
    expect(res).toMatchObject({ skipped: 'paused', attempts: 1 });
    expect(log.network().filter((e) => e.purpose === 'product').map((e) => e.status)).toEqual([500]);
  });

  it('a kill switch flipped during the slot wait cancels the request', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    let mode: DomainPolicy['accessMode'] = 'direct';
    const base = testFetcher({ dispatcher: agent });
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      stateStore: base.store,
      now: base.clock.now,
      policyFor: (host) => defaultDomainPolicy(host, { accessMode: mode }),
      sleep: async (ms, signal) => {
        await base.clock.sleep(ms, signal);
        if (ms > 0) mode = 'off';
      },
    });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res.skipped).toBe('access_off');
    expect(log.network().filter((e) => e.purpose === 'product')).toHaveLength(0);
  });

  it('a crawl window that closes during the slot wait cancels the request', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    const { fetcher, clock, log } = testFetcher({ dispatcher: agent, policy: { allowedHours: { start: '02:00', end: '07:00' } } });
    clock.t = Date.parse('2026-10-28T04:59:58Z'); // 06:59:58 in Bucharest
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' }); // robots.txt first, then a 5.1 s wait
    expect(res.skipped).toBe('outside_allowed_hours');
    expect(log.network().map((e) => e.purpose)).toEqual(['robots']);
  });

  it('applies the crawl window and pauses to redirect targets too', async () => {
    const agent = newAgent();
    const pool = shop(agent);
    pool.intercept({ path: '/old' }).reply(301, '', { headers: { location: 'https://www.shop-a.test/new' } });
    agent.get('https://www.shop-a.test').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    const { fetcher, store, log } = testFetcher({ dispatcher: agent });
    await store.setPause('www.shop-a.test', { until: Date.parse('2030-01-01'), reason: 'manual', setAt: 0, source: 'manual' }, 'replace');
    const res = await fetcher.fetchPolite(`${A}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'paused', finalUrl: 'https://www.shop-a.test/new', url: `${A}/old` });
    expect(log.network().map((e) => e.host)).toEqual([HOST, HOST]);
  });
});

describe('no caller choice skips robots.txt or splits a host', () => {
  it("rejects purpose 'robots' for anything but /robots.txt", async () => {
    const agent = newAgent();
    shop(agent, 'User-agent: *\nDisallow: /\n');
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    await expect(fetcher.fetchPolite(`${A}/checkout`, { purpose: 'robots' })).rejects.toThrow(/only for \/robots\.txt/);
    expect(log.network()).toHaveLength(0);
  });

  it("'probe' requests obey the crawl window like every other page", async () => {
    const agent = newAgent();
    shop(agent);
    const { fetcher, clock } = testFetcher({ dispatcher: agent, policy: { allowedHours: { start: '02:00', end: '07:00' } } });
    clock.t = Date.parse('2026-10-28T12:00:00Z');
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'probe' })).skipped).toBe('outside_allowed_hours');
  });

  it('treats a trailing-dot host as the same host (policy, pause, slot, robots.txt)', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    const off = testFetcher({ dispatcher: agent, policyFor: (host) => defaultDomainPolicy(host, { accessMode: host === HOST ? 'off' : 'direct' }) });
    expect((await off.fetcher.fetchPolite('https://shop-a.test./p/1', { purpose: 'product' })).skipped).toBe('access_off');

    const { fetcher, log } = testFetcher({ dispatcher: agent });
    await fetcher.pauseDomain('shop-a.test', 1, 'manual');
    expect((await fetcher.fetchPolite('https://SHOP-A.test./p/1', { purpose: 'product' })).skipped).toBe('paused');
    await fetcher.unpauseDomain('https://shop-a.test./');
    const res = await fetcher.fetchPolite('https://shop-a.test./p/1', { purpose: 'product' });
    expect(res).toMatchObject({ ok: true, url: `${A}/p/1` });
    expect(log.network().map((e) => [e.host, e.waitMs])).toEqual([
      [HOST, 0],
      [HOST, 5000 + M],
    ]);
  });

  it('accepts a test User-Agent override only in our exact format', () => {
    expect(() => testFetcher({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PretoscopBot Chrome/130' })).toThrow(/userAgent/);
    expect(() => testFetcher({ userAgent: 'Mozilla/5.0 (compatible; PretoscopBot/2.0; +https://example.test/bot)' })).not.toThrow();
  });

  it('CRAWL_ENABLED=false refuses every request, robots.txt included', async () => {
    const agent = newAgent();
    shop(agent);
    const { fetcher, log } = testFetcher({ dispatcher: agent, crawlEnabled: false });
    expect(await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).toMatchObject({ skipped: 'access_off', errorCode: 'crawl_disabled' });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ outcome: 'unavailable', source: 'none' });
    expect(log.network()).toHaveLength(0);
  });
});

describe('failure streaks and robots.txt caching', () => {
  it('a redirect in front of a failing origin still trips the breaker', async () => {
    const agent = newAgent();
    const pool = shop(agent);
    pool.intercept({ path: '/old' }).reply(301, '', { headers: { location: '/new' } }).persist();
    pool.intercept({ path: '/new' }).reply(502, 'bad gateway').persist();
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ status: 502, attempts: 3 });
    expect(await store.getFailures(HOST)).toBe(FAILURE_PAUSE_THRESHOLD);
    expect(await store.getPause(HOST)).not.toBeNull();
  });

  it('remembers a robots.txt that redirects to a paused host instead of asking again on every page', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(301, '', { headers: { location: 'https://cdn.static-shop.test/robots.txt' } }).persist();
    const { fetcher, store, log } = testFetcher({ dispatcher: agent });
    await store.setPause('cdn.static-shop.test', { until: Date.parse('2030-01-01'), reason: 'challenge', setAt: 0, source: 'auto' }, 'extend');
    for (let i = 1; i <= 4; i++) {
      expect((await fetcher.fetchPolite(`${A}/p/${i}`, { purpose: 'product' })).skipped).toBe('robots_disallowed');
    }
    expect(log.network().filter((e) => e.url === `${A}/robots.txt`)).toHaveLength(1);
  });
});

describe('aborts and caller errors', () => {
  async function slowServer(): Promise<TestServer> {
    const s = await startServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, TEXT);
        res.end(ROBOTS_ALLOW_ALL);
        return;
      }
      setTimeout(() => {
        res.writeHead(200, HTML);
        res.end(page);
      }, 500);
    });
    cleanups.push(s.close);
    return s;
  }

  it('logs a request that was on the wire when the caller aborted', async () => {
    const s = await slowServer();
    const { fetcher, log } = testFetcher();
    cleanups.push(() => fetcher.close());
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const res = await fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product', signal: controller.signal });
    expect(res.errorCode).toBe('aborted');
    expect(s.hits.map((h) => h.path)).toEqual(['/robots.txt', '/p/1']);
    expect(log.entries.find((e) => e.url.endsWith('/p/1'))).toMatchObject({ attempt: 1, errorCode: 'aborted', status: 0 });
  });

  it('logs a call aborted before any request, with no network attempt', async () => {
    const agent = newAgent();
    shop(agent);
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const controller = new AbortController();
    controller.abort();
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product', signal: controller.signal })).errorCode).toBe('aborted');
    expect(log.entries.at(-1)).toMatchObject({ attempt: 0, errorCode: 'aborted', url: `${A}/p/1` });
  });

  it('drops an unsendable header value instead of failing (and never blames the shop)', async () => {
    const s = await slowServer();
    const { fetcher, store } = testFetcher();
    cleanups.push(() => fetcher.close());
    const res = await fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product', etag: 'W/"preț-ș"', accept: 'text/html\r\nX-Injected: 1' });
    expect(res.ok).toBe(true);
    const hit = s.hits.find((h) => h.path === '/p/1');
    expect(hit?.headers['if-none-match']).toBeUndefined();
    expect(hit?.headers['x-injected']).toBeUndefined();
    expect(hit?.headers.accept).toMatch(/^text\/html,/);
    expect(await store.getFailures(s.host)).toBe(0);
  });
});

describe('assisted channel safety', () => {
  function assistedFetcher(assisted: AssistedChannel, extra: Parameters<typeof testFetcher>[0] = {}) {
    return testFetcher({ dispatcher: newAgent(), assisted, policy: { accessMode: 'assisted' }, ...extra });
  }

  it('gives up on a vendor call that never answers, and frees the host', async () => {
    let calls = 0;
    const assisted: AssistedChannel = {
      fetch: (url) => {
        calls += 1;
        if (url.endsWith('/robots.txt')) return Promise.resolve({ status: 404, body: '' });
        return new Promise(() => undefined); // hangs forever
      },
    };
    const { fetcher } = assistedFetcher(assisted);
    const started = Date.now();
    const first = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product', timeoutMs: 50 });
    expect(first).toMatchObject({ errorCode: 'timeout', channel: 'assisted', ok: false });
    const second = await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product', timeoutMs: 50 });
    expect(second.errorCode).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1500);
    expect(calls).toBe(3);
  });

  it('asks the vendor not to follow redirects and applies robots.txt to the 3xx target itself', async () => {
    const seen: Array<{ url: string; req: AssistedFetchRequest }> = [];
    const assisted: AssistedChannel = {
      async fetch(url, req) {
        seen.push({ url, req });
        if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /cos\n', contentType: 'text/plain' };
        if (url.endsWith('/old')) return { status: 301, body: '', headers: { Location: '/cos' } };
        return { status: 200, body: page, contentType: 'text/html' };
      },
    };
    const { fetcher } = assistedFetcher(assisted);
    const res = await fetcher.fetchPolite(`${A}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', finalUrl: `${A}/cos` });
    expect(seen.every((s) => s.req.followRedirects === false)).toBe(true);
    expect(seen.map((s) => new URL(s.url).pathname)).toEqual(['/robots.txt', '/old']);
  });

  it('drops the body when the vendor followed a redirect it should not have', async () => {
    const assisted: AssistedChannel = {
      async fetch(url) {
        if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /cos\n', contentType: 'text/plain' };
        if (url.endsWith('/a')) return { status: 200, body: page, contentType: 'text/html', finalUrl: 'https://elsewhere.test/x' };
        return { status: 200, body: page, contentType: 'text/html', finalUrl: `${A}/cos` };
      },
    };
    const { fetcher } = assistedFetcher(assisted);
    expect(await fetcher.fetchPolite(`${A}/a`, { purpose: 'product' })).toMatchObject({ errorCode: 'cross_site_redirect', body: null, ok: false });
    expect(await fetcher.fetchPolite(`${A}/b`, { purpose: 'product' })).toMatchObject({ errorCode: 'redirect_disallowed', body: null, ok: false });
  });

  it('reports every vendor block as vendor_blocked; three in a row pause the shop for an hour', async () => {
    const assisted: AssistedChannel = {
      async fetch(url) {
        if (url.endsWith('/robots.txt')) return { status: 404, body: '' };
        return { status: 403, body: null, blocked: true, blockReason: 'http_403', blockDetail: 'shop answered 403 to the vendor' };
      },
    };
    const { fetcher, store, clock } = assistedFetcher(assisted);
    const first = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(first).toMatchObject({ blocked: true, blockReason: 'vendor_blocked', body: null });
    expect(first.blockDetail).toMatch(/^http_403: shop answered 403/);
    expect(await store.getPause(HOST)).toBeNull();
    await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    await fetcher.fetchPolite(`${A}/p/3`, { purpose: 'product' });
    expect((await store.getPause(HOST))?.until).toBe(clock.t + 3_600_000);
  });
});

describe('FileDomainStateStore lock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pretoscop-fetch-lock-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('never breaks a lock held by a live process', async () => {
    const file = join(dir, 'state.json');
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.ppid, at: Date.now() }));
    const store = new FileDomainStateStore(file, { lockTimeoutMs: 200 });
    await expect(store.reserveSlot('shop.ro', 5000)).rejects.toThrow(/could not lock/);
  });
});

// ---------------------------------------------------------------- second review (re-review of 12be4a7)

const W = 'https://www.shop-a.test';

/** A store whose pause writes take a real round trip, like PostgreSQL. */
function slowPauseStore(inner: DomainStateStore, ms = 30): DomainStateStore {
  return {
    reserveSlot: (h, i) => inner.reserveSlot(h, i),
    getPause: (h) => inner.getPause(h),
    setPause: async (h, p, mode) => {
      await new Promise((r) => setTimeout(r, ms));
      return inner.setPause(h, p, mode);
    },
    clearPause: (h) => inner.clearPause(h),
    recordFailure: (h) => inner.recordFailure(h),
    resetFailures: (h) => inner.resetFailures(h),
    getFailures: (h) => inner.getFailures(h),
    consumeDailyRequest: (h, d, l) => inner.consumeDailyRequest(h, d, l),
    getDailyCount: (h, d) => inner.getDailyCount(h, d),
    getRobots: (o) => inner.getRobots(o),
    setRobots: (o, e) => inner.setRobots(o, e),
  };
}

describe('re-review: robots.txt through the assisted channel', () => {
  it.each([
    ['a partial vendor answer (2xx with an error)', { status: 200, body: 'User-agent: *\nDisallow: /\n', error: 'partial response' }],
    ['a redirect the vendor followed to another site', { status: 200, body: 'User-agent: *\nAllow: /\n', finalUrl: 'https://cdn.elsewhere.test/robots.txt' }],
  ])('never caches %s as "nothing disallowed"', async (_name, reply) => {
    const assisted: AssistedChannel = { fetch: async () => ({ contentType: 'text/plain', ...reply }) };
    const { fetcher, log } = testFetcher({ dispatcher: newAgent(), assisted, policy: { accessMode: 'assisted' } });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', errorCode: 'robots_unavailable' });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ outcome: 'unreachable', disallowAll: true, allowAll: false });
    expect(log.network().filter((e) => e.purpose === 'product')).toHaveLength(0);
  });
});

describe('re-review: the host lock is held until a refusal is recorded', () => {
  it('a request queued behind a slow 403 never goes out, even with a slow store and no slot wait', async () => {
    const agent = newAgent();
    const base = testFetcher({ dispatcher: agent });
    const pool = agent.get(A);
    pool.intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    pool
      .intercept({ path: /^\/p\// })
      .reply(() => {
        base.clock.advance(10_000); // the refusal takes longer than the interval: the next slot is already free
        return {
          statusCode: 403,
          data: readFixture('blocks', 'akamai_access_denied_403_synthetic.html'),
          responseOptions: { headers: { ...HTML, server: 'AkamaiGHost' } },
        };
      })
      .persist();
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      stateStore: slowPauseStore(base.store),
      now: base.clock.now,
      sleep: base.clock.sleep,
    });
    await fetcher.robotsFor(HOST);
    base.clock.advance(60_000);
    const results = await Promise.all([1, 2].map((i) => fetcher.fetchPolite(`${A}/p/${i}`, { purpose: 'product' })));
    expect(log.network().filter((e) => e.purpose === 'product')).toHaveLength(1);
    expect(results.map((r) => r.blockReason).sort()).toEqual(['http_403', 'paused']);
  });
});

describe("re-review: CAPTCHA on the shop's own subdomain", () => {
  it('flags a redirect to captcha.<shop> as a block, never follows it, and pauses the shop host', async () => {
    const agent = newAgent();
    const pool = agent.get(W);
    pool.intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    pool.intercept({ path: '/p/1' }).reply(302, '', { headers: { location: 'https://captcha.shop-a.test/?r=%2Fp%2F1' } });
    const { fetcher, store, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${W}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'captcha_redirect', status: 302 });
    expect(log.network().map((e) => e.host)).toEqual(['www.shop-a.test', 'www.shop-a.test']);
    expect(await store.getPause('www.shop-a.test')).not.toBeNull();
  });

  it('pauses every host of the chain when a redirect target serves a challenge', async () => {
    const agent = newAgent();
    agent.get(W).intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    agent.get(W).intercept({ path: '/p/2' }).reply(301, '', { headers: { location: 'https://m.shop-a.test/p/2' } });
    agent.get('https://m.shop-a.test').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    agent
      .get('https://m.shop-a.test')
      .intercept({ path: '/p/2' })
      .reply(200, readFixture('blocks', 'fastly_client_challenge_200_synthetic.html'), { headers: HTML });
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    expect(await fetcher.fetchPolite(`${W}/p/2`, { purpose: 'product' })).toMatchObject({ blocked: true, blockReason: 'challenge' });
    expect(await store.getPause('m.shop-a.test')).not.toBeNull();
    expect(await store.getPause('www.shop-a.test')).not.toBeNull();
  });
});

describe('re-review: a chain never switches channel', () => {
  it("an assisted shop's redirect to a host without its own policy stays on the vendor", async () => {
    const seen: string[] = [];
    const assisted: AssistedChannel = {
      async fetch(url) {
        seen.push(url);
        if (url.endsWith('/robots.txt')) return { status: 404, body: '' };
        if (url === `${W}/old`) return { status: 301, body: '', headers: { Location: 'https://shop-a.test/new' } };
        return { status: 200, body: page, contentType: 'text/html' };
      },
    };
    const { fetcher, log } = testFetcher({
      dispatcher: newAgent(), // no direct intercepts: any direct request would fail the test
      assisted,
      policyFor: (host) => defaultDomainPolicy(host, { accessMode: host === 'www.shop-a.test' ? 'assisted' : 'direct' }),
    });
    const res = await fetcher.fetchPolite(`${W}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ ok: true, channel: 'assisted', finalUrl: 'https://shop-a.test/new' });
    expect(seen).toEqual([`${W}/robots.txt`, `${W}/old`, 'https://shop-a.test/robots.txt', 'https://shop-a.test/new']);
    expect(log.network().every((e) => e.channel === 'assisted')).toBe(true);
  });

  it('a direct chain does not follow a redirect onto an assisted-only host', async () => {
    const agent = newAgent();
    agent.get(W).intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT });
    agent.get(W).intercept({ path: '/old' }).reply(301, '', { headers: { location: 'https://shop-a.test/new' } });
    const assisted: AssistedChannel = { fetch: async () => ({ status: 500, body: null, error: 'must not be called' }) };
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      assisted,
      policyFor: (host) => defaultDomainPolicy(host, { accessMode: host === 'shop-a.test' ? 'assisted' : 'direct' }),
    });
    const res = await fetcher.fetchPolite(`${W}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ ok: false, status: 301, errorCode: 'channel_change', finalUrl: `${W}/old` });
    expect(log.network().map((e) => e.host)).toEqual(['www.shop-a.test', 'www.shop-a.test']);
  });
});

describe('re-review: the global switch fails closed', () => {
  it('treats an unset CRAWL_ENABLED as off', async () => {
    const saved = process.env.CRAWL_ENABLED;
    try {
      delete process.env.CRAWL_ENABLED;
      const agent = newAgent();
      const off = createFetcher({ stateStore: new MemoryDomainStateStore(), dispatcher: agent });
      expect(await off.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' })).toMatchObject({
        skipped: 'access_off',
        errorCode: 'crawl_disabled',
      });
      process.env.CRAWL_ENABLED = 'true';
      shop(agent);
      const on = createFetcher({ stateStore: new MemoryDomainStateStore(), dispatcher: agent });
      expect(await on.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' })).toMatchObject({ ok: true, status: 200 });
    } finally {
      if (saved === undefined) delete process.env.CRAWL_ENABLED;
      else process.env.CRAWL_ENABLED = saved;
    }
  });
});

describe('re-review: attempts and waits', () => {
  it('keeps the attempts and waits already spent when the caller aborts during a back-off', async () => {
    const agent = newAgent();
    shop(agent).intercept({ path: '/p/1' }).reply(500, 'down').persist();
    const base = testFetcher({ dispatcher: agent });
    const controller = new AbortController();
    const { fetcher, log } = testFetcher({
      dispatcher: agent,
      stateStore: base.store,
      now: base.clock.now,
      sleep: async (ms, signal) => {
        if (ms === 10_000) {
          controller.abort();
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }
        return base.clock.sleep(ms, signal);
      },
    });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product', signal: controller.signal });
    expect(res).toMatchObject({ errorCode: 'aborted', attempts: 1, waitedMs: 5000 + M });
    expect(log.entries.filter((e) => e.url === `${A}/p/1`).map((e) => [e.attempt, e.status, e.errorCode ?? null])).toEqual([
      [1, 500, null],
      [0, 0, 'aborted'],
    ]);
  });

  it("a caller that joins another caller's robots.txt fetch can still abort its own wait", async () => {
    const agent = newAgent();
    const pool = agent.get(A);
    pool.intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: TEXT }).delay(300);
    pool.intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    const { fetcher } = testFetcher({ dispatcher: agent });
    const first = fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await new Promise((r) => setTimeout(r, 20));
    const controller = new AbortController();
    const second = fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product', signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    const t0 = Date.now();
    expect(await second).toMatchObject({ errorCode: 'aborted' });
    expect(Date.now() - t0).toBeLessThan(250);
    expect(await first).toMatchObject({ ok: true });
  });

  it('does not count a Crawl-delay twice when robots.txt is refreshed', async () => {
    const agent = newAgent();
    shop(agent, 'User-agent: *\nCrawl-delay: 12\nDisallow: /cart\n').intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();
    const { fetcher, clock, log } = testFetcher({ dispatcher: agent });
    await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    clock.advance(ROBOTS_TTL_MS + 1); // robots.txt expires; the next page refreshes it first
    await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    expect(log.network().map((e) => [e.purpose, e.waitMs])).toEqual([
      ['robots', 0],
      ['product', 12_000 + M],
      ['robots', 0],
      ['product', 12_000 + M],
    ]);
  });
});
