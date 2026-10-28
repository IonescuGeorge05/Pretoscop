import { deletePushSubscription } from '@pretoscop/db';
import { logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { readTextCapped } from '@/lib/body';
import { db } from '@/lib/db';
import { isCrossSite } from '@/lib/same-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4096;

/**
 * POST /api/push/unsubscribe { endpoint } (JSON, from this browser) or id=… (a plain form, the
 * device list on /alerte, works without JavaScript) — removes one of the logged-in user's own
 * subscriptions. Without any left, push alerts pause and the push consent is recorded as withdrawn.
 * Always available, whatever the feature flag says (withdrawing must stay possible).
 */
export async function POST(req: Request): Promise<Response> {
  if (isCrossSite(req.headers)) return new Response('forbidden', { status: 403 });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return Response.json({ ok: false, error: 'login' }, { status: 401 });
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  const isJson = contentType.includes('application/json');
  const text = await readTextCapped(req, MAX_BYTES);
  if (text === null) return Response.json({ ok: false, error: 'too_large' }, { status: 413 });
  let endpoint: string | undefined;
  let id: number | undefined;
  if (isJson) {
    try {
      const body = JSON.parse(text) as { endpoint?: unknown } | null;
      if (typeof body?.endpoint === 'string' && body.endpoint.length <= 2048) endpoint = body.endpoint;
    } catch {
      // handled below
    }
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    const n = Number(new URLSearchParams(text).get('id'));
    if (Number.isInteger(n) && n > 0) id = n;
  }
  if (endpoint === undefined && id === undefined) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  // Only the user's own row matches (user_id is part of the delete).
  const removed = await deletePushSubscription(db(), { userId: s.user.id, ...(id !== undefined ? { id } : { endpoint }) }, 'push_revoked');
  logAlert('push.unsubscribed', { removed });
  if (!isJson) return new Response(null, { status: 303, headers: { location: '/alerte?canal=notificari-oprite#canale', 'cache-control': 'no-store' } });
  return Response.json({ ok: true, removed }, { headers: { 'cache-control': 'no-store' } });
}
