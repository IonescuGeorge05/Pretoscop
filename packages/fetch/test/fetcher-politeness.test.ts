import { errors as undiciErrors, type MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { PAUSE_BLOCK_MS, SLOT_SAFETY_MARGIN_MS as M } from '../src/fetcher';
import type { AssistedChannel } from '../src/types';
import { ROBOTS_ALLOW_ALL, mockAgent, readFixture, testFetcher } from './helpers';

const A = 'https://shop-a.test';
const B = 'https://shop-b.test';
const HOUR = 3_600_000;
const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body>${title}</body></html>`;
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

let agent: MockAgent;
const agents: MockAgent[] = [];
const newAgent = () => {
  const created = mockAgent();
  agents.push(created);
  return created;
};
afterEach(async () => {
  await Promise.all(agents.splice(0).map((a) => a.close()));
});

function shop(origin: string, robots: string = ROBOTS_ALLOW_ALL) {
  const pool = agent.get(origin);
  pool.intercept({ path: '/robots.txt' }).reply(200, robots, { headers: { 'content-type': 'text/plain' } }).persist();
  return pool;
}

describe('per-host throttle', () => {
  it('starts two requests to one host at least the minimum interval apart (with 0–10% jitter)', async () => {
    agent = newAgent();
    shop(A).intercept({ path: /^\/p\// }).reply(200, html('produs'), { headers: HTML_HEADERS }).persist();
    const { fetcher, log } = testFetcher({ dispatcher: agent, random: () => 0.5 });
    await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    const second = await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    expect(second.ok).toBe(true);
    const starts = log.network().map((e) => e.ts.getTime());
    expect(log.network().map((e) => new URL(e.url).pathname)).toEqual(['/robots.txt', '/p/1', '/p/2']);
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] as number) - (starts[i - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(5000 + M);
      expect(gap).toBeLessThanOrEqual(5500 + M);
    }
    expect(second.waitedMs).toBe(5250 + M);
  });

  it('never goes below the interval even with the largest jitter, and never above 10% extra', async () => {
    agent = newAgent();
    shop(A).intercept({ path: /^\/p\// }).reply(200, html('x'), { headers: HTML_HEADERS }).persist();
    const { fetcher, log } = testFetcher({ dispatcher: agent, random: () => 0.999999 });
    await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    const waits = log.network().map((e) => e.waitMs);
    expect(waits[0]).toBe(0);
    for (const w of waits.slice(1)) {
      expect(w).toBeGreaterThanOrEqual(5000 + M);
      expect(w).toBeLessThan(5500 + M);
    }
  });

  it('does not make different hosts wait for each other', async () => {
    agent = newAgent();
    shop(A, 'User-agent: *\nAllow: /\n').intercept({ path: '/p/1' }).reply(200, html('a'), { headers: HTML_HEADERS }).persist();
    shop(B, 'User-agent: *\nAllow: /\n').intercept({ path: '/p/1' }).reply(200, html('b'), { headers: HTML_HEADERS }).persist();
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    await fetcher.robotsFor('shop-a.test');
    await fetcher.robotsFor('shop-b.test');
    const before = log.network().length;
    const a = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    const b = await fetcher.fetchPolite(`${B}/p/1`, { purpose: 'product' });
    expect(a.ok && b.ok).toBe(true);
    // Each host's page waits only for its own robots.txt request, never for the other host.
    expect(log.network().slice(before).map((e) => e.waitMs)).toEqual([5000 + M, 0]);
  });

  it('honours a robots.txt Crawl-delay longer than the policy interval, unless the policy says not to', async () => {
    agent = newAgent();
    shop(A, 'User-agent: *\nCrawl-delay: 12\nDisallow: /cart\n').intercept({ path: /^\/p\// }).reply(200, html('x'), { headers: HTML_HEADERS }).persist();
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    // The first page already waits the full Crawl-delay after robots.txt, not just the policy interval.
    expect(log.network().map((e) => e.waitMs)).toEqual([0, 12_000 + M, 12_000 + M]);

    const other = testFetcher({ dispatcher: agent, policy: { respectCrawlDelay: false } });
    await other.fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    await other.fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    expect(other.log.network().map((e) => e.waitMs)).toEqual([0, 5000 + M, 5000 + M]);
  });
});

describe('crawl window and daily budget', () => {
  it('skips outside an overnight window without a request, and fetches inside it', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(200, html('x'), { headers: HTML_HEADERS }).persist();
    const { fetcher, clock, log } = testFetcher({ dispatcher: agent, policy: { allowedHours: { start: '22:00', end: '06:00' } } });
    clock.t = Date.parse('2026-10-28T12:00:00Z'); // 14:00 in Bucharest
    const day = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(day).toMatchObject({ skipped: 'outside_allowed_hours', status: 0, attempts: 0, blocked: false });
    expect(log.network()).toHaveLength(0);
    expect(log.entries[0]).toMatchObject({ skipped: 'outside_allowed_hours', attempt: 0 });

    // robots.txt (one small request) is not bulk crawling: allowed outside the window.
    const robots = await fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' });
    expect(robots.status).toBe(200);

    clock.t = Date.parse('2026-10-28T21:30:00Z'); // 23:30 in Bucharest
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
  });

  it('stops at maxPagesPerDay (robots.txt counts) and resets on the next Bucharest day', async () => {
    agent = newAgent();
    shop(A).intercept({ path: /^\/p\// }).reply(200, html('x'), { headers: HTML_HEADERS }).persist();
    const { fetcher, clock } = testFetcher({ dispatcher: agent, policy: { maxPagesPerDay: 3 } });
    clock.t = Date.parse('2026-10-28T10:00:00Z');
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true); // robots + page
    expect((await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' })).ok).toBe(true);
    const third = await fetcher.fetchPolite(`${A}/p/3`, { purpose: 'product' });
    expect(third).toMatchObject({ skipped: 'budget_exhausted', status: 0 });
    clock.t = Date.parse('2026-10-28T22:00:00Z'); // 00:00 on 29 Oct in Bucharest
    expect((await fetcher.fetchPolite(`${A}/p/3`, { purpose: 'product' })).ok).toBe(true);
  });
});

describe('access modes', () => {
  it("'off' makes no request at all, not even robots.txt", async () => {
    agent = newAgent();
    const { fetcher, log } = testFetcher({ dispatcher: agent, policy: { accessMode: 'off' } });
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).skipped).toBe('access_off');
    expect((await fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' })).skipped).toBe('access_off');
    expect(await fetcher.isAllowedByRobots(`${A}/p/1`)).toBe(false);
    expect(log.network()).toHaveLength(0);
  });

  it("'feed_only' allows feeds (and their robots.txt) but nothing else", async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/feed.xml' }).reply(200, '<?xml version="1.0"?><rss/>', { headers: { 'content-type': 'application/xml' } });
    const { fetcher } = testFetcher({ dispatcher: agent, policy: { accessMode: 'feed_only' } });
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).skipped).toBe('feed_only');
    const feed = await fetcher.fetchPolite(`${A}/feed.xml`, { purpose: 'feed' });
    expect(feed).toMatchObject({ ok: true, body: '<?xml version="1.0"?><rss/>' });
  });

  it("'assisted' without a vendor client skips; with one, routes through it with the same politeness", async () => {
    agent = newAgent();
    const without = testFetcher({ dispatcher: agent, policy: { accessMode: 'assisted' } });
    expect((await without.fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).skipped).toBe('assisted_unavailable');

    const calls: Array<{ url: string; render: boolean }> = [];
    const assisted: AssistedChannel = {
      async fetch(url, req) {
        calls.push({ url, render: req.render });
        if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /cart\n', contentType: 'text/plain' };
        return { status: 200, body: html('produs prin canal asistat'), contentType: 'text/html' };
      },
    };
    const { fetcher, log } = testFetcher({ dispatcher: agent, assisted, policy: { accessMode: 'assisted', assistedRender: true } });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ ok: true, channel: 'assisted', status: 200 });
    expect((await fetcher.fetchPolite(`${A}/cart`, { purpose: 'product' })).skipped).toBe('robots_disallowed');
    expect(calls.map((c) => [new URL(c.url).pathname, c.render])).toEqual([
      ['/robots.txt', true],
      ['/p/1', true],
    ]);
    expect(log.network().map((e) => [e.channel, e.waitMs])).toEqual([
      ['assisted', 0],
      ['assisted', 5000 + M],
    ]);
  });

  it('maps a vendor-reported block to vendor_blocked without pausing the shop', async () => {
    agent = newAgent();
    const assisted: AssistedChannel = {
      async fetch(url) {
        if (url.endsWith('/robots.txt')) return { status: 404, body: '' };
        return { status: 200, body: readFixture('blocks', 'cloudflare_challenge_synthetic.html'), contentType: 'text/html' };
      },
    };
    const { fetcher, store } = testFetcher({ dispatcher: agent, assisted, policy: { accessMode: 'assisted' } });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'vendor_blocked', ok: false, body: null });
    expect(await store.getPause('shop-a.test')).toBeNull();
    expect(await store.getFailures('shop-a.test')).toBe(1);
  });
});

describe('blocks and pauses', () => {
  it('pauses 24 h on a 403, returns paused without a request, and resumes after the pause', async () => {
    agent = newAgent();
    const pool = shop(A);
    pool.intercept({ path: '/p/1' }).reply(403, readFixture('blocks', 'akamai_access_denied_403_synthetic.html'), {
      headers: { ...HTML_HEADERS, server: 'AkamaiGHost' },
    });
    const { fetcher, clock, store, log } = testFetcher({ dispatcher: agent });
    const first = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(first).toMatchObject({ blocked: true, blockReason: 'http_403', status: 403, ok: false, body: null });
    expect(first.blockDetail).toMatch(/Akamai/);
    expect((await store.getPause('shop-a.test'))?.until).toBe(clock.t + PAUSE_BLOCK_MS);

    const networkBefore = log.network().length;
    const second = await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' });
    expect(second).toMatchObject({ blocked: true, blockReason: 'paused', skipped: 'paused', status: 0 });
    expect(log.network()).toHaveLength(networkBefore);

    clock.advance(PAUSE_BLOCK_MS);
    pool.intercept({ path: '/p/2' }).reply(200, html('ok'), { headers: HTML_HEADERS });
    expect((await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' })).ok).toBe(true);
  });

  it('treats a Fastly "Client Challenge" served with 200 as a block (body never returned)', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(200, readFixture('blocks', 'fastly_client_challenge_200_synthetic.html'), { headers: HTML_HEADERS });
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'challenge', status: 200, ok: false, body: null, bodyBytes: null });
    expect(await store.getPause('shop-a.test')).not.toBeNull();
  });

  it('honours Retry-After on 429 with a one-hour minimum', async () => {
    agent = newAgent();
    const pool = shop(A);
    pool.intercept({ path: '/a' }).reply(429, 'slow down', { headers: { 'retry-after': '7200' } });
    pool.intercept({ path: '/b' }).reply(429, 'slow down', { headers: { 'retry-after': '60' } });
    const { fetcher, clock, store } = testFetcher({ dispatcher: agent });
    const a = await fetcher.fetchPolite(`${A}/a`, { purpose: 'product' });
    expect(a).toMatchObject({ blocked: true, blockReason: 'http_429', attempts: 1 });
    expect((await store.getPause('shop-a.test'))?.until).toBe(clock.t + 2 * HOUR);
    await fetcher.unpauseDomain('shop-a.test');
    await fetcher.fetchPolite(`${A}/b`, { purpose: 'product' });
    expect((await store.getPause('shop-a.test'))?.until).toBe(clock.t + HOUR);
  });

  it('pauses on 503 with Retry-After without retrying', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(503, html('Maintenance'), { headers: { ...HTML_HEADERS, 'retry-after': '600' } });
    const { fetcher, clock, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ status: 503, ok: false, blocked: false, attempts: 1 });
    expect((await store.getPause('shop-a.test'))?.until).toBe(clock.t + HOUR);
  });

  it('retries 5xx twice with exponential back-off (10 s, 20 s)', async () => {
    agent = newAgent();
    const pool = shop(A);
    pool.intercept({ path: '/p/1' }).reply(500, 'oops').times(2);
    pool.intercept({ path: '/p/1' }).reply(200, html('ok'), { headers: HTML_HEADERS });
    const { fetcher, clock, store, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ ok: true, status: 200, attempts: 3 });
    expect(clock.sleeps).toEqual([5000 + M, 10_000, 20_000]);
    expect(log.network().map((e) => [e.attempt, e.status])).toEqual([
      [1, 200],
      [1, 500],
      [2, 500],
      [3, 200],
    ]);
    expect(await store.getFailures('shop-a.test')).toBe(0);
    expect(await store.getPause('shop-a.test')).toBeNull();
  });

  it('pauses after 3 consecutive failures for 1 h, then doubles up to 24 h', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(500, 'down').persist();
    const { fetcher, clock, store } = testFetcher({ dispatcher: agent });
    const first = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(first).toMatchObject({ status: 500, attempts: 3, ok: false });
    const pauses: number[] = [];
    let pause = await store.getPause('shop-a.test');
    pauses.push((pause?.until ?? 0) - clock.t);
    for (let i = 0; i < 6; i++) {
      clock.t = pause?.until ?? clock.t;
      const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
      expect(res.attempts).toBe(1); // the breaker trips on the first failed attempt
      pause = await store.getPause('shop-a.test');
      pauses.push((pause?.until ?? 0) - clock.t);
    }
    expect(pauses.map((ms) => ms / HOUR)).toEqual([1, 2, 4, 8, 16, 24, 24]);
  });

  it('never follows a redirect to a CAPTCHA host and pauses the host', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(302, '', { headers: { location: 'http://captcha.distinct.ro/?original_url=https://shop-a.test/p/1' } });
    const { fetcher, store, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'captcha_redirect', status: 302, finalUrl: `${A}/p/1` });
    expect(log.network().map((e) => e.url)).toEqual([`${A}/robots.txt`, `${A}/p/1`]);
    expect(await store.getPause('shop-a.test')).not.toBeNull();
  });

  it('classifies a transport reset as a block (MockAgent error)', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).replyWithError(new undiciErrors.SocketError('other side closed'));
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'transport', errorCode: 'connection_reset', attempts: 1 });
    expect((await store.getPause('shop-a.test'))?.reason).toMatch(/^transport/);
  });

  it('pauses and unpauses by hand', async () => {
    agent = newAgent();
    shop(A).intercept({ path: '/p/1' }).reply(200, html('ok'), { headers: HTML_HEADERS }).persist();
    const { fetcher, store, log } = testFetcher({ dispatcher: agent });
    await fetcher.pauseDomain('https://shop-a.test/any/path', 2, 'shop asked us to stop (email of 28 Oct)');
    const paused = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(paused).toMatchObject({ skipped: 'paused', blocked: true, blockReason: 'paused' });
    expect(paused.blockDetail).toMatch(/shop asked us to stop/);
    expect(log.network()).toHaveLength(0);
    expect((await store.getPause('shop-a.test'))?.source).toBe('manual');
    await fetcher.unpauseDomain('shop-a.test');
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
    await expect(fetcher.pauseDomain('shop-a.test', 0, 'x')).rejects.toThrow(RangeError);
  });
});

describe('request log and options', () => {
  it('writes one entry per request and per skipped call, with run and source ids', async () => {
    agent = newAgent();
    shop(A, 'User-agent: *\nDisallow: /cart\n').intercept({ path: '/p/1' }).reply(200, html('ok'), { headers: HTML_HEADERS });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product', shopSlug: 'shop-a', runId: 42, sourceId: 7 });
    await fetcher.fetchPolite(`${A}/cart`, { purpose: 'product', shopSlug: 'shop-a', runId: 42, sourceId: 7 });
    expect(log.entries.map((e) => [e.purpose, new URL(e.url).pathname, e.status, e.skipped ?? null, e.robotsGroup ?? null])).toEqual([
      ['robots', '/robots.txt', 200, null, null],
      ['product', '/p/1', 200, null, '*'],
      ['product', '/cart', 0, 'robots_disallowed', '*'],
    ]);
    for (const e of log.entries) expect(e).toMatchObject({ shopSlug: 'shop-a', runId: 42, sourceId: 7, method: 'GET', channel: 'direct' });
  });

  it('rejects invalid URLs and honours an aborted signal', async () => {
    agent = newAgent();
    const { fetcher } = testFetcher({ dispatcher: agent });
    expect(await fetcher.fetchPolite('not a url', { purpose: 'product' })).toMatchObject({ errorCode: 'invalid_url', ok: false });
    expect(await fetcher.fetchPolite('ftp://shop-a.test/x', { purpose: 'product' })).toMatchObject({ errorCode: 'unsupported_scheme' });
    shop(A);
    const controller = new AbortController();
    controller.abort();
    expect(await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product', signal: controller.signal })).toMatchObject({
      errorCode: 'aborted',
      ok: false,
    });
  });

  it('rejects an unknown purpose as a programming error', async () => {
    agent = newAgent();
    const { fetcher } = testFetcher({ dispatcher: agent });
    await expect(fetcher.fetchPolite(`${A}/p/1`, { purpose: 'everything' as never })).rejects.toThrow(TypeError);
  });

  it('refuses a test User-Agent override that hides the PretoscopBot token', () => {
    expect(() => testFetcher({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' })).toThrow(/PretoscopBot/);
    expect(() => testFetcher({ botInfoUrl: 'javascript:alert(1)' })).toThrow(/botInfoUrl/);
  });
});
