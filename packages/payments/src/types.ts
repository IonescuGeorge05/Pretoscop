/**
 * The payment-provider contract (M25 merchant top-ups; reusable by M28 B2B plans). Amounts are
 * integer bani (1/100 RON) like everywhere else in Pretoscop: never floats. A provider only moves
 * money on its own hosted pages (no card data ever reaches our servers) and tells us the outcome
 * through a signed webhook; our ledger is credited from that webhook alone, never from a redirect.
 */

/** ISO 4217, upper case. Pretoscop bills in lei only. */
export type PaymentCurrency = 'RON';

export interface CheckoutRequest {
  /**
   * Our id of the thing being paid (`topup:42`, later `b2b-invoice:7`). It is the idempotency key
   * of the provider call (a retried request opens no second checkout) and comes back in every
   * webhook event, so the event can be matched even if the checkout id was never stored.
   */
  reference: string;
  /** What the payer is charged, VAT included, in bani. */
  amountBani: number;
  currency: PaymentCurrency;
  /** The line shown to the payer on the provider's page (Romanian). */
  description: string;
  /** Pre-fills the payer's email on the provider's page (receipts). */
  customerEmail?: string | null;
  /** Where the provider sends the payer after paying, and after giving up. */
  successUrl: string;
  cancelUrl: string;
  /** How long the checkout stays payable, in minutes (Stripe: 31 to 1,440; clamped). */
  expiresInMinutes?: number;
  /** Extra key/value pairs stored with the payment at the provider (no personal data). */
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  provider: string;
  /** The provider's id of the checkout (Stripe: `cs_…`); webhooks name it. */
  id: string;
  /** The hosted payment page to send the payer to. */
  url: string;
  expiresAt: Date | null;
}

/**
 * A recurring plan (M28 B2B subscriptions): the price (and its currency, EUR for B2B) lives at the
 * provider; the plan changes only from the signed webhooks that follow.
 */
export interface SubscriptionCheckoutRequest {
  /** Our id of the subscriber (`b2b:42`): the checkout's client reference, echoed in its webhook. */
  reference: string;
  /** The provider's price id (Stripe `price_…`, monthly). */
  priceId: string;
  /** The subscriber's existing provider customer (a new subscription keeps it). */
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Let the provider compute VAT (Stripe Tax). */
  automaticTax?: boolean;
  /** Stored on the checkout and copied onto the subscription and its invoices (no personal data). */
  metadata?: Record<string, string>;
}

export interface PortalSession {
  /** The provider's hosted page where the customer manages the card, invoices and cancellation. */
  url: string;
}

/** A verified webhook delivery, normalized. */
export type PaymentEvent =
  | {
      type: 'checkout.paid';
      provider: string;
      eventId: string;
      checkoutId: string;
      reference: string | null;
      /** What was actually paid, in bani, and in which currency (lower or upper case). */
      amountBani: number;
      currency: string;
    }
  | { type: 'checkout.failed' | 'checkout.expired'; provider: string; eventId: string; checkoutId: string; reference: string | null }
  /** M28: a subscription checkout finished (`paid`: the first invoice is paid or free). */
  | {
      type: 'subscription.checkout_completed';
      provider: string;
      eventId: string;
      checkoutId: string;
      reference: string | null;
      customerId: string | null;
      subscriptionId: string | null;
      paid: boolean;
      metadata: Record<string, string>;
    }
  /** M28: a subscription was created, changed or ended (`status` is the provider's; ended = `canceled`). */
  | {
      type: 'subscription.updated';
      provider: string;
      eventId: string;
      subscriptionId: string;
      customerId: string | null;
      status: string;
      periodEnd: Date | null;
      priceId: string | null;
      metadata: Record<string, string>;
    }
  /** M28: a subscription invoice was paid. Amounts in the currency's minor units (cents for EUR). */
  | {
      type: 'invoice.paid';
      provider: string;
      eventId: string;
      invoiceId: string;
      subscriptionId: string;
      customerId: string | null;
      currency: string;
      subtotal: number;
      tax: number;
      total: number;
      periodStart: Date | null;
      periodEnd: Date | null;
      paidAt: Date | null;
      /** The subscription's metadata, as the invoice carries it. */
      metadata: Record<string, string>;
    }
  /** A verified event we do not act on (another event type, or a checkout still awaiting payment). */
  | { type: 'ignored'; provider: string; eventId: string; eventType: string };

/** Header lookup that works with Fetch `Headers` and with plain objects (Node, tests). */
export type HeaderSource = Headers | Record<string, string | string[] | undefined>;

/**
 * One payment provider. Implementations: `StripeProvider` (Stripe Checkout over its REST API).
 * M28 extends this with subscription checkouts; keep new methods optional so M25 callers compile.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Opens a hosted checkout for a one-time payment. Throws `PaymentProviderError` on refusal. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Verifies a webhook delivery's signature against the raw request body (never a re-serialized
   * one) and normalizes it. Throws `WebhookSignatureError` when it is not authentic or too old.
   */
  parseWebhook(rawBody: string, headers: HeaderSource, now?: Date): PaymentEvent;
  /** M28: opens a hosted checkout for a recurring plan. Throws `PaymentProviderError` on refusal. */
  createSubscriptionCheckout?(req: SubscriptionCheckoutRequest): Promise<CheckoutSession>;
  /** M28: a hosted page where the customer manages its subscription. */
  createPortalSession?(customerId: string, returnUrl: string): Promise<PortalSession>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** The provider's error code (Stripe `error.code`), when it gave one. */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class WebhookSignatureError extends Error {
  constructor(readonly reason: 'missing' | 'malformed' | 'mismatch' | 'expired' | 'unconfigured' | 'payload') {
    super(`webhook signature ${reason}`);
    this.name = 'WebhookSignatureError';
  }
}

export function headerValue(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name);
  const rec = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key === undefined ? undefined : rec[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
