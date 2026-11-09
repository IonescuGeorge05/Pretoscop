import { createHmac, timingSafeEqual } from 'node:crypto';
import type { B2bPlan } from '@pretoscop/core';

/**
 * B2B subscriptions (M28) behind a small provider interface, with Stripe as the implementation
 * (REST over fetch, no SDK). Billing state changes only from verified webhooks, never from the
 * browser coming back from the provider.
 *
 * NOTE for the lead: M25 builds `@pretoscop/payments` (one-off Checkout for wallet top-ups) in
 * parallel. This module follows its conventions (same env names for the account, hand-checked
 * signatures, no SDK) so the two can be unified: move `createSubscriptionCheckout`,
 * `createPortalSession` and `normalizeStripeEvent` into that package as optional methods and new
 * event variants. No server-only import: the unit tests run it directly.
 */

export interface SubscriptionCheckoutRequest {
  workspaceId: number;
  plan: B2bPlan;
  priceId: string;
  /** Existing provider customer (a second subscription keeps the same customer). */
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  automaticTax: boolean;
}

export interface SubscriptionProvider {
  readonly name: 'stripe';
  createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<{ id: string; url: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
}

export class BillingProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}

/** Stripe's application/x-www-form-urlencoded with bracketed keys. */
function form(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.append(k, String(v));
  return u.toString();
}

export function stripeSubscriptionProvider(opts: { secretKey: string; apiBase?: string; fetchImpl?: typeof fetch; now?: () => number }): SubscriptionProvider {
  const base = (opts.apiBase ?? 'https://api.stripe.com').replace(/\/+$/, '');
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  async function post<T>(path: string, body: string, idempotencyKey?: string): Promise<T> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new BillingProviderError(`stripe unreachable: ${e instanceof Error ? e.message : String(e)}`, null, null);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
    if (!res.ok) throw new BillingProviderError(json.error?.message ?? `stripe ${res.status}`, res.status, json.error?.code ?? null);
    return json;
  }
  return {
    name: 'stripe',
    async createSubscriptionCheckout(req) {
      const ws = String(req.workspaceId);
      const body = form({
        mode: 'subscription',
        'line_items[0][price]': req.priceId,
        'line_items[0][quantity]': 1,
        client_reference_id: `b2b:${ws}`,
        'metadata[workspace_id]': ws,
        'metadata[plan]': req.plan,
        'subscription_data[metadata][workspace_id]': ws,
        'subscription_data[metadata][plan]': req.plan,
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        locale: 'ro',
        billing_address_collection: 'required',
        'tax_id_collection[enabled]': true,
        ...(req.automaticTax ? { 'automatic_tax[enabled]': true } : {}),
        ...(req.customerId
          ? { customer: req.customerId, 'customer_update[address]': 'auto', 'customer_update[name]': 'auto' }
          : { customer_email: req.customerEmail ?? undefined }),
      });
      // A double click within the same minute gets the same session back.
      const s = await post<{ id: string; url: string }>('/v1/checkout/sessions', body, `b2b-checkout:${ws}:${req.plan}:${Math.floor(now() / 60_000)}`);
      if (!s.id || !s.url) throw new BillingProviderError('stripe: checkout session without url', 200, null);
      return { id: s.id, url: s.url };
    },
    async createPortalSession(customerId, returnUrl) {
      const s = await post<{ url: string }>('/v1/billing_portal/sessions', form({ customer: customerId, return_url: returnUrl }));
      if (!s.url) throw new BillingProviderError('stripe: portal session without url', 200, null);
      return { url: s.url };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Webhooks

export type SignatureProblem = 'missing' | 'malformed' | 'mismatch' | 'expired';

/**
 * Stripe-Signature check: HMAC-SHA256 of `<t>.<raw body>` with the endpoint secret, any `v1`
 * accepted (secret rotation), at most `toleranceSec` old. Constant-time comparison.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): SignatureProblem | null {
  if (!header) return 'missing';
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k, v]) => k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)).map(([, v]) => Buffer.from(v!, 'hex'));
  if (!Number.isInteger(t) || sigs.length === 0) return 'malformed';
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest();
  if (!sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected))) return 'mismatch';
  if (Math.abs(nowSec - t) > toleranceSec) return 'expired';
  return null;
}

export type BillingEvent =
  | { kind: 'checkout_completed'; workspaceId: number; customerId: string | null; subscriptionId: string | null; plan: string | null; paid: boolean }
  | { kind: 'subscription'; subscriptionId: string; customerId: string | null; workspaceId: number | null; status: string; periodEnd: Date | null; priceId: string | null }
  | {
      kind: 'invoice_paid';
      invoiceId: string;
      subscriptionId: string | null;
      customerId: string | null;
      workspaceId: number | null;
      plan: string | null;
      currency: string;
      /** Minor units (cents) as the provider reports them. */
      subtotal: number;
      tax: number;
      total: number;
      periodStart: Date | null;
      periodEnd: Date | null;
      paidAt: Date | null;
    }
  | { kind: 'ignored' };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v).id);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown): Date | null => (num(v) === null ? null : new Date(num(v)! * 1000));
