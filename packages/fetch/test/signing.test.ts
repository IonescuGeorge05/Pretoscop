import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWebBotAuthSigner,
  directoryBody,
  DIRECTORY_TAG,
  generateEd25519Key,
  jwkThumbprint,
  loadEd25519Key,
  parseSignatureHeaders,
  serializeSignatureParams,
  signatureBase,
  signBase,
  signDirectoryResponse,
  signerFromEnv,
  verifyWebBotAuthRequest,
  WebBotAuthKeyError,
} from '../src/signing';
import { mockAgent, ROBOTS_ALLOW_ALL, testFetcher } from './helpers';

// RFC 9421 Appendix B.1.4 "test-key-ed25519": published in the RFC, a test fixture, never a real key.
const RFC_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF
-----END PRIVATE KEY-----`;
const RFC_KEY_SEED = 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU';
const RFC_KEY_X = 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs';
/** The keyid in the draft-meunier-web-bot-auth-architecture examples: the JWK thumbprint of that key. */
const RFC_KEY_THUMBPRINT = 'poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U';

describe('keys', () => {
  it('loads the RFC 9421 test key from its seed, from PEM and from one-line PEM, with the draft keyid', () => {
    for (const value of [RFC_KEY_SEED, RFC_KEY_PEM, RFC_KEY_PEM.replace(/\n/g, '\\n'), `  ${RFC_KEY_SEED}\n`]) {
      const key = loadEd25519Key(value);
      expect(key.jwk).toEqual({ kty: 'OKP', crv: 'Ed25519', x: RFC_KEY_X });
      expect(key.keyid).toBe(RFC_KEY_THUMBPRINT);
    }
    expect(jwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x: RFC_KEY_X })).toBe(RFC_KEY_THUMBPRINT);
  });

  it('refuses empty, malformed and non-Ed25519 keys', () => {
    expect(() => loadEd25519Key('')).toThrow(WebBotAuthKeyError);
    expect(() => loadEd25519Key('not-a-key')).toThrow(/base64url Ed25519 seed/);
    expect(() => loadEd25519Key('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')).toThrow(/unreadable key/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    expect(() => loadEd25519Key(rsa)).toThrow(/not an Ed25519 key/);
  });

  it('generates keys whose secret loads back to the same key', () => {
    const { secret, key } = generateEd25519Key();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loadEd25519Key(secret).keyid).toBe(key.keyid);
  });
});

describe('RFC 9421 Appendix B.2.6: signing a request with Ed25519', () => {
  it('builds the signature base and reproduces the published signature', () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/foo?param=Value&Pet=dog',
      headers: {
        Host: 'example.com',
        Date: 'Tue, 20 Apr 2021 02:07:55 GMT',
        'Content-Type': 'application/json',
        'Content-Digest': 'sha-512=:WZDPaVn/7XgHaAy8pmojAkGWoRx2UFChF41A2svX+TaPm+AbwAgBWnrIiYllu7BNNyealdVLvRwEmTHWXvJwew==:',
        'Content-Length': '18',
      },
    };
    const components = ['date', '@method', '@path', '@authority', 'content-type', 'content-length'].map((name) => ({ name }));
    const params = serializeSignatureParams(components, { created: 1618884473, keyid: 'test-key-ed25519' });
    expect(params).toBe('("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"');
    const base = signatureBase(components, params, request);
    expect(base).toBe(
      [
        '"date": Tue, 20 Apr 2021 02:07:55 GMT',
        '"@method": POST',
        '"@path": /foo',
        '"@authority": example.com',
        '"content-type": application/json',
        '"content-length": 18',
        `"@signature-params": ${params}`,
      ].join('\n'),
    );
    expect(signBase(base, loadEd25519Key(RFC_KEY_PEM))).toBe('wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==');
  });
});

const DRAFT_NONCE = 'e8N7S2MFd/qrd6T2R3tdfAuuANngKI7LFtKYI/vowzk4lAZYadIX6wW25MwG7DCT9RUKAJ0qVkU0mEeLElW1qg==';

describe('Web Bot Auth request signatures', () => {
  it('reproduces the example of draft-meunier-web-bot-auth-architecture byte for byte', () => {
    const signer = createWebBotAuthSigner({
      key: RFC_KEY_PEM,
      agentOrigin: 'https://signature-agent.test',
      label: 'sig2',
      validitySeconds: 3600,
      now: () => 1735689600_000,
      nonce: () => DRAFT_NONCE,
    });
    expect(signer.sign(new URL('https://example.com/path/to/resource'))).toEqual({
      'signature-agent': '"https://signature-agent.test"',
      'signature-input': `sig2=("@authority" "signature-agent");created=1735689600;keyid="${RFC_KEY_THUMBPRINT}";alg="ed25519";expires=1735693200;nonce="${DRAFT_NONCE}";tag="web-bot-auth"`,
      signature: 'sig2=:jdq0SqOwHdyHr9+r5jw3iYZH6aNGKijYp/EstF4RQTQdi5N5YYKrD+mCT1HA1nZDsi6nJKuHxUi/5Syp3rLWBA==:',
    });
  });

  it('verifies as a CDN would, and refuses another host, a changed agent, an unknown key and an expired signature', () => {
    const key = loadEd25519Key(RFC_KEY_SEED);
    const now = Date.parse('2026-10-28T10:00:00Z');
    const signer = createWebBotAuthSigner({ key, agentOrigin: 'https://pretoscop.ro/bot', now: () => now });
    const url = 'https://www.magazin.ro/p/1?x=2';
    const headers = signer.sign(new URL(url));
    expect(headers['signature-agent']).toBe('"https://pretoscop.ro"');
    expect(headers['signature-input']).toMatch(/^sig1=\("@authority" "signature-agent"\);created=\d+;keyid="[\w-]+";alg="ed25519";expires=\d+;nonce="[A-Za-z0-9+/=]{88}";tag="web-bot-auth"$/);
    const keys = [key.jwk];

    expect(verifyWebBotAuthRequest({ url, headers, keys, now })).toEqual({ ok: true, keyid: key.keyid, label: 'sig1' });
    expect(verifyWebBotAuthRequest({ url: 'https://alt-magazin.ro/p/1', headers, keys, now })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyWebBotAuthRequest({ url, headers: { ...headers, 'signature-agent': '"https://evil.example"' }, keys, now })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyWebBotAuthRequest({ url, headers, keys: [generateEd25519Key().key.jwk], now })).toEqual({ ok: false, reason: 'unknown_key' });
    expect(verifyWebBotAuthRequest({ url, headers, keys, now: now + 61_000 })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyWebBotAuthRequest({ url, headers: {}, keys, now })).toEqual({ ok: false, reason: 'no_signature' });
    expect(verifyWebBotAuthRequest({ url, headers, keys, now, tag: DIRECTORY_TAG })).toEqual({ ok: false, reason: 'wrong_tag' });
  });

  it('uses a fresh nonce for every request', () => {
    const signer = createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'https://pretoscop.ro' });
    const a = signer.sign(new URL('https://magazin.ro/'))['signature-input'];
    const b = signer.sign(new URL('https://magazin.ro/'))['signature-input'];
    expect(a).not.toBe(b);
  });
});

describe('signerFromEnv', () => {
  it('signs nothing unless WEB_BOT_AUTH is on', () => {
    expect(signerFromEnv({})).toBeUndefined();
    expect(signerFromEnv({ WEB_BOT_AUTH: '0', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED })).toBeUndefined();
  });

  it('refuses to run unsigned when told to sign, and takes the agent from BOT_INFO_URL', () => {
    expect(() => signerFromEnv({ WEB_BOT_AUTH: '1' })).toThrow(/WEB_BOT_AUTH_PRIVATE_KEY is not set/);
    expect(() => signerFromEnv({ WEB_BOT_AUTH: 'true', WEB_BOT_AUTH_PRIVATE_KEY: 'oops' })).toThrow(WebBotAuthKeyError);
    expect(signerFromEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED })?.signatureAgent).toBe('"https://pretoscop.ro"');
    const staging = signerFromEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED, BOT_INFO_URL: 'https://staging.pretoscop.ro/bot' });
    expect(staging?.signatureAgent).toBe('"https://staging.pretoscop.ro"');
    expect(staging?.keyid).toBe(RFC_KEY_THUMBPRINT);
  });
});

describe('key directory', () => {
  it('publishes only the public JWKs', () => {
    const key = loadEd25519Key(RFC_KEY_PEM);
    expect(directoryBody([key])).toBe(`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"${RFC_KEY_X}"}]}`);
    expect(directoryBody([key])).not.toContain(RFC_KEY_SEED);
  });

  it('signs the response for the requested authority with every published key', () => {
    const a = loadEd25519Key(RFC_KEY_PEM);
    const b = generateEd25519Key().key;
    const now = 1_800_000_000_000;
    const h = signDirectoryResponse({ keys: [a, b], authority: 'pretoscop.ro', now, nonce: () => 'bm9uY2U=' });
    expect(h['signature-input'].split(', ')[0]).toBe(
      `sig1=("@authority";req);created=1800000000;keyid="${RFC_KEY_THUMBPRINT}";alg="ed25519";expires=1800000060;nonce="bm9uY2U=";tag="http-message-signatures-directory"`,
    );
    expect(parseSignatureHeaders(h['signature-input'], h.signature).map((s) => s.params.keyid)).toEqual([a.keyid, b.keyid]);

    const directoryUrl = 'https://pretoscop.ro/.well-known/http-message-signatures-directory';
    const check = (keys: (typeof a)['jwk'][], requestUrl: string) =>
      verifyWebBotAuthRequest({ url: directoryUrl, headers: h, keys, now, tag: DIRECTORY_TAG, request: { url: requestUrl } });
    expect(check([a.jwk], directoryUrl)).toMatchObject({ ok: true, keyid: a.keyid });
    expect(check([b.jwk], directoryUrl)).toMatchObject({ ok: true, keyid: b.keyid, label: 'sig2' });
    expect(check([a.jwk], 'https://copie.example/.well-known/http-message-signatures-directory')).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('fetcher hook', () => {
  const agents: ReturnType<typeof mockAgent>[] = [];
  afterEach(async () => {
    await Promise.all(agents.splice(0).map((a) => a.close()));
  });

  it('signs every hop for its own authority, robots.txt included, only when a signer is given', async () => {
    const agent = mockAgent();
    agents.push(agent);
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const answer = (origin: string, body: string) => (opts: { path: string; headers?: unknown }) => {
      seen.push({ url: `${origin}${opts.path}`, headers: opts.headers as Record<string, string> });
      return body;
    };
    for (const origin of ['https://www.magazin.ro', 'https://magazin.ro']) {
      agent.get(origin).intercept({ path: '/robots.txt' }).reply(200, answer(origin, ROBOTS_ALLOW_ALL), { headers: { 'content-type': 'text/plain' } }).persist();
    }
    agent.get('https://www.magazin.ro').intercept({ path: '/p/1' }).reply(301, answer('https://www.magazin.ro', ''), { headers: { location: 'https://magazin.ro/p/1' } });
    agent.get('https://magazin.ro').intercept({ path: '/p/1' }).reply(200, answer('https://magazin.ro', '<html><body>ok</body></html>'), { headers: { 'content-type': 'text/html' } });

    const key = loadEd25519Key(RFC_KEY_SEED);
    const { fetcher, clock } = testFetcher({ dispatcher: agent, signer: createWebBotAuthSigner({ key, agentOrigin: 'https://pretoscop.ro', now: () => clock.now() }) });
    const res = await fetcher.fetchPolite('https://www.magazin.ro/p/1', { purpose: 'product' });
    expect(res.ok).toBe(true);
    expect(seen.map((s) => s.url)).toEqual([
      'https://www.magazin.ro/robots.txt',
      'https://www.magazin.ro/p/1',
      'https://magazin.ro/robots.txt',
      'https://magazin.ro/p/1',
    ]);
    for (const s of seen) {
      const headers = Object.fromEntries(Object.entries(s.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
      expect(headers['user-agent']).toMatch(/PretoscopBot\/1\.0/);
      expect(verifyWebBotAuthRequest({ url: s.url, headers, keys: [key.jwk], now: clock.now() })).toMatchObject({ ok: true });
    }

    const unsigned = mockAgent();
    agents.push(unsigned);
    unsigned.get('https://magazin.ro').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL).persist();
    let headersSeen: Record<string, string> = {};
    unsigned.get('https://magazin.ro').intercept({ path: '/p/2' }).reply(200, (o) => {
      headersSeen = o.headers as Record<string, string>;
      return '<html></html>';
    });
    const plain = testFetcher({ dispatcher: unsigned, signer: null });
    await plain.fetcher.fetchPolite('https://magazin.ro/p/2', { purpose: 'product' });
    expect(Object.keys(headersSeen).map((k) => k.toLowerCase())).not.toContain('signature');
  });
});
