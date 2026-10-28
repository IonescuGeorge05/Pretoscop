import { VERDICT_MIN_DAYS } from './verdict';

/**
 * Verified price drops and new all-time lows (M15, docs/03 §6.4, docs/07 §2.3). Inputs are our own
 * daily observations only: the product's daily minimum total (price + known delivery) of new,
 * in-stock offers sold by shops (the default chart series), in integer bani. Days we did not observe
 * are absent and never filled in.
 *
 * A drop is "verified" when:
 * 1. the current price level started on day S: S is the first observed day after the last observed
 *    day whose minimum was above today's price (so on every observed day since S the price was at
 *    or below today's);
 * 2. S is at most 30 days ago (older reductions are simply today's price, not news);
 * 3. we observed at least 14 of the 30 days before S (the reference window [S−30, S−1]);
 * 4. today's price is at least 3% below the lowest price of that window (the reference);
 * 5. on no observed day from S to today (today's own daily minimum included) was the price below
 *    today's: a partial rebound after a lower price, or a price that rose during the day, is not a
 *    drop, because we observed the lower price ourselves.
 * The badge then reads "−X% față de minimul din 30 de zile" and the explanation names the reference,
 * its window and S (the first day we observed the lower price: the drop itself may have happened on
 * an unobserved day before it). The shop's crossed price never enters this computation.
 *
 * A new all-time low additionally needs today's price strictly below every price we observed before S,
 * with at least 14 observed days before S, and rule 5.
 */

export interface DailyMin {
  /** ISO day (YYYY-MM-DD, Europe/Bucharest). */
  day: string;
  bani: number;
}

export const DROP_REFERENCE_DAYS = 30;
export const DROP_MIN_REFERENCE_DAYS = VERDICT_MIN_DAYS;
export const DROP_MIN_PCT = 0.03;
export const DROP_MAX_AGE_DAYS = 30;
/** Days of series a caller must load: the reference window plus the drop age, plus slack. */
export const DROP_LOOKBACK_DAYS = DROP_REFERENCE_DAYS + DROP_MAX_AGE_DAYS + 2;

const DAY = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export interface PriceDrop {
  /** Fraction, e.g. 0.15 for −15%. */
  pct: number;
  currentBani: number;
  /** Lowest price we observed in the 30 days before the drop. */
  referenceBani: number;
  referenceFrom: string;
  referenceTo: string;
  /** Observed days in the reference window. */
  referenceDays: number;
  /** First day at today's price level (S). */
  since: string;
  savedBani: number;
}

export interface DropInput {
  today: string;
  currentBani: number;
  /** Daily minimums, any order; days after `today` are ignored. */
  series: DailyMin[];
}

/** First day of today's price level, or null when we never saw a higher price in the series. */
export function currentLevelStart(today: string, currentBani: number, series: DailyMin[]): string | null {
  const days = series.filter((d) => d.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  let lastAbove = -1;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]!.bani > currentBani) {
      lastAbove = i;
      break;
    }
  }
  if (lastAbove < 0) return null;
  // The level starts on the next observed day, or today when the higher price was seen today
  // (the price fell during the day: our minimum for today already shows the old level too).
  return days[lastAbove + 1]?.day ?? today;
}

/** True when we observed a price below `currentBani` on a day from `since` to `today` (rule 5). */
function lowerSeenSince(series: DailyMin[], since: string, today: string, currentBani: number): boolean {
  return series.some((d) => d.day >= since && d.day <= today && d.bani < currentBani);
}

export function verifiedDrop(i: DropInput): PriceDrop | null {
  const since = currentLevelStart(i.today, i.currentBani, i.series);
  if (!since || daysBetween(since, i.today) > DROP_MAX_AGE_DAYS) return null;
  if (lowerSeenSince(i.series, since, i.today, i.currentBani)) return null;
  const referenceFrom = addDays(since, -DROP_REFERENCE_DAYS);
  const referenceTo = addDays(since, -1);
  const window = i.series.filter((d) => d.day >= referenceFrom && d.day <= referenceTo);
  if (window.length < DROP_MIN_REFERENCE_DAYS) return null;
  const referenceBani = Math.min(...window.map((d) => d.bani));
  if (referenceBani <= 0) return null;
  const pct = (referenceBani - i.currentBani) / referenceBani;
  // Integer comparison at the threshold (no float rounding): current ≤ 97% of the reference.
  if (i.currentBani * 100 > referenceBani * Math.round((1 - DROP_MIN_PCT) * 100)) return null;
  return {
    pct,
    currentBani: i.currentBani,
    referenceBani,
    referenceFrom,
    referenceTo,
    referenceDays: window.length,
    since,
    savedBani: referenceBani - i.currentBani,
  };
}

