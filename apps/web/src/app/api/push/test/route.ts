import { deletePushSubscription, markPushResult, userPushSubscriptions } from '@pretoscop/db';
import { links, logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pushPublicKey, pushSender } from '@/lib/push';
import { createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 5 test notifications per 10 minutes per account. */
const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/**
 * POST /api/push/test — "Trimite o notificare de test" on /alerte: one notification to each of the
 * logged-in user's browsers, sent from here (no worker needed). Gone subscriptions are removed.
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return new Response('forbidden', { status: 403 });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return Response.json({ ok: false, error: 'login' }, { status: 401 });
  const sender = pushSender();
  if (!sender || !(await pushPublicKey())) return Response.json({ ok: false, error: 'disabled' }, { status: 503 });
  if (!limiter.hit(s.user.id).allowed) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });
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
  return Response.json({ ok: sent > 0, sent, failed }, { headers: { 'cache-control': 'no-store' } });
}
