import { bindTopUpCheckout, closeTopUp, creditTopUp } from '@pretoscop/db';
import { WebhookSignatureError, type PaymentEvent } from '@pretoscop/payments';
import { isB2bPaymentEvent } from '@/lib/b2b-billing';
import { handleB2bBillingEvent } from '@/lib/b2b-billing-server';
import { readTextCapped } from '@/lib/body';
import { db } from '@/lib/db';
import { logPromoted, paymentProvider, refreshPromotedForMerchant } from '@/lib/promoted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 64 * 1024;

/** `topup:42` → 42 (the reference our checkouts carry, M25). */
function topupIdOf(reference: string | null): number | null {
  const m = /^topup:(\d{1,15})$/.exec(reference ?? '');
  return m ? Number(m[1]) : null;
}

async function credit(ev: Extract<PaymentEvent, { type: 'checkout.paid' }>) {
  const input = { provider: ev.provider, externalId: ev.checkoutId, eventId: ev.eventId, paidGrossBani: ev.amountBani, currency: ev.currency, actor: `${ev.provider}:webhook` };
  let res = await creditTopUp(db(), input);
  // The checkout id was never saved (the page failed right after Stripe answered): bind it by our reference.
  const id = topupIdOf(ev.reference);
  if (res.result === 'unknown' && id !== null && (await bindTopUpCheckout(db(), { topupId: id, provider: ev.provider, externalId: ev.checkoutId }))) res = await creditTopUp(db(), input);
  return res;
}

/**
 * POST /api/webhooks/stripe (M25): the only place a wallet is credited from a card payment, and (M28)
 * the only place a B2B subscription changes a workspace's plan or billing state. Signed
 * by Stripe (`Stripe-Signature`, checked against the raw body, 5-minute tolerance); off (404) until
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set. Idempotent: a redelivered or duplicated event
 * changes nothing (the ledger row of a top-up is unique). Answers 2xx for everything it has handled
 * or deliberately ignored, 5xx only when it could not record the outcome (Stripe then retries).
 */
export async function POST(req: Request): Promise<Response> {
  const provider = paymentProvider();
  if (!provider) return new Response('not found', { status: 404 });
  const body = await readTextCapped(req, MAX_BYTES);
  if (body === null) return new Response('too large', { status: 413 });
  let ev: PaymentEvent;
  try {
    ev = provider.parseWebhook(body, req.headers);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      if (err.reason === 'unconfigured') return new Response('not found', { status: 404 });
      logPromoted('webhook.refused', { reason: err.reason });
      return new Response('invalid signature', { status: err.reason === 'payload' ? 400 : 401 });
    }
    throw err;
  }
  try {
    if (ev.type === 'checkout.paid') {
      const res = await credit(ev);
      logPromoted('webhook.paid', { eventId: ev.eventId, checkoutId: ev.checkoutId, result: res.result, ...('merchantId' in res ? { merchantId: res.merchantId, topupId: res.topupId } : {}) });
      if (res.result === 'mismatch') logPromoted('webhook.amount_mismatch', { eventId: ev.eventId, checkoutId: ev.checkoutId }, new Error('paid amount or currency differs from the top-up'));
      // A credited wallet can bring a campaign back into the auction.
      if (res.result === 'credited') await refreshPromotedForMerchant(res.merchantId).catch(() => undefined);
      return Response.json({ ok: true, result: res.result });
    }
    if (ev.type === 'checkout.failed' || ev.type === 'checkout.expired') {
      const closed = await closeTopUp(db(), { provider: ev.provider, externalId: ev.checkoutId, eventId: ev.eventId, status: ev.type === 'checkout.failed' ? 'failed' : 'expired' });
      logPromoted('webhook.closed', { eventId: ev.eventId, checkoutId: ev.checkoutId, type: ev.type, closed });
      return Response.json({ ok: true, closed });
    }
    // M28: B2B plan subscriptions share this endpoint (one Stripe webhook, one secret).
    if (isB2bPaymentEvent(ev)) {
      const result = await handleB2bBillingEvent(ev);
      if (result === 'unknown_workspace') return new Response('no workspace for this event yet', { status: 409 });
      return Response.json({ ok: true, b2b: result });
    }
    return Response.json({ ok: true, ignored: ev.type === 'ignored' ? ev.eventType : ev.type });
  } catch (err) {
    logPromoted('webhook.failed', { eventId: ev.eventId }, err);
    return new Response('error', { status: 500 });
  }
}
