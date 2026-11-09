import { applyB2bBillingEvent, auditLog } from '@pretoscop/db';
import { normalizeStripeEvent, verifyStripeSignature } from '@/lib/b2b-billing';
import { toBillingInput } from '@/lib/b2b-billing-server';
import { readTextCapped } from '@/lib/body';
import { db, serverEnv } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;

const log = (event: string, fields: Record<string, unknown>) =>
  console.info(JSON.stringify({ level: 'info', service: 'web.b2b-billing', event, ...fields, time: new Date().toISOString() }));

/**
 * POST /api/webhooks/stripe-b2b — B2B subscription events (M28). The only way billing state
 * changes: signed by Stripe (endpoint secret B2B_STRIPE_WEBHOOK_SECRET, 5-minute tolerance), each
 * event applied once. Off (404) until the secret is set. Answers 409 for an event that names no
 * workspace yet, so Stripe retries it after the checkout event has linked the subscription.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = serverEnv().B2B_STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('not found', { status: 404 });
  const body = await readTextCapped(req, MAX_BYTES);
  if (body === null) return new Response('too large', { status: 413 });
  const problem = verifyStripeSignature(body, req.headers.get('stripe-signature'), secret);
  if (problem) return new Response(`invalid signature (${problem})`, { status: 400 });
  let event: { id?: unknown; type?: unknown };
  try {
    event = JSON.parse(body) as { id?: unknown; type?: unknown };
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  if (typeof event.id !== 'string' || typeof event.type !== 'string') return new Response('invalid event', { status: 400 });
  const normalized = normalizeStripeEvent(event);
  if (normalized.kind === 'ignored') return Response.json({ received: true, ignored: true });
  const result = await applyB2bBillingEvent(db(), 'stripe', event.id, event.type, toBillingInput(normalized));
  log('b2b.billing.event', { stripe_event: event.id, type: event.type, result });
  if (result === 'unknown_workspace') return new Response('no workspace for this event yet', { status: 409 });
  if (result === 'applied') {
    const workspace = 'workspaceId' in normalized ? normalized.workspaceId : null;
    await db()
      .insert(auditLog)
      .values({ actor: 'stripe', action: `b2b.billing.${normalized.kind}`, entity: 'b2b_workspaces', entityId: workspace === null ? null : String(workspace), before: null, after: { event: event.id, type: event.type } });
  }
  return Response.json({ received: true, result });
}
