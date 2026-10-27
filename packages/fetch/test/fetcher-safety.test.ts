// Regression tests for the independent review of M02: every request re-checks what may have
// changed while it queued, host identity is canonical, and no caller choice can skip robots.txt.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import type { MockAgent } from 'undici';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { FAILURE_PAUSE_THRESHOLD, SLOT_SAFETY_MARGIN_MS as M } from '../src/fetcher';
import { FileDomainStateStore } from '../src/state/file';
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
    expect(res).toMatchObject({ skipped: 'paused', blocked: true, blockReason: 'paused' });
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
    expect(res).toMatchObject({ skipped: 'paused', attempts: 2 });
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
