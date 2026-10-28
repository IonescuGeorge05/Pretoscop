import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Agent } from 'undici';
import {
  MemoryAssistedLedger,
  createAssistedChannel,
  createOxylabsClient,
  createZyteClient,
  ledgerRowCostCents,
  mapZyteAnswer,
  zytePricing,
  zyteRequestBody,
  type AssistedClient,
  type AssistedClientResponse,
} from '../src/assisted/index';
import { readFixture, startServer, testFetcher, type TestServer } from './helpers';

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

  it('the memory ledger sums the month from the given first day', async () => {
    const l = new MemoryAssistedLedger();
    const pricing = { httpCentsPer1k: 1000, renderCentsPer1k: 10_000 };
    await l.record({ day: '2026-10-31', shopSlug: 'a', vendor: 'zyte', rendered: false, billable: true, pricing });
    await l.record({ day: '2026-11-01', shopSlug: 'a', vendor: 'zyte', rendered: false, billable: true, pricing });
    await l.record({ day: '2026-11-01', shopSlug: 'a', vendor: 'zyte', rendered: false, billable: false, pricing });
    await l.record({ day: '2026-11-02', shopSlug: 'b', vendor: 'zyte', rendered: true, billable: true, pricing });
    expect(await l.monthToDateCents('2026-11-01')).toBe(1 + 10);
    expect([...l.rows.values()].find((r) => r.day === '2026-11-01')).toMatchObject({ requests: 2, successes: 1, costCents: 1 });
  });
});

