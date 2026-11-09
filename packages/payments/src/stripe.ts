import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  headerValue,
  PaymentProviderError,
  WebhookSignatureError,
  type CheckoutRequest,
  type CheckoutSession,
  type HeaderSource,
  type PaymentEvent,
  type PaymentProvider,
  type PortalSession,
  type SubscriptionCheckoutRequest,
} from './types';

/**
 * Stripe Checkout over Stripe's REST API with `fetch` (no SDK: two calls and one signature check).
 * Docs: https://docs.stripe.com/api/checkout/sessions/create and
 * https://docs.stripe.com/webhooks#verify-manually. The API version is the account's default
 * (pinned in the Stripe dashboard, D3); the fields read here are stable across versions.
 */

export interface StripeOptions {
  /** `sk_live_…` / `sk_test_…` (or a restricted `rk_…` key allowed to write Checkout Sessions). */
  secretKey: string;
  /** `whsec_…` of the webhook endpoint (`/api/webhooks/stripe`). */
  webhookSecret: string | null;
  /** https://api.stripe.com, or a local mock in tests. */
  apiBase?: string;
  /** Seconds a signed webhook stays acceptable (Stripe's libraries use 300). */
  toleranceSeconds?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Stripe's form encoding of nested parameters: `a[b][0][c]=v`. */
export function stripeForm(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(prefix ? `${prefix}[${k}]` : k, x);
    else out.append(prefix, String(v));
  };
  walk('', params);
  return out;
}

/** `t=<unix>,v1=<hex>`: what Stripe sends in `Stripe-Signature` (tests sign their own events with it). */
export function signStripePayload(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

/**
 * Checks a `Stripe-Signature` header: HMAC-SHA256 of `<t>.<raw body>` with the endpoint secret,
 * compared in constant time with every `v1` value (several during a secret rotation), and the
 * timestamp within the tolerance (replay protection).
 */
export function verifyStripeSignature(secret: string, payload: string, header: string | null, now: Date, toleranceSeconds = 300): void {
  if (!header) throw new WebhookSignatureError('missing');
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=', 2);
    if (k === 't' && v && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || v1.length === 0) throw new WebhookSignatureError('malformed');
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex'), 'utf8');
  if (!v1.some((s) => timingSafeEqual(Buffer.from(s, 'utf8'), expected))) throw new WebhookSignatureError('mismatch');
  if (Math.abs(now.getTime() / 1000 - t) > toleranceSeconds) throw new WebhookSignatureError('expired');
}

interface StripeCheckoutObject {
  id?: unknown;
  object?: unknown;
  mode?: unknown;
  client_reference_id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  customer?: unknown;
  subscription?: unknown;
  metadata?: Record<string, unknown> | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
/** An id that Stripe sends either as a string or as an expanded object. */
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v).id);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);
const unix = (v: unknown): Date | null => {
  const n = int(v);
  return n === null ? null : new Date(n * 1000);
};
const strings = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(obj(v)).filter((e): e is [string, string] => typeof e[1] === 'string'));

/**
 * Subscription and invoice events (M28). Reads both API shapes: before 2025-03-31 (period on the
 * subscription, `invoice.subscription`) and after ("basil": period on the items, `invoice.parent`).
 */
