/**
 * Report data contract (M23), versioned so every future report (Black Friday, Christmas, a
 * category study) reuses the same JSON, renderers and public page. Money is integer bani; shares
 * and percentages are fractions rounded to 4 decimals; days are YYYY-MM-DD in Europe/Bucharest.
 */
export const REPORT_SCHEMA = 'pretoscop.report/v1' as const;

/** How an offer's lowest event price compares with its own lowest price in the 30 days before. */
export type ChangeClass = 'real_drop' | 'no_real_drop' | 'higher' | 'insufficient_history';

export interface ReportOfferRow {
  offerId: number;
  shop: string;
  sellerType: 'shop' | 'marketplace';
  productId: number | null;
  productTitle: string | null;
  category: string | null;
  /** Lowest in-stock price in the 30 days before the event (null without enough history). */
  min30Bani: number | null;
  /** Share of those 30 days we observed. */
  coverage30: number;
  /** Lowest in-stock price during the event, and its first day. */
  eventMinBani: number;
  eventMinDay: string;
  /** The shop's crossed reference price on that day (null when none was shown). */
  referenceBani: number | null;
  /** The shop showed a reference price above the selling price on some event day. */
  discountClaimed: boolean;
  /** (eventMin − min30) / min30; null without enough history. */
  changePct: number | null;
  class: ChangeClass;
  /** Reference price more than 2% above everything we observed in the 30 days before. */
  referenceAboveMin30: boolean;
}

export interface GroupStats {
  key: string;
  label: string;
  /** Offers seen in stock during the event. */
  offers: number;
  /** …of which our history covers ≥ 70% of the 30 days before. */
  withHistory: number;
  /** Offers with history that displayed a reduction (reference price above the price). */
  claims: number;
  /** Claims whose event price was not ≥ 2% below our 30-day minimum (no real drop, or higher). */
  claimsWithoutRealDrop: number;
  /** claimsWithoutRealDrop / claims (null when there are no claims). */
  claimsWithoutRealDropShare: number | null;
  /** Offers with history, by class. */
  realDrop: number;
  noRealDrop: number;
  higher: number;
  /** Median changePct over offers with history. */
  medianChangePct: number | null;
}

export interface RaiseThenCutCase {
  offerId: number;
  shop: string;
  productTitle: string | null;
  earlierMedianBani: number;
  peakBani: number;
  peakDay: string;
  eventMinBani: number;
  eventMinDay: string;
  /** peak / earlierMedian − 1 */
  raisePct: number;
}

export interface ProductDrop {
  productId: number;
  title: string;
  category: string | null;
  min30Bani: number;
  eventMinBani: number;
  eventMinDay: string;
  /** (min30 − eventMin) / min30, positive for a drop. */
  dropPct: number;
  shops: number;
}

export interface ReportData {
  schema: typeof REPORT_SCHEMA;
  id: string;
  title: string;
  window: { from: string; to: string };
  /** Days of history needed before the event window for each rule. */
  baselineDays: { realDrop: 30; raiseThenCut: 60 };
  generatedAt: string;
  categories: string[] | null;
  approval: { approved: boolean; by: string | null; at: string | null };
  headline: GroupStats;
  byShop: GroupStats[];
  bySeller: GroupStats[];
  byCategory: GroupStats[];
  biggestDrops: ProductDrop[];
  raiseThenCut: { evaluated: number; cases: RaiseThenCutCase[]; note: string | null };
  /** Offer-level rows (the CSV); seller names are never included (anonymization rule). */
  offers: ReportOfferRow[];
  notes: string[];
}
