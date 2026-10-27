import { describe, expect, it } from 'vitest';
import { agrees, belowCrossShopFloor, breakerTripped, checkAgainstMedian, looksLikeHexJunk } from '../src/anomaly';
import { coverage, discountFacts, type OfferDay } from '../src/discount';
import { computeVerdict, dropVersus30dMin, median, verdictText } from '../src/verdict';

describe('verdict', () => {
  const base = { currentBani: 100_000, min30dBani: 100_000, median90dBani: 110_000, observationsDays: 30 };
  it('needs 14 days', () => {
    expect(computeVerdict({ ...base, observationsDays: 13 })).toBe('insufficient_data');
    expect(computeVerdict({ ...base, currentBani: null })).toBe('insufficient_data');
  });
  it('good price within 1% of the 30-day minimum', () => {
    expect(computeVerdict(base)).toBe('good_price');
    expect(computeVerdict({ ...base, currentBani: 101_000 })).toBe('good_price');
    expect(computeVerdict({ ...base, currentBani: 101_100 })).toBe('usual');
  });
  it('above usual at ≥ 8% over the 90-day median', () => {
    expect(computeVerdict({ ...base, currentBani: 118_800, min30dBani: 90_000 })).toBe('above_usual');
    expect(computeVerdict({ ...base, currentBani: 118_700, min30dBani: 90_000 })).toBe('usual');
  });
  it('explains itself in Romanian', () => {
    expect(verdictText('insufficient_data', 5)).toBe('Istoric de 5 zile: prea scurt pentru o evaluare.');
    expect(verdictText('insufficient_data', 1)).toContain('1 zi');
    expect(verdictText('good_price', 40)).toMatch(/Preț bun/);
  });
  it('drop versus the 30-day minimum is shown only with ≥ 14 days', () => {
    expect(dropVersus30dMin(90_000, 100_000, 20)).toBeCloseTo(0.1);
    expect(dropVersus30dMin(90_000, 100_000, 13)).toBeNull();
    expect(dropVersus30dMin(110_000, 100_000, 20)).toBeNull();
  });
  it('median of bani', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});

function series(from: string, days: number, price: (i: number) => number | null): OfferDay[] {
  const out: OfferDay[] = [];
  for (let i = 0; i < days; i++) {
    const p = price(i);
    if (p !== null) out.push({ day: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), priceBani: p });
  }
  return out;
}

describe('discount facts', () => {
  const today = '2026-12-01';
  it('flags a reference price above our 30-day low before the cut', () => {
    // 60 days at 1,000 lei, cut to 900 lei on 2026-11-28 with a "reference" of 1,299 lei.
    const history = series('2026-10-02', 60, (i) => (i < 57 ? 100_000 : 90_000));
    const facts = discountFacts({ today, currentBani: 90_000, referenceBani: 129_900, reductionStartedOn: '2026-11-28', history, offerAgeDays: 60, crossShopMedianBani: 95_000 });
    expect(facts.map((f) => f.kind)).toContain('reference_not_supported');
    expect(facts.find((f) => f.kind === 'reference_not_supported')?.text).toContain('1.299,00 lei');
  });

  it('flags raise-then-cut', () => {
    // 30 days at 1,000, then 25 days raised to 1,200, now "cut" back to 1,000.
    const history = series('2026-10-02', 60, (i) => (i < 31 ? 100_000 : i < 57 ? 120_000 : 100_000));
    const facts = discountFacts({ today, currentBani: 100_000, referenceBani: 120_000, reductionStartedOn: '2026-11-28', history, offerAgeDays: 60, crossShopMedianBani: null });
    expect(facts.map((f) => f.kind)).toContain('raise_then_cut');
  });

  it('flags a phantom old price only with 90 days of coverage', () => {
    const history = series('2026-09-01', 91, () => 100_000);
    const f = discountFacts({ today, currentBani: 95_000, referenceBani: 140_000, reductionStartedOn: null, history, offerAgeDays: 91, crossShopMedianBani: null });
    expect(f.map((x) => x.kind)).toContain('phantom_old_price');
    const young = discountFacts({ today, currentBani: 95_000, referenceBani: 140_000, reductionStartedOn: null, history, offerAgeDays: 60, crossShopMedianBani: null });
    expect(young.map((x) => x.kind)).not.toContain('phantom_old_price');
  });

  it('flags a big claimed discount at or above the market median', () => {
    const f = discountFacts({ today, currentBani: 100_000, referenceBani: 160_000, reductionStartedOn: null, history: [], offerAgeDays: 40, crossShopMedianBani: 98_000 });
    expect(f.map((x) => x.kind)).toEqual(['market_irrelevant_discount']);
  });

  it('says nothing in the first 30 days or with gaps in coverage', () => {
    const history = series('2026-10-02', 60, (i) => (i % 2 === 0 ? 100_000 : null));
    expect(coverage(history, '2026-10-02', '2026-11-30')).toBeLessThan(0.7);
    expect(discountFacts({ today, currentBani: 90_000, referenceBani: 129_900, reductionStartedOn: '2026-11-28', history, offerAgeDays: 60, crossShopMedianBani: null })).toEqual([]);
    expect(discountFacts({ today, currentBani: 90_000, referenceBani: 300_000, reductionStartedOn: null, history: [], offerAgeDays: 10, crossShopMedianBani: 50_000 })).toEqual([]);
  });
});

describe('anomaly guards', () => {
  it('quarantines ×3 / ÷3 moves and recognises separator bugs', () => {
    expect(checkAgainstMedian(100_000, 100_000)).toEqual({ action: 'accept' });
    expect(checkAgainstMedian(100_000, null)).toEqual({ action: 'accept' });
    const q = checkAgainstMedian(1_000, 100_000);
    expect(q.action).toBe('quarantine');
    expect(q.action === 'quarantine' && q.reason).toMatch(/separator/);
    expect(checkAgainstMedian(400_000, 100_000).action).toBe('quarantine');
  });
  it('agreement within 2%', () => {
    expect(agrees(100_000, 101_500)).toBe(true);
    expect(agrees(100_000, 103_000)).toBe(false);
  });
  it('cross-shop floor', () => {
    expect(belowCrossShopFloor(20_000, 100_000)).toBe(true);
    expect(belowCrossShopFloor(40_000, 100_000)).toBe(false);
    expect(belowCrossShopFloor(1, null)).toBe(false);
  });
  it('run breaker needs ≥ 20 compared offers and > 20% big moves', () => {
    const calm = Array.from({ length: 30 }, () => ({ previousBani: 100_000, newBani: 101_000 }));
    expect(breakerTripped(calm).tripped).toBe(false);
    const wild = [...calm.slice(0, 20), ...Array.from({ length: 10 }, () => ({ previousBani: 100_000, newBani: 10_000 }))];
    expect(breakerTripped(wild)).toMatchObject({ tripped: true, moved: 10, compared: 30 });
    expect(breakerTripped(wild.slice(-10)).tripped).toBe(false);
  });
  it('random-hex junk titles (cel.ro bot trap)', () => {
    expect(looksLikeHexJunk('a3f9c2e17b 4be81f00c2')).toBe(true);
    expect(looksLikeHexJunk('Telefon Samsung Galaxy S25 SM-S931B')).toBe(false);
  });
});
