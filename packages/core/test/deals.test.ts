import { describe, expect, it } from 'vitest';
import {
  allTimeLowExplanation,
  atThirtyDayLow,
  currentLevelStart,
  dropBadgeText,
  dropExplanation,
  dropPercentLabel,
  newAllTimeLow,
  verifiedDrop,
  type DailyMin,
} from '../src/deals';

const TODAY = '2026-11-20';
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Daily minimums from `from` days ago up to `to` days ago at `lei`. */
function run(from: number, to: number, lei: number): DailyMin[] {
  const out: DailyMin[] = [];
  for (let n = from; n >= to; n--) out.push({ day: day(n), bani: Math.round(lei * 100) });
  return out;
}

describe('verifiedDrop (badge rules, docs/03 §6.4)', () => {
  it('a drop 4 days ago below a 30-day reference of 2.000 lei is −15%', () => {
    const series = [...run(45, 5, 2000), ...run(4, 0, 1700)];
    const d = verifiedDrop({ today: TODAY, currentBani: 170_000, series });
    expect(d).toMatchObject({ since: day(4), referenceBani: 200_000, referenceFrom: day(34), referenceTo: day(5), referenceDays: 30, savedBani: 30_000 });
    expect(d!.pct).toBeCloseTo(0.15);
    expect(dropBadgeText(d!)).toBe('−15% față de minimul din 30 de zile');
    expect(dropExplanation(d!)).toContain('2.000,00 lei');
    expect(dropExplanation(d!)).toContain('1.700,00 lei');
  });

  it('no badge with fewer than 14 observed days in the reference window', () => {
    const series = [...run(17, 5, 2000), ...run(4, 0, 1700)]; // 13 days before the drop
    expect(verifiedDrop({ today: TODAY, currentBani: 170_000, series })).toBeNull();
    const sparse = [...run(40, 5, 2000).filter((_, i) => i % 3 === 0), ...run(4, 0, 1700)]; // 12 of 30 days
    expect(verifiedDrop({ today: TODAY, currentBani: 170_000, series: sparse })).toBeNull();
  });

  it('no badge for a product we observed for less than 14 days at all', () => {
    expect(verifiedDrop({ today: TODAY, currentBani: 90_000, series: [...run(10, 1, 1000), ...run(0, 0, 900)] })).toBeNull();
  });

  it('returning to an earlier low is not a drop (raise-then-cut)', () => {
    // 800 three weeks ago, raised to 1.000, back to 800 now: the reference is 800.
    const series = [...run(40, 21, 800), ...run(20, 3, 1000), ...run(2, 0, 800)];
    expect(verifiedDrop({ today: TODAY, currentBani: 80_000, series })).toBeNull();
  });

  it('below 3% is noise; exactly 3% counts', () => {
    const base = run(45, 1, 1000);
    expect(verifiedDrop({ today: TODAY, currentBani: 97_100, series: [...base, { day: TODAY, bani: 97_100 }] })).toBeNull();
    expect(verifiedDrop({ today: TODAY, currentBani: 97_000, series: [...base, { day: TODAY, bani: 97_000 }] })?.pct).toBeCloseTo(0.03);
  });

  it('a drop older than 30 days is today’s normal price, not a drop', () => {
    const series = [...run(80, 32, 2000), ...run(31, 0, 1700)];
    expect(verifiedDrop({ today: TODAY, currentBani: 170_000, series })).toBeNull();
  });

  it('a price that never was higher has no level start', () => {
    expect(currentLevelStart(TODAY, 100_000, run(40, 0, 1000))).toBeNull();
    expect(verifiedDrop({ today: TODAY, currentBani: 100_000, series: run(40, 0, 1000) })).toBeNull();
  });

  it('gaps are never filled: the level starts on the first observed day after the higher price', () => {
    const series = [...run(45, 8, 2000), ...run(3, 0, 1700)]; // days 7..4 not observed
    expect(currentLevelStart(TODAY, 170_000, series)).toBe(day(3));
  });

  it('rounds the percentage down, never up', () => {
    expect(dropPercentLabel(0.149)).toBe('14%');
    expect(dropPercentLabel(0.15)).toBe('15%');
  });
});

describe('newAllTimeLow', () => {
  it('needs a price below everything observed before the level started, and 14 days of history', () => {
    const series = [...run(45, 5, 2000), ...run(4, 0, 1700)];
    const a = newAllTimeLow({ today: TODAY, currentBani: 170_000, series });
    expect(a).toMatchObject({ previousLowBani: 200_000, historyDays: 41, since: day(4) });
    expect(allTimeLowExplanation(a!)).toContain('2.000,00 lei');
    // An older, lower price outside the loaded series rules it out.
    expect(newAllTimeLow({ today: TODAY, currentBani: 170_000, series, older: { lowBani: 160_000, days: 90 } })).toBeNull();
    // Too little history.
    expect(newAllTimeLow({ today: TODAY, currentBani: 170_000, series: [...run(12, 5, 2000), ...run(4, 0, 1700)] })).toBeNull();
  });
});

describe('atThirtyDayLow', () => {
  it('the lowest of 30 observed days with a real range, not a flat line', () => {
    expect(atThirtyDayLow({ today: TODAY, currentBani: 95_000, series: [...run(29, 10, 1000), ...run(9, 1, 950)] })).toMatchObject({ lowBani: 95_000, highBani: 100_000 });
    expect(atThirtyDayLow({ today: TODAY, currentBani: 100_000, series: run(29, 1, 1000) })).toBeNull();
    expect(atThirtyDayLow({ today: TODAY, currentBani: 96_000, series: [...run(29, 10, 1000), ...run(9, 1, 950)] })).toBeNull();
  });
});
