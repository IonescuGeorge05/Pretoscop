import { createHash } from 'node:crypto';
import type { NormalizedOffer } from '@pretoscop/core';

export interface OfferIdentity {
  /** The GTIN-14, only when valid. */
  gtin14: string | null;
  /** The brand when it may be a hard matching constraint (known, or confidence ≥ 0.7). */
  brandName: string | null;
  /** sha256 over (title match form, GTIN-14, MPN, brand): re-matching runs when it changes (M07). */
  identityHash: string;
}

/**
 * The identity columns of a normalized offer, exactly as the recorder stores them. Shared by
 * `createNormalize` (ingestion) and `renormalizeOffers`, so a re-normalized offer and a freshly
 * recorded one can never disagree on what triggers re-matching.
 */
export function offerIdentity(
  n: Pick<
    NormalizedOffer,
    | 'gtinQuality'
    | 'gtin14'
    | 'brandName'
    | 'brandKnown'
    | 'brandConfidence'
    | 'titleMatch'
    | 'mpnNorm'
  >,
): OfferIdentity {
  const gtin14 = n.gtinQuality === 'valid' ? n.gtin14 : null;
  // Ambiguous or component brands must not become hard matching constraints (M06 report).
  const brandName =
    n.brandName && (n.brandKnown || (n.brandConfidence ?? 0) >= 0.7) ? n.brandName : null;
  const identityHash = createHash('sha256')
    .update([n.titleMatch, gtin14 ?? '', n.mpnNorm ?? '', brandName ?? ''].join('|'))
    .digest('hex');
  return { gtin14, brandName, identityHash };
}
