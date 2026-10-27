import { describe, expect, it } from 'vitest';
import {
  extractGtins,
  gtinCheckDigit,
  isValidGtinCheckDigit,
  normalizeGtin,
  summarizeGtins,
  validateGtin,
} from './gtin';

/** Deterministic PRNG (mulberry32) so the property tests are reproducible without a library. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDigits(rand: () => number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String(Math.floor(rand() * 10));
  return s;
}

describe('check digit', () => {
  it('computes the GS1 mod-10 check digit', () => {
    expect(gtinCheckDigit('590123412345')).toBe(7);
    expect(gtinCheckDigit('071171957703')).toBe(4);
    expect(gtinCheckDigit('9638507')).toBe(4); // GTIN-8 96385074
    expect(isValidGtinCheckDigit('5901234123457')).toBe(true);
    expect(isValidGtinCheckDigit('5901234123458')).toBe(false);
    expect(isValidGtinCheckDigit('12345')).toBe(false);
  });

  it('property: every valid check digit is accepted and every single-digit corruption rejected', () => {
    // Failures are collected in plain loops (one expect at the end) so the ~150k checks stay fast.
    const rand = prng(20261027);
    const failures: string[] = [];
    let corruptions = 0;
    for (let n = 0; n < 1500; n++) {
      const bodyLength = [7, 11, 12, 13][n % 4] as number;
      const body = randomDigits(rand, bodyLength);
      const code = `${body}${gtinCheckDigit(body)}`;
      const r = validateGtin(code);
      if (!isValidGtinCheckDigit(code) || r.quality === 'invalid') failures.push(`valid ${code}`);
      for (let i = 0; i < code.length; i++) {
        for (let d = 0; d <= 9; d++) {
          if (String(d) === code[i]) continue;
          const corrupted = `${code.slice(0, i)}${d}${code.slice(i + 1)}`;
          if (isValidGtinCheckDigit(corrupted) || validateGtin(corrupted).quality === 'valid') {
            failures.push(`corrupted ${corrupted} (from ${code})`);
          }
          corruptions++;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(corruptions).toBeGreaterThan(100_000);
  }, 30_000);
});

describe('validateGtin', () => {
  it('accepts GTIN-8/12/13/14 and pads to 14 digits', () => {
    expect(validateGtin('4006381333931')).toEqual({
      gtin14: '04006381333931',
      quality: 'valid',
      kind: 'gtin13',
    });
    expect(validateGtin('0711719577034')).toMatchObject({
      gtin14: '00711719577034',
      quality: 'valid',
    });
    expect(validateGtin('711719577034')).toMatchObject({
      gtin14: '00711719577034',
      quality: 'valid',
      kind: 'gtin12',
    });
    expect(validateGtin('96385074')).toMatchObject({
      gtin14: '00000096385074',
      quality: 'valid',
      kind: 'gtin8',
    });
    expect(validateGtin('15901234123454')).toMatchObject({ quality: 'valid', kind: 'gtin14' });
  });

  it('ignores spaces, dashes and dots', () => {
    expect(normalizeGtin('400 6381 33393 1')).toBe('04006381333931');
    expect(normalizeGtin('400-6381-33393-1')).toBe('04006381333931');
    expect(normalizeGtin(' 0711719577034 ')).toBe('00711719577034');
    expect(normalizeGtin(711719577034)).toBe('00711719577034');
  });

  it('recovers leading zeros lost in spreadsheets', () => {
    // 0711719577034 saved as a number loses its leading zero; the check digit still validates.
    expect(validateGtin('711719577034').gtin14).toBe('00711719577034');
  });

  it('reports missing, malformed and bad check digits', () => {
    expect(validateGtin(undefined)).toEqual({ gtin14: null, quality: 'missing', reason: 'empty' });
    expect(validateGtin('  ')).toMatchObject({ quality: 'missing' });
    expect(validateGtin('12345')).toMatchObject({ quality: 'invalid', reason: 'malformed' });
    expect(validateGtin('59012341234AB')).toMatchObject({
      quality: 'invalid',
      reason: 'malformed',
    });
    expect(validateGtin('5.90123E+12')).toMatchObject({
      quality: 'invalid',
      reason: 'scientific_notation',
    });
    expect(validateGtin('5901234123458')).toMatchObject({
      quality: 'invalid',
      reason: 'bad_check_digit',
    });
    expect(validateGtin('123456789012345')).toMatchObject({
      quality: 'invalid',
      reason: 'malformed',
    });
  });

  it.each([
    ['0000000000000', 'all_zeros'],
    ['00000000', 'all_zeros'],
    ['1234567890123', 'sequence'],
    ['1234567890128', 'sequence'],
    ['0123456789012', 'sequence'],
    ['012345678905', 'sequence'],
    ['9876543210987', 'sequence'],
    ['12345670', 'sequence'],
    ['5555555555555', 'repeated_digit'],
    ['1111111111116', 'repeated_digit'],
    ['5901234123457', 'known_fake'],
    ['5000000000005', 'repeated_digit'],
    ['4006381333931', null],
  ])('detects placeholder %s', (code, reason) => {
    const r = validateGtin(code);
    if (reason === null) expect(r.quality).toBe('valid');
    else expect(r).toMatchObject({ quality: 'placeholder', reason });
  });

  it('keeps the GTIN-14 of a placeholder only when its check digit is right', () => {
    expect(validateGtin('0000000000000').gtin14).toBe('00000000000000');
    expect(validateGtin('1234567890123').gtin14).toBeNull();
  });

  it('applies the global, per-shop and extra fake lists', () => {
    const withFake = (code: string, opts = {}) => validateGtin(code, opts);
    expect(withFake('4006381333931')).toMatchObject({ quality: 'valid' });
    expect(withFake('4006381333931', { extraFakes: ['4006381333931'] })).toMatchObject({
      quality: 'placeholder',
      reason: 'known_fake',
    });
    expect(withFake('05901234123457')).toMatchObject({ reason: 'known_fake' });
  });

  it.each([
    ['0273519482609', 'rcn_region'],
    ['2073519482603', 'rcn_region'],
    ['2973519482606', 'rcn_region'],
    ['0473519482603', 'rcn_company'],
    ['0573519482600', 'coupon'],
    ['9527351948269', 'demo'],
    ['9807351948262', 'refund_receipt'],
    ['9873519482602', 'coupon'],
    ['9997351948260', 'coupon'],
    ['97351948260138', 'variable_measure'],
    ['02735191', 'rcn8'],
    ['20735197', 'rcn8'],
  ])('flags restricted prefix %s as %s', (code, reason) => {
    expect(isValidGtinCheckDigit(code)).toBe(true);
    expect(validateGtin(code)).toMatchObject({ quality: 'restricted', reason });
  });

  it('accepts ISBN, ISSN and Romanian (594) codes', () => {
    expect(validateGtin('9789734650002')).toMatchObject({ quality: 'valid', bookland: true });
    expect(validateGtin('9771234567003')).toMatchObject({ quality: 'valid', bookland: true });
    expect(validateGtin('5947351948269')).toMatchObject({ quality: 'valid' });
    expect(validateGtin('5947351948269').bookland).toBeUndefined();
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(validateGtin('0-306-40615-2')).toMatchObject({
      gtin14: '09780306406157',
      quality: 'valid',
      convertedFrom: 'isbn10',
    });
    expect(validateGtin('080442957X')).toMatchObject({
      gtin14: '09780804429573',
      quality: 'valid',
    });
    expect(validateGtin('080442957Y')).toMatchObject({ quality: 'invalid' });
  });

  it('EAN-8 prefixes outside the RCN-8 ranges are valid', () => {
    expect(isValidGtinCheckDigit('40123455')).toBe(true);
    expect(validateGtin('40123455')).toMatchObject({ quality: 'valid', kind: 'gtin8' });
  });
});

describe('extractGtins and summarizeGtins', () => {
  it('splits lists and keeps a spaced single code together', () => {
    const list = extractGtins('5901234123457, 4006381333931;0711719577034');
    expect(list.map((r) => r.gtin14)).toEqual([
      '05901234123457',
      '04006381333931',
      '00711719577034',
    ]);
    expect(extractGtins('590 1234 12345 7')).toHaveLength(1);
    expect(extractGtins('5901234123457 4006381333931')).toHaveLength(2);
    expect(extractGtins(['5901234123457', '05901234123457'])).toHaveLength(1);
    expect(extractGtins(null)).toEqual([]);
  });

  it('prefers the first valid code and reports the most informative failure', () => {
    const s = summarizeGtins(extractGtins('0000000000000, 4006381333931, 0711719577034'));
    expect(s.primary.gtin14).toBe('04006381333931');
    expect(s.alternates).toEqual(['00711719577034']);
    const bad = summarizeGtins(extractGtins('5901234123458, 0000000000000'));
    expect(bad.primary.quality).toBe('placeholder');
    expect(summarizeGtins([]).primary.quality).toBe('missing');
  });
});
