import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeEmail } from '@pretoscop/core';

/**
 * Signed, stateless links for alert emails (M19). A token is the first 16 bytes of
 * HMAC-SHA256(ALERTS_SECRET, "<purpose>:<id>") in base64url (22 characters). Unsubscribe links work
 * for as long as the alert or the account exists (RFC 8058 asks for links that keep working);
 * confirmation links expire with the pending alert (7 days). Rotating ALERTS_SECRET invalidates
 * every link already sent and every suppression hash: do it only after a leak.
 */
export type LinkPurpose = 'confirm' | 'unsub-alert' | 'unsub-user' | 'keep';

function mac(secret: string, purpose: LinkPurpose, id: string | number): Buffer {
  return createHmac('sha256', secret).update(`${purpose}:${String(id)}`).digest().subarray(0, 16);
}

export function signLink(secret: string, purpose: LinkPurpose, id: string | number): string {
  return mac(secret, purpose, id).toString('base64url');
}

export function verifyLink(secret: string, purpose: LinkPurpose, id: string | number, token: unknown): boolean {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) return false;
  const given = Buffer.from(token, 'base64url');
  const expected = mac(secret, purpose, id);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Stable pseudonym of an address (suppression list and consent ledger): HMAC-SHA256 with
 * ALERTS_SECRET over the normalized address. Not the daily-salted hash used for IPs: it must match
 * the same address years later.
 */
export function emailHash(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`email:${normalizeEmail(email)}`).digest('hex');
}

export interface AlertLinks {
  confirm(alertId: number): string;
  unsubscribeAlert(alertId: number): string;
  unsubscribeAll(userId: string): string;
  /** RFC 8058 one-click target for the List-Unsubscribe header (POST only). */
  oneClick(userId: string): string;
  keepAccount(userId: string): string;
  manage(): string;
  product(slug: string): string;
  /** Click-out through /out (logs a hashed click, picks the allowed link). */
  out(offerId: number): string;
}

export function alertLinks(secret: string, baseUrl: string): AlertLinks {
  const base = baseUrl.replace(/\/+$/, '');
  const q = (purpose: LinkPurpose, key: 'a' | 'u', id: string | number) => `${key}=${encodeURIComponent(String(id))}&t=${signLink(secret, purpose, id)}`;
  return {
    confirm: (alertId) => `${base}/alerte/confirmare?${q('confirm', 'a', alertId)}`,
    unsubscribeAlert: (alertId) => `${base}/alerte/dezabonare?${q('unsub-alert', 'a', alertId)}`,
    unsubscribeAll: (userId) => `${base}/alerte/dezabonare?${q('unsub-user', 'u', userId)}`,
    oneClick: (userId) => `${base}/api/alerts/unsubscribe?${q('unsub-user', 'u', userId)}`,
    keepAccount: (userId) => `${base}/alerte/pastreaza?${q('keep', 'u', userId)}`,
    manage: () => `${base}/alerte`,
    product: (slug) => `${base}/p/${encodeURIComponent(slug)}`,
    out: (offerId) => `${base}/out/${offerId}?p=alert`,
  };
}
