import 'server-only';
import { currentConsentText } from '@pretoscop/config/legal-texts';
import { ALERT_CONFIRM_TTL_DAYS, normalizeEmail } from '@pretoscop/core';
import { isFlagEnabled, sql, type AlertKind } from '@pretoscop/db';
import { createMailer } from '@pretoscop/mailer';
import { alertLinks, confirmationEmail, emailHash, type AlertLinks, type Operator } from '@pretoscop/notify';
import { auth } from './auth';
import { db, serverEnv } from './db';

/** Feature flag for the whole email-alert feature (form, confirmation, sending). */
export const ALERTS_EMAIL_FLAG = 'alerts.email.enabled';

export async function alertsEnabled(): Promise<boolean> {
  return isFlagEnabled(db(), ALERTS_EMAIL_FLAG).catch(() => false);
}

export function links(): AlertLinks {
  const env = serverEnv();
  return alertLinks(env.ALERTS_SECRET, env.PUBLIC_BASE_URL);
}

export function secret(): string {
  return serverEnv().ALERTS_SECRET;
}

export function hashEmail(email: string): string {
  return emailHash(secret(), email);
}

export function operator(): Operator {
  const env = serverEnv();
  return { name: env.COMPANY_LEGAL_NAME, address: env.COMPANY_POSTAL_ADDRESS, website: env.PUBLIC_BASE_URL.replace(/\/+$/, '') };
}

/** The alert consent shown today (versioned, M17 `legal-texts`). */
export function alertConsent() {
  return currentConsentText('alertConsent');
}

/**
 * The account for an address: found, or created unverified through Better Auth's adapter (same id
 * format and hooks as a magic-link sign-up, including the admin allowlist). An unverified account
 * that never confirms anything is deleted by the retention job after 7 days.
 */
export async function findOrCreateUser(email: string): Promise<{ id: string; email: string; emailVerified: boolean }> {
  const normalized = normalizeEmail(email);
  const found = await db().execute<{ id: string; email: string; email_verified: boolean }>(
    sql`SELECT id, email, email_verified FROM users WHERE lower(email) = ${normalized} LIMIT 1`,
  );
  const row = found.rows[0];
  if (row) return { id: row.id, email: row.email, emailVerified: row.email_verified };
  const ctx = await auth().$context;
  try {
    const user = await ctx.internalAdapter.createUser({ email: normalized, emailVerified: false, name: '' }, { method: 'alert-form' });
    return { id: user.id, email: user.email, emailVerified: false };
  } catch (err) {
    // Two submissions racing for the same new address: the other one created it.
    const again = await db().execute<{ id: string; email: string; email_verified: boolean }>(
      sql`SELECT id, email, email_verified FROM users WHERE lower(email) = ${normalized} LIMIT 1`,
    );
    const r = again.rows[0];
    if (!r) throw err;
    return { id: r.id, email: r.email, emailVerified: r.email_verified };
  }
}

/** Sends the double opt-in email for a pending alert. */
export async function sendConfirmation(input: {
  to: string;
  alertId: number;
  productTitle: string;
  kind: AlertKind;
  targetBani: number | null;
  anyVariant: boolean;
  requestedAt: Date;
}): Promise<void> {
  const consent = alertConsent();
  const mail = confirmationEmail({
    productTitle: input.productTitle,
    kind: input.kind,
    targetBani: input.targetBani,
    anyVariant: input.anyVariant,
    confirmUrl: links().confirm(input.alertId),
    consent: { text: consent.text, key: consent.key },
    requestedAt: input.requestedAt,
    expiresDays: ALERT_CONFIRM_TTL_DAYS,
    operator: operator(),
  });
  await createMailer(serverEnv()).send({ to: input.to, subject: mail.subject, text: mail.text, html: mail.html, tags: { kind: 'alert_confirmation' } });
}

/** JSON logs for the web process (no personal data: ids and outcomes only). */
export function logAlert(event: string, fields: Record<string, unknown>, err?: unknown): void {
  const line = { level: err ? 'error' : 'info', service: 'web.alerts', event, ...fields, ...(err ? { error: err instanceof Error ? err.message : String(err) } : {}), time: new Date().toISOString() };
  (err ? console.error : console.log)(JSON.stringify(line));
}