function scriptedClient(responses: (url: string) => Partial<AssistedClientResponse>) {
  const calls: { url: string; render: boolean; country?: string }[] = [];
  const client: AssistedClient = {
    vendor: 'zyte',
    async fetch(url, req) {
      calls.push({ url, render: req.render, country: req.country });
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

const ROBOTS = { body: 'User-agent: *\nDisallow: /cos\n', contentType: 'text/plain', headers: { 'content-type': 'text/plain' } };

describe('channel: monthly hard cap, refusals, ledger', () => {
  it('stops calling the vendor once the month reaches the cap (100%)', async () => {
    const { client, calls } = scriptedClient(() => ({}));
    const ledger = new MemoryAssistedLedger();
    // 1.448 cents per rendered page: 6 pages = 9 cents (< 10), 7 pages = 11 cents (≥ 10).
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 10, shopSettings: () => ({ pricing: zytePricing(5) }) });
    const req = { render: true, followRedirects: false as const, timeoutMs: 1000, purpose: 'listing' as const, shopSlug: 'altex' };
    for (let i = 0; i < 7; i++) {
      expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toBeNull();
      await ch.fetch(`https://altex.ro/p${i}`, req);
    }
    expect(await ch.monthToDateCents()).toBe(11);
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap', detail: expect.stringMatching(/€0\.11 spent of €0\.10/) });
    const refused = await ch.fetch('https://altex.ro/p8', req);
    expect(refused).toMatchObject({ status: 0, body: null, error: expect.stringMatching(/monthly cap/) });
    expect(calls).toHaveLength(7);
  });

  it('a cap of 0 refuses everything; an unreadable ledger fails closed', async () => {
    const { client } = scriptedClient(() => ({}));
    expect(await createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 0 }).check({ host: 'x', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap' });
    const broken = { record: async () => undefined, monthToDateCents: async () => Promise.reject(new Error('db down')) };
    expect(await createAssistedChannel({ client, ledger: broken, monthlyCapCents: 100_00 }).check({ host: 'x', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap', detail: expect.stringMatching(/ledger unavailable/) });
  });

  it('spend that the ledger failed to write still counts towards the cap', async () => {
    const { client } = scriptedClient(() => ({}));
    const flaky = { record: async () => Promise.reject(new Error('insert failed')), monthToDateCents: async () => 0 };
    const ch = createAssistedChannel({ client, ledger: flaky, monthlyCapCents: 2, shopSettings: () => ({ pricing: { httpCentsPer1k: 1000, renderCentsPer1k: 1000 } }) });
    await ch.fetch('https://altex.ro/a', { render: false, followRedirects: false, timeoutMs: 1000, purpose: 'listing', shopSlug: 'altex' });
    await ch.fetch('https://altex.ro/b', { render: false, followRedirects: false, timeoutMs: 1000, purpose: 'listing', shopSlug: 'altex' });
    expect(await ch.monthToDateCents()).toBe(2);
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_cap' });
  });

  it('a refused account stops every call for an hour; a refused domain only that shop for a day', async () => {
    let t = Date.parse('2026-11-02T10:00:00Z');
    const { client } = scriptedClient((url) =>
      url.includes('flanco') ? { outcome: 'refused', billable: false, vendorStatus: 451, status: 0, body: null, error: 'domain forbidden' } : url.includes('bad-key') ? { outcome: 'refused', billable: false, vendorStatus: 401, status: 0, body: null } : {},
    );
    const ch = createAssistedChannel({ client, ledger: new MemoryAssistedLedger(), monthlyCapCents: 100_00, now: () => t });
    const req = (shopSlug: string) => ({ render: false, followRedirects: false as const, timeoutMs: 1000, purpose: 'listing' as const, shopSlug });
    await ch.fetch('https://www.flanco.ro/x', req('flanco'));
    expect(await ch.check({ shopSlug: 'flanco', host: 'www.flanco.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused' });
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toBeNull();
    await ch.fetch('https://altex.ro/bad-key', req('altex'));
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused', detail: expect.stringMatching(/refuses our account/) });
    t += 61 * 60_000;
    expect(await ch.check({ shopSlug: 'altex', host: 'altex.ro', purpose: 'listing' })).toBeNull();
    expect(await ch.check({ shopSlug: 'flanco', host: 'www.flanco.ro', purpose: 'listing' })).toMatchObject({ code: 'assisted_refused' });
  });

  it('uses the browser tier for pages only: robots.txt, sitemaps and feeds stay on the HTTP tier', async () => {
    const { client, calls } = scriptedClient(() => ({}));
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100_00 });
    for (const purpose of ['robots', 'sitemap', 'feed', 'listing', 'product'] as const) {
      await ch.fetch(`https://altex.ro/${purpose}`, { render: true, followRedirects: false, timeoutMs: 1000, purpose, shopSlug: 'altex' });
    }
    expect(calls.map((c) => c.render)).toEqual([false, false, false, true, true]);
    expect([...ledger.rows.values()][0]).toMatchObject({ requests: 5, renderedRequests: 2 });
  });

  it('passes the shop country to the vendor and records billable and free calls', async () => {
    const { client, calls } = scriptedClient((url) => (url.endsWith('/ban') ? { outcome: 'blocked', billable: false, blocked: true, blockReason: 'vendor_blocked', status: 0, body: null } : {}));
    const ledger = new MemoryAssistedLedger();
    const ch = createAssistedChannel({ client, ledger, monthlyCapCents: 100_00, shopSettings: () => ({ pricing: zytePricing(3), country: 'RO' }) });
    const req = { render: false, followRedirects: false as const, timeoutMs: 1000, purpose: 'listing' as const, shopSlug: 'cel' };
    await ch.fetch('https://www.cel.ro/ok', req);
    await ch.fetch('https://www.cel.ro/ban', req);
    expect(calls.map((c) => c.country)).toEqual(['RO', 'RO']);
    expect([...ledger.rows.values()][0]).toMatchObject({ shopSlug: 'cel', requests: 2, successes: 1 });
  });
});

describe('fetchPolite through the assisted channel: same politeness, cap before any request', () => {
  function setup(opts: { capCents?: number; respond?: (url: string) => Partial<AssistedClientResponse>; policy?: Record<string, unknown> } = {}) {
    const { client, calls } = scriptedClient((url) => (url.endsWith('/robots.txt') ? ROBOTS : (opts.respond?.(url) ?? {})));
    const ledger = new MemoryAssistedLedger();
    const channel = createAssistedChannel({ client, ledger, monthlyCapCents: opts.capCents ?? 100_00, shopSettings: () => ({ pricing: zytePricing(5) }) });
    const t = testFetcher({ assisted: channel, policy: { accessMode: 'assisted', shopSlug: 'altex', ...opts.policy } });
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

  it('obeys robots.txt read through the channel: a disallowed path never reaches the vendor', async () => {
    const { fetcher, calls } = setup();
    const r = await fetcher.fetchPolite('https://altex.ro/cos/', { purpose: 'product', shopSlug: 'altex' });
    expect(r).toMatchObject({ skipped: 'robots_disallowed', channel: 'assisted' });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/robots.txt']);
  });

  it('at the cap: skipped before any slot, budget or vendor call', async () => {
    const { fetcher, calls, clock, store } = setup({ capCents: 0 });
    const r = await fetcher.fetchPolite('https://altex.ro/telefoane/cpl/', { purpose: 'listing', shopSlug: 'altex' });
    expect(r).toMatchObject({ skipped: 'assisted_unavailable', errorCode: 'assisted_cap', attempts: 0, channel: 'assisted' });
    expect(calls).toEqual([]);
    expect(clock.sleeps).toEqual([]);
    expect(await store.getDailyCount('altex.ro', '2026-10-28')).toBe(0);
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

  it('without a channel, assisted shops are never fetched directly', async () => {
    const send = vi.fn();
    const { fetcher } = testFetcher({ policy: { accessMode: 'assisted', shopSlug: 'altex' }, dispatcher: { dispatch: send } as never });
    expect(await fetcher.fetchPolite('https://altex.ro/a/', { purpose: 'listing' })).toMatchObject({ skipped: 'assisted_unavailable' });
    expect(send).not.toHaveBeenCalled();
  });
});

