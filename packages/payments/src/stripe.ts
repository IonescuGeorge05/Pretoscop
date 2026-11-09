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
  client_reference_id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown> | null;
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
    let res: Response;
    try {
      res = await this.doFetch(`${this.apiBase}/v1/checkout/sessions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': req.reference,
        },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
      });
    } catch (err) {
      throw new PaymentProviderError(`Stripe unreachable: ${(err as Error).message}`, null, 'network');
    }
    const json = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown; expires_at?: unknown; error?: { message?: string; code?: string } } | null;
    if (!res.ok || !json || typeof json.id !== 'string' || typeof json.url !== 'string') {
      throw new PaymentProviderError(`Stripe refused the checkout: ${json?.error?.message ?? `HTTP ${res.status}`}`, res.status, json?.error?.code ?? null);
    }
    return { provider: this.name, id: json.id, url: json.url, expiresAt: typeof json.expires_at === 'number' ? new Date(json.expires_at * 1000) : null };
  }

  parseWebhook(rawBody: string, headers: HeaderSource, now: Date = new Date()): PaymentEvent {
    if (!this.opts.webhookSecret) throw new WebhookSignatureError('unconfigured');
    verifyStripeSignature(this.opts.webhookSecret, rawBody, headerValue(headers, 'stripe-signature'), now, this.opts.toleranceSeconds ?? 300);
    let event: { id?: unknown; type?: unknown; data?: { object?: StripeCheckoutObject } };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      throw new WebhookSignatureError('payload');
    }
    const eventId = typeof event.id === 'string' ? event.id : '';
    const type = typeof event.type === 'string' ? event.type : '';
    const o = event.data?.object;
    if (!eventId || !type || !o || o.object !== 'checkout.session' || typeof o.id !== 'string') return { type: 'ignored', provider: this.name, eventId, eventType: type };
    const reference = typeof o.client_reference_id === 'string' ? o.client_reference_id : typeof o.metadata?.reference === 'string' ? o.metadata.reference : null;
    const base = { provider: this.name, eventId, checkoutId: o.id, reference };
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
