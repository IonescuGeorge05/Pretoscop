import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Agent } from 'undici';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import {
  MemoryAssistedLedger,
  assistedScopeRefusal,
  createAssistedChannel,
  createOxylabsClient,
  createZyteClient,
  ledgerRowCostCents,
  mapZyteAnswer,
  maxCallCents,
  nonPublicSegment,
  zytePricing,
  zyteRequestBody,
  type AssistedClient,
  type AssistedClientResponse,
  type AssistedLedger,
} from '../src/assisted/index';
import { createFetcher, FetchError, MemoryDomainStateStore, ScopedDomainStateStore } from '../src/index';
import { fakeClock, readFixture, startServer, testFetcher, type TestServer } from './helpers';

type Answer = { status: number; body: unknown };
const ANSWERS = JSON.parse(readFixture('zyte', 'answers_synthetic.json')) as Record<string, Answer>;
const answer = (name: string): Answer => {
  const a = ANSWERS[name];
  if (!a) throw new Error(`no fixture answer ${name}`);
  return a;
};

describe('Zyte request shape (what we send, and never send)', () => {
  it('HTTP tier asks for the raw response without following redirects', () => {
    expect(zyteRequestBody('https://shop.test/a', { render: false })).toEqual({
      url: 'https://shop.test/a',
      httpResponseBody: true,
      httpResponseHeaders: true,
      followRedirect: false,
    });
  });

  it('browser tier only when the policy says so; geolocation only when configured', () => {
    expect(zyteRequestBody('https://shop.test/a', { render: true, country: 'RO' })).toEqual({ url: 'https://shop.test/a', browserHtml: true, geolocation: 'RO' });
  });

  it('never sends headers, IP types, sessions or actions', () => {
    for (const body of [zyteRequestBody('https://s.test/', { render: false, country: 'RO' }), zyteRequestBody('https://s.test/', { render: true })]) {
      for (const key of ['customHttpRequestHeaders', 'requestHeaders', 'ipType', 'session', 'sessionContext', 'actions', 'requestCookies', 'device']) {
        expect(body).not.toHaveProperty(key);
      }
    }
  });
});

describe('Zyte answer mapping (recorded shapes, synthetic until A10)', () => {
  it('200 relays the shop response: status, merged headers, body bytes; billed', () => {
    const a = answer('success_200');
    const r = mapZyteAnswer(a.status, a.body, 'https://shop.test/televizoare', false);
    expect(r).toMatchObject({ outcome: 'success', billable: true, status: 200, vendorStatus: 200, contentType: 'text/html; charset=utf-8' });
    expect(r.headers?.['set-cookie']).toBe('a=1, b=2');
    expect(Buffer.from(r.bodyBytes!).toString('utf8')).toContain('oțel periat');
  });

  it('a shop redirect comes back as the 3xx with its location (the fetch layer decides)', () => {
    const a = answer('redirect_301');
    expect(mapZyteAnswer(a.status, a.body, 'https://shop.test/old', false)).toMatchObject({ status: 301, headers: { location: 'https://shop.test/new' }, billable: true });
  });

  it('a shop 404 is a successful (billed) vendor answer with status 404', () => {
    const a = answer('shop_404');
    const r = mapZyteAnswer(a.status, a.body, 'https://shop.test/missing', false);
    expect(r).toMatchObject({ status: 404, outcome: 'success', billable: true });
    expect(Buffer.from(r.bodyBytes!).toString('utf8')).toBe('<h1>Nu am găsit</h1>');
  });

  it('browser tier returns the rendered HTML as text', () => {
    const a = answer('browser_200');
    expect(mapZyteAnswer(a.status, a.body, 'https://shop.test/rendered', true)).toMatchObject({ status: 200, body: expect.stringContaining('1.234,56 lei'), billable: true });
  });

  it.each([
    ['ban_520', { outcome: 'blocked', blocked: true, blockReason: 'vendor_blocked' }],
    ['internal_521', { outcome: 'error' }],
    ['rate_429', { outcome: 'rate_limited' }],
    ['overload_503', { outcome: 'rate_limited' }],
    ['timeout_500', { outcome: 'timeout' }],
    ['auth_401', { outcome: 'refused' }],
    ['suspended_403', { outcome: 'refused' }],
    ['forbidden_451', { outcome: 'refused' }],
    ['invalid_400', { outcome: 'error' }],
  ])('%s → %o, not billed, no body', (name, expected) => {
    const a = answer(name);
    const r = mapZyteAnswer(a.status, a.body, 'https://shop.test/x', false);
    expect(r).toMatchObject({ ...expected, billable: false, status: 0, body: null, vendorStatus: a.status });
    expect(r.vendorError).toBe((a.body as { type: string }).type);
  });
});

