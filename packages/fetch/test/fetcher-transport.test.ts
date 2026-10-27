import type { ServerResponse } from 'node:http';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import { H2CClient } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { buildUserAgent, createFetcher, MemoryDomainStateStore, type Fetcher } from '../src/index';
import { collectLog, startServer, testFetcher, type TestServer } from './helpers';

const PAGE = '<!doctype html><html><head><title>Produs</title></head><body>Preț: 2.199,99 lei</body></html>';
const ROBOTS = 'User-agent: *\nDisallow: /cart\n';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

async function server(handler: Parameters<typeof startServer>[0]): Promise<TestServer> {
  const s = await startServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(ROBOTS);
      return;
    }
    handler(req, res);
  });
  cleanups.push(s.close);
  return s;
}

/** Fake clock for slot waits (no real waiting), real network to 127.0.0.1. */
function localFetcher(extra: Parameters<typeof testFetcher>[0] = {}) {
  const t = testFetcher(extra);
  cleanups.push(() => t.fetcher.close());
  return t;
}

describe('identity on the wire', () => {
  it('sends exactly the PretoscopBot headers: no cookies, no Referer, no browser hints', async () => {
    const s = await server((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
    });
    const { fetcher } = localFetcher();
    await fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product' });
    await fetcher.fetchPolite(`${s.origin}/feed.xml`, { purpose: 'feed' });
    const pageHit = s.hits.find((h) => h.path === '/p/1');
    expect(pageHit?.headers['user-agent']).toBe(buildUserAgent('page', process.env.BOT_INFO_URL ?? 'https://pretoscop.ro/bot'));
    expect(pageHit?.headers['user-agent']).toMatch(/^Mozilla\/5\.0 \(compatible; PretoscopBot\/1\.0; \+https?:\/\/\S+\)$/);
    expect(pageHit?.headers['accept-encoding']).toBe('gzip, deflate, br');
    expect(pageHit?.headers['accept-language']).toBe('ro-RO,ro;q=0.9,en;q=0.6');
    expect(pageHit?.headers.accept).toMatch(/^text\/html/);
    const names = Object.keys(pageHit?.headers ?? {}).sort();
    expect(names.filter((n) => !['host', 'connection'].includes(n))).toEqual([
      'accept',
      'accept-encoding',
      'accept-language',
      'user-agent',
    ]);
    const feedHit = s.hits.find((h) => h.path === '/feed.xml');
    expect(feedHit?.headers['user-agent']).toMatch(/^Mozilla\/5\.0 \(compatible; PretoscopBot-Feed\/1\.0; \+/);
  });
});

describe('bodies', () => {
  it('decodes gzip and brotli responses', async () => {
    const s = await server((req, res) => {
      const raw = Buffer.from(PAGE);
      if (req.url === '/gz') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync(raw));
      } else {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'br' });
        res.end(zlib.brotliCompressSync(raw));
      }
    });
    const { fetcher } = localFetcher();
    expect((await fetcher.fetchPolite(`${s.origin}/gz`, { purpose: 'product' })).body).toBe(PAGE);
    expect((await fetcher.fetchPolite(`${s.origin}/br`, { purpose: 'product' })).body).toBe(PAGE);
  });

  it('decodes a windows-1250 page from its Content-Type charset', async () => {
    const s = await server((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=windows-1250' });
      // "<p>Preţ şi îngheţată</p>" in windows-1250
      res.end(Buffer.from([0x3c, 0x70, 0x3e, 0x50, 0x72, 0x65, 0xfe, 0x20, 0xba, 0x69, 0x20, 0xee, 0x6e, 0x67, 0x68, 0x65, 0xfe, 0x61, 0x74, 0xe3, 0x3c, 0x2f, 0x70, 0x3e]));
    });
    const { fetcher } = localFetcher();
    expect((await fetcher.fetchPolite(`${s.origin}/p`, { purpose: 'product' })).body).toBe('<p>Preţ şi îngheţată</p>');
  });

  it('enforces the size cap from Content-Length and while streaming; not a block, not a failure', async () => {
    const s = await server((req, res) => {
      if (req.url === '/declared') {
        res.writeHead(200, { 'content-type': 'text/html', 'content-length': String(5 * 1024 * 1024) });
        res.end(Buffer.alloc(5 * 1024 * 1024, 0x61));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }); // chunked, no length
      for (let i = 0; i < 64; i++) res.write(Buffer.alloc(64 * 1024, 0x62));
      res.end();
    });
    const { fetcher, store } = localFetcher();
    const declared = await fetcher.fetchPolite(`${s.origin}/declared`, { purpose: 'product', maxBytes: 1024 * 1024 });
    expect(declared).toMatchObject({ ok: false, blocked: false, errorCode: 'body_too_large', attempts: 1 });
    const streamed = await fetcher.fetchPolite(`${s.origin}/streamed`, { purpose: 'product', maxBytes: 1024 * 1024 });
    expect(streamed).toMatchObject({ ok: false, blocked: false, errorCode: 'body_too_large', attempts: 1 });
    expect(await store.getPause(s.host)).toBeNull();
    expect(await store.getFailures(s.host)).toBe(0);
  });

  it('caps a gzip bomb on the decoded size', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(32 * 1024 * 1024));
    const s = await server((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      res.end(bomb);
    });
    const { fetcher } = localFetcher();
    const res = await fetcher.fetchPolite(`${s.origin}/bomb`, { purpose: 'product', maxBytes: 2 * 1024 * 1024 });
    expect(res).toMatchObject({ errorCode: 'body_too_large', blocked: false });
  });

  it('sends If-None-Match / If-Modified-Since and reports 304 as notModified', async () => {
    const s = await server((req, res) => {
      if (req.headers['if-none-match'] === '"abc"' || req.headers['if-modified-since'] === 'Tue, 27 Oct 2026 10:00:00 GMT') {
        res.writeHead(304, { etag: '"abc"' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/xml', etag: '"abc"', 'last-modified': 'Tue, 27 Oct 2026 10:00:00 GMT' });
      res.end('<?xml version="1.0"?><urlset/>');
    });
    const { fetcher } = localFetcher();
    const first = await fetcher.fetchPolite(`${s.origin}/sitemap.xml`, { purpose: 'sitemap' });
    expect(first).toMatchObject({ ok: true, status: 200, notModified: false });
    expect(first.headers.etag).toBe('"abc"');
    const byEtag = await fetcher.fetchPolite(`${s.origin}/sitemap.xml`, { purpose: 'sitemap', etag: first.headers.etag });
    expect(byEtag).toMatchObject({ ok: true, status: 304, notModified: true, body: null, bodyBytes: null });
    const byDate = await fetcher.fetchPolite(`${s.origin}/sitemap.xml`, { purpose: 'sitemap', lastModified: first.headers['last-modified'] });
    expect(byDate.notModified).toBe(true);
  });

  it('decodes a .xml.gz sitemap file (gzip as the payload, not as Content-Encoding)', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://x/p/1</loc></url></urlset>';
    const s = await server((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-gzip' });
      res.end(zlib.gzipSync(Buffer.from(xml)));
    });
    const { fetcher } = localFetcher();
    const res = await fetcher.fetchPolite(`${s.origin}/sitemap-products-1.xml.gz`, { purpose: 'sitemap' });
    expect(res.body).toBe(xml);
    const asPage = await fetcher.fetchPolite(`${s.origin}/sitemap-products-1.xml.gz`, { purpose: 'product' });
    expect(asPage.body).toBeNull();
    expect(asPage.bodyBytes?.length).toBeGreaterThan(0);
  });
});

