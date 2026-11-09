/**
 * @pretoscop/payments: the payment-provider contract and its Stripe implementation (M25 wallet
 * top-ups; M28 B2B plans reuse it). See README.md for the flow and the rules.
 */
import { StripeProvider } from './stripe';
import type { PaymentProvider } from './types';

export * from './types';
export { signStripePayload, StripeProvider, stripeForm, verifyStripeSignature, type StripeOptions } from './stripe';

export interface PaymentEnv {
  STRIPE_SECRET_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
  STRIPE_API_BASE: string;
}

/**
 * The configured provider, or null when none is (no Stripe key: top-ups are off and the portal
 * says so; admins can still record a bank transfer as an adjustment).
 */
export function paymentProviderFromEnv(env: PaymentEnv): PaymentProvider | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new StripeProvider({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null, apiBase: env.STRIPE_API_BASE });
}