describe('Zyte client against a mock API server', () => {
  let server: TestServer;
  const seen: { auth?: string; body: Record<string, unknown> }[] = [];
  let next: Answer | 'hang' = answer('success_200');
  beforeAll(async () => {
    server = await startServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        seen.push({ auth: req.headers.authorization, body: JSON.parse(raw) as Record<string, unknown> });
        if (next === 'hang') return; // never answers
        res.writeHead(next.status, { 'content-type': next.status === 200 ? 'application/json' : 'application/problem+json' });
        res.end(JSON.stringify(next.body));
      });
    });
  });
  afterAll(async () => server.close());

  const client = () => createZyteClient({ apiKey: 'test-key', endpoint: `${server.origin}/v1/extract`, dispatcher: new Agent() });

  it('authenticates with the key as Basic user name and posts the documented body', async () => {
    next = answer('success_200');
    const r = await client().fetch('https://shop.test/televizoare', { render: false, timeoutMs: 5000 });
    expect(r).toMatchObject({ outcome: 'success', status: 200 });
    const last = seen.at(-1)!;
    expect(last.auth).toBe(`Basic ${Buffer.from('test-key:').toString('base64')}`);
    expect(last.body).toEqual({ url: 'https://shop.test/televizoare', httpResponseBody: true, httpResponseHeaders: true, followRedirect: false });
  });

  it('maps a ban to vendor_blocked', async () => {
    next = answer('ban_520');
    expect(await client().fetch('https://shop.test/x', { render: false, timeoutMs: 5000 })).toMatchObject({ outcome: 'blocked', blockReason: 'vendor_blocked' });
  });

  it('turns its own deadline into a timeout outcome, and propagates the caller abort', async () => {
    next = 'hang';
    expect(await client().fetch('https://shop.test/slow', { render: false, timeoutMs: 300 })).toMatchObject({ outcome: 'timeout', billable: false, status: 0 });
    const ctl = new AbortController();
    const p = client().fetch('https://shop.test/slow', { render: false, timeoutMs: 5000, signal: ctl.signal });
    setTimeout(() => ctl.abort(new Error('caller gave up')), 100);
    await expect(p).rejects.toThrow();
  });

  it('an unreachable API is an error outcome, never an exception', async () => {
    const c = createZyteClient({ apiKey: 'k', endpoint: 'http://127.0.0.1:9/v1/extract', dispatcher: new Agent() });
    expect(await c.fetch('https://shop.test/x', { render: false, timeoutMs: 2000 })).toMatchObject({ outcome: 'error', billable: false });
  });

  it('the Oxylabs adapter is a clear stub', async () => {
    const r = await createOxylabsClient({ username: 'u', password: 'p' }).fetch('https://shop.test/x', { render: false, timeoutMs: 1000 });
    expect(r).toMatchObject({ outcome: 'error', error: expect.stringMatching(/stub/) });
  });
});