describe('redirects', () => {
  it('follows a same-host redirect, and the hop waits for its own slot', async () => {
    const s = await server((req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: '/new' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
    });
    const { fetcher, log } = localFetcher();
    const res = await fetcher.fetchPolite(`${s.origin}/old`, { purpose: 'product' });
    expect(res).toMatchObject({ ok: true, status: 200, finalUrl: `${s.origin}/new`, url: `${s.origin}/old` });
    expect(log.network().map((e) => [new URL(e.url).pathname, e.status, e.hop, e.waitMs])).toEqual([
      ['/robots.txt', 200, 0, 0],
      ['/old', 301, 0, 5000],
      ['/new', 200, 1, 5000],
    ]);
  });

  it('does not follow a cross-site redirect, and never follows one to a CAPTCHA host', async () => {
    const s = await server((req, res) => {
      if (req.url === '/elsewhere') {
        res.writeHead(302, { location: 'https://another-shop.test/p/1' });
      } else {
        res.writeHead(302, { location: 'http://captcha.distinct.ro/?original_url=https%3A%2F%2Fshop%2Fp' });
      }
      res.end();
    });
    const { fetcher, store, log } = localFetcher();
    const away = await fetcher.fetchPolite(`${s.origin}/elsewhere`, { purpose: 'product' });
    expect(away).toMatchObject({ ok: false, blocked: false, status: 302, errorCode: 'cross_site_redirect' });
    expect(away.headers.location).toBe('https://another-shop.test/p/1');
    const captcha = await fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product' });
    expect(captcha).toMatchObject({ blocked: true, blockReason: 'captcha_redirect', status: 302 });
    expect(await store.getPause(s.host)).not.toBeNull();
    expect(log.network().every((e) => e.host === s.host)).toBe(true);
  });
});

