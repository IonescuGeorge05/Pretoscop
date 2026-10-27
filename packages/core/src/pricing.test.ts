import { describe, expect, it } from 'vitest';
import { contentHashInput } from './content-hash';
import { contentHash, sha256Hex } from './hash';
import { totalPrice } from './pricing';

const rules = { free_over: 250, flat: 19.99, locker_flat: 12.99 };

describe('totalPrice', () => {
  it('uses the delivery cost stated on the offer', () => {
    expect(totalPrice({ priceBani: 10000, shippingBani: 1500, rules })).toEqual({
      shippingBani: 1500,
      totalBani: 11500,
      shippingEstimated: false,
      basis: 'offer',
    });
    expect(totalPrice({ priceBani: 10000, shippingBani: 0, rules })).toMatchObject({
      totalBani: 10000,
      basis: 'offer',
    });
  });

  it('applies free delivery from the threshold (inclusive)', () => {
    expect(totalPrice({ priceBani: 25000, rules })).toEqual({
      shippingBani: 0,
      totalBani: 25000,
      shippingEstimated: true,
      basis: 'free_over',
    });
    expect(totalPrice({ priceBani: 24999, rules })).toMatchObject({
      shippingBani: 1999,
      totalBani: 26998,
      basis: 'flat',
    });
  });

  it('uses the locker price only for eligible items and only when cheaper', () => {
    expect(totalPrice({ priceBani: 10000, rules, isLockerEligible: true })).toMatchObject({
      shippingBani: 1299,
      totalBani: 11299,
      basis: 'locker_flat',
    });
    expect(
      totalPrice({
        priceBani: 10000,
        rules: { flat: 9.99, locker_flat: 12.99 },
        isLockerEligible: true,
      }),
    ).toMatchObject({ shippingBani: 999, basis: 'flat' });
    expect(
      totalPrice({ priceBani: 10000, rules: { locker_flat: 12.99 }, isLockerEligible: true }),
    ).toMatchObject({ shippingBani: 1299, basis: 'locker_flat' });
  });

  it('reports unknown delivery when there are no rules', () => {
    expect(totalPrice({ priceBani: 10000 })).toEqual({
      shippingBani: null,
      totalBani: 10000,
      shippingEstimated: true,
      basis: 'unknown',
    });
    expect(totalPrice({ priceBani: 10000, rules: { free_over: null, flat: null } })).toMatchObject({
      basis: 'unknown',
    });
  });

  it('rejects non-integer amounts', () => {
    expect(() => totalPrice({ priceBani: 10.5 })).toThrow();
    expect(() => totalPrice({ priceBani: 1000, shippingBani: -1 })).toThrow();
  });
});

describe('content hash', () => {
  it('has a documented canonical form with explicit nulls', () => {
    expect(
      contentHashInput({
        priceBani: 123456,
        oldPriceBani: null,
        shippingBani: 1999,
        availability: 'in_stock',
      }),
    ).toBe('v1|1234.56|null|19.99|in_stock');
    expect(
      contentHashInput({
        priceBani: 5,
        oldPriceBani: 10000,
        shippingBani: null,
        availability: 'unknown',
      }),
    ).toBe('v1|0.05|100.00|null|unknown');
  });

  it('is the sha256 hex of the canonical form', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const fields = {
      priceBani: 123456,
      oldPriceBani: null,
      shippingBani: 1999,
      availability: 'in_stock',
    } as const;
    expect(contentHash(fields)).toBe(sha256Hex('v1|1234.56|null|19.99|in_stock'));
    expect(contentHash(fields)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any hashed field changes and only then', () => {
    const base = {
      priceBani: 100000,
      oldPriceBani: 120000,
      shippingBani: 0,
      availability: 'in_stock',
    } as const;
    const h = contentHash(base);
    expect(contentHash({ ...base })).toBe(h);
    expect(contentHash({ ...base, priceBani: 99999 })).not.toBe(h);
    expect(contentHash({ ...base, oldPriceBani: null })).not.toBe(h);
    expect(contentHash({ ...base, shippingBani: null })).not.toBe(h);
    expect(contentHash({ ...base, availability: 'out_of_stock' })).not.toBe(h);
  });
});
