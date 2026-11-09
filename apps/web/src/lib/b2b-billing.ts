import { isB2bPlan, type B2bPlan } from '@pretoscop/core';
import type { B2bBillingInput } from '@pretoscop/db';
import type { PaymentEvent } from '@pretoscop/payments';

/**
 * B2B subscriptions (M28) on M25's payment provider (`@pretoscop/payments`, extended with
 * subscription checkouts, the customer portal and subscription/invoice events). This module maps
 * a verified provider event to what the database applies. Pure: the unit tests run it directly.
 */

export type B2bPaymentEvent = Extract<PaymentEvent, { type: 'subscription.checkout_completed' | 'subscription.updated' | 'invoice.paid' }>;

export function isB2bPaymentEvent(ev: PaymentEvent): ev is B2bPaymentEvent {
  return ev.type === 'subscription.checkout_completed' || ev.type === 'subscription.updated' || ev.type === 'invoice.paid';
}

/** Which of our plans a provider price is (null: not one of ours). */
export function planOfPrice(priceId: string | null, prices: Partial<Record<B2bPlan, string>>): B2bPlan | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(prices) as Array<[B2bPlan, string]>) if (id === priceId) return plan;
  return null;
}

const workspaceIdOf = (reference: string | null | undefined, meta: Record<string, string>): number | null => {
  const m = /^b2b:(\d{1,12})$/.exec(reference ?? meta.reference ?? '');
  if (m) return Number(m[1]);
  return /^\d{1,12}$/.test(meta.workspace_id ?? '') ? Number(meta.workspace_id) : null;
};
const planOf = (p: string | undefined): B2bPlan | null => (p && isB2bPlan(p) ? p : null);

/**
 * The database input for a subscription event, and whether the event itself says it is ours
 * (reference `b2b:<id>` or our metadata). An unmarked event can still be ours when the subscription
 * id is a workspace's; when it is not, it belongs to nobody here and is acknowledged without effect.
 */
export function b2bBillingInput(ev: B2bPaymentEvent, prices: Partial<Record<B2bPlan, string>>): { input: B2bBillingInput; marked: boolean } | null {
  if (ev.type === 'subscription.checkout_completed') {
    const workspaceId = workspaceIdOf(ev.reference, ev.metadata);
    if (workspaceId === null) return null;
    return {
      marked: true,
      input: { kind: 'checkout_completed', workspaceId, customerId: ev.customerId, subscriptionId: ev.subscriptionId, plan: planOf(ev.metadata.plan), paid: ev.paid },
    };
  }
  const workspaceId = workspaceIdOf(null, ev.metadata);
  if (ev.type === 'subscription.updated') {
    return {
      marked: workspaceId !== null,
      input: { kind: 'subscription', subscriptionId: ev.subscriptionId, customerId: ev.customerId, workspaceId, status: ev.status, periodEnd: ev.periodEnd, plan: planOfPrice(ev.priceId, prices) },
    };
  }
  return {
    marked: workspaceId !== null,
    input: {
      kind: 'invoice_paid',
      invoiceId: ev.invoiceId,
      subscriptionId: ev.subscriptionId,
      customerId: ev.customerId,
      workspaceId,
      plan: planOf(ev.metadata.plan),
      currency: ev.currency,
      subtotal: ev.subtotal,
      tax: ev.tax,
      total: ev.total,
      periodStart: ev.periodStart,
      periodEnd: ev.periodEnd,
      paidAt: ev.paidAt,
    },
  };
}
