/**
 * Canonical form of an offer's price state, hashed into `offers.content_hash` (M01): a price event
 * is written only when this hash changes. Pure: the SHA-256 itself lives in `hash.ts`
 * (`@pretoscop/core/hash`, uses `node:crypto`) so browser bundles never pull Node crypto.
 */
import type { Availability } from './availability';
import { type Bani, baniToDecimalString } from './money';

export interface ContentHashFields {
  priceBani: Bani;
  oldPriceBani: Bani | null;
  /** Delivery cost as observed on the offer (null when the source did not state it). */
  shippingBani: Bani | null;
  availability: Availability;
}

/** Bump when the canonical form changes (every offer then gets one new event). */
export const CONTENT_HASH_VERSION = 'v1';

/**
 * `v1|<price>|<old_price>|<shipping_cost>|<availability>` with amounts written exactly as
 * PostgreSQL prints `numeric(12,2)` ("1234.56") and a missing amount as the literal `null`.
 * Example: `v1|1234.56|null|19.99|in_stock`. SQL equivalent, for checks and backfills:
 * `encode(sha256(convert_to(concat_ws('|', 'v1', price::text, coalesce(old_price::text, 'null'),
 * coalesce(shipping_cost::text, 'null'), availability), 'UTF8')), 'hex')`.
 */
export function contentHashInput(fields: ContentHashFields): string {
  const amount = (v: Bani | null): string => (v == null ? 'null' : baniToDecimalString(v));
  return [
    CONTENT_HASH_VERSION,
    amount(fields.priceBani),
    amount(fields.oldPriceBani),
    amount(fields.shippingBani),
    fields.availability,
  ].join('|');
}

/** A function that turns the price state into the hex digest stored in `offers.content_hash`. */
export type ContentHasher = (fields: ContentHashFields) => string;
