import { afterEach, describe, expect, it } from 'vitest';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import { createFetcher, MemoryDomainStateStore, type RequestLogEntry } from '@pretoscop/fetch';
import { createIcecatClient, MemoryIcecatUsage } from '../src/index';
import { startIcecatMock, type IcecatMock, type IcecatMockOptions } from '../src/mock';

const mocks: IcecatMock[] = [];
afterEach(async () => {
  await Promise.all(mocks.splice(0).map((m) => m.close()));
});

async function setup(mockOptions: IcecatMockOptions = {}, cap?: number) {
  const mock = await startIcecatMock(mockOptions);
  mocks.push(mock);
  const log: RequestLogEntry[] = [];
  const store = new MemoryDomainStateStore();
  const fetcher = createFetcher({
    stateStore: store,
    crawlEnabled: true,
    policyFor: (host) => defaultDomainPolicy(host, { minIntervalMs: 0 }),
    requestLog: { write: (e) => void log.push(e) },
    retry: { maxRetries: 0, baseDelayMs: 1 },
  });
  const usage = new MemoryIcecatUsage();
  const client = createIcecatClient({
    fetcher,
    shopname: 'demo-account',
    baseUrl: mock.apiUrl,
    usage,
    monthlyCap: cap,
  });
  return { mock, fetcher, client, log, usage, store };
}

describe('Icecat client over the polite fetcher', () => {
  it('finds a datasheet by GTIN, identified as PretoscopBot-Feed, after reading robots.txt', async () => {
    const { mock, client, log, usage } = await setup();
    const r = await client.lookup({ gtin: '5397184119709' }, 'RO');
    expect(r.status).toBe('found');
    expect(mock.requests.map((q) => q.path)).toEqual(['/robots.txt', '/api']);
    expect(mock.requests[1]?.query).toEqual({
      lang: 'RO',
      shopname: 'demo-account',
      GTIN: '5397184119709',
    });
    expect(mock.requests[1]?.userAgent).toMatch(
      /^Mozilla\/5\.0 \(compatible; PretoscopBot-Feed\/1\.0; \+https:\/\/pretoscop\.ro\/bot\)$/,
    );
    expect(log.filter((e) => e.attempt > 0).map((e) => e.purpose)).toEqual(['robots', 'feed']);
    expect(await usage.used('RO', new Date())).toBe(1);
  });

  it('looks up by brand and product code', async () => {
    const { mock, client } = await setup();
    const r = await client.lookup({ brand: 'Philips', mpn: 'HD9252/90' }, 'RO');
    expect(r.status).toBe('found');
    expect(mock.requests.at(-1)?.query).toMatchObject({
      Brand: 'Philips',
      ProductCode: 'HD9252/90',
    });
  });

  it('classifies per-product answers: not present, brand restrictions, Full Icecat only', async () => {
    const { client, mock } = await setup();
    expect(await client.lookup({ gtin: '4006381333931' }, 'RO')).toMatchObject({
      status: 'not_found',
      detail: expect.stringMatching(/not present/),
    });
    expect(await client.lookup({ brand: 'Apple', mpn: 'MTJV3ZM/A' }, 'RO')).toMatchObject({
      status: 'restricted',
    });
    expect(await client.lookup({ brand: 'Sony', mpn: 'WH1000XM5B.CE7' }, 'RO')).toMatchObject({
      status: 'full_only',
    });
    // The fetch layer paused the host on that bare 403; the client lifted it, so lookups go on.
    expect(await client.lookup({ gtin: '8806094724721' }, 'RO')).toMatchObject({ status: 'found' });
    expect(mock.requests.filter((q) => q.path === '/api')).toHaveLength(4);
  });

  it('stops before any request once the monthly cap is reached', async () => {
    const { client, mock } = await setup({}, 1);
    expect((await client.lookup({ gtin: '5397184119709' }, 'RO')).status).toBe('found');
    const before = mock.requests.length;
    expect(await client.lookup({ gtin: '8806094724721' }, 'RO')).toEqual({
      status: 'cap_reached',
      used: 1,
    });
    expect(mock.requests.length).toBe(before);
    // The cap is per language repository.
    expect((await client.lookup({ gtin: '8806094724721' }, 'EN')).status).toBe('found');
  });

  it('obeys robots.txt of the API host (a licence condition)', async () => {
    const { client, mock } = await setup({ robotsTxt: 'User-agent: *\nDisallow: /api\n' });
    const r = await client.lookup({ gtin: '5397184119709' }, 'RO');
    expect(r).toMatchObject({
      status: 'stop',
      reason: expect.stringMatching(/robots\.txt .* disallows \/api/),
    });
    expect(mock.requests.map((q) => q.path)).toEqual(['/robots.txt']);
  });

  it('stops on rate limiting and on a WAF 403, and does not lift those pauses', async () => {
    const limited = await setup({
      respond: (q) =>
        q.path === '/api'
          ? { status: 429, body: '{}', headers: { 'retry-after': '3600' } }
          : undefined,
    });
    expect(await limited.client.lookup({ gtin: '5397184119709' }, 'RO')).toMatchObject({
      status: 'stop',
      reason: expect.stringMatching(/http_429/),
    });
    expect(await limited.client.lookup({ gtin: '5397184119709' }, 'RO')).toMatchObject({
      status: 'stop',
      reason: expect.stringMatching(/paused/),
    });

    const waf = await setup({
      respond: (q) =>
        q.path === '/api'
          ? {
              status: 403,
              body: '<html>Access denied</html>',
              headers: { server: 'cloudflare', 'content-type': 'text/html' },
            }
          : undefined,
    });
    expect(await waf.client.lookup({ gtin: '5397184119709' }, 'RO')).toMatchObject({
      status: 'stop',
      reason: expect.stringMatching(/Cloudflare/),
    });
  });

  it('downloads gallery images as bytes', async () => {
    const { client, mock } = await setup();
    const r = await client.image(`${mock.origin}/img/gallery/56195846_synth-main.jpg`);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.contentType).toBe('image/jpeg');
      expect(Buffer.from(r.bytes).subarray(0, 2).toString('hex')).toBe('ffd8');
    }
    expect(await client.image(`${mock.origin}/nope.jpg`)).toEqual({
      status: 'skip',
      reason: 'HTTP 404',
    });
  });
});