describe('transport blocks and timeouts', () => {
  it('classifies a socket reset by the server as a transport block and pauses the host', async () => {
    const s = await server((req) => {
      req.socket.destroy();
    });
    const { fetcher, store } = localFetcher();
    const res = await fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'transport', status: 0, attempts: 1, errorCode: 'connection_reset' });
    expect((await store.getPause(s.host))?.blockReason).toBe('transport');
  });

  it('classifies an HTTP/2 stream reset (RST_STREAM INTERNAL_ERROR) as a transport block', async () => {
    const h2 = http2.createServer();
    h2.on('stream', (stream, headers) => {
      stream.on('error', () => undefined);
      if (headers[':path'] === '/robots.txt') {
        stream.respond({ ':status': 200, 'content-type': 'text/plain' });
        stream.end('User-agent: *\nAllow: /\n');
        return;
      }
      stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
    });
    await new Promise<void>((resolve) => h2.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(h2.address() as AddressInfo).port}`;
    const client = new H2CClient(origin);
    cleanups.push(async () => {
      await client.destroy().catch(() => undefined);
      await new Promise((resolve) => h2.close(resolve));
    });
    const { fetcher, store } = testFetcher({ dispatcher: client });
    const res = await fetcher.fetchPolite(`${origin}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'transport', errorCode: 'http2_reset' });
    expect(res.error).toMatch(/NGHTTP2_INTERNAL_ERROR/);
    expect(await store.getPause(new URL(origin).host)).not.toBeNull();
  });

  it('classifies an HTTP/2 GOAWAY as a transport block', async () => {
    const h2 = http2.createServer();
    h2.on('stream', (stream, headers) => {
      stream.on('error', () => undefined);
      stream.session?.on('error', () => undefined);
      if (headers[':path'] === '/robots.txt') {
        stream.respond({ ':status': 404 });
        stream.end();
        return;
      }
      stream.session?.goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
    });
    await new Promise<void>((resolve) => h2.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(h2.address() as AddressInfo).port}`;
    const client = new H2CClient(origin);
    cleanups.push(async () => {
      await client.destroy().catch(() => undefined);
      await new Promise((resolve) => h2.close(resolve));
    });
    const { fetcher } = testFetcher({ dispatcher: client, defaultTimeoutMs: 3000 });
    const res = await fetcher.fetchPolite(`${origin}/p/1`, { purpose: 'product' });
    expect(res).toMatchObject({ blocked: true, blockReason: 'transport', errorCode: 'http2_reset' });
  });

  it('retries a timeout as a transient failure (each attempt takes a fresh slot) and counts it towards the breaker', async () => {
    const s = await server(() => {
      // never answers
    });
    const { fetcher, store, clock } = localFetcher({ retry: { maxRetries: 2, baseDelayMs: 1000 } });
    const res = await fetcher.fetchPolite(`${s.origin}/slow`, { purpose: 'product', timeoutMs: 150 });
    expect(res).toMatchObject({ ok: false, blocked: false, errorCode: 'timeout', attempts: 3 });
    // slot, back-off 1 s, rest of the next slot, back-off 2 s, rest of the next slot
    expect(clock.sleeps).toEqual([5000, 1000, 4000, 2000, 3000]);
    expect(await store.getFailures(s.host)).toBe(3);
    expect(await store.getPause(s.host)).not.toBeNull();
  });
});

describe('real-time politeness', () => {
  function realFetcher(intervalMs: number) {
    const fetcher: Fetcher = createFetcher({
      stateStore: new MemoryDomainStateStore(),
      policyFor: (host) => defaultDomainPolicy(host, { minIntervalMs: intervalMs }),
      requestLog: collectLog().sink,
    });
    cleanups.push(() => fetcher.close());
    return fetcher;
  }

  it('keeps two requests to one host at least the interval apart (real timers)', async () => {
    const s = await server((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
    });
    const fetcher = realFetcher(300);
    await Promise.all([fetcher.fetchPolite(`${s.origin}/p/1`, { purpose: 'product' }), fetcher.fetchPolite(`${s.origin}/p/2`, { purpose: 'product' })]);
    const times = s.hits.map((h) => h.at);
    expect(s.hits.map((h) => h.path).sort()).toEqual(['/p/1', '/p/2', '/robots.txt']);
    for (let i = 1; i < times.length; i++) expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(295);
  });

  it('runs one request at a time per host, even when a response is slower than the interval', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const s = await server((_req, res) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(PAGE);
      }, 150);
    });
    const fetcher = realFetcher(10);
    const results = await Promise.all([1, 2, 3].map((i) => fetcher.fetchPolite(`${s.origin}/p/${i}`, { purpose: 'product' })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('does not make two hosts wait for each other (real timers)', async () => {
    const handler = (_req: unknown, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
    };
    const [s1, s2] = await Promise.all([server(handler), server(handler)]);
    const fetcher = realFetcher(400);
    // Warm both robots.txt caches first, then fetch one page from each host at the same time.
    await Promise.all([fetcher.robotsFor((s1 as TestServer).origin), fetcher.robotsFor((s2 as TestServer).origin)]);
    await new Promise((r) => setTimeout(r, 420));
    const started = Date.now();
    await Promise.all([
      fetcher.fetchPolite(`${(s1 as TestServer).origin}/p/1`, { purpose: 'product' }),
      fetcher.fetchPolite(`${(s2 as TestServer).origin}/p/1`, { purpose: 'product' }),
    ]);
    expect(Date.now() - started).toBeLessThan(350);
  });
});
