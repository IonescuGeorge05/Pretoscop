import { currentConsentText } from '@pretoscop/config/legal-texts';
import { savePushSubscription } from '@pretoscop/db';
import { hashEmail, logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { readTextCapped } from '@/lib/body';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { deviceLabel, parseSubscription, pushPublicKey } from '@/lib/push';
import { createRateLimiter } from '@/lib/rate-limit';
import { isCrossSite } from '@/lib/same-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A subscription is about 400 bytes of JSON; anything bigger is refused before it is read. */
const MAX_BYTES = 4096;
/** 10 subscriptions per hour per account (a browser subscribes once; the cap keeps a script out). */
const limiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * POST /api/push/subscribe { subscription, consent: true, consentVersion } — stores this browser's
 * Web Push subscription for the logged-in user with the consent shown next to the button
 * (pushConsent, versioned), after the browser itself granted permission (the client asks). The
 * endpoint must be an https URL on a known push service (`parsePushSubscription`).
 */
export async function POST(req: Request): Promise<Response> {
  if (isCrossSite(req.headers)) return json(403, { ok: false, error: 'forbidden' });
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return json(415, { ok: false, error: 'content_type' });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return json(401, { ok: false, error: 'login' });
  if (!(await pushPublicKey())) return json(503, { ok: false, error: 'disabled' });
  if (!limiter.hit(s.user.id).allowed) return json(429, { ok: false, error: 'rate_limited' });
  const text = await readTextCapped(req, MAX_BYTES);
  if (text === null) return json(413, { ok: false, error: 'too_large' });
  let body: { subscription?: unknown; consent?: unknown; consentVersion?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return json(400, { ok: false, error: 'invalid_body' });
  }
  if (!body || typeof body !== 'object') return json(400, { ok: false, error: 'invalid_body' });
  const consent = currentConsentText('pushConsent');
  if (body.consent !== true || body.consentVersion !== consent.key) return json(400, { ok: false, error: 'consent' });
  const sub = parseSubscription(body.subscription);
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
