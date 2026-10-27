import { describe, expect, it } from 'vitest';
import {
  convertToRonBani,
  detectVatMention,
  grossUpVat,
  normalizeCurrencyCode,
  parsePrice,
  parsePriceRon,
  parseShippingCost,
  vatRateAt,
} from './price';

const bani = (input: unknown, format?: 'ro' | 'decimal'): number | string => {
  const r = parsePriceRon(input, format);
  return r.ok ? r.bani : r.reason;
};
const flags = (input: unknown, format?: 'ro' | 'decimal'): string[] => {
  const r = parsePriceRon(input, format);
  return r.ok ? r.flags : [];
};

describe('parsePriceRon: accepted Romanian formats', () => {
  it.each([
    ['1.234,56 lei', 123456],
    ['1234.56 RON', 123456],
    ['1 234,56 Lei', 123456],
    ['1\u{A0}234,56 lei', 123456],
    ['1\u{202F}234,56 lei', 123456],
    ['1.299 Lei', 129900],
    ['1.234,5', 123450],
    ['19,99 lei', 1999],
    ['RON 1234.56', 123456],
    ['1.234,56lei', 123456],
    ['Preț: 1.299,99 lei (TVA inclus)', 129999],
    ['1.234.567,89 lei', 123456789],
    ['3,638.99 Lei', 363899],
    ['1,234,567', 123456700],
    ['1299.0000', 129900],
    ['1.299,- lei', 129900],
    ['1.299 lei -15%', 129900],
    ['&nbsp;1.234,56&nbsp;lei', 123456],
    ['999', 99900],
  ])('%s → %i bani', (input, expected) => {
    expect(bani(input)).toBe(expected);
  });

  it('accepts numbers as lei', () => {
    expect(bani(1234.56)).toBe(123456);
    expect(bani(19.99)).toBe(1999);
    expect(bani(1299)).toBe(129900);
  });

  it('marks "de la" prices as lower bounds', () => {
    expect(bani('de la 1.234 lei')).toBe(123400);
    expect(flags('de la 1.234 lei')).toContain('from');
  });
});

describe('parsePriceRon: separator disambiguation', () => {
  it('reads one separator followed by three digits as thousands without a format', () => {
    expect(bani('12.500')).toBe(1250000);
    expect(bani('1,299')).toBe(129900);
  });

  it('lets the declared format decide the ambiguous cases', () => {
    expect(bani('12.500', 'decimal')).toBe(1250);
    expect(bani('12.500', 'ro')).toBe(1250000);
    expect(bani('1234.50', 'decimal')).toBe(123450);
    expect(bani('1,234.56', 'decimal')).toBe(123456);
    expect(bani('1,299', 'decimal')).toBe(129900);
    expect(bani('1,299', 'ro')).toBe(130);
    expect(flags('1,299', 'ro')).toContain('rounded');
  });

  it('reads one separator followed by one or two digits as decimals', () => {
    expect(bani('19.99')).toBe(1999);
    expect(bani('1234,5')).toBe(123450);
  });

  it('falls back to the unambiguous reading when the declared format does not fit', () => {
    expect(bani('1234.56', 'ro')).toBe(123456);
    expect(flags('1234.56', 'ro')).toContain('format_mismatch');
    expect(bani('1.234,56', 'decimal')).toBe(123456);
    expect(flags('1.234,56', 'decimal')).toContain('format_mismatch');
  });

  it('rounds extra decimals only when a format is declared', () => {
    expect(bani('12.3456')).toBe('unparseable');
    expect(bani('12.3456', 'decimal')).toBe(1235);
    expect(bani('1234.567')).toBe('unparseable');
    expect(bani('9.999', 'decimal')).toBe(1000);
  });

  it('accepts eMAG split cents but not a flattened string', () => {
    expect(bani('1.234<sup>99</sup> Lei')).toBe(123499);
    expect(flags('1.234<sup>99</sup> Lei')).toContain('split_cents');
    expect(bani('<p class="product-new-price">2.199<sup>99</sup> <span>Lei</span></p>')).toBe(
      219999,
    );
    expect(bani('1.234 99 Lei')).toBe(123499);
    expect(bani('1.23499')).toBe('unparseable');
  });

  it('does not mistake a space thousands group for cents', () => {
    expect(bani('1 234')).toBe(123400);
    expect(bani('12 500 lei')).toBe(1250000);
  });
});

