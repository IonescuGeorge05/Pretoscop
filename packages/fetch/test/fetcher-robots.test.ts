import { errors as undiciErrors, type MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { ROBOTS_FAILURE_TTL_MS, ROBOTS_TTL_MS } from '../src/fetcher';
import { mockAgent, readFixture, testFetcher } from './helpers';

const A = 'https://www.shop-a.test';
const HOST = 'www.shop-a.test';
const TEXT = { 'content-type': 'text/plain; charset=utf-8' };
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const page = '<!doctype html><html><head><title>Produs</title></head><body>ok</body></html>';

const agents: MockAgent[] = [];
const newAgent = () => {
  const created = mockAgent();
  agents.push(created);
  return created;
};
afterEach(async () => {
  await Promise.all(agents.splice(0).map((a) => a.close()));
});

describe('robots.txt status handling', () => {
  it('2xx: parses, caches for 24 h, then revalidates with a conditional GET', async () => {
    const agent = newAgent();
    const pool = agent.get(A);
    const seen: Array<Record<string, string>> = [];
    pool
      .intercept({ path: '/robots.txt' })
      .reply((opts) => {
        seen.push({ ...(opts.headers as Record<string, string>) });
        return { statusCode: 200, data: 'User-agent: *\nDisallow: /cart\n', responseOptions: { headers: { ...TEXT, etag: '"v1"' } } };
      });
    pool.intercept({ path: '/robots.txt', headers: { 'if-none-match': '"v1"' } }).reply(304, '');
    pool.intercept({ path: /^\/p\// }).reply(200, page, { headers: HTML }).persist();

    const { fetcher, clock, log } = testFetcher({ dispatcher: agent });
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
    expect((await fetcher.fetchPolite(`${A}/cart`, { purpose: 'product' })).skipped).toBe('robots_disallowed');
    expect((await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' })).ok).toBe(true);
    expect(log.network().filter((e) => e.purpose === 'robots')).toHaveLength(1);

    clock.advance(ROBOTS_TTL_MS + 1);
    expect((await fetcher.fetchPolite(`${A}/cart`, { purpose: 'product' })).skipped).toBe('robots_disallowed');
    const robotsRequests = log.network().filter((e) => e.purpose === 'robots');
    expect(robotsRequests.map((e) => e.status)).toEqual([200, 304]);
    expect(seen[0]?.['if-none-match']).toBeUndefined();
    const info = await fetcher.robotsFor(HOST);
    expect(info).toMatchObject({ outcome: 'parsed', source: 'cache', matchedGroup: '*', status: 200 });
  });

  it('3xx: follows up to five redirects (even to another host) and applies the target to the original host', async () => {
    const agent = newAgent();
    agent.get('https://shop-a.test').intercept({ path: '/robots.txt' }).reply(301, '', { headers: { location: 'https://www.shop-a.test/robots.txt' } });
    agent.get(A).intercept({ path: '/robots.txt' }).reply(302, '', { headers: { location: 'https://cdn.static-shop.test/shop-a/robots.txt' } });
    agent.get('https://cdn.static-shop.test').intercept({ path: '/shop-a/robots.txt' }).reply(200, 'User-agent: *\nDisallow: /cos\n', { headers: TEXT });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const info = await fetcher.robotsFor('shop-a.test');
    expect(info).toMatchObject({ outcome: 'parsed', rules: [{ type: 'disallow', pattern: '/cos' }] });
    expect(await fetcher.isAllowedByRobots('https://shop-a.test/cos')).toBe(false);
    expect(log.network().map((e) => [e.host, e.status, e.hop])).toEqual([
      ['shop-a.test', 301, 0],
      ['www.shop-a.test', 302, 1],
      ['cdn.static-shop.test', 200, 2],
    ]);
  });

  it('more than five redirects: complete disallow', async () => {
    const agent = newAgent();
    const pool = agent.get(A);
    for (let i = 0; i < 6; i++) {
      pool.intercept({ path: i === 0 ? '/robots.txt' : `/r${i}` }).reply(302, '', { headers: { location: `/r${i + 1}` } });
    }
    const { fetcher } = testFetcher({ dispatcher: agent });
    const info = await fetcher.robotsFor(HOST);
    expect(info).toMatchObject({ outcome: 'too_many_redirects', disallowAll: true });
    expect(await fetcher.isAllowedByRobots(`${A}/p/1`)).toBe(false);
  });

  it.each([404, 410, 401])('%i: everything allowed (cached 24 h)', async (status) => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(status, 'Not Found', { headers: TEXT });
    agent.get(A).intercept({ path: '/p/1' }).reply(200, page, { headers: HTML });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res.ok).toBe(true);
    expect(log.network().find((e) => e.url.endsWith('/p/1'))?.robotsGroup).toBe('no-robots');
    const info = await fetcher.robotsFor(HOST);
    expect(info).toMatchObject({ outcome: 'not_found', allowAll: true, disallowAll: false, source: 'cache' });
    expect(Date.parse(info.expiresAt ?? '') - Date.parse(info.fetchedAt ?? '')).toBe(ROBOTS_TTL_MS);
  });

  it('5xx: complete disallow, retried, cached for one hour only', async () => {
    const agent = newAgent();
    const pool = agent.get(A);
    pool.intercept({ path: '/robots.txt' }).reply(500, 'error').times(3);
    pool.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n', { headers: TEXT });
    pool.intercept({ path: '/p/1' }).reply(200, page, { headers: HTML });
    const { fetcher, clock, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', errorCode: 'robots_unavailable', blocked: false });
    expect(res.error).toMatch(/unreachable/);
    const entry = await store.getRobots(A);
    expect(entry).toMatchObject({ outcome: 'unreachable', status: 500 });
    expect((entry?.expiresAt ?? 0) - (entry?.fetchedAt ?? 0)).toBe(ROBOTS_FAILURE_TTL_MS);
    // Three failed robots.txt attempts also tripped the failure breaker (1 h).
    expect(await store.getPause(HOST)).not.toBeNull();
    clock.advance(ROBOTS_FAILURE_TTL_MS);
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
  });

  it('network error: complete disallow', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).replyWithError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })).persist();
    const { fetcher } = testFetcher({ dispatcher: agent, retry: { maxRetries: 0 } });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', errorCode: 'robots_unavailable' });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ outcome: 'unreachable', disallowAll: true, status: 0 });
  });

  it('403 on robots.txt (edge block): complete disallow and the host is paused', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(403, readFixture('blocks', 'cloudfront_request_blocked_403_synthetic.html'), {
      headers: { ...HTML, server: 'CloudFront' },
    });
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', blocked: true, blockReason: 'http_403' });
    expect(res.blockDetail).toMatch(/CloudFront/);
    expect((await store.getPause(HOST))?.blockReason).toBe('http_403');
    expect((await fetcher.fetchPolite(`${A}/p/2`, { purpose: 'product' })).skipped).toBe('paused');
  });

  it('a transport reset on robots.txt (Akamai HTTP/2 reset): complete disallow and pause', async () => {
    const agent = newAgent();
    agent
      .get(A)
      .intercept({ path: '/robots.txt' })
      .replyWithError(Object.assign(new Error('Stream closed with error code NGHTTP2_INTERNAL_ERROR'), { code: 'ERR_HTTP2_STREAM_ERROR' }));
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ skipped: 'robots_disallowed', blocked: true, blockReason: 'transport' });
    expect(await store.getPause(HOST)).not.toBeNull();
  });

  it('an HTML challenge served for robots.txt (EdgeOne, 200): complete disallow and pause', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, readFixture('blocks', 'edgeone_challenge_200_synthetic.html'), { headers: HTML });
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const direct = await fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' });
    expect(direct).toMatchObject({ blocked: true, blockReason: 'challenge', status: 200, body: null });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ outcome: 'blocked', disallowAll: true, blockReason: 'challenge' });
    expect(await store.getPause(HOST)).not.toBeNull();
  });

  it('a Decathlon-style robots.txt naming _Incapsula_Resource is parsed, not treated as a challenge', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, readFixture('robots', 'decathlon_style_incapsula_synthetic.txt'), { headers: TEXT });
    agent.get(A).intercept({ path: '/p/1' }).reply(200, page, { headers: HTML });
    const { fetcher, store } = testFetcher({ dispatcher: agent });
    const robots = await fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' });
    expect(robots).toMatchObject({ blocked: false, ok: true, status: 200 });
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
    expect(await fetcher.isAllowedByRobots(`${A}/_Incapsula_Resource?x=1`)).toBe(false);
    expect(await fetcher.isAllowedByRobots(`${A}/checkout`)).toBe(false);
    expect(await store.getPause(HOST)).toBeNull();
    const info = await fetcher.robotsFor(HOST);
    expect(info.sitemaps).toHaveLength(3);
    expect(info.crawlDelaySec).toBeNull(); // the Crawl-delay lines are for MJ12bot and FacebookBot
  });

  it('an HTML page without rules (soft 404) is parsed as "no rules" and flagged', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, page, { headers: HTML });
    const { fetcher } = testFetcher({ dispatcher: agent });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ outcome: 'parsed', htmlBody: true, allowAll: true, matchedGroup: 'none' });
  });

  it('a 429 on robots.txt pauses for Retry-After and disallows', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(429, 'Too Many Requests', { headers: { ...TEXT, 'retry-after': '10800' } });
    const { fetcher, clock, store } = testFetcher({ dispatcher: agent });
    expect(await fetcher.isAllowedByRobots(`${A}/p/1`)).toBe(false);
    expect((await store.getPause(HOST))?.until).toBe(clock.t + 3 * 3_600_000);
  });

  it('keeps only the first 512 KiB of a huge robots.txt', async () => {
    const agent = newAgent();
    const huge = `User-agent: *\nDisallow: /early\n${'# padding\n'.repeat(60_000)}Disallow: /late\n`;
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, huge, { headers: TEXT });
    const { fetcher } = testFetcher({ dispatcher: agent });
    const info = await fetcher.robotsFor(HOST);
    expect(info).toMatchObject({ outcome: 'parsed', truncated: true });
    expect(await fetcher.isAllowedByRobots(`${A}/early`)).toBe(false);
    expect(await fetcher.isAllowedByRobots(`${A}/late`)).toBe(true);
  });
});

