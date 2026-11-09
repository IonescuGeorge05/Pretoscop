import { describe, expect, it } from 'vitest';
import { loadEd25519Key, signDirectoryResponse, directoryBody, DIRECTORY_MEDIA_TYPE, generateEd25519Key } from '@pretoscop/fetch';
import { checkDirectory, checkIpsJson, checkReverseDns, type Resolver } from '../src/ops/bot-identity';

const notFound = Object.assign(new Error('queryPtr ENOTFOUND'), { code: 'ENOTFOUND' });
function resolver(ptr: Record<string, string[]>, a: Record<string, string[]>): Resolver {
  return {
    reverse: async (ip) => {
      if (!ptr[ip]) throw notFound;
      return ptr[ip]!;
    },
    resolve4: async (name) => a[name] ?? [],
    resolve6: async (name) => a[name] ?? [],
  };
}

describe('forward-confirmed reverse DNS', () => {
  it('accepts crawl-N.bot.pretoscop.ro that resolves back, for IPv4 and IPv6', async () => {
    const r = resolver(
      { '203.0.113.10': ['crawl-1.bot.pretoscop.ro.'], '2001:db8::10': ['crawl-2.bot.pretoscop.ro'] },
      { 'crawl-1.bot.pretoscop.ro': ['203.0.113.10'], 'crawl-2.bot.pretoscop.ro': ['2001:0db8:0000:0000:0000:0000:0000:0010'] },
    );
    expect(await checkReverseDns('203.0.113.10', r)).toEqual({ name: 'reverse DNS 203.0.113.10', ok: true, detail: '203.0.113.10 → crawl-1.bot.pretoscop.ro → 203.0.113.10' });
    expect(await checkReverseDns('2001:db8::10', r)).toMatchObject({ ok: true });
  });

  it('refuses a missing PTR, a foreign name and a name that does not resolve back', async () => {
    const r = resolver(
      { '203.0.113.11': ['static.11.113.0.203.clients.your-server.de'], '203.0.113.12': ['crawl-3.bot.pretoscop.ro'], '203.0.113.13': ['crawl-1.bot.pretoscop.ro.evil.example'] },
      { 'crawl-3.bot.pretoscop.ro': ['198.51.100.1'] },
    );
    expect(await checkReverseDns('203.0.113.10', r)).toMatchObject({ ok: false, detail: expect.stringContaining('no PTR record (ENOTFOUND)') });
    expect(await checkReverseDns('203.0.113.11', r)).toMatchObject({ ok: false, detail: expect.stringContaining('expected crawl-N.bot.pretoscop.ro') });
    expect(await checkReverseDns('203.0.113.12', r)).toMatchObject({ ok: false, detail: expect.stringContaining('does not resolve back') });
    expect(await checkReverseDns('203.0.113.13', r)).toMatchObject({ ok: false });
    expect(await checkReverseDns('203.0.113.0/28', r)).toMatchObject({ ok: false, detail: expect.stringContaining('not an IP address') });
  });
});

describe('/bot/ips.json', () => {
  it('must list exactly the configured addresses, in both formats', () => {
    const body = { ipv4: ['203.0.113.10'], ipv6: [], prefixes: [{ ipv4Prefix: '203.0.113.10/32' }] };
    expect(checkIpsJson(body, ['203.0.113.10'])).toMatchObject({ ok: true });
    expect(checkIpsJson(body, ['203.0.113.10', '203.0.113.11'])).toMatchObject({ ok: false });
    expect(checkIpsJson({ ipv4: ['203.0.113.10'], ipv6: [] }, ['203.0.113.10'])).toMatchObject({ ok: false, detail: expect.stringContaining('prefixes') });
    expect(checkIpsJson({ ipv4: [], ipv6: [], prefixes: [] }, [])).toMatchObject({ ok: true, detail: expect.stringContaining('A4 pending') });
  });
});

describe('key directory', () => {
  const seed = 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU'; // RFC 9421 test key
  const key = loadEd25519Key(seed);
  const now = Date.parse('2026-10-28T10:00:00Z');
  const served = (authority: string) => ({
    status: 200,
    headers: { 'content-type': DIRECTORY_MEDIA_TYPE, ...signDirectoryResponse({ keys: [key], body: directoryBody([key]), authority, now }) },
    body: directoryBody([key]),
  });

  it('accepts a signed directory that holds our key', () => {
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', ...served('pretoscop.ro'), privateKey: seed, now })).toMatchObject({ ok: true });
  });

  it('reports a missing directory, a signature for another host and a directory without our key', () => {
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', status: 404, headers: {}, body: '' })).toMatchObject({ ok: false, detail: expect.stringContaining('not published') });
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', ...served('staging.pretoscop.ro'), now })).toMatchObject({ ok: false, detail: expect.stringContaining('does not verify') });
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', ...served('pretoscop.ro'), privateKey: generateEd25519Key().secret, now })).toMatchObject({
      ok: false,
      detail: expect.stringContaining('is not in the directory'),
    });
    const tampered = served('pretoscop.ro');
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', ...tampered, body: tampered.body.replace('"use":"sig"', '"use":"enc"'), now })).toMatchObject({
      ok: false,
      detail: expect.stringContaining('Content-Digest'),
    });
    expect(checkDirectory({ siteOrigin: 'https://pretoscop.ro', ...served('pretoscop.ro'), now: now + 3_600_000 })).toMatchObject({
      ok: false,
      detail: expect.stringContaining('expired'),
    });
  });
});
