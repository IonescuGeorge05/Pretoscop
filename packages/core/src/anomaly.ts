/**
 * Anomaly guards (M08, docs/03 §6.4). Pure decisions; the worker applies them.
 */

/** Ratio of a new price to the offer's 14-day median beyond which we quarantine. */
export const QUARANTINE_HIGH = 3;
export const QUARANTINE_LOW = 0.33;
/** Two observations agree when within 2% of each other. */
export const AGREEMENT_TOLERANCE = 0.02;
/** Below this share of the product's cross-shop median, an offer goes back to the matcher. */
export const CROSS_SHOP_FLOOR = 0.3;
/** Run-level breaker: more than 20% of the offers in a batch moved by more than 50%. */
export const BREAKER_SHARE = 0.2;
export const BREAKER_MOVE = 0.5;
export const BREAKER_MIN_BATCH = 20;

export type PriceCheck =
  | { action: 'accept' }
  | { action: 'quarantine'; ratio: number; reason: string };

/** Compare a new observation with the offer's 14-day median (null when we have no history). */
export function checkAgainstMedian(newBani: number, median14dBani: number | null): PriceCheck {
  if (median14dBani === null || median14dBani <= 0) return { action: 'accept' };
  const ratio = newBani / median14dBani;
  if (ratio > QUARANTINE_HIGH || ratio < QUARANTINE_LOW) {
    const decimalBug = [10, 100, 1000].some((f) => Math.abs(ratio - f) / f < 0.05 || Math.abs(1 / ratio - f) / f < 0.05);
    return {
      action: 'quarantine',
      ratio,
      reason: `price ratio ${ratio.toFixed(2)} vs 14-day median${decimalBug ? ' (looks like a decimal/thousands separator error)' : ''}`,
    };
  }
  return { action: 'accept' };
}

export function agrees(aBani: number, bBani: number): boolean {
  return Math.abs(aBani - bBani) <= Math.max(aBani, bBani) * AGREEMENT_TOLERANCE;
}

/** An offer whose total is below 30% of the product's cross-shop median is probably mismatched. */
export function belowCrossShopFloor(totalBani: number, crossShopMedianBani: number | null): boolean {
  return crossShopMedianBani !== null && crossShopMedianBani > 0 && totalBani < crossShopMedianBani * CROSS_SHOP_FLOOR;
}

/** Run-level breaker over (previous, new) price pairs of a batch. */
export function breakerTripped(pairs: Array<{ previousBani: number | null; newBani: number }>): { tripped: boolean; share: number; moved: number; compared: number } {
  const compared = pairs.filter((p) => p.previousBani !== null && p.previousBani > 0);
  const moved = compared.filter((p) => Math.abs(p.newBani - p.previousBani!) / p.previousBani! > BREAKER_MOVE).length;
  const share = compared.length === 0 ? 0 : moved / compared.length;
  return { tripped: compared.length >= BREAKER_MIN_BATCH && share > BREAKER_SHARE, share, moved, compared: compared.length };
}

/** cel.ro serves fake products with random hex names to bots behind its captcha: never ingest them. */
export function looksLikeHexJunk(title: string): boolean {
  const tokens = title.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hex = tokens.filter((t) => /^[0-9a-f]{6,}$/i.test(t) && /\d/.test(t) && /[a-f]/i.test(t));
  return hex.length / tokens.length >= 0.5;
}
