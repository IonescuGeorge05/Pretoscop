/**
 * Price verdicts (M08, docs/03 §6.4). Inputs are our own observations only, in integer bani.
 *
 * - `insufficient_data`: fewer than 14 days of observations.
 * - `good_price`: today's best total ≤ the 30-day minimum × 1.01.
 * - `above_usual`: today's best total ≥ the 90-day median × 1.08.
 * - `usual`: everything else.
 */
export type Verdict = 'good_price' | 'usual' | 'above_usual' | 'insufficient_data';

export const VERDICT_MIN_DAYS = 14;
export const GOOD_PRICE_TOLERANCE = 1.01;
export const ABOVE_USUAL_FACTOR = 1.08;

export interface VerdictInput {
  currentBani: number | null;
  min30dBani: number | null;
  median90dBani: number | null;
  observationsDays: number;
}

export function computeVerdict(i: VerdictInput): Verdict {
  if (i.observationsDays < VERDICT_MIN_DAYS || i.currentBani === null) return 'insufficient_data';
  // Integer comparisons (percent × bani): no float rounding at the thresholds.
  if (i.min30dBani !== null && i.currentBani * 100 <= i.min30dBani * Math.round(GOOD_PRICE_TOLERANCE * 100)) return 'good_price';
  if (i.median90dBani !== null && i.currentBani * 100 >= i.median90dBani * Math.round(ABOVE_USUAL_FACTOR * 100)) return 'above_usual';
  return 'usual';
}

/** Romanian explanation shown next to the verdict (factual, reproducible). */
export function verdictText(v: Verdict, observationsDays: number): string {
  switch (v) {
    case 'good_price':
      return 'Preț bun: cel mai mic din ultimele 30 de zile observate de Pretoscop.';
    case 'above_usual':
      return 'Peste obișnuit: cu cel puțin 8% peste mediana ultimelor 90 de zile.';
    case 'usual':
      return 'Preț obișnuit pentru acest produs în ultimele 90 de zile.';
    case 'insufficient_data':
      return observationsDays > 0
        ? `Istoric de ${observationsDays} ${observationsDays === 1 ? 'zi' : 'zile'}: prea scurt pentru o evaluare.`
        : 'Încă nu avem istoric pentru acest produs.';
  }
}

/**
 * Superseded for display by `verifiedDrop` (M15): `product_stats.min_30d` already includes today's
 * price, so this is never positive for the current price. Kept for the M08 tests and callers that
 * pass a minimum that excludes the current level.
 */
export function dropVersus30dMin(currentBani: number, min30dBani: number | null, observationsDays: number): number | null {
  if (observationsDays < VERDICT_MIN_DAYS || min30dBani === null || min30dBani <= 0) return null;
  const drop = (min30dBani - currentBani) / min30dBani;
  return drop > 0 ? drop : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}
