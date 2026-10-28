import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createMailer } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

describe('Resend driver', () => {
  it('passes the idempotency key, so a retry of the same message is not sent twice', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'email-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const mailer = createMailer(getEnv({ MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_test_key' }));
    const sent = await mailer.send({ to: 'a@exemplu.ro', subject: 'S', text: 'T', idempotencyKey: 'alert-sends-abc' });
    expect(sent).toEqual({ id: 'email-1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('alert-sends-abc');
  });

  it('sends no idempotency header when the message has no key', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'email-2' }));
    vi.stubGlobal('fetch', fetchMock);
    await createMailer(getEnv({ MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_test_key' })).send({ to: 'a@exemplu.ro', subject: 'S', text: 'T' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('idempotency-key');
  });
});
