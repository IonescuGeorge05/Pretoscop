/**
 * Total price = price + delivery (the ranking key of the product page). Pure.
 */
import { type Bani, leiToBani } from './money';

/**
 * A shop's delivery rules as stored in `shops.shipping_rules` (jsonb), amounts in **lei**:
 * `free_over` = free delivery from this order value (inclusive), `flat` = standard courier
 * price, `locker_flat` = price to a parcel locker (easybox etc.), `notes` = free text.
 * Amounts are VAT-included consumer prices.
 */
export interface ShippingRules {
  free_over?: number | null;
  flat?: number | null;
  locker_flat?: number | null;
  notes?: string;
}

export type ShippingBasis = 'offer' | 'free_over' | 'flat' | 'locker_flat' | 'unknown';

export interface TotalPriceInput {
  priceBani: Bani;
  /** Delivery cost stated on the offer or feed (0 = free). Wins over the shop rules. */
  shippingBani?: Bani | null;
  rules?: ShippingRules | null;
  /** The item can go to a parcel locker; then `locker_flat` is used when it is cheaper. */
  isLockerEligible?: boolean;
}

export interface TotalPriceResult {
  /** Delivery used in the total; null when unknown (then the total is the price alone). */
  shippingBani: Bani | null;
  totalBani: Bani;
  /** True unless the offer itself stated the delivery cost. */
  shippingEstimated: boolean;
  basis: ShippingBasis;
}

function ruleBani(lei: number | null | undefined): Bani | null {
  if (lei == null || !Number.isFinite(lei) || lei < 0) return null;
  return leiToBani(lei);
}

/**
 * Computes the total price of an offer:
 * 1. a delivery cost stated on the offer wins (`basis: 'offer'`, not estimated);
 * 2. else, if `free_over` is set and the price reaches it → delivery 0 (`free_over`);
 * 3. else the cheapest of `flat` and (when `isLockerEligible`) `locker_flat`;
 * 4. else delivery unknown: total = price, `shippingBani: null`, `basis: 'unknown'`.
 */
export function totalPrice(input: TotalPriceInput): TotalPriceResult {
  const { priceBani, shippingBani, rules, isLockerEligible = false } = input;
  if (!Number.isSafeInteger(priceBani) || priceBani < 0) {
    throw new RangeError('priceBani must be a non-negative integer');
  }
  if (shippingBani != null) {
    if (!Number.isSafeInteger(shippingBani) || shippingBani < 0) {
      throw new RangeError('shippingBani must be a non-negative integer');
    }
    return {
      shippingBani,
      totalBani: priceBani + shippingBani,
      shippingEstimated: false,
      basis: 'offer',
    };
  }
  const freeOver = ruleBani(rules?.free_over);
  if (freeOver !== null && priceBani >= freeOver) {
    return { shippingBani: 0, totalBani: priceBani, shippingEstimated: true, basis: 'free_over' };
  }
  const flat = ruleBani(rules?.flat);
  const locker = isLockerEligible ? ruleBani(rules?.locker_flat) : null;
  if (locker !== null && (flat === null || locker < flat)) {
    return {
      shippingBani: locker,
      totalBani: priceBani + locker,
      shippingEstimated: true,
      basis: 'locker_flat',
    };
  }
  if (flat !== null) {
    return {
      shippingBani: flat,
      totalBani: priceBani + flat,
      shippingEstimated: true,
      basis: 'flat',
    };
  }
  return { shippingBani: null, totalBani: priceBani, shippingEstimated: true, basis: 'unknown' };
}
