import { deletePushSubscription, markPushResult, userPushSubscriptions } from '@pretoscop/db';
import { links, logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pushPublicKey, pushSender } from '@/lib/push';
import { createRateLimiter } from '@/lib/rate-limit';
import { isCrossSite } from '@/lib/same-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 5 test notifications per 10 minutes per account. */
const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * POST /api/push/test — "Trimite o notificare de test" on /alerte: one notification to each of the
 * logged-in user's browsers, sent from here (no worker needed), only while the feature is on.
 * Subscriptions the push service reports gone are removed. Never logs endpoints.
 */
export async function POST(req: Request): Promise<Response> {
  if (isCrossSite(req.headers)) return json(403, { ok: false, error: 'forbidden' });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return json(401, { ok: false, error: 'login' });
  const sender = pushSender();
  if (!sender || !(await pushPublicKey())) return json(503, { ok: false, error: 'disabled' });
  if (!limiter.hit(s.user.id).allowed) return json(429, { ok: false, error: 'rate_limited' });
  const subs = await userPushSubscriptions(db(), s.user.id);
  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const r = await sender.send(
      sub,
      { title: 'Pretoscop: notificare de test', body: 'Notificările de preț funcționează pe acest dispozitiv.', url: links().manage(), tag: 'test' },
      { ttlSec: 600, urgency: 'normal' },
    );
    if (r.ok) {
      sent++;
      await markPushResult(db(), sub.id, true);
    } else {
      failed++;
      if (r.gone) await deletePushSubscription(db(), { userId: s.user.id, id: sub.id }, 'push_expired');
      else await markPushResult(db(), sub.id, false);
    }
  }
  logAlert('push.test', { sent, failed });
  return json(200, { ok: sent > 0, sent, failed });
}
