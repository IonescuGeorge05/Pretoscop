import 'server-only';
import { normalizeEmail } from '@pretoscop/core';
import { clearSendCounter, hitSendCounter, sql, type Db } from '@pretoscop/db';
import { clientIp, hashWithDailySalt } from './privacy';
import { createRateLimiter } from './rate-limit';

/**
 * Limits on magic-link emails (M19 review, finding 1). Better Auth's own rate limiter is off here
 * (`disableIpTracking` gives it no IP to key on), and its HTTP endpoint
 * `POST /api/auth/sign-in/magic-link` is public, so the limits live in `sendMagicLink`, which every
 * login path goes through: the /alerte form, the admin and merchant login forms and direct calls.
 *
 * - Per address: at most `LOGIN_LINKS_PER_ADDRESS_PER_HOUR` emails in a fixed one-hour window,
 *   counted in the database (all web processes share it) under a daily-salted hash of the address.
 *   A successful login starts the count over, so people who use their links are never limited.
 * - Per client: at most `LOGIN_LINKS_PER_CLIENT` emails per 15 minutes per daily-salted IP hash
 *   (in memory, per process), whatever the addresses.
 *
 * Over a limit nothing is sent, and the caller answers exactly as if it had been (no enumeration).
 */
export const LOGIN_LINKS_PER_ADDRESS_PER_HOUR = 5;
export const LOGIN_LINKS_PER_CLIENT = 20;

const clientLimiter = createRateLimiter({ limit: LOGIN_LINKS_PER_CLIENT, windowMs: 15 * 60 * 1000 });

function addressKey(email: string): string {
  return `login:${hashWithDailySalt('login-email', normalizeEmail(email))}`;
}

export type LoginEmailDecision = { allowed: true } | { allowed: false; reason: 'address' | 'client' };

/** Whether a magic-link email to `email` may go out now (and counts it when it may). */
export async function allowLoginEmail(db: Db, email: string, headers: Headers | null | undefined): Promise<LoginEmailDecision> {
  if (headers && !clientLimiter.hit(hashWithDailySalt('ip', clientIp(headers))).allowed) {
    return { allowed: false, reason: 'client' };
  }
  const n = await hitSendCounter(db, addressKey(email), 60);
  return n <= LOGIN_LINKS_PER_ADDRESS_PER_HOUR ? { allowed: true } : { allowed: false, reason: 'address' };
}

/** A successful login: the address's counter starts over. */
export async function resetLoginEmails(db: Db, userId: string): Promise<void> {
  const r = await db.execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${userId}`);
  const email = r.rows[0]?.email;
  if (email) await clearSendCounter(db, addressKey(email));
}