describe('robots.txt decisions per shop', () => {
  it('ignores cel.ro-style generic groups under RFC 9309 and makes that visible', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, readFixture('robots', 'celro_style_generic_tokens_synthetic.txt'), { headers: TEXT });
    agent.get(A).intercept({ path: '/telefoane/samsung-galaxy-1.html' }).reply(200, page, { headers: HTML });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/telefoane/samsung-galaxy-1.html`, { purpose: 'product', shopSlug: 'cel' });
    expect(res.ok).toBe(true);
    const entry = log.network().find((e) => e.purpose === 'product');
    expect(entry?.robotsGroup).toBe('*');
    expect(entry?.robotsIgnoredGroups).toEqual(['bot-', 'bot/', 'crawl', 'robot', 'spider']);
    const info = await fetcher.robotsFor(HOST);
    expect(info.matchedGroup).toBe('*');
    expect(info.ignoredGroups.map((g) => `${g.userAgent}:${g.reason}`)).toEqual([
      'bot-:generic_fragment',
      'bot/:generic_fragment',
      'crawl:generic_fragment',
      'robot:generic_fragment',
      'spider:generic_fragment',
    ]);
    expect(await fetcher.isAllowedByRobots(`${A}/cumpara/123`)).toBe(false);
    expect(await fetcher.isAllowedByRobots(`${A}/nou/blackfriday/oferte`)).toBe(true);
  });

  it('describes the robots.txt that applies to PretoscopBot', async () => {
    const agent = newAgent();
    const robots = [
      'User-agent: *',
      'Disallow: /checkout',
      'Disallow: /*?sort=',
      'Crawl-delay: 2',
      '',
      'User-agent: PretoscopBot',
      'Allow: /',
      'Disallow: /cart',
      'Crawl-delay: 8',
      '',
      'Sitemap: https://www.shop-a.test/sitemap.xml',
    ].join('\n');
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, robots, { headers: TEXT });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const info = await fetcher.robotsFor(`${A}/any/page`);
    expect(info).toMatchObject({
      host: HOST,
      robotsUrl: `${A}/robots.txt`,
      productToken: 'PretoscopBot',
      source: 'network',
      status: 200,
      matchedGroup: 'PretoscopBot',
      matchedUserAgents: ['PretoscopBot'],
      rules: [
        { type: 'allow', pattern: '/' },
        { type: 'disallow', pattern: '/cart' },
      ],
      crawlDelaySec: 8,
      sitemaps: ['https://www.shop-a.test/sitemap.xml'],
      groupCount: 2,
      allowAll: false,
      disallowAll: false,
      channel: 'direct',
    });
    expect(await fetcher.isAllowedByRobots(`${A}/checkout`)).toBe(true); // the * group does not apply to us
    expect(await fetcher.isAllowedByRobots(`${A}/cart`)).toBe(false);
    expect(log.network()).toHaveLength(1);
  });

  it('a manual unpause drops a robots.txt result cached while blocked', async () => {
    const agent = newAgent();
    const pool = agent.get(A);
    pool.intercept({ path: '/robots.txt' }).reply(403, 'Forbidden', { headers: TEXT });
    pool.intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n', { headers: TEXT });
    pool.intercept({ path: '/p/1' }).reply(200, page, { headers: HTML });
    const { fetcher } = testFetcher({ dispatcher: agent });
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).blocked).toBe(true);
    await fetcher.unpauseDomain(HOST);
    expect((await fetcher.fetchPolite(`${A}/p/1`, { purpose: 'product' })).ok).toBe(true);
  });

  it('robots.txt fetched via fetchPolite feeds the cache (no second request for robotsFor)', async () => {
    const agent = newAgent();
    agent.get(A).intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow: /cart\n', { headers: TEXT });
    const { fetcher, log } = testFetcher({ dispatcher: agent });
    const res = await fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' });
    expect(res).toMatchObject({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /cart\n' });
    expect(await fetcher.robotsFor(HOST)).toMatchObject({ source: 'cache', outcome: 'parsed' });
    expect(log.network()).toHaveLength(1);
  });

  it('closing a fetcher with an injected dispatcher leaves the dispatcher alone', async () => {
    const agent = newAgent();
    const { fetcher } = testFetcher({ dispatcher: agent });
    await fetcher.close();
    agent.get(A).intercept({ path: '/robots.txt' }).replyWithError(new undiciErrors.SocketError('other side closed'));
    expect((await testFetcher({ dispatcher: agent }).fetcher.fetchPolite(`${A}/robots.txt`, { purpose: 'robots' })).blockReason).toBe(
      'transport',
    );
  });
});
