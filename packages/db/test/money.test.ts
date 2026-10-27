import { describe, expect, it } from 'vitest';
import { baniToNumeric, numericToBani } from '../src/money';

describe('money conversions', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [99, '0.99'],
    [100, '1.00'],
    [123456, '1234.56'],
    [999999999999, '9999999999.99'],
    [-150, '-1.50'],
  ])('%i bani ↔ %s', (bani, numeric) => {
    expect(baniToNumeric(bani)).toBe(numeric);
    expect(numericToBani(numeric)).toBe(bani);
  });

  it('accepts one decimal and integers from the driver', () => {
    expect(numericToBani('12.5')).toBe(1250);
    expect(numericToBani('12')).toBe(1200);
    expect(numericToBani(null)).toBeNull();
  });

  it('rejects floats and garbage', () => {
    expect(() => baniToNumeric(1.5)).toThrow();
    expect(() => numericToBani('1,5')).toThrow();
  });
});
