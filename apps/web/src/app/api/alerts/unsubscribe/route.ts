import { deleteAlert, sql, unsubscribeAllEmail } from '@pretoscop/db';
import { verifyLink } from '@pretoscop/notify';
import { hashEmail, logAlert, secret } from '@/lib/alerts';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Target = { kind: 'alert'; id: number } | { kind: 'user'; id: string };

function target(params: URLSearchParams): Target | null {
  const t = params.get('t') ?? '';
  const a = params.get('a');
  const u = params.get('u');
  if (a !== null) {
    const id = Number(a);
    return Number.isInteger(id) && id > 0 && verifyLink(secret(), 'unsub-alert', id, t) ? { kind: 'alert', id } : null;
  }
  if (u !== null && u.length > 0 && u.length <= 64) return verifyLink(secret(), 'unsub-user', u, t) ? { kind: 'user', id: u } : null;
  return null;
}

/** Performs the unsubscription; unknown alerts or accounts count as already unsubscribed. */
async function unsubscribe(to: Target, method: 'list_unsubscribe' | 'unsubscribe_link'): Promise<void> {
  const d = db();
  if (to.kind === 'alert') {
    const removed = await deleteAlert(d, to.id, { method });
    logAlert('alert.unsubscribe', { alert_id: to.id, method, removed });
    return;
  }
  const r = await d.execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${to.id}`);
  const email = r.rows[0]?.email;
  if (!email) return;
  const out = await unsubscribeAllEmail(d, to.id, { method, emailHash: hashEmail(email), suppress: 'unsubscribed' });
  logAlert('alert.unsubscribe_all', { method, ...out });
}

/**
 * One-click unsubscribe (RFC 8058): mailbox providers POST `List-Unsubscribe=One-Click` to the
 * URL of the `List-Unsubscribe` header, without cookies; we answer 200 at once. The buttons on
 * /alerte/dezabonare post here too (form fields `a`/`u` and `t`) and are redirected back.
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const params = new URLSearchParams(url.search);
  for (const k of ['a', 'u', 't'] as const) {
    const v = form?.get(k);
    if (typeof v === 'string' && !params.has(k)) params.set(k, v);
  }
  const oneClick = form?.get('List-Unsubscribe') === 'One-Click';
  const to = target(params);
  if (oneClick) {
    if (!to) return new Response('Link de dezabonare invalid.', { status: 400, headers: { 'cache-control': 'no-store' } });
    await unsubscribe(to, 'list_unsubscribe');
    return new Response('Te-ai dezabonat de la alertele de preț Pretoscop.', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (req.headers.get('sec-fetch-site') === 'cross-site') return new Response('forbidden', { status: 403 });
  const page = new URL('/alerte/dezabonare', url);
  for (const [k, v] of params) if (k === 'a' || k === 'u' || k === 't') page.searchParams.set(k, v);
  if (!to) {
    page.searchParams.set('stare', 'invalid');
  } else {
    await unsubscribe(to, 'unsubscribe_link');
    page.searchParams.set('stare', 'gata');
  }
  return new Response(null, { status: 303, headers: { location: `${page.pathname}${page.search}`, 'cache-control': 'no-store' } });
}

/** Someone opened the header URL in a browser: show the page (a GET never unsubscribes). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return new Response(null, { status: 303, headers: { location: `/alerte/dezabonare${url.search}`, 'cache-control': 'no-store' } });
}
