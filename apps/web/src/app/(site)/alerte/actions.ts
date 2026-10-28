'use server';

import { ALERT_CONFIRM_TTL_DAYS, isPlausibleEmail, normalizeEmail, parseTargetPrice } from '@pretoscop/core';
import { bestAlertOffer, confirmAlert, deleteAlert, deleteAllAlerts, deleteUserData, getAlert, updateAlert, type AlertKind } from '@pretoscop/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashEmail, logAlert } from '@/lib/alerts';
import { auth, getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { createRateLimiter } from '@/lib/rate-limit';

/** 5 login links per 15 minutes per daily-salted session hash (Better Auth adds its own limit on HTTP). */
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
  if (!loginLimiter.hit(hashWithDailySalt(clientIp(h), h.get('user-agent'))).allowed) back('eroare=limita');
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

/** Changes what an alert watches (kind and target). A target must be under today's best total. */
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
  await updateAlert(db(), id, user.id, { kind, targetBani });
  back(`modificat=${id}#alerta-${id}`);
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
