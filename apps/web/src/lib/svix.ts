import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signature check for Resend (Svix scheme): HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${raw body}` with the base64 key after the `whsec_` prefix; the
 * `svix-signature` header lists `v1,<base64>` values (any may match). Timestamps older or newer
 * than five minutes are refused (replays).
 */
export const SVIX_TOLERANCE_SEC = 5 * 60;

export function svixSign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSec - ts) > SVIX_TOLERANCE_SEC) return false;
  const expected = Buffer.from(svixSign(secret, id, timestamp, body));
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type ResendEvent = { type: string; data?: { to?: unknown; email_id?: string; bounce?: { type?: string } } };

/** Addresses a Resend event is about (`data.to` is a list). */
export function eventRecipients(e: ResendEvent): string[] {
  const to = e.data?.to;
  const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
  return list.filter((x): x is string => typeof x === 'string' && x.includes('@')).slice(0, 50);
}

/** What an event means for alerts: a permanent bounce, a spam complaint, or nothing. */
export function eventAction(e: ResendEvent): 'bounce' | 'complaint' | null {
  if (e.type === 'email.complained') return 'complaint';
  if (e.type === 'email.bounced') {
    const kind = (e.data?.bounce?.type ?? '').toLowerCase();
    return kind === 'transient' || kind === 'temporary' ? null : 'bounce';
  }
  return null;
}
