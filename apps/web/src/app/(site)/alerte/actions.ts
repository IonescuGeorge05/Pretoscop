'use server';

import { randomBytes } from 'node:crypto';
import { ALERT_CONFIRM_TTL_DAYS, isPlausibleEmail, normalizeEmail, parseTargetPrice } from '@pretoscop/core';
import { currentConsentText } from '@pretoscop/config/legal-texts';
import {
  bestAlertOffer,
  confirmAlert,
  createTelegramLinkToken,
  deleteAlert,
  deleteAllAlerts,
  deleteUserData,
  getAlert,
  unlinkTelegram,
  updateAlert,
  type AlertChannel,
  type AlertKind,
} from '@pretoscop/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashEmail, logAlert } from '@/lib/alerts';
import { userChannels } from '@/lib/channels';
import { auth, getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { createRateLimiter } from '@/lib/rate-limit';

/**
 * 5 login-link requests per 15 minutes per daily-salted IP hash (never the User-Agent, which a
 * client can change at will), to tell the visitor. The binding limits (per address, per client)
 * apply to every login path in `sendMagicLink` (lib/login-limits.ts).
 */
const loginLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

async function currentUser() {
  const s = await getSession();
  if (!s) redirect('/alerte');
  return s.user;
}

const back: (q: string) => never = (q) => redirect(`/alerte?${q}`);

/** Magic-link login for /alerte, as a plain form (works without JavaScript). */
export async function requestLoginLink(form: FormData): Promise<void> {
  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!isPlausibleEmail(email)) back('eroare=email');
  const h = await headers();
  if (!loginLimiter.hit(hashWithDailySalt('ip', clientIp(h))).allowed) back('eroare=limita');
  try {
    await auth().api.signInMagicLink({ body: { email, callbackURL: '/alerte' }, headers: h });
  } catch (err) {
    logAlert('login.link_failed', {}, err);
    back('eroare=trimitere');
  }
  back('link=trimis');
}

export async function signOutAction(): Promise<void> {
  await auth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  redirect('/alerte');
}

/** Changes what an alert watches (kind, target, channel). A target must be under today's best total. */
export async function updateAlertAction(form: FormData): Promise<void> {
  const user = await currentUser();
  const id = Number(form.get('alertId'));
  const alert = Number.isInteger(id) ? await getAlert(db(), id) : null;
  if (!alert || alert.userId !== user.id) back('eroare=alerta');
  const kind = String(form.get('kind') ?? '') as AlertKind;
  if (kind !== 'below' && kind !== 'any_drop') back(`eroare=tip&a=${id}`);
  let targetBani: number | null = null;
  if (kind === 'below') {
    const best = await bestAlertOffer(db(), alert.productId, alert.anyVariant);
    const t = parseTargetPrice(String(form.get('target') ?? ''), best?.totalBani ?? null);
    if (!t.ok) back(`eroare=prag-${t.error}&a=${id}`);
    else targetBani = t.bani;
  }
  // M27: the channel. Push and Telegram need the channel set up (with its own consent); moving an
  // alert to email from another channel needs the email consent box ticked in this form.
  const requested = String(form.get('channel') ?? alert.channel) as AlertChannel;
  if (requested !== 'email' && requested !== 'push' && requested !== 'telegram') back(`eroare=canal&a=${id}`);
  const ch = await userChannels(user.id);
  if (!ch.usable[requested]) back(`eroare=canal&a=${id}`);
  let consent: { textVersion: string; ipHash: string | null; emailHash: string | null } | undefined;
  if (requested === 'email' && alert.channel !== 'email') {
    if (form.get('emailConsent') !== 'on') back(`eroare=acord-email&a=${id}#alerta-${id}`);
    const h = await headers();
    consent = { textVersion: currentConsentText('alertConsent').key, ipHash: hashWithDailySalt('ip', clientIp(h)), emailHash: hashEmail(user.email) };
  }
  await updateAlert(db(), id, user.id, { kind, targetBani, channel: requested, ...(consent ? { consent } : {}) });
  back(`modificat=${id}#alerta-${id}`);
}

/**
 * M27: "Conectează Telegram" with the Telegram consent box ticked. A one-time token (15 minutes,
 * stored as a hash) goes into the t.me deep link; the bot links the chat on /start <token>.
 */
export async function startTelegramLinkAction(form: FormData): Promise<void> {
  const user = await currentUser();
  if (form.get('telegramConsent') !== 'on') back('eroare=acord-telegram#canale');
  const ch = await userChannels(user.id);
  if (!ch.telegramBot) back('eroare=telegram#canale');
  const token = randomBytes(24).toString('base64url');
  await createTelegramLinkToken(db(), user.id, token, currentConsentText('telegramConsent').key);
  back(`tg=${token}#canale`);
}

/** M27: disconnects Telegram; alerts on Telegram pause until the chat is linked again. */
export async function unlinkTelegramAction(): Promise<void> {
  const user = await currentUser();
  await unlinkTelegram(db(), user.id, 'account');
  back('canal=telegram-oprit#canale');
}

export async function deleteAlertAction(form: FormData): Promise<void> {
  const user = await currentUser();
  const id = Number(form.get('alertId'));
  if (Number.isInteger(id)) await deleteAlert(db(), id, { method: 'account', userId: user.id });
  back('sters-alerta=1');
}

/** A pending alert seen by its logged-in owner: the session (a magic link to that address) is the proof. */
export async function confirmPendingAction(form: FormData): Promise<void> {
  const user = await currentUser();
  const id = Number(form.get('alertId'));
  const alert = Number.isInteger(id) ? await getAlert(db(), id) : null;
  if (!alert || alert.userId !== user.id || !user.emailVerified) back('eroare=alerta');
  const h = await headers();
  await confirmAlert(db(), id, { ipHash: hashWithDailySalt('ip', clientIp(h)), method: 'session', ttlDays: ALERT_CONFIRM_TTL_DAYS, emailHash: hashEmail(user.email) });
  back(`confirmat=${id}#alerta-${id}`);
}

export async function stopAllAction(): Promise<void> {
  const user = await currentUser();
  const n = await deleteAllAlerts(db(), user.id, { method: 'account' });
  logAlert('alert.stop_all', { removed: n });
  back('oprite=1');
}

/** GDPR art. 17 self-service: the account, its alerts and channels go; the evidence stays 3 years. */
export async function deleteAccountAction(form: FormData): Promise<void> {
  const user = await currentUser();
  if (form.get('confirm') !== 'on') back('eroare=confirmare#date');
  const h = await headers();
  // End the session first (its row is deleted with the account anyway).
  await auth()
    .api.signOut({ headers: h })
    .catch(() => undefined);
  await deleteUserData(db(), user.id, { method: 'account_deleted', emailHash: hashEmail(user.email) });
  logAlert('account.deleted', {});
  redirect('/alerte?cont-sters=1');
}
