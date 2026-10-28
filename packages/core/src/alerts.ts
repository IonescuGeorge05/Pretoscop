/**
 * Price-alert rules (M19, docs/03 §6.5). Pure decisions in integer bani; the worker reads the
 * state, asks `decideAlert`, and applies the answer with a compare-and-set on that same state, so a
 * job delivered twice never sends twice.
 *
 * - 'below': notify when the best total is at or under the target; then stay quiet until the total
 *   goes back above the target (re-armed) or drops at least 1% under the last notified total.
 * - 'any_drop': notify when the best total is at least 1% under the last total we told the user
 *   about (or, before the first notification, the best total when the alert was confirmed).
 * - At most one notification per alert per 24 hours; never twice for the same total.
 * - "Best total" comes only from fresh, in-stock, new, shop-sold offers without a pending
 *   quarantine (the query in packages/db), and a total under 30% of the product's cross-shop
 *   median is treated as a probable mismatch, never notified.
 */
import { belowCrossShopFloor } from './anomaly';
import { parsePriceRon } from './price';

export type AlertKind = 'below' | 'any_drop';

/** Minimum drop for 'any_drop' and for a second notification of a 'below' alert: 1%. */
export const ALERT_MIN_DROP_PERCENT = 1;
/** At most one notification per alert in this window. */
export const ALERT_COOLDOWN_HOURS = 24;
/** A pending alert (double opt-in not done) is deleted after this many days. */
export const ALERT_CONFIRM_TTL_DAYS = 7;
/** Push and Telegram messages wait for the morning between these hours (Europe/Bucharest). */
export const QUIET_HOURS = { from: 22, to: 8 } as const;
/** Largest target we accept (just under the numeric(12,2) placeholder range of the parser). */
export const ALERT_MAX_TARGET_BANI = 99_999_999;

export interface AlertState {
  kind: AlertKind;
  targetBani: number | null;
  baselineBani: number | null;
  armed: boolean;
  lastNotifiedAt: Date | null;
  lastNotifiedBani: number | null;
}

export interface BestOfferForAlert {
  offerId: number;
  totalBani: number;
  /** Cross-shop median of the offer's product (≥ 2 shops), for the mismatch guard. */
  crossShopMedianBani: number | null;
}

export type AlertNotifyReason = 'below_target' | 'lower_below_target' | 'drop';
export type AlertQuietReason = 'no_offer' | 'not_met' | 'cooldown' | 'already_notified' | 'suspicious' | 'invalid';

export type AlertDecision =
  | { action: 'notify'; reason: AlertNotifyReason; referenceBani: number | null }
  | { action: 'set_baseline'; baselineBani: number }
  | { action: 'rearm' }
  | { action: 'none'; why: AlertQuietReason };

/** `total` is at least `ALERT_MIN_DROP_PERCENT` under `reference` (integer arithmetic). */
export function droppedEnough(totalBani: number, referenceBani: number): boolean {
  return totalBani * 100 <= referenceBani * (100 - ALERT_MIN_DROP_PERCENT);
}

function inCooldown(state: AlertState, now: Date): boolean {
  return state.lastNotifiedAt !== null && now.getTime() - state.lastNotifiedAt.getTime() < ALERT_COOLDOWN_HOURS * 3_600_000;
}

/** What to do with one active alert, given the best eligible offer right now. */
export function decideAlert(state: AlertState, best: BestOfferForAlert | null, now: Date = new Date()): AlertDecision {
  if (!best) return { action: 'none', why: 'no_offer' };
  if (belowCrossShopFloor(best.totalBani, best.crossShopMedianBani)) return { action: 'none', why: 'suspicious' };
  const total = best.totalBani;

  if (state.kind === 'below') {
    const target = state.targetBani;
    if (target === null || target <= 0) return { action: 'none', why: 'invalid' };
    if (total > target) return state.armed ? { action: 'none', why: 'not_met' } : { action: 'rearm' };
    if (state.armed) {
      if (inCooldown(state, now)) return { action: 'none', why: 'cooldown' };
      return { action: 'notify', reason: 'below_target', referenceBani: target };
    }
    // Already told the user it is under the target: only a further, real drop is news.
    if (state.lastNotifiedBani !== null && droppedEnough(total, state.lastNotifiedBani)) {
      if (inCooldown(state, now)) return { action: 'none', why: 'cooldown' };
      return { action: 'notify', reason: 'lower_below_target', referenceBani: state.lastNotifiedBani };
    }
    return { action: 'none', why: 'already_notified' };
  }

  const reference = state.lastNotifiedBani ?? state.baselineBani;
  if (reference === null) return { action: 'set_baseline', baselineBani: total };
  if (!droppedEnough(total, reference)) return { action: 'none', why: 'not_met' };
  if (inCooldown(state, now)) return { action: 'none', why: 'cooldown' };
  return { action: 'notify', reason: 'drop', referenceBani: reference };
}

export type TargetPriceError = 'empty' | 'invalid' | 'too_low' | 'too_high' | 'not_below_current';

/**
 * Parses the target typed in the alert form ("1.999", "1999,99", "2.000 lei"; Romanian separators)
 * into bani. A target at or above today's best total is refused: the alert would fire at once.
 */
export function parseTargetPrice(input: unknown, currentBestBani: number | null): { ok: true; bani: number } | { ok: false; error: TargetPriceError } {
  if (typeof input !== 'string' && typeof input !== 'number') return { ok: false, error: 'empty' };
  const text = String(input).trim();
  if (text === '') return { ok: false, error: 'empty' };
  const parsed = parsePriceRon(text, 'ro');
  if (!parsed.ok) return { ok: false, error: parsed.reason === 'zero' || parsed.reason === 'negative' ? 'too_low' : parsed.reason === 'placeholder' ? 'too_high' : 'invalid' };
  if (parsed.flags.includes('vat_excluded')) return { ok: false, error: 'invalid' };
  if (parsed.bani < 100) return { ok: false, error: 'too_low' };
  if (parsed.bani > ALERT_MAX_TARGET_BANI) return { ok: false, error: 'too_high' };
  if (currentBestBani !== null && parsed.bani >= currentBestBani) return { ok: false, error: 'not_below_current' };
  return { ok: true, bani: parsed.bani };
}

/** Hour of the day in Europe/Bucharest (0–23). */
export function bucharestHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(h);
}

/** True between 22:00 and 08:00 Romania time: push and Telegram notifications wait. */
export function inQuietHours(now: Date = new Date()): boolean {
  const h = bucharestHour(now);
  return h >= QUIET_HOURS.from || h < QUIET_HOURS.to;
}

/** Normalized email address for hashing and comparison (trimmed, lower case). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/** A plausible single address (RFC 5321 length limits; no display names or lists). */
export function isPlausibleEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 6 || e.length > 254) return false;
  const local = e.split('@')[0] ?? '';
  return local.length <= 64 && EMAIL_RE.test(e);
}
