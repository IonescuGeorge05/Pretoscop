import 'server-only';
import { isB2bPlan, type B2bPlan } from '@pretoscop/core';
import { isFlagEnabled, type B2bBillingInput } from '@pretoscop/db';
import { planOfPrice, stripeSubscriptionProvider, type BillingEvent, type SubscriptionProvider } from './b2b-billing';
import { db, serverEnv } from './db';

/** Self-serve plans with a configured price (Stripe price id from the environment). */
export function selfServePrices(): Partial<Record<B2bPlan, string>> {
  const env = serverEnv();
  return { ...(env.B2B_STRIPE_PRICE_STARTER ? { starter: env.B2B_STRIPE_PRICE_STARTER } : {}), ...(env.B2B_STRIPE_PRICE_PRO ? { pro: env.B2B_STRIPE_PRICE_PRO } : {}) };
}

/** The provider, or null while the account (setup D3) or the flag `b2b.billing.enabled` is missing. */
export async function billingProvider(): Promise<SubscriptionProvider | null> {
  const env = serverEnv();
  if (!env.STRIPE_SECRET_KEY || !env.B2B_STRIPE_WEBHOOK_SECRET) return null;
  if (!(await isFlagEnabled(db(), 'b2b.billing.enabled'))) return null;
  return stripeSubscriptionProvider({ secretKey: env.STRIPE_SECRET_KEY, apiBase: env.STRIPE_API_BASE });
}

/** A normalized provider event in the shape the database applies (plans resolved from price ids). */
export function toBillingInput(e: Exclude<BillingEvent, { kind: 'ignored' }>): B2bBillingInput {
  const prices = selfServePrices();
  const plan = (p: string | null) => (p && isB2bPlan(p) ? p : null);
  if (e.kind === 'subscription') return { ...e, plan: planOfPrice(e.priceId, prices) };
  if (e.kind === 'checkout_completed') return { ...e, plan: plan(e.plan) };
  return { ...e, plan: plan(e.plan) };
}