function parseSubscriptionEvent(provider: string, eventId: string, type: string, created: unknown, o: Obj): PaymentEvent | null {
  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const id = str(o.id);
    if (!id || (o.object !== undefined && o.object !== 'subscription')) return null;
    const item = obj((obj(o.items).data as unknown[] | undefined)?.[0]);
    return {
      type: 'subscription.updated',
      provider,
      eventId,
      subscriptionId: id,
      customerId: idOf(o.customer),
      status: type === 'customer.subscription.deleted' ? 'canceled' : (str(o.status) ?? 'incomplete'),
      periodEnd: unix(o.current_period_end) ?? unix(item.current_period_end),
      priceId: idOf(item.price),
      metadata: strings(o.metadata),
    };
  }
  if (type === 'invoice.paid') {
    const id = str(o.id);
    if (!id || (o.object !== undefined && o.object !== 'invoice')) return null;
    const parent = obj(obj(o.parent).subscription_details);
    const subscriptionId = idOf(o.subscription) ?? idOf(parent.subscription);
    // A one-off invoice (no subscription) is not a plan payment.
    if (!subscriptionId) return null;
    const metadata = Object.keys(obj(parent.metadata)).length > 0 ? strings(parent.metadata) : strings(obj(o.subscription_details).metadata);
    const line = obj((obj(o.lines).data as unknown[] | undefined)?.[0]);
    const taxes = Array.isArray(o.total_taxes) ? (o.total_taxes as unknown[]).reduce<number>((a, t) => a + (int(obj(t).amount) ?? 0), 0) : null;
    const total = int(o.total) ?? 0;
    const tax = int(o.tax) ?? taxes ?? 0;
    return {
      type: 'invoice.paid',
      provider,
      eventId,
      invoiceId: id,
      subscriptionId,
      customerId: idOf(o.customer),
      currency: (str(o.currency) ?? 'eur').toUpperCase(),
      subtotal: int(o.subtotal_excluding_tax) ?? int(o.subtotal) ?? total - tax,
      tax,
      total,
      periodStart: unix(obj(line.period).start) ?? unix(o.period_start),
      periodEnd: unix(obj(line.period).end) ?? unix(o.period_end),
      paidAt: unix(obj(o.status_transitions).paid_at) ?? unix(created),
      metadata,
    };
  }
  return null;
}

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly apiBase: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: StripeOptions) {
    this.apiBase = (opts.apiBase ?? 'https://api.stripe.com').replace(/\/+$/, '');
    this.doFetch = opts.fetch ?? fetch;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isSafeInteger(req.amountBani) || req.amountBani < 200) throw new PaymentProviderError('amount must be at least 2,00 lei (Stripe minimum)', null, 'amount_too_small');
    const minutes = Math.min(1440, Math.max(31, Math.round(req.expiresInMinutes ?? 60)));
    const body = stripeForm({
      mode: 'payment',
      client_reference_id: req.reference,
      customer_email: req.customerEmail ?? undefined,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      locale: 'ro',
      expires_at: Math.floor(Date.now() / 1000) + minutes * 60,
      line_items: [{ quantity: 1, price_data: { currency: req.currency.toLowerCase(), unit_amount: req.amountBani, product_data: { name: req.description } } }],
      metadata: { ...req.metadata, reference: req.reference },
      payment_intent_data: { metadata: { reference: req.reference } },
    });
    const json = await this.post('/v1/checkout/sessions', body, req.reference, 'checkout');
    return this.session(json, 'checkout');
  }

  /** One form-encoded POST to the Stripe API; a refusal or a network error becomes a PaymentProviderError. */
  private async post(path: string, body: URLSearchParams, idempotencyKey: string | null, what: string): Promise<{ id?: unknown; url?: unknown; expires_at?: unknown }> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
      });
    } catch (err) {
      throw new PaymentProviderError(`Stripe unreachable: ${(err as Error).message}`, null, 'network');
    }
    const json = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown; expires_at?: unknown; error?: { message?: string; code?: string } } | null;
    if (!res.ok || !json) throw new PaymentProviderError(`Stripe refused the ${what}: ${json?.error?.message ?? `HTTP ${res.status}`}`, res.status, json?.error?.code ?? null);
    return json;
  }

  private session(json: { id?: unknown; url?: unknown; expires_at?: unknown }, what: string): CheckoutSession {
    if (typeof json.id !== 'string' || typeof json.url !== 'string') throw new PaymentProviderError(`Stripe refused the ${what}: no session in the answer`, 200, null);
    return { provider: this.name, id: json.id, url: json.url, expiresAt: typeof json.expires_at === 'number' ? new Date(json.expires_at * 1000) : null };
  }

  /**
   * M28: Stripe Checkout in subscription mode for a monthly price. The reference and the metadata
   * go on the checkout and on the subscription (so its invoices name the subscriber even before
   * the checkout event arrives); tax ids and the billing address are collected for the invoice.
   * Idempotent per reference, price and minute (a double click opens one checkout).
   */
  async createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<CheckoutSession> {
    const metadata = { ...req.metadata, reference: req.reference };
    const body = stripeForm({
      mode: 'subscription',
      client_reference_id: req.reference,
      line_items: [{ price: req.priceId, quantity: 1 }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      locale: 'ro',
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      automatic_tax: req.automaticTax ? { enabled: true } : undefined,
      metadata,
      subscription_data: { metadata },
      ...(req.customerId ? { customer: req.customerId, customer_update: { address: 'auto', name: 'auto' } } : { customer_email: req.customerEmail ?? undefined }),
    });
    const json = await this.post('/v1/checkout/sessions', body, `${req.reference}:${req.priceId}:${Math.floor(Date.now() / 60_000)}`, 'subscription checkout');
    return this.session(json, 'subscription checkout');
  }

  /** M28: the Stripe customer portal (card, invoices, cancellation), returning to `returnUrl`. */
  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    const json = await this.post('/v1/billing_portal/sessions', stripeForm({ customer: customerId, return_url: returnUrl }), null, 'portal session');
    if (typeof json.url !== 'string') throw new PaymentProviderError('Stripe refused the portal session: no url in the answer', 200, null);
    return { url: json.url };
  }

  parseWebhook(rawBody: string, headers: HeaderSource, now: Date = new Date()): PaymentEvent {
    if (!this.opts.webhookSecret) throw new WebhookSignatureError('unconfigured');
    verifyStripeSignature(this.opts.webhookSecret, rawBody, headerValue(headers, 'stripe-signature'), now, this.opts.toleranceSeconds ?? 300);
    let event: { id?: unknown; type?: unknown; created?: unknown; data?: { object?: StripeCheckoutObject } };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      throw new WebhookSignatureError('payload');
    }
    const eventId = typeof event.id === 'string' ? event.id : '';
    const type = typeof event.type === 'string' ? event.type : '';
    const o = event.data?.object;
    if (eventId && type && o) {
      const sub = parseSubscriptionEvent(this.name, eventId, type, event.created, o as Obj);
      if (sub) return sub;
    }
    if (!eventId || !type || !o || o.object !== 'checkout.session' || typeof o.id !== 'string') return { type: 'ignored', provider: this.name, eventId, eventType: type };
    const reference = typeof o.client_reference_id === 'string' ? o.client_reference_id : typeof o.metadata?.reference === 'string' ? o.metadata.reference : null;
    const base = { provider: this.name, eventId, checkoutId: o.id, reference };
    // M28: a subscription checkout is not a one-off payment (its money arrives as invoice.paid).
    if (o.mode === 'subscription') {
      if (type !== 'checkout.session.completed') return { type: 'ignored', provider: this.name, eventId, eventType: type };
      return {
        type: 'subscription.checkout_completed',
        ...base,
        customerId: idOf(o.customer),
        subscriptionId: idOf(o.subscription),
        paid: o.payment_status === 'paid' || o.payment_status === 'no_payment_required',
        metadata: strings(o.metadata),
      };
    }
    // A card payment is "paid" at completion; a delayed method (bank debit) completes "unpaid" and
    // later sends async_payment_succeeded or async_payment_failed.
    if ((type === 'checkout.session.completed' && o.payment_status === 'paid') || type === 'checkout.session.async_payment_succeeded') {
      if (typeof o.amount_total !== 'number' || !Number.isSafeInteger(o.amount_total) || typeof o.currency !== 'string') throw new WebhookSignatureError('payload');
      return { type: 'checkout.paid', ...base, amountBani: o.amount_total, currency: o.currency };
    }
    if (type === 'checkout.session.async_payment_failed') return { type: 'checkout.failed', ...base };
    if (type === 'checkout.session.expired') return { type: 'checkout.expired', ...base };
    return { type: 'ignored', provider: this.name, eventId, eventType: type };
  }
}
