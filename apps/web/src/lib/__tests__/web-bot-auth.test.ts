import { DIRECTORY_MEDIA_TYPE, DIRECTORY_TAG, verifyWebBotAuthRequest } from '@pretoscop/fetch/signing';
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

  it('serves the public JWK with a signature for the public authority', async () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    const res = keyDirectoryResponse({ ...BASE, WEB_BOT_AUTH_PRIVATE_KEY: TEST_SEED }, now);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(DIRECTORY_MEDIA_TYPE);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await res.json()) as { keys: Array<Record<string, string>> };
    expect(body).toEqual({ keys: [{ kty: 'OKP', crv: 'Ed25519', x: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs' }] });
    expect(JSON.stringify(body)).not.toContain(TEST_SEED);

    const headers = { 'signature-input': res.headers.get('signature-input') ?? '', signature: res.headers.get('signature') ?? '' };
    expect(headers['signature-input']).toContain(`keyid="${TEST_KEYID}"`);
    expect(headers['signature-input']).toContain('tag="http-message-signatures-directory"');
    const url = 'https://pretoscop.ro/.well-known/http-message-signatures-directory';
    const keys = [body.keys[0] as { kty: 'OKP'; crv: 'Ed25519'; x: string }];
    expect(verifyWebBotAuthRequest({ url, headers, keys, now: now + 1000, tag: DIRECTORY_TAG, request: { url } })).toMatchObject({ ok: true, keyid: TEST_KEYID });
    // A copy served from another host does not verify.
    expect(verifyWebBotAuthRequest({ url, headers, keys, now, tag: DIRECTORY_TAG, request: { url: 'https://copie.example/x' } })).toMatchObject({ ok: false });
  });
});
