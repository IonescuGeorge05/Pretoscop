import { describe, expect, it } from 'vitest';
import {
  baniToDecimalString,
  decimalStringToBani,
  formatLei,
  isBani,
  leiToBani,
  mulDivRound,
  sumBani,
} from './money';

describe('bani ⇄ numeric(12,2) strings', () => {
  it('converts bani to decimal strings', () => {
    expect(baniToDecimalString(123456)).toBe('1234.56');
    expect(baniToDecimalString(5)).toBe('0.05');
    expect(baniToDecimalString(0)).toBe('0.00');
    expect(baniToDecimalString(-150)).toBe('-1.50');
    expect(baniToDecimalString(999_999_999_999)).toBe('9999999999.99');
  });

  it('converts decimal strings to bani', () => {
    expect(decimalStringToBani('1234.56')).toBe(123456);
    expect(decimalStringToBani('1234.5')).toBe(123450);
    expect(decimalStringToBani('1234')).toBe(123400);
    expect(decimalStringToBani('-0.05')).toBe(-5);
    expect(decimalStringToBani(' 12.500 ')).toBe(1250);
  });

  it('refuses silent rounding and garbage', () => {
    expect(() => decimalStringToBani('1.234')).toThrow(/more than two decimals/);
    expect(() => decimalStringToBani('1.234,56')).toThrow(/not a decimal/);
    expect(() => decimalStringToBani('')).toThrow();
    expect(() => baniToDecimalString(1.5)).toThrow(/integer/);
  });

  it('round-trips every amount', () => {
    for (const v of [0, 1, 9, 10, 99, 100, 101, 123456, 999_999_999_999, -1, -123456]) {
      expect(decimalStringToBani(baniToDecimalString(v))).toBe(v);
    }
  });

  it('converts JSON lei numbers to bani without float artefacts', () => {
    expect(leiToBani(19.99)).toBe(1999);
    expect(leiToBani(0.1 + 0.2)).toBe(30);
    expect(leiToBani(250)).toBe(25000);
    expect(leiToBani(1.005)).toBe(101);
    expect(leiToBani(-2.5)).toBe(-250);
    expect(() => leiToBani(Number.NaN)).toThrow();
  });

  it('isBani accepts only safe integers', () => {
    expect(isBani(100)).toBe(true);
    expect(isBani(1.5)).toBe(false);
    expect(isBani('100')).toBe(false);
  });
});

describe('formatLei', () => {
  it('uses Romanian separators', () => {
    expect(formatLei(123456)).toBe('1.234,56 lei');
    expect(formatLei(5)).toBe('0,05 lei');
    expect(formatLei(100)).toBe('1,00 lei');
    expect(formatLei(123456789)).toBe('1.234.567,89 lei');
    expect(formatLei(-123456)).toBe('-1.234,56 lei');
  });

  it('can drop ,00 or the unit', () => {
    expect(formatLei(123400, { decimals: 'auto' })).toBe('1.234 lei');
    expect(formatLei(123456, { decimals: 'auto' })).toBe('1.234,56 lei');
    expect(formatLei(123456, { decimals: 'never' })).toBe('1.235 lei');
    expect(formatLei(123456, { unit: false })).toBe('1.234,56');
    expect(formatLei(99900, { nbsp: true })).toBe('999,00\u{A0}lei');
  });
});

describe('integer arithmetic helpers', () => {
  it('sums bani', () => {
    expect(sumBani(100, 250, 1)).toBe(351);
    expect(() => sumBani(1, 0.5)).toThrow();
  });

  it('multiplies with round-half-up', () => {
    expect(mulDivRound(100, 121n, 100n)).toBe(121);
    expect(mulDivRound(1, 1n, 2n)).toBe(1);
    expect(mulDivRound(-1, 1n, 2n)).toBe(-1);
    expect(mulDivRound(333, 1n, 3n)).toBe(111);
  });
});
