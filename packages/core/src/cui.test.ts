import { describe, expect, it } from 'vitest';
import { cuiControlDigit, validateCui } from './cui';

describe('validateCui', () => {
  it.each([
    ['14399840', '14399840', false], // Dante International (eMAG)
    ['RO14399840', '14399840', true],
    ['ro 14399840', '14399840', true],
    ['2864518', '2864518', false], // Altex Romania
    ['RO 2864518', '2864518', true],
  ])('accepts %s', (input, cui, vatPrefix) => {
    expect(validateCui(input)).toEqual({ ok: true, cui, vatPrefix });
  });

  it('rejects a wrong control digit, bad formats and lengths', () => {
    expect(validateCui('14399841')).toMatchObject({ ok: false, reason: 'checksum' });
    expect(validateCui('2864517')).toMatchObject({ ok: false, reason: 'checksum' });
    expect(validateCui('RO12AB')).toMatchObject({ ok: false, reason: 'format' });
    expect(validateCui('1')).toMatchObject({ ok: false, reason: 'length' });
    expect(validateCui('12345678901')).toMatchObject({ ok: false, reason: 'length' });
    expect(validateCui('  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateCui(null)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('computes the control digit, mapping a remainder of 10 to 0', () => {
    expect(cuiControlDigit('1439984')).toBe(0);
    expect(cuiControlDigit('286451')).toBe(8);
    // Search a body whose weighted sum × 10 leaves remainder 10, and check that it maps to 0.
    const body = Array.from({ length: 2000 }, (_, i) => String(i + 10)).find((b) => {
      const padded = b.padStart(9, '0');
      const sum = [...padded].reduce((s, d, i) => s + Number(d) * [7, 5, 3, 2, 1, 7, 5, 3, 2][i]!, 0);
      return (sum * 10) % 11 === 10;
    });
    expect(body).toBeDefined();
    expect(cuiControlDigit(body!)).toBe(0);
    expect(validateCui(`${body}0`).ok).toBe(true);
  });
});
