import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingProviderError, normalizeStripeEvent, planOfPrice, stripeSubscriptionProvider, verifyStripeSignature } from '../b2b-billing';

const SECRET = 'whsec_test123';
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('Stripe webhook signature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const now = 1_794_000_000;
  it('accepts a fresh signature, also among several v1 values (secret rotation)', () => {
    expect(verifyStripeSignature(body, sign(body, now), SECRET, now)).toBeNull();
    const other = sign(body, now, 'whsec_old').split(',')[1];
    expect(verifyStripeSignature(body, `${sign(body, now)},${other}`, SECRET, now + 10)).toBeNull();
  });
  it('refuses missing, malformed, wrong, tampered and stale signatures', () => {
    expect(verifyStripeSignature(body, null, SECRET, now)).toBe('missing');
    expect(verifyStripeSignature(body, 't=abc,v1=xyz', SECRET, now)).toBe('malformed');
    expect(verifyStripeSignature(body, sign(body, now, 'whsec_other'), SECRET, now)).toBe('mismatch');
    expect(verifyStripeSignature(`${body} `, sign(body, now), SECRET, now)).toBe('mismatch');
    expect(verifyStripeSignature(body, sign(body, now - 301), SECRET, now)).toBe('expired');
  });
});

describe('Stripe events → billing events', () => {
  it('reads a subscription checkout and ignores other checkouts', () => {
    const e = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: 'b2b:42', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', metadata: { plan: 'pro' } } } };
    expect(normalizeStripeEvent(e)).toEqual({ kind: 'checkout_completed', workspaceId: 42, customerId: 'cus_1', subscriptionId: 'sub_1', plan: 'pro', paid: true });
    expect(normalizeStripeEvent({ ...e, data: { object: { ...e.data.object, mode: 'payment' } } })).toEqual({ kind: 'ignored' });
    expect(normalizeStripeEvent({ ...e, data: { object: { ...e.data.object, client_reference_id: 'topup:42' } } })).toEqual({ kind: 'ignored' });
  });
  it('reads subscriptions in both API shapes (period on the subscription or on the item)', () => {
    const old = { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due', current_period_end: 1_796_000_000, metadata: { workspace_id: '42' }, items: { data: [{ price: { id: 'price_pro' } }] } } } };
    expect(normalizeStripeEvent(old)).toEqual({ kind: 'subscription', subscriptionId: 'sub_1', customerId: 'cus_1', workspaceId: 42, status: 'past_due', periodEnd: new Date(1_796_000_000_000), priceId: 'price_pro' });
    const basil = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: { id: 'cus_1' }, status: 'active', items: { data: [{ current_period_end: 1_796_000_000, price: 'price_pro' }] } } } };
    expect(normalizeStripeEvent(basil)).toMatchObject({ status: 'canceled', periodEnd: new Date(1_796_000_000_000), priceId: 'price_pro', workspaceId: null, customerId: 'cus_1' });
  });
  it('reads paid invoices with tax, period and the subscription metadata', () => {
    const inv = {
      type: 'invoice.paid',
      created: 1_794_000_100,
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          currency: 'eur',
          subtotal: 14_900,
          total: 18_029,
          total_taxes: [{ amount: 3_129 }],
          parent: { subscription_details: { subscription: 'sub_1', metadata: { workspace_id: '42', plan: 'pro' } } },
          lines: { data: [{ period: { start: 1_794_000_000, end: 1_796_600_000 } }] },
          status_transitions: { paid_at: 1_794_000_050 },
        },
      },
    };
    expect(normalizeStripeEvent(inv)).toEqual({
      kind: 'invoice_paid',
      invoiceId: 'in_1',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      workspaceId: 42,
      plan: 'pro',
      currency: 'EUR',
      subtotal: 14_900,
      tax: 3_129,
      total: 18_029,
      periodStart: new Date(1_794_000_000_000),
      periodEnd: new Date(1_796_600_000_000),
      paidAt: new Date(1_794_000_050_000),
    });
    // An invoice without a subscription (a one-off M25 payment) is not ours.
    expect(normalizeStripeEvent({ ...inv, data: { object: { ...inv.data.object, parent: {} } } })).toEqual({ kind: 'ignored' });
    expect(normalizeStripeEvent({ type: 'payment_intent.succeeded', data: { object: {} } })).toEqual({ kind: 'ignored' });
  });
  it('maps price ids to plans', () => {
    expect(planOfPrice('price_s', { starter: 'price_s', pro: 'price_p' })).toBe('starter');
    expect(planOfPrice('price_p', { starter: 'price_s', pro: 'price_p' })).toBe('pro');
    expect(planOfPrice('price_x', { starter: 'price_s' })).toBeNull();
  });
});

describe('Stripe client against a local mock', () => {
  let server: http.Server;
  let base = '';
  const seen: Array<{ path: string; headers: http.IncomingHttpHeaders; body: URLSearchParams }> = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen.push({ path: req.url!, headers: req.headers, body: new URLSearchParams(raw) });
        res.setHeader('content-type', 'application/json');
        if (req.headers.authorization !== 'Bearer sk_test_abc') {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: { message: 'Invalid API Key', code: 'api_key_invalid' } }));
        }
        if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }));
        if (req.url === '/v1/billing_portal/sessions') return res.end(JSON.stringify({ url: 'https://billing.stripe.test/p_1' }));
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('creates a subscription checkout with the workspace in the metadata, tax and an idempotency key', async () => {
    const p = stripeSubscriptionProvider({ secretKey: 'sk_test_abc', apiBase: base, now: () => 1_794_000_000_000 });
    const s = await p.createSubscriptionCheckout({ workspaceId: 7, plan: 'pro', priceId: 'price_pro', customerEmail: 'facturi@client.ro', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', automaticTax: true });
    expect(s).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    const call = seen.at(-1)!;
    expect(call.headers['idempotency-key']).toBe(`b2b-checkout:7:pro:${Math.floor(1_794_000_000_000 / 60_000)}`);
    expect(Object.fromEntries(call.body)).toMatchObject({
      mode: 'subscription',
      'line_items[0][price]': 'price_pro',
      client_reference_id: 'b2b:7',
      'subscription_data[metadata][workspace_id]': '7',
      'automatic_tax[enabled]': 'true',
      'tax_id_collection[enabled]': 'true',
      customer_email: 'facturi@client.ro',
      locale: 'ro',
    });
    expect(call.body.has('customer')).toBe(false);
    await p.createSubscriptionCheckout({ workspaceId: 7, plan: 'starter', priceId: 'price_s', customerId: 'cus_1', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', automaticTax: false });
    expect(Object.fromEntries(seen.at(-1)!.body)).toMatchObject({ customer: 'cus_1', 'customer_update[address]': 'auto' });
    expect(seen.at(-1)!.body.has('automatic_tax[enabled]')).toBe(false);
    expect(await p.createPortalSession('cus_1', 'https://x/setari')).toEqual({ url: 'https://billing.stripe.test/p_1' });
  });

  it('turns refusals and network errors into BillingProviderError', async () => {
    const bad = stripeSubscriptionProvider({ secretKey: 'sk_test_wrong', apiBase: base });
    await expect(bad.createPortalSession('cus_1', 'https://x')).rejects.toMatchObject({ name: 'BillingProviderError', status: 401, code: 'api_key_invalid' });
    const down = stripeSubscriptionProvider({ secretKey: 'sk_test_abc', apiBase: 'http://127.0.0.1:1' });
    await expect(down.createPortalSession('cus_1', 'https://x')).rejects.toBeInstanceOf(BillingProviderError);
  });
});