describe('pricing and the cost ledger', () => {
  it('prices the dearest Zyte tier by default, in EUR cents per 1,000 (rounded up)', () => {
    expect(zytePricing()).toEqual({ httpCentsPer1k: 115, renderCentsPer1k: 1448 });
    expect(zytePricing(1, 1)).toEqual({ httpCentsPer1k: 13, renderCentsPer1k: 101 });
    expect(zytePricing(9 as never)).toEqual(zytePricing(5));
  });

  it('row cost: billable responses at their tier, rounded up; failures are free', () => {
    const p = { httpCentsPer1k: 115, renderCentsPer1k: 1448 };
    expect(ledgerRowCostCents({ successes: 0, renderedRequests: 0 }, p)).toBe(0);
    expect(ledgerRowCostCents({ successes: 1, renderedRequests: 0 }, p)).toBe(1);
    expect(ledgerRowCostCents({ successes: 1000, renderedRequests: 0 }, p)).toBe(115);
    expect(ledgerRowCostCents({ successes: 1000, renderedRequests: 1000 }, p)).toBe(1448);
    // more rendered calls than billable ones (rendered failures): only billable ones are priced
    expect(ledgerRowCostCents({ successes: 10, renderedRequests: 50 }, p)).toBe(15);
  });

  it('the most one call can add: a whole cent at least (rows are rounded up)', () => {
    expect(maxCallCents({ httpCentsPer1k: 115, renderCentsPer1k: 1448 }, false)).toBe(1);
    expect(maxCallCents({ httpCentsPer1k: 115, renderCentsPer1k: 1448 }, true)).toBe(2);
    expect(maxCallCents({ httpCentsPer1k: 2500, renderCentsPer1k: 1000 }, true)).toBe(3);
  });

  it('the memory ledger books before the call, gives unbilled calls back, sums the month from its first day', async () => {
    const l = new MemoryAssistedLedger();
    const pricing = { httpCentsPer1k: 1000, renderCentsPer1k: 10_000 };
    const e = (day: string, shopSlug: string, rendered = false) => ({ day, shopSlug, vendor: 'zyte', rendered, pricing });
    expect(await l.reserve(e('2026-10-31', 'altex'), '2026-10-01', 100)).toBe(true);
    expect(await l.reserve(e('2026-11-01', 'altex'), '2026-11-01', 100)).toBe(true);
    expect(await l.reserve(e('2026-11-01', 'altex'), '2026-11-01', 100)).toBe(true);
    await l.release(e('2026-11-01', 'altex')); // the vendor did not bill the second call of the day
    expect(await l.reserve(e('2026-11-02', 'flanco', true), '2026-11-01', 100)).toBe(true);
    expect(await l.monthToDateCents('2026-11-01')).toBe(1 + 10);
    expect([...l.rows.values()].find((r) => r.day === '2026-11-01')).toMatchObject({ requests: 2, successes: 1, costCents: 1 });
    // A booking that would pass the cap is refused and books nothing.
    expect(await l.reserve(e('2026-11-02', 'flanco', true), '2026-11-01', 20)).toBe(false);
    expect(await l.monthToDateCents('2026-11-01')).toBe(11);
    expect([...l.rows.values()].find((r) => r.day === '2026-11-02')).toMatchObject({ requests: 1, renderedRequests: 1, successes: 1 });
  });
});

function scriptedClient(responses: (url: string) => Partial<AssistedClientResponse>, delayMs = 0) {
  const calls: { url: string; render: boolean; country?: string }[] = [];
  const client: AssistedClient = {
    vendor: 'zyte',
    async fetch(url, req) {
      calls.push({ url, render: req.render, country: req.country });
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return {
        outcome: 'success',
        billable: true,
        vendorStatus: 200,
        status: 200,
        body: '<html><body>ok</body></html>',
        contentType: 'text/html; charset=utf-8',
        headers: { 'content-type': 'text/html; charset=utf-8' },
        finalUrl: url,
        ...responses(url),
      };
    },
  };
  return { client, calls };
}

const ROBOTS = { body: 'User-agent: *\nDisallow: /cos\nDisallow: /alerta-pret\n', contentType: 'text/plain', headers: { 'content-type': 'text/plain' } };
const REQ = { render: false, followRedirects: false as const, timeoutMs: 1000 };
const listing = (shopSlug: string, render = false) => ({ ...REQ, render, purpose: 'listing' as const, shopSlug });

async function refusedWith(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (error) {
    expect(error).toBeInstanceOf(FetchError);
    return { code: (error as FetchError).fetchCode, message: (error as Error).message };
  }
  throw new Error('expected the channel to refuse the call');
}

