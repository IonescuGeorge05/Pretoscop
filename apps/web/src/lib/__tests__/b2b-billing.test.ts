import { describe, expect, it } from 'vitest';
import { b2bBillingInput, isB2bPaymentEvent, planOfPrice } from '../b2b-billing';

const prices = { starter: 'price_s', pro: 'price_p' };
const base = { provider: 'stripe', eventId: 'evt_1' };

describe('B2B billing events from the shared Stripe webhook', () => {
  it('picks out subscription events; one-off payments stay M25’s', () => {
    expect(isB2bPaymentEvent({ ...base, type: 'invoice.paid' } as never)).toBe(true);
    expect(isB2bPaymentEvent({ ...base, type: 'checkout.paid', checkoutId: 'cs', reference: 'topup:1', amountBani: 1, currency: 'ron' })).toBe(false);
    expect(isB2bPaymentEvent({ ...base, type: 'ignored', eventType: 'x' })).toBe(false);
  });

  it('maps a checkout by its b2b reference; a checkout of something else is not ours', () => {
    const co = { ...base, type: 'subscription.checkout_completed' as const, checkoutId: 'cs_1', reference: 'b2b:42', customerId: 'cus_1', subscriptionId: 'sub_1', paid: true, metadata: { plan: 'pro', workspace_id: '42' } };
    expect(b2bBillingInput(co, prices)).toEqual({ marked: true, input: { kind: 'checkout_completed', workspaceId: 42, customerId: 'cus_1', subscriptionId: 'sub_1', plan: 'pro', paid: true } });
    expect(b2bBillingInput({ ...co, reference: 'other:1', metadata: {} }, prices)).toBeNull();
    expect(b2bBillingInput({ ...co, metadata: { plan: 'gold' } }, prices)?.input).toMatchObject({ plan: null });
  });

  it('maps subscriptions (plan from the price) and invoices (plan from the metadata); marked only with our metadata', () => {
    const sub = { ...base, type: 'subscription.updated' as const, subscriptionId: 'sub_1', customerId: 'cus_1', status: 'active', periodEnd: new Date(0), priceId: 'price_s', metadata: { workspace_id: '42' } };
    expect(b2bBillingInput(sub, prices)).toEqual({ marked: true, input: { kind: 'subscription', subscriptionId: 'sub_1', customerId: 'cus_1', workspaceId: 42, status: 'active', periodEnd: new Date(0), plan: 'starter' } });
    expect(b2bBillingInput({ ...sub, metadata: {}, priceId: 'price_x' }, prices)).toMatchObject({ marked: false, input: { workspaceId: null, plan: null } });
    const inv = {
      ...base,
      type: 'invoice.paid' as const,
      invoiceId: 'in_1',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      currency: 'EUR',
      subtotal: 14_900,
      tax: 3_129,
      total: 18_029,
      periodStart: null,
      periodEnd: null,
      paidAt: null,
      metadata: { reference: 'b2b:42', plan: 'pro' },
    };
    expect(b2bBillingInput(inv, prices)).toMatchObject({ marked: true, input: { kind: 'invoice_paid', workspaceId: 42, plan: 'pro', total: 18_029 } });
  });

  it('maps price ids to plans', () => {
    expect(planOfPrice('price_p', prices)).toBe('pro');
    expect(planOfPrice('price_x', prices)).toBeNull();
    expect(planOfPrice(null, prices)).toBeNull();
  });
});
