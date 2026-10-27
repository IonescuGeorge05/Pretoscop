/**
 * Unit helpers shared by text matching and attribute extraction. Pure.
 */

/** What kind of screen a centimetre diagonal in a title refers to. */
export type ScreenContext = 'tv' | 'monitor' | 'laptop';

/**
 * Detects whether a (folded, lower-case) title is about a TV, a monitor or a laptop, the only
 * products whose titles give the diagonal in centimetres. Other titles use cm for widths and
 * heights (fridges, hobs, cables), which must never become screen sizes.
 */
export function screenContextOf(foldedLower: string): ScreenContext | null {
  if (
    /\b(?:televizor|televizoare|televiziune)\b|^(?:smart |led |oled |qled )?tv\b/.test(foldedLower)
  ) {
    return 'tv';
  }
  if (
    /^(?:monitor|display)\b|\bmonitor (?:gaming|led|ips|curbat|lcd|oled|portabil)\b/.test(
      foldedLower,
    )
  ) {
    return 'monitor';
  }
  if (/\b(?:laptop|notebook|ultrabook|macbook|chromebook)\b/.test(foldedLower)) return 'laptop';
  return null;
}

/** Marketed TV diagonals in inches (39" and 49" omitted: they collide with 40"/50" listings). */
export const TV_SIZES_IN: readonly number[] = [
  19, 20, 22, 24, 28, 32, 40, 42, 43, 48, 50, 55, 58, 60, 65, 70, 75, 77, 82, 83, 85, 86, 98, 100,
  115,
];

/** Marketed monitor diagonals in inches. */
export const MONITOR_SIZES_IN: readonly number[] = [
  21.5, 23.8, 24, 24.5, 25, 27, 28, 31.5, 32, 34, 38, 40, 42, 43, 45, 48, 49, 55, 57,
];

const CM_PER_INCH = 2.54;

function nearest(cm: number, sizes: readonly number[], toleranceCm: number): number | null {
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const size of sizes) {
    const diff = Math.abs(size * CM_PER_INCH - cm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  return bestDiff <= toleranceCm ? best : null;
}

/**
 * Converts a diagonal in centimetres to inches the way shops mean it: TVs snap to the nearest
 * marketed size within 3 cm (138 cm → 55, 108 cm → 43), monitors within 1 cm, laptops round to one
 * decimal (39.6 cm → 15.6). Returns null outside plausible ranges.
 */
export function cmToScreenInches(cm: number, context: ScreenContext): number | null {
  if (!Number.isFinite(cm) || cm <= 0) return null;
  const exact = cm / CM_PER_INCH;
  if (context === 'tv') {
    if (cm < 40 || cm > 300) return null;
    return nearest(cm, TV_SIZES_IN, 3) ?? Math.round(exact);
  }
  if (context === 'monitor') {
    if (cm < 30 || cm > 150) return null;
    return nearest(cm, MONITOR_SIZES_IN, 1) ?? Math.round(exact * 10) / 10;
  }
  if (cm < 25 || cm > 50) return null;
  return Math.round(exact * 10) / 10;
}

/** Parses "6,7" or "6.7" into 6.7; returns NaN for anything else. */
export function parseDecimal(raw: string): number {
  const s = raw.replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}
