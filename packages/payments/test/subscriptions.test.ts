import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentProviderError, StripeProvider } from '../src/index';
import { signedStripeHeaders, startStripeMock, type StripeMock } from '../src/testing';

/** M28: subscription checkouts, the customer portal and the subscription/invoice webhooks. */

const SECRET = 'whsec_test_0123456789abcdef';
let mock: StripeMock;
let stripe: StripeProvider;

beforeAll(async () => {
  mock = await startStripeMock();
  stripe = new StripeProvider({ secretKey: 'sk_test_mock', webhookSecret: SECRET, apiBase: mock.url });
});
afterAll(async () => mock?.close());

const deliver = (type: string, object: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`) => {
  const body = JSON.stringify({ id, object: 'event', type, created: 1_794_000_100, data: { object } });
  return stripe.parseWebhook(body, signedStripeHeaders(SECRET, body), new Date());
};

describe('subscription checkout and portal (against the local mock)', () => {
  it('opens a subscription checkout for a price, with the reference on the subscription, tax and an idempotency key', async () => {
    const s = await stripe.createSubscriptionCheckout({
      reference: 'b2b:7',
      priceId: 'price_pro',
      customerEmail: 'facturi@client.ro',
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      automaticTax: true,
      metadata: { workspace_id: '7', plan: 'pro' },
    });
    expect(s.provider).toBe('stripe');
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/pay\/cs_test_mock_/);
    const sent = mock.sessions.at(-1)!;
    expect(sent.authorization).toBe('Bearer sk_test_mock');
    expect(sent.idempotencyKey).toMatch(/^b2b:7:price_pro:\d+$/);
    expect(sent.params).toMatchObject({
      mode: 'subscription',
      client_reference_id: 'b2b:7',
      'line_items[0][price]': 'price_pro',
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][workspace_id]': '7',
      'subscription_data[metadata][reference]': 'b2b:7',
      'metadata[plan]': 'pro',
      'automatic_tax[enabled]': 'true',
      'tax_id_collection[enabled]': 'true',
      billing_address_collection: 'required',
      customer_email: 'facturi@client.ro',
      locale: 'ro',
    });
    expect(sent.params.customer).toBeUndefined();
    // An existing customer is reused (and its address and name updated by the checkout).
    await stripe.createSubscriptionCheckout({ reference: 'b2b:7', priceId: 'price_s', customerId: 'cus_1', successUrl: 'https://x/ok', cancelUrl: 'https://x/no' });
    expect(mock.sessions.at(-1)!.params).toMatchObject({ customer: 'cus_1', 'customer_update[address]': 'auto', 'customer_update[name]': 'auto' });
    expect(mock.sessions.at(-1)!.params['automatic_tax[enabled]']).toBeUndefined();
    expect(mock.sessions.at(-1)!.params.customer_email).toBeUndefined();
  });

  it('opens the customer portal and turns refusals into PaymentProviderError', async () => {
    expect(await stripe.createPortalSession('cus_1', 'https://x/setari')).toEqual({ url: expect.stringMatching(/\/portal\/1$/) });
    expect(mock.portals.at(-1)!.params).toEqual({ customer: 'cus_1', return_url: 'https://x/setari' });
    mock.failNext(400, 'No such customer');
    await expect(stripe.createPortalSession('cus_x', 'https://x')).rejects.toMatchObject({ name: 'PaymentProviderError', status: 400, code: 'mock_failure' });
    const down = new StripeProvider({ secretKey: 'sk_test_mock', webhookSecret: SECRET, apiBase: 'http://127.0.0.1:1' });
    await expect(down.createSubscriptionCheckout({ reference: 'b2b:1', priceId: 'price_s', successUrl: 'https://x', cancelUrl: 'https://x' })).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe('subscription webhooks', () => {
  it('a subscription checkout is not a one-off payment', () => {
    const o = { id: 'cs_9', object: 'checkout.session', mode: 'subscription', client_reference_id: 'b2b:42', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', amount_total: 18_029, currency: 'eur', metadata: { workspace_id: '42', plan: 'pro', reference: 'b2b:42' } };
    expect(deliver('checkout.session.completed', o, 'evt_co')).toEqual({
      type: 'subscription.checkout_completed',
      provider: 'stripe',
      eventId: 'evt_co',
      checkoutId: 'cs_9',
      reference: 'b2b:42',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      paid: true,
      metadata: { workspace_id: '42', plan: 'pro', reference: 'b2b:42' },
    });
    expect(deliver('checkout.session.expired', { ...o, payment_status: 'unpaid' }).type).toBe('ignored');
    // A one-off top-up (M25) still reads as before.
    expect(deliver('checkout.session.completed', { ...o, mode: 'payment', client_reference_id: 'topup:3', amount_total: 15_000, currency: 'ron' }).type).toBe('checkout.paid');
  });

  it('reads subscriptions in both API shapes; ended = canceled', () => {
    const old = { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'past_due', current_period_end: 1_796_000_000, metadata: { workspace_id: '42' }, items: { data: [{ price: { id: 'price_pro' } }] } };
    expect(deliver('customer.subscription.updated', old, 'evt_s')).toEqual({
      type: 'subscription.updated',
      provider: 'stripe',
      eventId: 'evt_s',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      status: 'past_due',
      periodEnd: new Date(1_796_000_000_000),
      priceId: 'price_pro',
      metadata: { workspace_id: '42' },
    });
    const basil = { id: 'sub_1', object: 'subscription', customer: { id: 'cus_1' }, status: 'active', items: { data: [{ current_period_end: 1_796_000_000, price: 'price_pro' }] } };
    expect(deliver('customer.subscription.deleted', basil)).toMatchObject({ status: 'canceled', periodEnd: new Date(1_796_000_000_000), priceId: 'price_pro', customerId: 'cus_1', metadata: {} });
  });

  it('reads paid subscription invoices (tax, period, the subscription metadata) and ignores one-off invoices', () => {
    const inv = {
      id: 'in_1',
      object: 'invoice',
      customer: 'cus_1',
      currency: 'eur',
      subtotal: 14_900,
      total: 18_029,
      total_taxes: [{ amount: 3_129 }],
      parent: { subscription_details: { subscription: 'sub_1', metadata: { workspace_id: '42', plan: 'pro' } } },
      lines: { data: [{ period: { start: 1_794_000_000, end: 1_796_600_000 } }] },
      status_transitions: { paid_at: 1_794_000_050 },
    };
    expect(deliver('invoice.paid', inv, 'evt_i')).toEqual({
      type: 'invoice.paid',
      provider: 'stripe',
      eventId: 'evt_i',
      invoiceId: 'in_1',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      currency: 'EUR',
      subtotal: 14_900,
      tax: 3_129,
      total: 18_029,
      periodStart: new Date(1_794_000_000_000),
      periodEnd: new Date(1_796_600_000_000),
      paidAt: new Date(1_794_000_050_000),
      metadata: { workspace_id: '42', plan: 'pro' },
    });
    // Older API: `subscription` and `tax` on the invoice itself, period on the invoice.
    expect(deliver('invoice.paid', { id: 'in_2', object: 'invoice', subscription: 'sub_1', tax: 21, subtotal: 100, total: 121, period_start: 1_794_000_000, period_end: 1_796_600_000 })).toMatchObject({
      subscriptionId: 'sub_1',
      tax: 21,
      periodStart: new Date(1_794_000_000_000),
      paidAt: new Date(1_794_000_100_000),
    });
    expect(deliver('invoice.paid', { ...inv, parent: {} }).type).toBe('ignored');
  });
});
