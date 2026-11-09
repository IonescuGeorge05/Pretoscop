import 'server-only';
import type { B2bPlan } from '@pretoscop/core';
import { applyB2bBillingEvent, auditLog, isFlagEnabled } from '@pretoscop/db';
import { paymentProviderFromEnv, type PaymentProvider } from '@pretoscop/payments';
import { b2bBillingInput, type B2bPaymentEvent } from './b2b-billing';
import { db, serverEnv } from './db';

/** Self-serve plans with a configured price (Stripe price id from the environment). */
export function selfServePrices(): Partial<Record<B2bPlan, string>> {
  const env = serverEnv();
  return { ...(env.B2B_STRIPE_PRICE_STARTER ? { starter: env.B2B_STRIPE_PRICE_STARTER } : {}), ...(env.B2B_STRIPE_PRICE_PRO ? { pro: env.B2B_STRIPE_PRICE_PRO } : {}) };
}

export type SubscriptionProvider = PaymentProvider & Required<Pick<PaymentProvider, 'createSubscriptionCheckout' | 'createPortalSession'>>;

/**
 * M25's payment provider when it can sell B2B plans: the Stripe account (STRIPE_SECRET_KEY) and its
 * webhook (STRIPE_WEBHOOK_SECRET, the only way billing state changes) exist and the flag
 * `b2b.billing.enabled` is on. Else null: no subscribe button, pilot and contract plans only.
 */
export async function billingProvider(): Promise<SubscriptionProvider | null> {
  const env = serverEnv();
  const p = paymentProviderFromEnv(env);
  if (!p || !env.STRIPE_WEBHOOK_SECRET || !p.createSubscriptionCheckout || !p.createPortalSession) return null;
  if (!(await isFlagEnabled(db(), 'b2b.billing.enabled'))) return null;
  return p as SubscriptionProvider;
}

/**
 * A verified subscription event from the shared Stripe webhook (/api/webhooks/stripe). Applied
 * whatever the flag says: a subscription that exists must be followed. `unknown_workspace` asks
 * the provider to retry (an invoice that arrived before its checkout event links the workspace).
 */
export async function handleB2bBillingEvent(ev: B2bPaymentEvent): Promise<'applied' | 'duplicate' | 'unknown_workspace' | 'not_b2b'> {
  const mapped = b2bBillingInput(ev, selfServePrices());
  if (!mapped) return 'not_b2b';
  const result = await applyB2bBillingEvent(db(), ev.provider, ev.eventId, ev.type, mapped.input);
  // Not ours: no workspace has this subscription and the event does not name one.
  if (result === 'unknown_workspace' && !mapped.marked) return 'not_b2b';
  if (result === 'applied') {
    const ws = 'workspaceId' in mapped.input ? mapped.input.workspaceId : null;
    await db()
      .insert(auditLog)
      .values({ actor: `${ev.provider}:webhook`, action: `b2b.billing.${mapped.input.kind}`, entity: 'b2b_workspaces', entityId: ws === null ? null : String(ws), before: null, after: { event: ev.eventId } });
  }
  console.info(JSON.stringify({ level: 'info', service: 'web.b2b-billing', event: 'b2b.billing.event', stripe_event: ev.eventId, type: ev.type, result, time: new Date().toISOString() }));
  return result;
}
