import { normalizeEmail } from '@pretoscop/core';
import { sql, suppressEmail, unsubscribeAllEmail } from '@pretoscop/db';
import { hashEmail, logAlert } from '@/lib/alerts';
import { db, serverEnv } from '@/lib/db';
import { eventAction, eventRecipients, verifySvix, type ResendEvent } from '@/lib/svix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 256 * 1024;

/**
 * POST /api/webhooks/resend — bounces and complaints (M19). A complaint ("this is spam") is a
 * withdrawal of consent; a permanent bounce means the address no longer exists. Both stop every
 * email alert of the address and add it to the suppression list (hash only). Signed by Resend
 * (Svix); off (404) until RESEND_WEBHOOK_SECRET is set. Idempotent: redeliveries change nothing.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = serverEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response('not found', { status: 404 });
  const body = await req.text();
  if (body.length > MAX_BYTES) return new Response('too large', { status: 413 });
  const ok = verifySvix(secret, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') }, body);
  if (!ok) return new Response('invalid signature', { status: 401 });
  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  const action = eventAction(event);
  if (!action) return Response.json({ ok: true, ignored: event.type });

  const d = db();
  let users = 0;
  for (const address of eventRecipients(event)) {
    const email = normalizeEmail(address);
    const hash = hashEmail(email);
    const r = await d.execute<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = ${email}`);
    const userId = r.rows[0]?.id;
    if (userId) {
      await unsubscribeAllEmail(d, userId, { method: action, emailHash: hash, suppress: action });
      users++;
    } else {
      await suppressEmail(d, hash, action);
    }
  }
  logAlert('webhook.resend', { type: event.type, action, users });
  return Response.json({ ok: true, action });
}