export interface AllTimeLow {
  previousLowBani: number;
  /** Observed days before the current level started. */
  historyDays: number;
  since: string;
}

export interface AllTimeLowInput extends DropInput {
  /** Lowest daily minimum and number of observed days older than the loaded series (if any). */
  older?: { lowBani: number | null; days: number } | null;
}

/** Today's price is below every price we ever observed before the current level started. */
export function newAllTimeLow(i: AllTimeLowInput): AllTimeLow | null {
  const since = currentLevelStart(i.today, i.currentBani, i.series);
  if (!since || daysBetween(since, i.today) > DROP_MAX_AGE_DAYS) return null;
  if (lowerSeenSince(i.series, since, i.today, i.currentBani)) return null;
  const before = i.series.filter((d) => d.day < since);
  const olderDays = i.older?.days ?? 0;
  const historyDays = before.length + olderDays;
  if (historyDays < VERDICT_MIN_DAYS) return null;
  const lows = before.map((d) => d.bani);
  if (i.older?.lowBani !== null && i.older?.lowBani !== undefined) lows.push(i.older.lowBani);
  const previousLowBani = Math.min(...lows);
  return i.currentBani < previousLowBani ? { previousLowBani, historyDays, since } : null;
}

/**
 * At its 30-day low without being a verified drop: today's price is the lowest of the last 30 observed
 * days (≥ 14 of them before today; today's own daily minimum counts too, so a price that rose during
 * the day is not "at its low") while the window also shows a price at least 5% higher, i.e. not a
 * flat line.
 */
export function atThirtyDayLow(i: DropInput): { lowBani: number; highBani: number; days: number } | null {
  const from = addDays(i.today, -29);
  const win = i.series.filter((d) => d.day >= from && d.day < i.today);
  if (win.length < VERDICT_MIN_DAYS) return null;
  const todayRow = i.series.find((d) => d.day === i.today);
  const low = Math.min(...win.map((d) => d.bani));
  const high = Math.max(...win.map((d) => d.bani));
  if (i.currentBani > low || (todayRow && i.currentBani > todayRow.bani)) return null;
  if (high * 100 < i.currentBani * 105) return null;
  return { lowBani: low, highBani: high, days: win.length };
}

const pctFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const lei = (bani: number) =>
  `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions).format(bani / 100)} lei`;
/** "14 zile", "41 de zile" (Romanian: numbers ending in 20–99 or 00 take "de"). */
const zile = (n: number) => (n === 1 ? '1 zi' : n % 100 >= 1 && n % 100 <= 19 ? `${n} zile` : `${n} de zile`);
const roDay = (day: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** Whole percent, never rounded up past the truth: 0.149 → "14%". */
export function dropPercentLabel(pct: number): string {
  return `${pctFmt.format(Math.floor(pct * 100 + 1e-9))}%`;
}

/** "−15% față de minimul din 30 de zile" */
export function dropBadgeText(d: Pick<PriceDrop, 'pct'>): string {
  return `−${dropPercentLabel(d.pct)} față de minimul din 30 de zile`;
}

/** The factual sentence behind the badge (shown next to it, and as its tooltip). */
export function dropExplanation(d: PriceDrop): string {
  return `Prețul total de acum (${lei(d.currentBani)}) este cu ${dropPercentLabel(d.pct)} sub cel mai mic preț observat de Pretoscop în cele 30 de zile dinaintea scăderii (${lei(d.referenceBani)}, între ${roDay(d.referenceFrom)} și ${roDay(d.referenceTo)}). Am observat prețul mai mic începând cu ${roDay(d.since)}.`;
}

export function allTimeLowExplanation(a: AllTimeLow): string {
  return `Cel mai mic preț total observat de Pretoscop pentru acest produs: înainte de ${roDay(a.since)}, minimul din ${zile(a.historyDays)} observate era ${lei(a.previousLowBani)}.`;
}