describe('parsePriceRon: rejections', () => {
  it.each([
    ['1.000 - 2.000 lei', 'range'],
    ['1.000 lei - 2.000 lei', 'range'],
    ['intre 1.000 si 2.000 lei', 'range'],
    ['de la 1.000 pana la 2.000 lei', 'range'],
    ['99 lei/lună', 'instalment'],
    ['99 lei / luna', 'instalment'],
    ['12 rate x 99 lei', 'instalment'],
    ['Rate de la 99 lei', 'instalment'],
    ['3 x 333 lei', 'instalment'],
    ['12,99 lei/kg', 'unit_price'],
    ['', 'empty'],
    ['lei', 'empty'],
    ['   ', 'empty'],
    ['0 lei', 'zero'],
    ['0,00', 'zero'],
    ['-5 lei', 'negative'],
    ['9.999.999 lei', 'placeholder'],
    ['999.999 lei', 'placeholder'],
    ['12.345.678,00 lei', 'placeholder'],
    ['99 €', 'currency'],
    ['99 EUR', 'currency'],
    ['1.299,99 lei 1.499,99 lei', 'multiple_numbers'],
    ['1.2.3', 'unparseable'],
  ])('%s → %s', (input, reason) => {
    expect(bani(input)).toBe(reason);
  });

  it('rejects null, undefined, negative and non-finite numbers', () => {
    expect(bani(null)).toBe('empty');
    expect(bani(undefined)).toBe('empty');
    expect(bani(-3)).toBe('negative');
    expect(bani(Number.NaN)).toBe('unparseable');
    expect(bani(0)).toBe('zero');
  });

  it('flags prices of at most one leu and implausibly high prices', () => {
    expect(bani('1 leu')).toBe(100);
    expect(flags('1 leu')).toContain('below_min');
    expect(flags('0,99 lei')).toContain('below_min');
    expect(flags('1,01 lei')).not.toContain('below_min');
    expect(flags('1.500.000 lei')).toContain('suspicious_high');
    expect(bani('99.999 lei')).toBe(9999900);
  });

  it('flags prices stated without VAT', () => {
    expect(flags('1.299,99 lei fără TVA')).toContain('vat_excluded');
    expect(flags('1.299,99 lei + TVA')).toContain('vat_excluded');
    expect(flags('1.299,99 lei')).not.toContain('vat_excluded');
  });
});

describe('parsePrice with currencies', () => {
  it('detects the currency in the text', () => {
    expect(parsePrice('99,90 €')).toEqual({ ok: true, minor: 9990, currency: 'EUR', flags: [] });
    expect(parsePrice('1.299 Lei')).toMatchObject({ ok: true, minor: 129900, currency: 'RON' });
  });

  it('uses the declared currency when the text has none', () => {
    expect(parsePrice('99.90', { currency: 'EUR', format: 'decimal' })).toMatchObject({
      ok: true,
      minor: 9990,
      currency: 'EUR',
    });
    expect(parsePrice('99.90', { currency: 'lei' })).toMatchObject({ currency: 'RON' });
  });

  it('rejects conflicting or unknown currencies', () => {
    expect(parsePrice('99 €', { currency: 'RON' })).toMatchObject({
      ok: false,
      reason: 'currency_mismatch',
    });
    expect(parsePrice('1.000 lei sau 200 €')).toMatchObject({
      ok: false,
      reason: 'currency_mismatch',
    });
    expect(parsePrice('99', { currency: 'monede' })).toMatchObject({
      ok: false,
      reason: 'currency',
    });
  });

  it('normalizes currency codes', () => {
    expect(normalizeCurrencyCode('lei')).toBe('RON');
    expect(normalizeCurrencyCode(' ron ')).toBe('RON');
    expect(normalizeCurrencyCode('ROL')).toBe('RON');
    expect(normalizeCurrencyCode('€')).toBe('EUR');
    expect(normalizeCurrencyCode('Euro')).toBe('EUR');
    expect(normalizeCurrencyCode('usd')).toBe('USD');
    expect(normalizeCurrencyCode('huf')).toBe('HUF');
    expect(normalizeCurrencyCode('')).toBeNull();
    expect(normalizeCurrencyCode('abcd')).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
  });
});

