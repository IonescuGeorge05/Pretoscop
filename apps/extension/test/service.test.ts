import { describe, expect, it } from 'vitest';
import { LOOKUP_MESSAGE } from '../src/messages';
import { createLookupService, lookupUrl, type SenderInfo } from '../src/service';
import { sampleBody } from './sample';

const API = 'https://pretoscop.ro';
const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const PAGE = 'https://www.emag.ro/telefon/pd/DF1MLR2BM/';
const sender: SenderInfo = { id: EXT, url: `${PAGE}?ref=x`, frameId: 0, tab: { id: 7 } };
const msg = (ids: unknown = { url: PAGE, brand: 'Samsung', mpn: 'SM-S741BZVDEUE' }, extra: Record<string, unknown> = {}) => ({ type: LOOKUP_MESSAGE, shop: 'emag', ids, ...extra });

function setup(responses: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let clock = 1_000_000;
  const service = createLookupService({
    apiBase: API,
    extensionId: EXT,
    now: () => clock,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return next();
    },
  });
  return { service, calls, advance: (ms: number) => (clock += ms) };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('lookupUrl', () => {
  it('sends the identifiers and nothing else', () => {
    expect(lookupUrl('https://pretoscop.ro/', { url: PAGE, gtin: '8806097640226', brand: 'Samsung', mpn: 'SM-A1/B' })).toBe(
      'https://pretoscop.ro/api/ext/lookup?url=https%3A%2F%2Fwww.emag.ro%2Ftelefon%2Fpd%2FDF1MLR2BM%2F&gtin=8806097640226&brand=Samsung&mpn=SM-A1%2FB',
    );
    expect(lookupUrl(API, { url: PAGE })).toBe(`${API}/api/ext/lookup?url=${encodeURIComponent(PAGE)}`);
  });
});

describe('message checks (only our content script, top frame, a supported shop tab)', () => {
  const refused: Array<[string, unknown, SenderInfo]> = [
    ['not an object', 'lookup', sender],
    ['another type', { ...msg(), type: 'pretoscop/other' }, sender],
    ['extra fields', msg(undefined, { title: 'x' }), sender],
    ['another extension', msg(), { ...sender, id: 'other' }],
    ['no tab (e.g. a page of another extension)', msg(), { ...sender, tab: undefined }],
    ['a subframe', msg(), { ...sender, frameId: 3 }],
    ['no sender address', msg(), { ...sender, url: undefined }],
    ['a tab of another site', msg(), { ...sender, url: 'https://evil.example/x' }],
    ['a shop that is not the tab’s', { ...msg({ url: 'https://altex.ro/x/cpd/A1/' }), shop: 'altex' }, sender],
    ['identifiers of another page’s shop', msg({ url: 'https://altex.ro/x/cpd/A1/' }), sender],
    ['malformed identifiers', msg({ url: PAGE, gtin: '123' }), sender],
  ];
  it.each(refused)('refuses %s without any request', async (_name, m, s) => {
    const { service, calls } = setup([]);
    expect(await service.handle(m, s)).toEqual({ ok: false, reason: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('asks the API without cookies or referrer and answers with the checked body', async () => {
    const { service, calls } = setup([json(200, sampleBody())]);
    const r = await service.handle(msg(), sender);
    expect(r).toEqual({ ok: true, body: sampleBody() });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(lookupUrl(API, { url: PAGE, brand: 'Samsung', mpn: 'SM-S741BZVDEUE' }));
    expect(calls[0]!.init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
});

describe('answers, cache and back-off', () => {
  it('keeps answers in memory for 10 minutes, shares identical requests in flight', async () => {
    const { service, calls, advance } = setup([json(200, sampleBody()), json(200, sampleBody())]);
    const [a, b] = await Promise.all([service.handle(msg(), sender), service.handle(msg(), sender)]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
    await service.handle(msg(), sender);
    expect(calls).toHaveLength(1);
    advance(10 * 60_000 + 1);
    await service.handle(msg(), sender);
    expect(calls).toHaveLength(2);
  });

  it('remembers "not found" and "switched off"', async () => {
    const { service, calls } = setup([json(404, { error: 'not_found' }), json(503, { error: 'disabled' })]);
    expect(await service.handle(msg(), sender)).toEqual({ ok: false, reason: 'not_found' });
    expect(await service.handle(msg(), sender)).toEqual({ ok: false, reason: 'not_found' });
    const other = msg({ url: 'https://www.emag.ro/x/pd/DXVS722BM/' });
    expect(await service.handle(other, sender)).toEqual({ ok: false, reason: 'disabled' });
    expect(await service.handle(other, sender)).toEqual({ ok: false, reason: 'disabled' });
    expect(calls).toHaveLength(2);
  });

  it('pauses every lookup for Retry-After after a 429', async () => {
    const { service, calls, advance } = setup([json(429, { error: 'rate_limited' }, { 'retry-after': '120' }), json(200, sampleBody())]);
    expect(await service.handle(msg(), sender)).toEqual({ ok: false, reason: 'rate_limited' });
    advance(119_000);
    expect(await service.handle(msg({ url: 'https://www.emag.ro/x/pd/DXVS722BM/' }), sender)).toEqual({ ok: false, reason: 'rate_limited' });
    expect(calls).toHaveLength(1);
    advance(2000);
    expect((await service.handle(msg(), sender)).ok).toBe(true);
  });

  it('shows nothing for errors and answers out of shape (never cached)', async () => {
    const bad = { ...sampleBody(), slug: '<img src=x onerror=alert(1)>' };
    const { service, calls } = setup([json(500, {}), json(200, bad), () => new Response('not json', { status: 200 }), () => Promise.reject(new Error('offline')), json(503, { error: 'unavailable' })]);
    for (let i = 0; i < 5; i++) expect(await service.handle(msg(), sender)).toEqual({ ok: false, reason: 'unavailable' });
    expect(calls).toHaveLength(5);
  });
});