describe('channel: monthly hard cap (never passed), refusals, ledger', () => {
  it('stops before the call that would pass the cap; the month never exceeds it', async () => {
    const { client, calls } = scriptedClient(() => ({}));
    const ledger = new MemoryAssistedLedger();
    // 1.448 cents per rendered page, rows rounded up: 6 pages = 9 cents; a 7th could reach 11 (> 10).
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 10, shopSettings: () => ({ pricing: zytePricing(5) }) });
    let sent = 0;
    for (let i = 0; i < 10; i++) {
      if (await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing', url: `https://altex.ro/p${i}/` })) break;
      await ch.fetch(`https://altex.ro/p${i}/`, listing('altex', true));
      sent += 1;
    }
    expect(sent).toBe(6);
    expect(calls).toHaveLength(6);
    expect(await ch.monthToDateCents()).toBe(9);
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap', detail: expect.stringMatching(/€0\.09 spent of €0\.10/) });
    // Called anyway (a caller that skipped the gate): refused before the vendor, nothing booked.
    expect(await refusedWith(ch.fetch('https://altex.ro/p9/', listing('altex', true)))).toMatchObject({ code: 'assisted_cap' });
    expect(calls).toHaveLength(6);
    expect(await ledger.monthToDateCents('2026-01-01')).toBe(9);
  });

  it('concurrent calls (several shops at once) can never pass the cap together', async () => {
    const { client, calls } = scriptedClient(() => ({}), 20);
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 5, spendCacheMs: 60_000, shopSettings: () => ({ pricing: { httpCentsPer1k: 1000, renderCentsPer1k: 1000 } }) });
    const shops = ['altex', 'mediagalaxy', 'flanco', 'pcgarage', 'cel', 'evomag', 'vexio'];
    // Every caller passed the gate while the month was empty (a stale spend cache), then all call at once.
    for (const s of shops) expect(await ch.check({ shopSlug: s, host: `${s}.ro`, purpose: 'listing' })).toBeNull();
    const results = await Promise.allSettled(Array.from({ length: 21 }, (_, i) => ch.fetch(`https://${shops[i % 7]}.ro/p${i}/`, listing(shops[i % 7]!))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason.fetchCode === 'assisted_cap')).toBe(true);
    expect(calls).toHaveLength(5);
    expect(await ledger.monthToDateCents('2026-01-01')).toBe(5);
  });

  it('a call the vendor does not bill gives its booking back; an aborted one keeps it', async () => {
    const { client } = scriptedClient((url) => (url.endsWith('/ban/') ? { outcome: 'blocked', billable: false, blocked: true, blockReason: 'vendor_blocked', status: 0, body: null } : {}));
    const ledger = new MemoryAssistedLedger();
    const pricing = { httpCentsPer1k: 1000, renderCentsPer1k: 1000 };
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100, shopSettings: () => ({ pricing }) });
    await ch.fetch('https://altex.ro/ban/', listing('altex'));
    expect([...ledger.rows.values()][0]).toMatchObject({ requests: 1, successes: 0, costCents: 0 });
    const slow: AssistedClient = { vendor: 'zyte', fetch: (_u, req) => new Promise((_r, reject) => req.signal?.addEventListener('abort', () => reject(new Error('aborted')))) };
    const ch2 = createAssistedChannel({ client: slow, ledger, monthlyCapCents: 100, shopSettings: () => ({ pricing }) });
    const ctl = new AbortController();
    const p = ch2.fetch('https://altex.ro/slow/', { ...listing('altex'), signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(p).rejects.toThrow(/aborted/);
    expect([...ledger.rows.values()][0]).toMatchObject({ requests: 2, successes: 1, costCents: 1 });
  });

  it('a cap of 0 refuses everything; a ledger that cannot be read or written fails closed (nothing sent)', async () => {
    const { client, calls } = scriptedClient(() => ({}));
    expect(await createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 0 }).check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap' });
    const unreadable = { reserve: async () => true, release: async () => undefined, monthToDateCents: async () => Promise.reject(new Error('db down')) };
    expect(await createAssistedChannel({ client, ledger: unreadable, monthlyCapCents: 100_00 }).check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap', detail: expect.stringMatching(/ledger unavailable/) });
    const unwritable = { reserve: async () => Promise.reject(new Error('insert failed')), release: async () => undefined, monthToDateCents: async () => 0 };
    const ch = createAssistedChannel({ client, ledger: unwritable, monthlyCapCents: 100_00 });
    expect(await refusedWith(ch.fetch('https://altex.ro/a/', listing('altex')))).toMatchObject({ code: 'assisted_cap', message: expect.stringMatching(/not sent/) });
    expect(calls).toEqual([]);
  });

  it('a refused account stops every call for an hour; a refused domain only that shop for a day', async () => {
    let t = Date.parse('2026-11-02T10:00:00Z');
    const { client } = scriptedClient((url) =>
      url.includes('flanco') ? { outcome: 'refused', billable: false, vendorStatus: 451, status: 0, body: null, error: 'domain forbidden' } : url.includes('bad-key') ? { outcome: 'refused', billable: false, vendorStatus: 401, status: 0, body: null } : {},
    );
    const ch = createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 100_00, now: () => t });
    await ch.fetch('https://www.flanco.ro/x/', listing('flanco'));
    expect(await ch.check({ shopSlug: 'flanco', host: 'www.flanco.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused' });
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toBeNull();
    await ch.fetch('https://altex.ro/bad-key/', listing('altex'));
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused', detail: expect.stringMatching(/refuses our account/) });
    t += 61 * 60_000;
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toBeNull();
    expect(await ch.check({ shopSlug: 'flanco', host: 'www.flanco.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused' });
  });

  it('uses the browser tier for pages only: robots.txt and sitemaps stay on the HTTP tier', async () => {
    const { client, calls } = scriptedClient(() => ({}));
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100_00 });
    for (const [purpose, path] of [['robots', '/robots.txt'], ['sitemap', '/sitemap.xml'], ['listing', '/televizoare/cpl/'], ['product', '/tv-x/cpd/X1/']] as const) {
      await ch.fetch(`https://altex.ro${path}`, { ...REQ, render: true, purpose, shopSlug: 'altex' });
    }
    expect(calls.map((c) => c.render)).toEqual([false, false, true, true]);
    expect([...ledger.rows.values()][0]).toMatchObject({ requests: 4, renderedRequests: 2 });
  });

  it('passes the shop country to the vendor and books billable calls only', async () => {
    const { client, calls } = scriptedClient((url) => (url.endsWith('/ban/') ? { outcome: 'blocked', billable: false, blocked: true, blockReason: 'vendor_blocked', status: 0, body: null } : {}));
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100_00, shopSettings: () => ({ pricing: zytePricing(3), country: 'RO' }) });
    await ch.fetch('https://www.cel.ro/ok/', listing('cel'));
    await ch.fetch('https://www.cel.ro/ban/', listing('cel'));
    expect(calls.map((c) => c.country)).toEqual(['RO', 'RO']);
    expect([...ledger.rows.values()][0]).toMatchObject({ shopSlug: 'cel', requests: 2, successes: 1 });
  });
});

