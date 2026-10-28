import { describe, expect, it } from 'vitest';
import {
  ALERT_COOLDOWN_HOURS,
  decideAlert,
  droppedEnough,
  inQuietHours,
  isPlausibleEmail,
  normalizeEmail,
  parseTargetPrice,
  type AlertState,
} from '../src/alerts';

const NOW = new Date('2026-11-06T10:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const best = (totalBani: number, crossShopMedianBani: number | null = null) => ({ offerId: 7, totalBani, crossShopMedianBani });

const below = (over: Partial<AlertState> = {}): AlertState => ({
  kind: 'below',
  targetBani: 200_000,
  baselineBani: null,
  armed: true,
  lastNotifiedAt: null,
  lastNotifiedBani: null,
  ...over,
});
const anyDrop = (over: Partial<AlertState> = {}): AlertState => ({
  kind: 'any_drop',
  targetBani: null,
  baselineBani: 250_000,
  armed: true,
  lastNotifiedAt: null,
  lastNotifiedBani: null,
  ...over,
});

describe('decideAlert: below a target', () => {
  it('stays quiet above the target and notifies at or under it', () => {
    expect(decideAlert(below(), best(200_001), NOW)).toEqual({ action: 'none', why: 'not_met' });
    expect(decideAlert(below(), best(200_000), NOW)).toEqual({ action: 'notify', reason: 'below_target', referenceBani: 200_000 });
    expect(decideAlert(below(), best(150_000), NOW)).toMatchObject({ action: 'notify', reason: 'below_target' });
  });

  it('after a notification, the same total (or a tiny change) is not news', () => {
    const notified = below({ armed: false, lastNotifiedAt: hoursAgo(48), lastNotifiedBani: 199_000 });
    expect(decideAlert(notified, best(199_000), NOW)).toEqual({ action: 'none', why: 'already_notified' });
    expect(decideAlert(notified, best(198_000), NOW)).toEqual({ action: 'none', why: 'already_notified' }); // −0.5%
  });

  it('a further drop of at least 1% under the last notified total is news (after the cooldown)', () => {
    const notified = below({ armed: false, lastNotifiedAt: hoursAgo(48), lastNotifiedBani: 199_000 });
    expect(decideAlert(notified, best(197_010), NOW)).toEqual({ action: 'notify', reason: 'lower_below_target', referenceBani: 199_000 });
    const recent = { ...notified, lastNotifiedAt: hoursAgo(3) };
    expect(decideAlert(recent, best(150_000), NOW)).toEqual({ action: 'none', why: 'cooldown' });
  });

  it('re-arms when the total goes back above the target, then notifies the next crossing', () => {
    const notified = below({ armed: false, lastNotifiedAt: hoursAgo(30), lastNotifiedBani: 199_000 });
    expect(decideAlert(notified, best(210_000), NOW)).toEqual({ action: 'rearm' });
    const rearmed = { ...notified, armed: true };
    expect(decideAlert(rearmed, best(199_000), NOW)).toMatchObject({ action: 'notify', reason: 'below_target' });
  });

  it('respects the 24-hour cooldown even for a new crossing', () => {
    const rearmed = below({ armed: true, lastNotifiedAt: hoursAgo(ALERT_COOLDOWN_HOURS - 1), lastNotifiedBani: 199_000 });
    expect(decideAlert(rearmed, best(190_000), NOW)).toEqual({ action: 'none', why: 'cooldown' });
    const later = { ...rearmed, lastNotifiedAt: hoursAgo(ALERT_COOLDOWN_HOURS) };
    expect(decideAlert(later, best(190_000), NOW)).toMatchObject({ action: 'notify' });
  });

  it('never re-arms or notifies without an eligible offer (a stale shop is not a price change)', () => {
    expect(decideAlert(below({ armed: false, lastNotifiedBani: 199_000 }), null, NOW)).toEqual({ action: 'none', why: 'no_offer' });
  });

  it('refuses an invalid target', () => {
    expect(decideAlert(below({ targetBani: null }), best(100), NOW)).toEqual({ action: 'none', why: 'invalid' });
  });
});

describe('decideAlert: any drop', () => {
  it('sets the baseline when none is known yet, without notifying', () => {
    expect(decideAlert(anyDrop({ baselineBani: null }), best(240_000), NOW)).toEqual({ action: 'set_baseline', baselineBani: 240_000 });
  });

  it('notifies a drop of at least 1% under the baseline, not less', () => {
    expect(decideAlert(anyDrop(), best(247_600), NOW)).toEqual({ action: 'none', why: 'not_met' }); // −0.96%
    expect(decideAlert(anyDrop(), best(247_500), NOW)).toEqual({ action: 'notify', reason: 'drop', referenceBani: 250_000 }); // −1%
    expect(decideAlert(anyDrop(), best(260_000), NOW)).toEqual({ action: 'none', why: 'not_met' });
  });

  it('measures later drops against the last notified total (never against a higher price)', () => {
    const notified = anyDrop({ lastNotifiedAt: hoursAgo(30), lastNotifiedBani: 230_000 });
    expect(decideAlert(notified, best(240_000), NOW)).toEqual({ action: 'none', why: 'not_met' }); // went up again
    expect(decideAlert(notified, best(230_000), NOW)).toEqual({ action: 'none', why: 'not_met' }); // same as told
    expect(decideAlert(notified, best(227_000), NOW)).toEqual({ action: 'notify', reason: 'drop', referenceBani: 230_000 });
  });

  it('waits out the cooldown', () => {
    const notified = anyDrop({ lastNotifiedAt: hoursAgo(2), lastNotifiedBani: 230_000 });
    expect(decideAlert(notified, best(200_000), NOW)).toEqual({ action: 'none', why: 'cooldown' });
  });
});

describe('decideAlert: mismatch guard', () => {
  it('never notifies a total under 30% of the cross-shop median', () => {
    expect(decideAlert(below(), best(50_000, 250_000), NOW)).toEqual({ action: 'none', why: 'suspicious' });
    expect(decideAlert(anyDrop(), best(70_000, 250_000), NOW)).toEqual({ action: 'none', why: 'suspicious' });
    expect(decideAlert(below(), best(80_000, 250_000), NOW)).toMatchObject({ action: 'notify' });
  });
});

describe('droppedEnough', () => {
  it('uses exact integer arithmetic at the 1% threshold', () => {
    expect(droppedEnough(99, 100)).toBe(true);
    expect(droppedEnough(100, 100)).toBe(false);
    expect(droppedEnough(9_900, 10_000)).toBe(true);
    expect(droppedEnough(9_901, 10_000)).toBe(false);
  });
});

describe('parseTargetPrice', () => {
  it('reads Romanian amounts', () => {
    expect(parseTargetPrice('1.999', null)).toEqual({ ok: true, bani: 199_900 });
    expect(parseTargetPrice('1999,99', null)).toEqual({ ok: true, bani: 199_999 });
    expect(parseTargetPrice('2.000 lei', null)).toEqual({ ok: true, bani: 200_000 });
    expect(parseTargetPrice(' 1 999 ', null)).toEqual({ ok: true, bani: 199_900 });
    expect(parseTargetPrice('2,5', null)).toEqual({ ok: true, bani: 250 });
  });

  it('refuses empty, invalid, too small, too large and not-below-current targets', () => {
    expect(parseTargetPrice('', null)).toEqual({ ok: false, error: 'empty' });
    expect(parseTargetPrice(undefined, null)).toEqual({ ok: false, error: 'empty' });
    expect(parseTargetPrice('abc', null)).toEqual({ ok: false, error: 'invalid' });
    expect(parseTargetPrice('100-200', null)).toEqual({ ok: false, error: 'invalid' });
    expect(parseTargetPrice('0', null)).toEqual({ ok: false, error: 'too_low' });
    expect(parseTargetPrice('0,50', null)).toEqual({ ok: false, error: 'too_low' });
    expect(parseTargetPrice('99999999', null)).toEqual({ ok: false, error: 'too_high' });
    expect(parseTargetPrice('2.100', 209_999)).toEqual({ ok: false, error: 'not_below_current' });
    expect(parseTargetPrice('2.099,99', 209_999)).toEqual({ ok: false, error: 'not_below_current' });
    expect(parseTargetPrice('2.099,98', 209_999)).toEqual({ ok: true, bani: 209_998 });
  });
});

describe('quiet hours and email helpers', () => {
  it('treats 22:00–08:00 Romania time as quiet (summer and winter time)', () => {
    expect(inQuietHours(new Date('2026-11-06T06:30:00Z'))).toBe(false); // 08:30 EET
    expect(inQuietHours(new Date('2026-11-06T05:59:00Z'))).toBe(true); // 07:59 EET
    expect(inQuietHours(new Date('2026-11-06T19:59:00Z'))).toBe(false); // 21:59 EET
    expect(inQuietHours(new Date('2026-11-06T20:00:00Z'))).toBe(true); // 22:00 EET
    expect(inQuietHours(new Date('2026-07-01T04:59:00Z'))).toBe(true); // 07:59 EEST
    expect(inQuietHours(new Date('2026-07-01T05:00:00Z'))).toBe(false); // 08:00 EEST
  });

  it('normalizes and checks addresses', () => {
    expect(normalizeEmail('  Ana.Pop@Exemplu.RO ')).toBe('ana.pop@exemplu.ro');
    expect(isPlausibleEmail('ana@exemplu.ro')).toBe(true);
    expect(isPlausibleEmail('ana@exemplu')).toBe(false);
    expect(isPlausibleEmail('Ana <ana@exemplu.ro>')).toBe(false);
    expect(isPlausibleEmail('a,b@exemplu.ro')).toBe(false);
    expect(isPlausibleEmail(`${'x'.repeat(65)}@exemplu.ro`)).toBe(false);
  });
});