describe('parseShippingCost', () => {
  it('reads free shipping and costs', () => {
    expect(parseShippingCost('Gratuit')).toMatchObject({ ok: true, minor: 0 });
    expect(parseShippingCost('Livrare gratuită')).toMatchObject({ ok: true, minor: 0 });
    expect(parseShippingCost('0 lei')).toMatchObject({ ok: true, minor: 0 });
    expect(parseShippingCost(0)).toMatchObject({ ok: true, minor: 0 });
    expect(parseShippingCost('19,99 lei')).toMatchObject({ ok: true, minor: 1999 });
    expect(parseShippingCost('0,99 lei')).toMatchObject({ ok: true, minor: 99, flags: [] });
  });

  it('does not read a free-shipping rule as a cost', () => {
    expect(parseShippingCost('Livrare gratuită peste 200 lei')).toMatchObject({
      ok: false,
      reason: 'unparseable',
    });
  });
});

describe('VAT', () => {
  it('switches from 19% to 21% at midnight Bucharest time on 1 August 2025', () => {
    expect(vatRateAt(new Date('2025-07-31T20:59:59Z'))).toBe(19);
    expect(vatRateAt(new Date('2025-07-31T21:00:00Z'))).toBe(21);
    expect(vatRateAt(new Date('2026-10-27T12:00:00Z'))).toBe(21);
    expect(vatRateAt(new Date('2024-01-15T12:00:00Z'))).toBe(19);
  });

  it('knows the older standard rates', () => {
    expect(vatRateAt(new Date('2016-06-01T12:00:00Z'))).toBe(20);
    expect(vatRateAt(new Date('2012-06-01T12:00:00Z'))).toBe(24);
    expect(vatRateAt(new Date('2009-06-01T12:00:00Z'))).toBe(19);
    expect(() => vatRateAt(new Date('nope'))).toThrow();
  });

  it('grosses up net amounts with the rate of the observation date', () => {
    expect(grossUpVat(100000, new Date('2026-10-27T12:00:00Z'))).toBe(121000);
    expect(grossUpVat(99, new Date('2026-10-27T12:00:00Z'))).toBe(120);
    expect(grossUpVat(100, new Date('2024-01-01T12:00:00Z'))).toBe(119);
  });

  it('detects VAT statements', () => {
    expect(detectVatMention('Preț fără TVA')).toBe('excluded');
    expect(detectVatMention('pret fara tva')).toBe('excluded');
    expect(detectVatMention('1.000 lei + TVA')).toBe('excluded');
    expect(detectVatMention('exclusiv T.V.A.')).toBe('excluded');
    expect(detectVatMention('TVA neinclus')).toBe('excluded');
    expect(detectVatMention('Prețul nu include TVA')).toBe('excluded');
    expect(detectVatMention('TVA inclus')).toBe('included');
    expect(detectVatMention('preț cu TVA')).toBe('included');
    expect(detectVatMention('Avantaj client')).toBeNull();
    expect(detectVatMention(null)).toBeNull();
  });
});

describe('convertToRonBani', () => {
  it('converts with the BNR rate and rounds half-up', () => {
    expect(convertToRonBani(9990, 'EUR', 5.3487)).toBe(53434);
    expect(convertToRonBani(100, 'eur', 5)).toBe(500);
  });

  it('passes RON through and requires a rate for anything else', () => {
    expect(convertToRonBani(123456, 'RON', null)).toBe(123456);
    expect(convertToRonBani(123456, 'lei', undefined)).toBe(123456);
    expect(() => convertToRonBani(100, 'EUR', undefined)).toThrow(/rate/);
    expect(() => convertToRonBani(100, 'EUR', 0)).toThrow(/rate/);
  });
});