const wsOf = (meta: unknown): number | null => {
  const raw = str(obj(meta).workspace_id);
  return raw && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
};

/**
 * Stripe event → what B2B billing needs. Reads both API shapes: before 2025-03-31 (period on the
 * subscription, `invoice.subscription`) and after (period on the items, `invoice.parent`).
 */
export function normalizeStripeEvent(event: unknown): BillingEvent {
  const e = obj(event);
  const o = obj(obj(e.data).object);
  switch (e.type) {
    case 'checkout.session.completed': {
      const ref = str(o.client_reference_id);
      if (o.mode !== 'subscription' || !ref || !/^b2b:\d{1,12}$/.test(ref)) return { kind: 'ignored' };
      return {
        kind: 'checkout_completed',
        workspaceId: Number(ref.slice(4)),
        customerId: idOf(o.customer),
        subscriptionId: idOf(o.subscription),
        plan: str(obj(o.metadata).plan),
        paid: o.payment_status === 'paid' || o.payment_status === 'no_payment_required',
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const id = str(o.id);
      if (!id) return { kind: 'ignored' };
      const item = obj((obj(o.items).data as unknown[] | undefined)?.[0]);
      return {
        kind: 'subscription',
        subscriptionId: id,
        customerId: idOf(o.customer),
        workspaceId: wsOf(o.metadata),
        status: e.type === 'customer.subscription.deleted' ? 'canceled' : (str(o.status) ?? 'incomplete'),
        periodEnd: date(o.current_period_end) ?? date(item.current_period_end),
        priceId: idOf(item.price),
      };
    }
    case 'invoice.paid': {
      const id = str(o.id);
      if (!id) return { kind: 'ignored' };
      const parentSub = obj(obj(o.parent).subscription_details);
      const subscriptionId = idOf(o.subscription) ?? idOf(parentSub.subscription);
      if (!subscriptionId) return { kind: 'ignored' };
      const meta = Object.keys(obj(parentSub.metadata)).length ? parentSub.metadata : obj(o.subscription_details).metadata;
      const line = obj((obj(o.lines).data as unknown[] | undefined)?.[0]);
      const taxes = Array.isArray(o.total_taxes) ? (o.total_taxes as unknown[]).reduce<number>((a, t) => a + (num(obj(t).amount) ?? 0), 0) : null;
      const total = num(o.total) ?? 0;
      const tax = num(o.tax) ?? taxes ?? 0;
      return {
        kind: 'invoice_paid',
        invoiceId: id,
        subscriptionId,
        customerId: idOf(o.customer),
        workspaceId: wsOf(meta),
        plan: str(obj(meta).plan),
        currency: (str(o.currency) ?? 'eur').toUpperCase(),
        subtotal: num(o.subtotal_excluding_tax) ?? num(o.subtotal) ?? total - tax,
        tax,
        total,
        periodStart: date(obj(line.period).start) ?? date(o.period_start),
        periodEnd: date(obj(line.period).end) ?? date(o.period_end),
        paidAt: date(obj(o.status_transitions).paid_at) ?? date(e.created),
      };
    }
    default:
      return { kind: 'ignored' };
  }
}

/** Which of our plans a Stripe price is (null: not one of ours). */
export function planOfPrice(priceId: string | null, prices: { starter?: string; pro?: string }): B2bPlan | null {
  if (!priceId) return null;
  if (prices.starter && priceId === prices.starter) return 'starter';
  if (prices.pro && priceId === prices.pro) return 'pro';
  return null;
}
