import { currentConsentText } from '@pretoscop/config/legal-texts';
import { savePushSubscription } from '@pretoscop/db';
import { hashEmail, logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db, serverEnv } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { deviceLabel, parseSubscription, pushPublicKey } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * POST /api/push/subscribe { subscription, consent: true, consentVersion } — stores this browser's
 * Web Push subscription for the logged-in user with the consent shown next to the button
 * (pushConsent, versioned). Only after the browser itself granted permission (the client asks).
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return json(403, { ok: false, error: 'forbidden' });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return json(401, { ok: false, error: 'login' });
  if (!(await pushPublicKey())) return json(503, { ok: false, error: 'disabled' });
  const text = await req.text();
  if (text.length > 4096) return json(413, { ok: false, error: 'too_large' });
  let body: { subscription?: unknown; consent?: unknown; consentVersion?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return json(400, { ok: false, error: 'invalid_body' });
  }
  const consent = currentConsentText('pushConsent');
  if (body.consent !== true || body.consentVersion !== consent.key) return json(400, { ok: false, error: 'consent' });
  const sub = parseSubscription(body.subscription, serverEnv().APP_ENV !== 'prod');
  if (!sub) return json(400, { ok: false, error: 'subscription' });
  const ipHash = hashWithDailySalt('ip', clientIp(req.headers));
  const id = await savePushSubscription(db(), {
    userId: s.user.id,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    deviceLabel: deviceLabel(req.headers.get('user-agent')),
    consentTextVersion: consent.key,
    emailHash: hashEmail(s.user.email),
    ipHash,
  });
  logAlert('push.subscribed', { subscription_id: id });
  return json(201, { ok: true, id });
}
