import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatLei, formatLeiNumeric, formatLeiShort, formatRelative, plural, toBani } from '../format';

describe('Romanian formatting', () => {
  it('formats lei with dot thousands and comma decimals', () => {
    expect(formatLei(123456)).toBe('1.234,56 lei');
    expect(formatLei(99)).toBe('0,99 lei');
    expect(formatLei(1_000_000_00)).toBe('1.000.000,00 lei');
    expect(formatLeiShort(250000)).toBe('2.500 lei');
    expect(formatLeiShort(250050)).toBe('2.500,50 lei');
    expect(formatLeiNumeric('3170.99')).toBe('3.170,99 lei');
    expect(formatLei(null)).toBe('—');
  });

  it('converts numeric strings to bani without floats', () => {
    expect(toBani('0.07')).toBe(7);
    expect(toBani('1234.5')).toBe(123450);
    expect(toBani('abc')).toBeNull();
  });

  it('formats dates in Europe/Bucharest', () => {
    expect(formatDate('2026-10-27T22:30:00Z')).toBe('28 oct. 2026');
    expect(formatDateTime('2026-10-27T12:05:00Z')).toBe('27 oct. 2026, 14:05');
  });

  it('relative times in Romanian', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(formatRelative('2026-10-27T11:59:30Z', now)).toBe('chiar acum');
    expect(formatRelative('2026-10-27T09:00:00Z', now)).toBe('acum 3 ore');
    expect(formatRelative('2026-10-26T12:00:00Z', now)).toBe('ieri');
    expect(formatRelative('2026-10-24T12:00:00Z', now)).toBe('acum 3 zile');
  });

  it('Romanian plurals', () => {
    expect(plural(1, 'magazin', 'magazine')).toBe('1 magazin');
    expect(plural(3, 'magazin', 'magazine')).toBe('3 magazine');
    expect(plural(25, 'magazin', 'magazine')).toBe('25 de magazine');
    expect(plural(101, 'ofertă', 'oferte')).toBe('101 oferte');
  });
});