describe('channel scope: designated shops, public pages, the shop\'s own host', () => {
  const settings = () => ({ pricing: zytePricing(5), hosts: ['altex.ro', 'www.altex.ro'] });

  it.each([
    ['eMAG (ADR-013)', 'emag', 'https://www.emag.ro/telefoane/c', 'listing', /emag is not designated/],
    ['a shop not designated', 'dedeman', 'https://www.dedeman.ro/ro/x/c/1', 'listing', /dedeman is not designated/],
    ['no shop at all', undefined, 'https://altex.ro/televizoare/cpl/', 'listing', /no shop/],
    ['a feed', 'altex', 'https://altex.ro/feed.xml', 'feed', /purpose "feed"/],
    ['a probe', 'altex', 'https://altex.ro/', 'probe', /purpose "probe"/],
    ['an internal API host', 'altex', 'https://fenrir.altex.ro/catalog/category/products', 'listing', /not altex's web host/],
    ['another subdomain', 'altex', 'https://m.altex.ro/telefoane/cpl/', 'listing', /not altex's web host/],
    ['the cart', 'altex', 'https://altex.ro/cos/', 'listing', /"cos"/],
    ['checkout', 'altex', 'https://altex.ro/checkout/cart/', 'product', /"checkout"/],
    ['an account page', 'altex', 'https://altex.ro/customer/account/login/', 'product', /"customer"/],
    ['a Romanian login page', 'altex', 'https://www.altex.ro/autentificare', 'product', /"autentificare"/],
    ['a REST API', 'altex', 'https://altex.ro/rest/V1/products', 'listing', /"rest"/],
    ['GraphQL', 'altex', 'https://altex.ro/graphql?query=x', 'listing', /"graphql"/],
    ['a Zen Cart cart page', 'altex', 'https://altex.ro/index.php?main_page=shopping_cart', 'product', /"shopping_cart"/],
    ['an OpenCart checkout route', 'altex', 'https://altex.ro/index.php?route=checkout/cart', 'product', /"checkout"/],
    ['a login page with an extension', 'altex', 'https://altex.ro/login.php', 'product', /"login"/],
    ['credentials in the URL', 'altex', 'https://user:pw@altex.ro/telefoane/cpl/', 'listing', /credentials/],
  ] as const)('refuses %s before any vendor call', async (_name, shopSlug, url, purpose, detail) => {
    const { client, calls } = scriptedClient(() => ({}));
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100_00, shopSettings: settings });
    const host = new URL(url).host;
    expect(await ch.check({ shopSlug, host, purpose, url })).toMatchObject({ code: 'assisted_refused', detail: expect.stringMatching(detail) });
    expect(await refusedWith(ch.fetch(url, { ...REQ, purpose, shopSlug }))).toMatchObject({ code: 'assisted_refused' });
    expect(calls).toEqual([]);
    expect(ledger.rows.size).toBe(0);
  });

  it.each([
    ['robots.txt', 'https://altex.ro/robots.txt', 'robots'],
    ['a sitemap', 'https://altex.ro/sitemaps/products/1.xml', 'sitemap'],
    ['a category listing with a page number', 'https://altex.ro/telefoane/cpl/filtru/p/2/', 'listing'],
    ['a product whose slug starts with a cart word', 'https://www.altex.ro/cos-de-rufe-tesatura-60l/cpd/X1/', 'product'],
    ['a search listing', 'https://www.altex.ro/cauta/?q=laptop', 'listing'],
  ] as const)('serves %s', async (_name, url, purpose) => {
    const { client, calls } = scriptedClient(() => ({}));
    const ch = createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 100_00, shopSettings: settings });
    expect(await ch.check({ shopSlug: 'altex', host: new URL(url).host, purpose, url })).toBeNull();
    await ch.fetch(url, { ...REQ, purpose, shopSlug: 'altex' });
    expect(calls).toHaveLength(1);
  });

  it('pure helpers: segments match whole, page-naming query values count, other query values do not', () => {
    expect(nonPublicSegment(new URL('https://s.ro/Cont/Comenzi'))).toBe('cont');
    expect(nonPublicSegment(new URL('https://s.ro/telefoane?sort=cart'))).toBeNull();
    expect(nonPublicSegment(new URL('https://s.ro/index.php?main_page=product_info&products_id=1'))).toBeNull();
    expect(assistedScopeRefusal({ shopSlug: 'altex', host: 'altex.ro', purpose: 'robots', url: 'https://altex.ro/robots.txt' })).toBeNull();
  });
});

