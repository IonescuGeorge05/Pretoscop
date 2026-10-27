import { median } from './verdict';

/**
 * Discount-verification facts per offer (docs/03 §6.4, docs/07 §2). Each fact is a factual,
 * reproducible statement about the shop's displayed reference price measured against our own
 * observations of that same offer; none is computed in the offer's first 30 days or when our
 * history does not cover the window. Wording never accuses.
 */

/** One day of one offer's observed price (min in-stock price of that day), integer bani. */
export interface OfferDay {
  /** ISO date (YYYY-MM-DD, Europe/Bucharest). */
  day: string;
  priceBani: number;
}

export interface DiscountInput {
  today: string;
  currentBani: number;
  /** The shop's crossed ("old") price as displayed today. */
  referenceBani: number | null;
  /** The day the current reduction started (first day at today's lower price level), if known. */
  reductionStartedOn: string | null;
  /** Days observed for this offer, ascending, without gaps filled. */
  history: OfferDay[];
  /** Days since we first saw the offer. */
  offerAgeDays: number;
  /** Median of today's in-stock totals across shops for the product, if ≥ 2 shops. */
  crossShopMedianBani: number | null;
}

export type DiscountFactKind = 'reference_not_supported' | 'raise_then_cut' | 'phantom_old_price' | 'market_irrelevant_discount';

export interface DiscountFact {
  kind: DiscountFactKind;
  /** Plain Romanian statement with the numbers and dates it rests on. */
  text: string;
  evidence: Record<string, number | string | null>;
}

const DAY_MS = 86_400_000;

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function inRange(h: OfferDay[], from: string, to: string): OfferDay[] {
  return h.filter((d) => d.day >= from && d.day <= to);
}

/** Share of the days in [from, to] that we observed. */
export function coverage(h: OfferDay[], from: string, to: string): number {
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  return span <= 0 ? 0 : inRange(h, from, to).length / span;
}

const lei = (bani: number) =>
  `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions).format(bani / 100)} lei`;

const roDate = (day: string) =>
  new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** Minimum share of days we must have observed in a window before we state anything about it. */
export const MIN_COVERAGE = 0.7;

export function discountFacts(i: DiscountInput): DiscountFact[] {
  const facts: DiscountFact[] = [];
  if (i.offerAgeDays < 30) return facts;

  // (1) Reference not supported: crossed price > 2% above our lowest observed price at this shop
  // in the 30 days before the reduction started.
  if (i.referenceBani !== null && i.referenceBani > i.currentBani && i.reductionStartedOn) {
    const from = addDays(i.reductionStartedOn, -30);
    const to = addDays(i.reductionStartedOn, -1);
    const win = inRange(i.history, from, to);
    if (coverage(i.history, from, to) >= MIN_COVERAGE && win.length > 0) {
      const low = win.reduce((m, d) => (d.priceBani < m.priceBani ? d : m));
      if (i.referenceBani > low.priceBani * 1.02) {
        facts.push({
          kind: 'reference_not_supported',
          text: `Prețul de referință afișat de magazin (${lei(i.referenceBani)}) este mai mare decât cel mai mic preț observat de Pretoscop la acest magazin în cele 30 de zile dinaintea reducerii (${lei(low.priceBani)}, la ${roDate(low.day)}).`,
          evidence: { reference: i.referenceBani, lowest30dBefore: low.priceBani, lowestOn: low.day, reductionStartedOn: i.reductionStartedOn },
        });
      }
    }
  }

  // (2) Raise-then-cut: max over [t−30d, t−3d] ≥ 1.15 × median over [t−60d, t−31d] and the
  // current price is ≥ 97% of that earlier median.
  {
    const recentFrom = addDays(i.today, -30);
    const recentTo = addDays(i.today, -3);
    const earlierFrom = addDays(i.today, -60);
    const earlierTo = addDays(i.today, -31);
    if (coverage(i.history, recentFrom, recentTo) >= MIN_COVERAGE && coverage(i.history, earlierFrom, earlierTo) >= MIN_COVERAGE) {
      const recent = inRange(i.history, recentFrom, recentTo);
      const earlierMedian = median(inRange(i.history, earlierFrom, earlierTo).map((d) => d.priceBani));
      const peak = recent.reduce((m, d) => (d.priceBani > m.priceBani ? d : m), recent[0]!);
      if (earlierMedian !== null && peak && peak.priceBani >= earlierMedian * 1.15 && i.currentBani >= earlierMedian * 0.97) {
        facts.push({
          kind: 'raise_then_cut',
          text: `Prețul a crescut la ${lei(peak.priceBani)} (${roDate(peak.day)}) față de o mediană de ${lei(earlierMedian)} în luna anterioară, iar prețul actual (${lei(i.currentBani)}) este la nivelul de dinaintea creșterii.`,
          evidence: { peak: peak.priceBani, peakOn: peak.day, earlierMedian, current: i.currentBani },
        });
      }
    }
  }

  // (3) Phantom old price: the crossed price was never an observed selling price in 90 days.
  if (i.referenceBani !== null && i.referenceBani > i.currentBani) {
    const from = addDays(i.today, -90);
    const to = addDays(i.today, -1);
    if (i.offerAgeDays >= 90 && coverage(i.history, from, to) >= MIN_COVERAGE) {
      const seen = inRange(i.history, from, to).some((d) => Math.abs(d.priceBani - i.referenceBani!) <= Math.max(100, i.referenceBani! * 0.005));
      if (!seen) {
        facts.push({
          kind: 'phantom_old_price',
          text: `Pretoscop nu a observat produsul la prețul de referință afișat (${lei(i.referenceBani)}) în ultimele 90 de zile.`,
          evidence: { reference: i.referenceBani, windowFrom: from, windowTo: to },
        });
      }
    }
  }

  // (4) Market-irrelevant discount: claimed reduction > 30% while the price is at or above the
  // cross-shop median today.
  if (i.referenceBani !== null && i.referenceBani > 0 && i.crossShopMedianBani !== null) {
    const claimed = (i.referenceBani - i.currentBani) / i.referenceBani;
    if (claimed > 0.3 && i.currentBani >= i.crossShopMedianBani) {
      facts.push({
        kind: 'market_irrelevant_discount',
        text: `Reducerea afișată este de ${Math.round(claimed * 100)}%, dar prețul (${lei(i.currentBani)}) nu este sub mediana prețurilor din celelalte magazine azi (${lei(i.crossShopMedianBani)}).`,
        evidence: { claimedPct: Math.round(claimed * 100), current: i.currentBani, crossShopMedian: i.crossShopMedianBani },
      });
    }
  }
  return facts;
}
