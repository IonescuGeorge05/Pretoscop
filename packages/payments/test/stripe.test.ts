import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { paymentProviderFromEnv, PaymentProviderError, signStripePayload, StripeProvider, stripeForm, verifyStripeSignature, WebhookSignatureError } from '../src/index';
import { signedStripeHeaders, startStripeMock, stripeEvent, type StripeMock } from '../src/testing';

const SECRET = 'whsec_test_0123456789abcdef';
let mock: StripeMock;
let stripe: StripeProvider;

beforeAll(async () => {
  mock = await startStripeMock();
  stripe = new StripeProvider({ secretKey: 'sk_test_mock', webhookSecret: SECRET, apiBase: mock.url });
});
afterAll(async () => mock?.close());

describe('Stripe form encoding', () => {
  it('nests objects and arrays the way Stripe expects', () => {
    const f = stripeForm({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'ron', unit_amount: 15000 } }], metadata: { reference: 'topup:1' }, skip: undefined });
    expect([...f.entries()]).toEqual([
      ['mode', 'payment'],
      ['line_items[0][quantity]', '1'],
      ['line_items[0][price_data][currency]', 'ron'],
      ['line_items[0][price_data][unit_amount]', '15000'],
      ['metadata[reference]', 'topup:1'],
    ]);
  });
});

