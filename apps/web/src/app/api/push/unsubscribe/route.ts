import { deletePushSubscription } from '@pretoscop/db';
import { logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/push/unsubscribe { endpoint } (JSON, from this browser) or { id } (form, from the
 * device list on /alerte) — removes one of the logged-in user's subscriptions. Without any left,
 * push alerts pause and the push consent is recorded as withdrawn.
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return new Response('forbidden', { status: 403 });
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return Response.json({ ok: false, error: 'login' }, { status: 401 });
  const isForm = !(req.headers.get('content-type') ?? '').includes('application/json');
  let endpoint: string | undefined;
  let id: number | undefined;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const n = Number(form?.get('id'));
    if (Number.isInteger(n) && n > 0) id = n;
  } else {
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint === 'string') endpoint = body.endpoint;
  }
  if (endpoint === undefined && id === undefined) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const removed = await deletePushSubscription(db(), { userId: s.user.id, ...(id !== undefined ? { id } : { endpoint }) }, 'push_revoked');
  logAlert('push.unsubscribed', { removed });
  if (isForm) return new Response(null, { status: 303, headers: { location: '/alerte?canal=notificari-oprite#canale', 'cache-control': 'no-store' } });
  return Response.json({ ok: true, removed }, { headers: { 'cache-control': 'no-store' } });
}