describe('fetchPolite through the assisted channel: same politeness, scope and cap before any request', () => {
  function setup(
    opts: {
      capCents?: number;
      respond?: (url: string) => Partial<AssistedClientResponse>;
      policy?: Record<string, unknown>;
      ledger?: AssistedLedger;
      deps?: Record<string, unknown>;
    } = {},
  ) {
    const { client, calls } = scriptedClient((url) => (url.endsWith('/robots.txt') ? ROBOTS : (opts.respond?.(url) ?? {})));
    const ledger = opts.ledger ?? new MemoryAssistedLedger();
    const channel = createAssistedChannel({
      client,
      ledger,
      monthlyCapCents: opts.capCents ?? 100_00,
      shopSettings: () => ({ pricing: zytePricing(5), hosts: ['altex.ro', 'www.altex.ro'] }),
    });
    const t = testFetcher({ assisted: channel, policy: { accessMode: 'assisted', shopSlug: 'altex', ...opts.policy }, ...opts.deps });
    return { ...t, calls, ledger, channel };
  }

  it('keeps the per-domain interval between assisted requests (robots.txt first, through the vendor)', async () => {
    const { fetcher, clock, calls, log } = setup();
    const a = await fetcher.fetchPolite('https://altex.ro/telefoane/cpl/', { purpose: 'listing', shopSlug: 'altex' });
    const t1 = clock.t;
    const b = await fetcher.fetchPolite('https://altex.ro/laptopuri/cpl/', { purpose: 'listing', shopSlug: 'altex' });
    expect(a).toMatchObject({ ok: true, channel: 'assisted', status: 200 });
    expect(b).toMatchObject({ ok: true, channel: 'assisted' });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/robots.txt', '/telefoane/cpl/', '/laptopuri/cpl/']);
    expect(clock.t - t1).toBeGreaterThanOrEqual(5000);
    const net = log.network();
    expect(net.every((e) => e.channel === 'assisted')).toBe(true);
    for (let i = 1; i < net.length; i++) expect(net[i]!.ts.getTime() - net[i - 1]!.ts.getTime()).toBeGreaterThanOrEqual(5000);
  });

  it('one request at a time per shop: concurrent callers are serialised and spaced', async () => {
    const { fetcher, clock, calls } = setup();
    const results = await Promise.all(['/a/', '/b/', '/c/'].map((p) => fetcher.fetchPolite(`https://altex.ro${p}`, { purpose: 'listing', shopSlug: 'altex' })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(calls).toHaveLength(4); // robots.txt + 3 pages, one after another
    expect(clock.sleeps.filter((ms) => ms >= 5000)).toHaveLength(3);
  });

  it('obeys robots.txt read through the channel: a disallowed path never reaches the vendor', async () => {
    const { fetcher, calls } = setup();
    const r = await fetcher.fetchPolite('https://altex.ro/alerta-pret/123/', { purpose: 'product', shopSlug: 'altex' });
    expect(r).toMatchObject({ skipped: 'robots_disallowed', channel: 'assisted' });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/robots.txt']);
  });

  it('out of scope (an account page robots.txt allows, an API subdomain): skipped before any slot, budget or vendor call', async () => {
    const { fetcher, calls, clock, store } = setup();
    for (const url of ['https://altex.ro/customer/account/', 'https://fenrir.altex.ro/v2/catalog/']) {
      const r = await fetcher.fetchPolite(url, { purpose: 'listing', shopSlug: 'altex' });
      expect(r).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_refused', attempts: 0, channel: 'assisted' });
    }
    expect(calls).toEqual([]);
    expect(clock.sleeps).toEqual([]);
    expect(await store.getDailyCount('altex.ro', '2026-10-28')).toBe(0);
  });

  it('at the cap: skipped before any slot, budget or vendor call', async () => {
    const { fetcher, calls, clock, store } = setup({ capCents: 0 });
    const r = await fetcher.fetchPolite('https://altex.ro/telefoane/cpl/', { purpose: 'listing', shopSlug: 'altex' });
    expect(r).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_cap', attempts: 0, channel: 'assisted' });
    expect(calls).toEqual([]);
    expect(clock.sleeps).toEqual([]);
    expect(await store.getDailyCount('altex.ro', '2026-10-28')).toBe(0);
  });

  it('a call refused at booking time (another shop took the last of the cap) is a skip, never a failure of the shop', async () => {
    // The gate always sees an empty month; after robots.txt, every booking finds the month full.
    let bookings = 0;
    const full: AssistedLedger = { reserve: async () => bookings++ === 0, release: async () => undefined, monthToDateCents: async () => 0 };
    const { fetcher, calls, store, log } = setup({ ledger: full });
    for (let i = 0; i < 4; i++) {
      const r = await fetcher.fetchPolite(`https://altex.ro/p${i}/`, { purpose: 'listing', shopSlug: 'altex' });
      expect(r).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_cap', attempts: 0 });
    }
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/robots.txt']);
    expect(await store.getPause('altex.ro')).toBeNull();
    expect(await store.getFailures('altex.ro')).toBe(0);
    expect(log.network().map((e) => new URL(e.url).pathname)).toEqual(['/robots.txt']);
  });

  it('the daily budget and the crawl window apply to assisted requests too', async () => {
    const budget = setup({ policy: { maxPagesPerDay: 2 } });
    await budget.fetcher.fetchPolite('https://altex.ro/a/', { purpose: 'listing', shopSlug: 'altex' }); // robots + page = 2
    const third = await budget.fetcher.fetchPolite('https://altex.ro/b/', { purpose: 'listing', shopSlug: 'altex' });
    expect(third).toMatchObject({ skipped: 'budget_exhausted' });
    expect(budget.calls).toHaveLength(2);

    const window = setup({ policy: { allowedHours: { start: '02:00', end: '07:00' } } }); // fake clock: 12:00 in Bucharest
    const r = await window.fetcher.fetchPolite('https://altex.ro/a/', { purpose: 'listing', shopSlug: 'altex' });
    expect(r).toMatchObject({ skipped: 'outside_allowed_hours' });
    expect(window.calls).toEqual([]);
  });

  it('a vendor ban is vendor_blocked (never parsed); three in a row pause the shop', async () => {
    const { fetcher, calls } = setup({ respond: () => ({ outcome: 'blocked', billable: false, blocked: true, blockReason: 'vendor_blocked', blockDetail: 'Zyte 520', status: 0, body: null }) });
    for (let i = 0; i < 3; i++) {
      const r = await fetcher.fetchPolite(`https://altex.ro/p${i}/`, { purpose: 'product', shopSlug: 'altex' });
      expect(r).toMatchObject({ blocked: true, blockReason: 'vendor_blocked', body: null });
    }
    const after = await fetcher.fetchPolite('https://altex.ro/p9/', { purpose: 'product', shopSlug: 'altex' });
    expect(after).toMatchObject({ skipped: 'paused' });
    expect(calls).toHaveLength(4); // robots + 3 pages
  });

  it.each([
    ['a Cloudflare challenge', 'cloudflare_challenge_synthetic.html'],
    ['cel.ro\'s "Verificare rapida" page with decoy products', 'cel_celcaptcha_decoy_from-research-notes.html'],
  ])('a challenge page the vendor relays with 200 (%s) is never returned as data', async (_name, file) => {
    const page = readFixture('blocks', file);
    const { fetcher } = setup({ respond: () => ({ body: page }) });
    const r = await fetcher.fetchPolite('https://altex.ro/placi-video/', { purpose: 'listing', shopSlug: 'altex' });
    expect(r).toMatchObject({ ok: false, blocked: true, blockReason: 'vendor_blocked', body: null });
  });

  it('the shop itself is never contacted: the direct dispatcher (and its SSRF guard) is not used on the assisted path', async () => {
    const send = vi.fn();
    const { fetcher, calls } = setup({ deps: { dispatcher: { dispatch: send } as never } });
    expect(await fetcher.fetchPolite('https://altex.ro/a/', { purpose: 'listing', shopSlug: 'altex' })).toMatchObject({ ok: true, channel: 'assisted' });
    expect(calls).toHaveLength(2);
    expect(send).not.toHaveBeenCalled();
  });

  it('without a channel, assisted shops are never fetched directly', async () => {
    const send = vi.fn();
    const { fetcher } = testFetcher({ policy: { accessMode: 'assisted', shopSlug: 'altex' }, dispatcher: { dispatch: send } as never });
    expect(await fetcher.fetchPolite('https://altex.ro/a/', { purpose: 'listing' })).toMatchObject({ skipped: 'assisted_unavailable' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the assisted channel next to the merchant fetcher (M20 ScopedDomainStateStore)', () => {
  function setup() {
    const clock = fakeClock();
    const shared = new MemoryDomainStateStore({ now: clock.now });
    const { client, calls } = scriptedClient((url) => (url.endsWith('/robots.txt') ? ROBOTS : {}));
    const channel = createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 100_00, shopSettings: () => ({ pricing: zytePricing(5), hosts: ['altex.ro'] }) });
    const send = vi.fn();
    const common = {
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      crawlEnabled: true,
      dispatcher: { dispatch: send } as never,
      policyFor: (host: string) => defaultDomainPolicy(host, { accessMode: 'assisted', shopSlug: 'altex' }),
    };
    return {
      clock,
      shared,
      calls,
      send,
      // The worker hands the channel to the crawler only (apps/worker/src/services.ts).
      crawler: createFetcher({ ...common, stateStore: shared, assisted: channel }),
      merchant: createFetcher({ ...common, stateStore: new ScopedDomainStateStore(shared, 'merchant') }),
    };
  }

  it('a merchant-supplied URL on an assisted shop is never sent (no vendor call, no direct request, no spend)', async () => {
    const s = setup();
    const r = await s.merchant.fetchPolite('https://altex.ro/feed.xml', { purpose: 'feed' });
    expect(r).toMatchObject({ skipped: 'assisted_unavailable', attempts: 0 });
    expect(s.calls).toEqual([]);
    expect(s.send).not.toHaveBeenCalled();
  });

  it('assisted requests keep the shared per-host spacing and obey the crawler\'s pause, not a merchant-scoped one', async () => {
    const s = setup();
    await s.crawler.fetchPolite('https://altex.ro/a/', { purpose: 'listing', shopSlug: 'altex' });
    // Any later request to the host, whoever makes it, waits for the interval the assisted call reserved.
    expect((await new ScopedDomainStateStore(s.shared, 'merchant').reserveSlot('altex.ro', 5000)).waitMs).toBeGreaterThan(4000);
    s.clock.advance(60_000);
    await s.shared.setPause('merchant:altex.ro', { until: s.clock.t + 3_600_000, reason: 'http_403: merchant check', setAt: s.clock.t, source: 'auto', blockReason: 'http_403' }, 'replace');
    expect(await s.crawler.fetchPolite('https://altex.ro/b/', { purpose: 'listing', shopSlug: 'altex' })).toMatchObject({ ok: true, channel: 'assisted' });
    await s.shared.setPause('altex.ro', { until: s.clock.t + 3_600_000, reason: 'http_403: crawler pause', setAt: s.clock.t, source: 'auto', blockReason: 'http_403' }, 'replace');
    expect(await s.crawler.fetchPolite('https://altex.ro/c/', { purpose: 'listing', shopSlug: 'altex' })).toMatchObject({ skipped: 'paused' });
    expect(s.calls.map((c) => new URL(c.url).pathname)).toEqual(['/robots.txt', '/a/', '/b/']);
  });
});