describe('Stripe Checkout (against the local mock)', () => {
  it('opens a checkout in lei for the gross amount, idempotent per reference', async () => {
    const req = {
      reference: 'topup:7',
      amountBani: 18_150,
      currency: 'RON' as const,
      description: 'Credit Promovat Pretoscop',
      customerEmail: 'shop@example.ro',
      successUrl: 'http://localhost/ok',
      cancelUrl: 'http://localhost/no',
      expiresInMinutes: 60,
    };
    const s = await stripe.createCheckout(req);
    expect(s).toMatchObject({ provider: 'stripe', id: expect.stringMatching(/^cs_test_mock_/), url: `${mock.url}/pay/${s.id}` });
    expect(s.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    const sent = mock.sessions.at(-1)!;
    expect(sent.authorization).toBe('Bearer sk_test_mock');
    expect(sent.idempotencyKey).toBe('topup:7');
    expect(sent.params).toMatchObject({
      mode: 'payment',
      client_reference_id: 'topup:7',
      customer_email: 'shop@example.ro',
      locale: 'ro',
      'line_items[0][price_data][currency]': 'ron',
      'line_items[0][price_data][unit_amount]': '18150',
      'line_items[0][quantity]': '1',
      'metadata[reference]': 'topup:7',
      'payment_intent_data[metadata][reference]': 'topup:7',
    });
    const again = await stripe.createCheckout(req);
    expect(again.id).toBe(s.id);
  });

  it('turns a refusal into a PaymentProviderError and refuses amounts under Stripe’s minimum', async () => {
    mock.failNext(400, 'Invalid currency');
    await expect(stripe.createCheckout({ reference: 'topup:8', amountBani: 15_000, currency: 'RON', description: 'x', successUrl: 'http://l/ok', cancelUrl: 'http://l/no' })).rejects.toMatchObject({
      name: 'PaymentProviderError',
      status: 400,
      code: 'mock_failure',
    });
    await expect(stripe.createCheckout({ reference: 'topup:9', amountBani: 199, currency: 'RON', description: 'x', successUrl: 'http://l/ok', cancelUrl: 'http://l/no' })).rejects.toBeInstanceOf(PaymentProviderError);
    const down = new StripeProvider({ secretKey: 'sk', webhookSecret: null, apiBase: 'http://127.0.0.1:9' });
    await expect(down.createCheckout({ reference: 'topup:10', amountBani: 15_000, currency: 'RON', description: 'x', successUrl: 'http://l/ok', cancelUrl: 'http://l/no' })).rejects.toMatchObject({ code: 'network' });
  });
});

describe('webhook signatures', () => {
  const body = stripeEvent('checkout.session.completed', { id: 'cs_1', reference: 'topup:1', amountBani: 15_000 }, 'evt_1');
  const now = new Date();

  it('accepts a correctly signed, fresh event and normalizes it', () => {
    expect(stripe.parseWebhook(body, signedStripeHeaders(SECRET, body), now)).toEqual({
      type: 'checkout.paid',
      provider: 'stripe',
      eventId: 'evt_1',
      checkoutId: 'cs_1',
      reference: 'topup:1',
      amountBani: 15_000,
      currency: 'ron',
    });
    // Fetch Headers work too, and a second v1 (secret rotation) is accepted.
    const h = new Headers({ 'Stripe-Signature': `${signStripePayload(SECRET, body)},v1=${'0'.repeat(64)}` });
    expect(stripe.parseWebhook(body, h, now).type).toBe('checkout.paid');
  });

  it('refuses a missing, malformed, wrong, replayed or re-serialized signature', () => {
    const reason = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (e) {
        return e instanceof WebhookSignatureError ? e.reason : 'other';
      }
    };
    expect(reason(() => stripe.parseWebhook(body, {}, now))).toBe('missing');
    expect(reason(() => stripe.parseWebhook(body, { 'stripe-signature': 'v1=abc' }, now))).toBe('malformed');
    expect(reason(() => stripe.parseWebhook(body, signedStripeHeaders('whsec_other', body), now))).toBe('mismatch');
    expect(reason(() => stripe.parseWebhook(body, signedStripeHeaders(SECRET, body, Math.floor(now.getTime() / 1000) - 301), now))).toBe('expired');
    // The signature covers the exact bytes: a body parsed and re-serialized with other spacing fails.
    expect(reason(() => stripe.parseWebhook(JSON.stringify(JSON.parse(body), null, 1), signedStripeHeaders(SECRET, body), now))).toBe('mismatch');
    expect(reason(() => new StripeProvider({ secretKey: 'sk', webhookSecret: null }).parseWebhook(body, signedStripeHeaders(SECRET, body), now))).toBe('unconfigured');
    expect(() => verifyStripeSignature(SECRET, body, signStripePayload(SECRET, body), now)).not.toThrow();
  });

  it('maps the checkout lifecycle: async success and failure, expiry, unpaid completion and other events', () => {
    const parse = (b: string) => stripe.parseWebhook(b, signedStripeHeaders(SECRET, b), now);
    expect(parse(stripeEvent('checkout.session.completed', { id: 'cs_2', reference: 'topup:2', amountBani: 100, paymentStatus: 'unpaid' }, 'evt_2'))).toEqual({
      type: 'ignored',
      provider: 'stripe',
      eventId: 'evt_2',
      eventType: 'checkout.session.completed',
    });
    expect(parse(stripeEvent('checkout.session.async_payment_succeeded', { id: 'cs_2', reference: 'topup:2', amountBani: 100 }, 'evt_3'))).toMatchObject({ type: 'checkout.paid', amountBani: 100 });
    expect(parse(stripeEvent('checkout.session.async_payment_failed', { id: 'cs_2', reference: 'topup:2', amountBani: 100 }, 'evt_4'))).toMatchObject({ type: 'checkout.failed', checkoutId: 'cs_2' });
    expect(parse(stripeEvent('checkout.session.expired', { id: 'cs_3', reference: 'topup:3', amountBani: 100 }, 'evt_5'))).toMatchObject({ type: 'checkout.expired', reference: 'topup:3' });
    const other = JSON.stringify({ id: 'evt_6', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge' } } });
    expect(parse(other)).toEqual({ type: 'ignored', provider: 'stripe', eventId: 'evt_6', eventType: 'charge.refunded' });
  });
});

describe('provider from the environment', () => {
  it('is off without a secret key', () => {
    expect(paymentProviderFromEnv({ STRIPE_API_BASE: 'https://api.stripe.com' })).toBeNull();
    expect(paymentProviderFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_API_BASE: 'https://api.stripe.com' })?.name).toBe('stripe');
  });
});
