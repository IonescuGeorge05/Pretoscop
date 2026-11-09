import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  contentDigest,
  createWebBotAuthSigner,
  directoryBody,
  generateEd25519Key,
  jwkThumbprint,
  loadEd25519Key,
  parseSfDictionary,
  parseSignatureHeaders,
  serializeSignatureParams,
  signatureBase,
  signBase,
  signDirectoryResponse,
  signerFromEnv,
  verifyDirectoryResponse,
  verifyWebBotAuthRequest,
  WebBotAuthKeyError,
  type Component,
} from '../src/signing';
import { mockAgent, ROBOTS_ALLOW_ALL, testFetcher } from './helpers';

// RFC 9421 Appendix B.1.4 "test-key-ed25519": published in the RFC, a test fixture, never a real key.
const RFC_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF
-----END PRIVATE KEY-----`;
const RFC_KEY_SEED = 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU';
const RFC_KEY_X = 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs';
/** The keyid of the draft's test vectors: the JWK thumbprint of that key. */
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

  it('refuses empty, malformed and non-Ed25519 keys without echoing them', () => {
    expect(() => loadEd25519Key('')).toThrow(WebBotAuthKeyError);
    expect(() => loadEd25519Key('not-a-key')).toThrow(/base64url Ed25519 seed/);
    expect(() => loadEd25519Key('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')).toThrow(/unreadable key/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    expect(() => loadEd25519Key(rsa)).toThrow(/not an Ed25519 key/);
    expect(() => loadEd25519Key(`${RFC_KEY_SEED}x`)).toThrow(WebBotAuthKeyError);
    try {
      loadEd25519Key(`${RFC_KEY_SEED}x`);
    } catch (err) {
      expect((err as Error).message).not.toContain(RFC_KEY_SEED);
    }
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

// draft-ietf-webbotauth-httpsig-protocol-00, Appendix E.2.
const E21_NONCE = 'n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==';
const E22_NONCE = 'e8N7S2MFd/qrd6T2R3tdfAuuANngKI7LFtKYI/vowzk4lAZYadIX6wW25MwG7DCT9RUKAJ0qVkU0mEeLElW1qg==';

describe('Web Bot Auth request signatures (draft-ietf-webbotauth-httpsig-protocol-00)', () => {
  it('E.2.1: reproduces the dictionary-form vector byte for byte', () => {
    const signer = createWebBotAuthSigner({
      key: RFC_KEY_PEM,
      agentOrigin: 'https://signature-agent.test',
      label: 'sig2',
      agentKey: 'agent2',
      validitySeconds: 4889289600 - 1735689600,
      now: () => 1735689600_000,
      nonce: () => E21_NONCE,
    });
    expect(signer.sign(new URL('https://example.com/path/to/resource'))).toEqual({
      'signature-agent': 'agent2="https://signature-agent.test"',
      'signature-input': `sig2=("@authority" "signature-agent";key="agent2");created=1735689600;keyid="${RFC_KEY_THUMBPRINT}";alg="ed25519";expires=4889289600;nonce="${E21_NONCE}";tag="web-bot-auth"`,
      signature: 'sig2=:RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg==:',
    });
  });

  it('E.2.2: the legacy bare-string form still reproduces, and verifiers here accept it', () => {
    const components: Component[] = [{ name: '@authority' }, { name: 'signature-agent' }];
    const params = serializeSignatureParams(components, {
      created: 1735689600,
      keyid: RFC_KEY_THUMBPRINT,
      alg: 'ed25519',
      expires: 1735693200,
      nonce: E22_NONCE,
      tag: 'web-bot-auth',
    });
    const headers = { 'signature-agent': '"https://signature-agent.test"' };
    const sig = signBase(signatureBase(components, params, { url: 'https://example.com/', headers }), loadEd25519Key(RFC_KEY_SEED));
    expect(sig).toBe('jdq0SqOwHdyHr9+r5jw3iYZH6aNGKijYp/EstF4RQTQdi5N5YYKrD+mCT1HA1nZDsi6nJKuHxUi/5Syp3rLWBA==');
    const all = { ...headers, 'signature-input': `sig2=${params}`, signature: `sig2=:${sig}:` };
    expect(verifyWebBotAuthRequest({ url: 'https://example.com/', headers: all, keys: [{ kty: 'OKP', crv: 'Ed25519', x: RFC_KEY_X }], now: 1735689700_000 })).toEqual({
      ok: true,
      keyid: RFC_KEY_THUMBPRINT,
      label: 'sig2',
      agent: 'https://signature-agent.test',
    });
  });

  it('signs with sig1 and its own Signature-Agent member by default, valid for a minute', () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    const signer = createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'https://pretoscop.ro/bot', now: () => now });
    expect(signer.agentOrigin).toBe('https://pretoscop.ro');
    const headers = signer.sign(new URL('https://www.magazin.ro/p/1'));
    expect(headers['signature-agent']).toBe('sig1="https://pretoscop.ro"');
    expect(headers['signature-input']).toMatch(
      /^sig1=\("@authority" "signature-agent";key="sig1"\);created=\d+;keyid="[\w-]{43}";alg="ed25519";expires=\d+;nonce="[A-Za-z0-9+/=]{88}";tag="web-bot-auth"$/,
    );
    const p = parseSignatureHeaders(headers['signature-input']!, headers.signature!)[0]!;
    expect(Number(p.params.expires) - Number(p.params.created)).toBe(60);
  });

  it('verifies as a CDN would, and refuses another host, a changed agent, an unknown key, an expired or unbounded signature', () => {
    const key = loadEd25519Key(RFC_KEY_SEED);
    const now = Date.parse('2026-10-28T10:00:00Z');
    const signer = createWebBotAuthSigner({ key, agentOrigin: 'https://pretoscop.ro', now: () => now });
    const url = 'https://www.magazin.ro/p/1?x=2';
    const headers = signer.sign(new URL(url));
    const keys = [key.jwk];

    expect(verifyWebBotAuthRequest({ url, headers, keys, now })).toEqual({ ok: true, keyid: key.keyid, label: 'sig1', agent: 'https://pretoscop.ro' });
    // Same site, other path: the covered components are the authority and the agent only (by design).
    expect(verifyWebBotAuthRequest({ url: 'https://www.magazin.ro/alt', headers, keys, now })).toMatchObject({ ok: true });
    expect(verifyWebBotAuthRequest({ url: 'https://alt-magazin.ro/p/1', headers, keys, now })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyWebBotAuthRequest({ url, headers: { ...headers, 'signature-agent': 'sig1="https://evil.example"' }, keys, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifyWebBotAuthRequest({ url, headers: { ...headers, 'signature-agent': 'other="https://pretoscop.ro"' }, keys, now })).toEqual({
      ok: false,
      reason: 'missing_component',
    });
    expect(verifyWebBotAuthRequest({ url, headers, keys: [generateEd25519Key().key.jwk], now })).toEqual({ ok: false, reason: 'unknown_key' });
    expect(verifyWebBotAuthRequest({ url, headers, keys, now: now + 61_000 })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyWebBotAuthRequest({ url, headers, keys, now: now - 120_000 })).toEqual({ ok: false, reason: 'not_yet_valid' });
    expect(verifyWebBotAuthRequest({ url, headers: {}, keys, now })).toEqual({ ok: false, reason: 'no_signature' });
    const otherTag = { ...headers, 'signature-input': headers['signature-input']!.replace('tag="web-bot-auth"', 'tag="other"') };
    expect(verifyWebBotAuthRequest({ url, headers: otherTag, keys, now })).toEqual({ ok: false, reason: 'wrong_tag' });
    const noExpiry = { ...headers, 'signature-input': headers['signature-input']!.replace(/;expires=\d+/, '') };
    expect(verifyWebBotAuthRequest({ url, headers: noExpiry, keys, now })).toEqual({ ok: false, reason: 'missing_params' });
  });

  it('uses a fresh nonce for every request', () => {
    const signer = createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'https://pretoscop.ro' });
    const a = signer.sign(new URL('https://magazin.ro/'))['signature-input'];
    const b = signer.sign(new URL('https://magazin.ro/'))['signature-input'];
    expect(a).not.toBe(b);
  });

  it('accepts only an https agent origin (http only on loopback, for local tests)', () => {
    expect(() => createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'http://pretoscop.ro' })).toThrow(/https origin/);
    expect(() => createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'ftp://pretoscop.ro' })).toThrow(/https origin/);
    expect(createWebBotAuthSigner({ key: RFC_KEY_SEED, agentOrigin: 'http://localhost:3450/bot' }).signatureAgent).toBe('sig1="http://localhost:3450"');
  });
});

describe('structured-field dictionary', () => {
  it('re-serializes members canonically, with parameters', () => {
    const d = parseSfDictionary('sig1="https://a.test" , sig2="https://b.test/jwks.json";type=jwks_uri, flag, n=12;x=?1');
    expect([...d.entries()]).toEqual([
      ['sig1', '"https://a.test"'],
      ['sig2', '"https://b.test/jwks.json";type=jwks_uri'],
      ['flag', '?1'],
      ['n', '12;x'],
    ]);
    expect(() => parseSfDictionary('sig1="unterminated')).toThrow();
    expect(() => parseSfDictionary('sig1="a",')).toThrow(/trailing comma/);
  });
});

describe('signerFromEnv', () => {
  it('signs nothing unless WEB_BOT_AUTH is on', () => {
    expect(signerFromEnv({})).toBeUndefined();
    expect(signerFromEnv({ WEB_BOT_AUTH: '0', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED })).toBeUndefined();
    expect(signerFromEnv({ WEB_BOT_AUTH: 'false', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED })).toBeUndefined();
  });

  it('refuses to run unsigned when told to sign, and takes the agent from BOT_INFO_URL', () => {
    expect(() => signerFromEnv({ WEB_BOT_AUTH: '1' })).toThrow(/WEB_BOT_AUTH_PRIVATE_KEY is not set/);
    expect(() => signerFromEnv({ WEB_BOT_AUTH: 'true', WEB_BOT_AUTH_PRIVATE_KEY: 'oops' })).toThrow(WebBotAuthKeyError);
    expect(() => signerFromEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED, BOT_INFO_URL: 'http://pretoscop.ro/bot' })).toThrow(/https origin/);
    expect(signerFromEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED })?.signatureAgent).toBe('sig1="https://pretoscop.ro"');
    const staging = signerFromEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: RFC_KEY_SEED, BOT_INFO_URL: 'https://staging.pretoscop.ro/bot' });
    expect(staging?.signatureAgent).toBe('sig1="https://staging.pretoscop.ro"');
    expect(staging?.keyid).toBe(RFC_KEY_THUMBPRINT);
  });
});

describe('key directory', () => {
  const VECTOR_BODY = `{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"${RFC_KEY_THUMBPRINT}","x":"${RFC_KEY_X}","use":"sig"}]}`;

  it('publishes only the public JWK, with kid = thumbprint, byte for byte as the draft', () => {
    const key = loadEd25519Key(RFC_KEY_PEM);
    expect(directoryBody([key])).toBe(VECTOR_BODY);
    expect(directoryBody([key])).not.toContain(RFC_KEY_SEED);
    expect(directoryBody([key])).not.toMatch(/"d"/);
  });

  it('E.2.3: reproduces the signed directory response vector', () => {
    const key = loadEd25519Key(RFC_KEY_PEM);
    const h = signDirectoryResponse({ keys: [key], body: VECTOR_BODY, authority: 'signature-agent.test', now: 1735689600_000, validitySeconds: 4889289600 - 1735689600 });
    expect(h).toEqual({
      'content-digest': 'sha-256=:CADMT2aBdV/rqQr/NIru64ERQkCobVvllA4V0fLFDu0=:',
      'signature-input': `binding=("@authority";req "content-digest");created=1735689600;expires=4889289600;keyid="${RFC_KEY_THUMBPRINT}";tag="http-message-signatures-directory"`,
      signature: 'binding=:l6P8R67tm3kujAxbHWio7ll01qrEZ0dKD/WWlGhNYEmTnFZM8Wt0VQ9zqGfvo7T/UMkBxsigzChM1Gpz7gOVBg==:',
    });
    expect(contentDigest(VECTOR_BODY)).toBe(h['content-digest']);
    expect(
      verifyDirectoryResponse({ requestUrl: 'https://signature-agent.test/.well-known/http-message-signatures-directory', headers: h, body: VECTOR_BODY, now: 1735689600_000 }),
    ).toEqual({ ok: true, keyids: [RFC_KEY_THUMBPRINT] });
  });

  it('signs for the requested authority with every published key; the checker refuses copies and swapped bodies', () => {
    const a = loadEd25519Key(RFC_KEY_PEM);
    const b = generateEd25519Key().key;
    const now = 1_800_000_000_000;
    const body = directoryBody([a, b]);
    const h = signDirectoryResponse({ keys: [a, b], body, authority: 'pretoscop.ro', now });
    expect(parseSignatureHeaders(h['signature-input'], h.signature).map((s) => [s.label, s.params.keyid])).toEqual([
      ['binding', a.keyid],
      ['binding2', b.keyid],
    ]);
    const directoryUrl = 'https://pretoscop.ro/.well-known/http-message-signatures-directory';
    expect(verifyDirectoryResponse({ requestUrl: directoryUrl, headers: h, body, now })).toEqual({ ok: true, keyids: [a.keyid, b.keyid] });
    expect(verifyDirectoryResponse({ requestUrl: 'https://copie.example/.well-known/http-message-signatures-directory', headers: h, body, now })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
    const swapped = directoryBody([a, generateEd25519Key().key]);
    expect(verifyDirectoryResponse({ requestUrl: directoryUrl, headers: h, body: swapped, now })).toMatchObject({ ok: false, reason: 'bad_digest' });
    expect(verifyDirectoryResponse({ requestUrl: directoryUrl, headers: { ...h, 'content-digest': contentDigest(swapped) }, body: swapped, now })).toMatchObject({ ok: false });
    expect(verifyDirectoryResponse({ requestUrl: directoryUrl, headers: h, body, now: now + 61_000 })).toMatchObject({ ok: false, reason: 'expired' });
    expect(verifyDirectoryResponse({ requestUrl: directoryUrl, headers: h, body: '{"keys":[{"kty":"OKP","crv":"Ed25519","x":"x","d":"secret"}]}', now })).toMatchObject({
      ok: false,
      reason: 'bad_body',
    });
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
      expect(verifyWebBotAuthRequest({ url: s.url, headers, keys: [key.jwk], now: clock.now() })).toMatchObject({ ok: true, agent: 'https://pretoscop.ro' });
    }

    const unsigned = mockAgent();
    agents.push(unsigned);
    unsigned.get('https://magazin.ro').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL).persist();
    let headersSeen: Record<string, string> = {};
    unsigned
      .get('https://magazin.ro')
      .intercept({ path: '/p/2' })
      .reply(200, (o) => {
        headersSeen = o.headers as Record<string, string>;
        return '<html></html>';
      });
    const plain = testFetcher({ dispatcher: unsigned, signer: null });
    await plain.fetcher.fetchPolite('https://magazin.ro/p/2', { purpose: 'product' });
    const names = Object.keys(headersSeen).map((k) => k.toLowerCase());
    expect(names).not.toContain('signature');
    expect(names).not.toContain('signature-agent');
  });

  it('reads WEB_BOT_AUTH from the environment when no signer is injected, and stays unsigned by default', async () => {
    const saved = { WEB_BOT_AUTH: process.env.WEB_BOT_AUTH, WEB_BOT_AUTH_PRIVATE_KEY: process.env.WEB_BOT_AUTH_PRIVATE_KEY, BOT_INFO_URL: process.env.BOT_INFO_URL };
    const run = async (path: string) => {
      const agent = mockAgent();
      agents.push(agent);
      agent.get('https://magazin.ro').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL).persist();
      let h: Record<string, string> = {};
      agent
        .get('https://magazin.ro')
        .intercept({ path })
        .reply(200, (o) => {
          h = Object.fromEntries(Object.entries(o.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));
          return '<html></html>';
        });
      await testFetcher({ dispatcher: agent }).fetcher.fetchPolite(`https://magazin.ro${path}`, { purpose: 'product' });
      return h;
    };
    try {
      delete process.env.WEB_BOT_AUTH;
      process.env.WEB_BOT_AUTH_PRIVATE_KEY = RFC_KEY_SEED;
      delete process.env.BOT_INFO_URL;
      expect((await run('/p/3')).signature).toBeUndefined();
      process.env.WEB_BOT_AUTH = '1';
      expect((await run('/p/4'))['signature-agent']).toBe('sig1="https://pretoscop.ro"');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
