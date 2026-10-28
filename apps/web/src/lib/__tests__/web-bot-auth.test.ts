import { DIRECTORY_MEDIA_TYPE, verifyDirectoryResponse } from '@pretoscop/fetch/signing';
import { describe, expect, it } from 'vitest';
import { keyDirectoryResponse, webBotAuthStatus } from '../web-bot-auth';

// RFC 9421 Appendix B.1.4 test key (public; refused by getEnv() in staging and production).
const TEST_SEED = 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU';
const TEST_KEYID = 'poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U';
const BASE = { WEB_BOT_AUTH: false, WEB_BOT_AUTH_PRIVATE_KEY: undefined, BOT_INFO_URL: 'https://pretoscop.ro/bot' };

describe('webBotAuthStatus', () => {
  it('reports nothing published and no signing without a key', () => {
    expect(webBotAuthStatus(BASE)).toEqual({
      keyPublished: false,
      signing: false,
      keyid: null,
      agentOrigin: 'https://pretoscop.ro',
      signatureAgentHeader: 'sig1="https://pretoscop.ro"',
      directoryUrl: 'https://pretoscop.ro/.well-known/http-message-signatures-directory',
    });
  });

  it('publishes the key before signing is switched on', () => {
    expect(webBotAuthStatus({ ...BASE, WEB_BOT_AUTH_PRIVATE_KEY: TEST_SEED })).toMatchObject({ keyPublished: true, signing: false, keyid: TEST_KEYID });
    expect(webBotAuthStatus({ ...BASE, WEB_BOT_AUTH: true, WEB_BOT_AUTH_PRIVATE_KEY: TEST_SEED })).toMatchObject({ signing: true });
    expect(webBotAuthStatus({ ...BASE, WEB_BOT_AUTH: true, WEB_BOT_AUTH_PRIVATE_KEY: 'A'.repeat(43) + '!' })).toMatchObject({ keyPublished: false, signing: false });
  });
});

describe('keyDirectoryResponse', () => {
  it('is a 404 until a key is configured', async () => {
    const res = keyDirectoryResponse(BASE);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('No Web Bot Auth key');
  });

  it('serves the public JWK with a content digest and a possession proof for the public authority', async () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    const res = keyDirectoryResponse({ ...BASE, WEB_BOT_AUTH_PRIVATE_KEY: TEST_SEED }, now);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(DIRECTORY_MEDIA_TYPE);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ keys: [{ kty: 'OKP', crv: 'Ed25519', kid: TEST_KEYID, x: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs', use: 'sig' }] });
    expect(text).not.toContain(TEST_SEED);

    const headers = Object.fromEntries(res.headers.entries());
    expect(headers['signature-input']).toContain(`keyid="${TEST_KEYID}"`);
    expect(headers['signature-input']).toContain('("@authority";req "content-digest")');
    expect(headers['signature-input']).toContain('tag="http-message-signatures-directory"');
    const url = 'https://pretoscop.ro/.well-known/http-message-signatures-directory';
    expect(verifyDirectoryResponse({ requestUrl: url, headers, body: text, now: now + 1000 })).toEqual({ ok: true, keyids: [TEST_KEYID] });
    // A copy served from another host does not verify, nor does a changed body.
    expect(verifyDirectoryResponse({ requestUrl: 'https://copie.example/.well-known/http-message-signatures-directory', headers, body: text, now })).toMatchObject({ ok: false });
    expect(verifyDirectoryResponse({ requestUrl: url, headers, body: text.replace('"use":"sig"', '"use":"enc"'), now })).toMatchObject({ ok: false, reason: 'bad_digest' });
  });
});
