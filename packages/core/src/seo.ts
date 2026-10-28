/**
 * Index policy (docs/03 §6.6, docs/04 §2.5): which product pages search engines may index. One
 * function, used by the product page's robots meta, the search index (`indexable` field), the
 * category/brand pages' ItemList and the sitemaps, so they never disagree.
 *
 * A product page is indexable when all of these hold:
 * - the product is active and not provisional (a provisional product was created by the matcher
 *   from a single offer and is unverified);
 * - it has at least one live offer (zero-offer pages are noindex, docs/04 §2.5);
 * - it has at least 2 live offers, or at least 14 days of observed history.
 *
 * "Live" = active, matched (auto/manual), from an active shop, checked within the shop's freshness
 * SLO, whatever the stock state.
 */
export const INDEX_MIN_LIVE_OFFERS = 2;
export const INDEX_MIN_HISTORY_DAYS = 14;

export interface IndexabilityInput {
  status?: 'active' | 'merged' | 'hidden' | string;
  provisional: boolean;
  liveOffers: number;
  observationsDays: number;
}

export type IndexDecision = 'indexable' | 'inactive' | 'provisional' | 'no_live_offers' | 'thin';

export function productIndexDecision(i: IndexabilityInput): IndexDecision {
  if (i.status !== undefined && i.status !== 'active') return 'inactive';
  if (i.provisional) return 'provisional';
  if (i.liveOffers < 1) return 'no_live_offers';
  if (i.liveOffers >= INDEX_MIN_LIVE_OFFERS || i.observationsDays >= INDEX_MIN_HISTORY_DAYS) return 'indexable';
  return 'thin';
}

export function isProductIndexable(i: IndexabilityInput): boolean {
  return productIndexDecision(i) === 'indexable';
}

/** A brand × category landing page is "curated" (indexable) from this many indexable products. */
export const BRAND_CATEGORY_MIN_PRODUCTS = 3;
