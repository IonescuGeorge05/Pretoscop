import { describe, expect, it } from 'vitest';
import {
  B2B_IMPORT_MAX_LINES,
  B2B_PLANS,
  baniToLeiString,
  bearerToken,
  computePosition,
  csvNumber,
  csvText,
  effectiveLimits,
  formatApiKey,
  medianBani,
  parseApiKey,
  parseB2bImport,
  pctOneDecimal,
  skuIdentity,
  splitDelimitedLine,
  toCsv,
} from './b2b';

describe('plans', () => {
  it('match docs/08 (Starter 200 SKUs without API, Pro 2,000 with API, Enterprise 10k)', () => {
    expect(B2B_PLANS.starter).toMatchObject({ skuLimit: 200, apiDailyQuota: 0, monthlyEurCents: 4900 });
    expect(B2B_PLANS.pro).toMatchObject({ skuLimit: 2000, monthlyEurCents: 14900 });
    expect(B2B_PLANS.pro.apiDailyQuota).toBeGreaterThan(0);
    expect(B2B_PLANS.enterprise.skuLimit).toBe(10_000);
    expect(B2B_PLANS.pilot.selfServe).toBe(false);
  });
  it('apply admin overrides, null keeps the plan', () => {
    expect(effectiveLimits('pro', { skuLimit: 50, apiDailyQuota: null })).toMatchObject({ skuLimit: 50, apiDailyQuota: 10_000 });
    expect(effectiveLimits('starter', { apiDailyQuota: 0 }).apiDailyQuota).toBe(0);
  });
});

describe('parseB2bImport', () => {
  it('reads columns by header, any delimiter, Romanian names and prices', () => {
    const r = parseB2bImport('Cod intern;EAN;Marcă;Cod producător;Denumire;Preț\nA-1;8806095426280;Samsung;SM-S931B;Galaxy S25;"3.999,90"\n');
    expect(r.errors).toEqual([]);
    expect(r.columns).toEqual(['ref', 'gtin', 'brand', 'mpn', 'label', 'price']);
    expect(r.lines).toEqual([
      { line: 2, gtin: '08806095426280', mpn: 'SMS931B', mpnRaw: 'SM-S931B', brand: 'Samsung', ref: 'A-1', label: 'Galaxy S25', referencePriceBani: 399990, errors: [] },
    ]);
  });
  it('reads tab- and comma-separated lists with quotes', () => {
    expect(parseB2bImport('gtin\tsku\n4006381333931\tX').lines[0]).toMatchObject({ gtin: '04006381333931', ref: 'X' });
    expect(parseB2bImport('mpn,name\n"AB-12,3","Cablu ""USB"""').lines[0]).toMatchObject({ mpn: 'AB123', label: 'Cablu "USB"' });
  });
  it('without a header reads one code per line: valid GTINs, else MPNs (numeric part codes too)', () => {
    const r = parseB2bImport('﻿8806095426280\r\n\r\nMQ6T3RX/A\n12345678\n');
    expect(r.columns).toEqual([]);
    expect(r.lines.map((l) => [l.line, l.gtin, l.mpn])).toEqual([
      [1, '08806095426280', null],
      [3, null, 'MQ6T3RXA'],
      [4, null, '12345678'],
    ]);
  });
  it('reports bad lines without dropping the good ones', () => {
    const r = parseB2bImport('gtin,mpn,pret\n5901234123458,,\n,,10\n,XY-99,abc\n4006381333931,,"1.299,00 lei"');
    expect(r.lines.map((l) => l.errors.length > 0)).toEqual([true, true, true, false]);
    expect(r.lines[0]!.errors[0]).toMatch(/GTIN invalid/);
    expect(r.lines[1]!.errors).toEqual(['Lipsește GTIN-ul sau MPN-ul.']);
    expect(r.lines[2]!.errors[0]).toMatch(/Preț de necitit/);
    expect(r.lines[3]!.referencePriceBani).toBe(129900);
  });
  it('needs a code column when a header is given, refuses empty and oversized lists', () => {
    expect(parseB2bImport('nume,pret\nx,1').errors[0]).toMatch(/GTIN\/EAN/);
    expect(parseB2bImport(' \n\n').errors).toEqual(['Lista este goală.']);
    expect(parseB2bImport(Array.from({ length: B2B_IMPORT_MAX_LINES + 1 }, () => 'ABC123').join('\n')).errors[0]).toMatch(/cel mult/);
  });
  it('caps field length and normalizes cedilla diacritics', () => {
    const r = parseB2bImport(`mpn,nume\nABC123,${'ş'.repeat(300)}`);
    expect(r.lines[0]!.label).toBe('ș'.repeat(200));
  });
});

describe('splitDelimitedLine', () => {
  it('keeps delimiters inside quotes and trims cells', () => {
    expect(splitDelimitedLine(' a ; "b;c" ;""', ';')).toEqual(['a', 'b;c', '']);
  });
});

describe('skuIdentity', () => {
  it('prefers product, then GTIN, then folded brand + MPN', () => {
    expect(skuIdentity({ productId: 7, gtin: '1' })).toBe('product:7');
    expect(skuIdentity({ gtin: '08806095426280', mpn: 'X' })).toBe('gtin:08806095426280');
    expect(skuIdentity({ mpn: 'SMS931B', brand: 'Samsung Electronics' })).toBe('mpn:samsungelectronics:SMS931B');
    expect(skuIdentity({ mpn: 'SMS931B', brand: null })).toBe('mpn::SMS931B');
    expect(skuIdentity({})).toBeNull();
  });
});

describe('positions', () => {
  it('median of an even count rounds half up, odd count takes the middle', () => {
    expect(medianBani([300, 100, 200])).toBe(200);
    expect(medianBani([100, 201])).toBe(151);
    expect(medianBani([100, 200])).toBe(150);
    expect(medianBani([])).toBeNull();
  });
  it('percentages with one decimal and the right sign', () => {
    expect(pctOneDecimal(5, 100)).toBe(5);
    expect(pctOneDecimal(1, 3)).toBe(33.3);
    expect(pctOneDecimal(-1, 3)).toBe(-33.3);
    expect(pctOneDecimal(0, 3)).toBe(0);
    expect(pctOneDecimal(1, 0)).toBeNull();
  });
  it('ranks our price among competitors', () => {
    expect(computePosition(10_000, [9_000, 11_000, 12_000])).toEqual({ minBani: 9_000, medianBani: 11_000, competitors: 3, rank: 2, gapToMinPct: 11.1, status: 'above' });
    expect(computePosition(9_000, [9_000, 11_000])).toMatchObject({ rank: 1, status: 'tied', gapToMinPct: 0 });
    expect(computePosition(8_000, [9_000])).toMatchObject({ rank: 1, status: 'cheapest', gapToMinPct: -11.1 });
    expect(computePosition(8_000, [])).toEqual({ minBani: null, medianBani: null, competitors: 0, rank: 1, gapToMinPct: null, status: 'alone' });
    expect(computePosition(null, [9_000])).toMatchObject({ rank: null, status: 'no_price', minBani: 9_000 });
    expect(computePosition(null, [])).toMatchObject({ status: 'no_data' });
    expect(computePosition(null, [], true)).toMatchObject({ status: 'no_price' });
  });
});

describe('API keys', () => {
  const id = 'abcdefgh2345';
  const secret = 'A'.repeat(42) + '_';
  it('round-trips and rejects anything malformed', () => {
    const key = formatApiKey(id, secret);
    expect(key).toBe(`psk_${id}_${secret}`);
    expect(parseApiKey(key)).toEqual({ publicId: id, secret });
    for (const bad of [null, '', `psk_${id}_${secret}x`, `psx_${id}_${secret}`, `psk_${id.toUpperCase()}_${secret}`, `psk_${id}-${secret}`, `psk_abcdefgh2341_${secret}`, `psk_${id}_${'A'.repeat(42)}=`]) {
      expect(parseApiKey(bad), String(bad)).toBeNull();
    }
    expect(() => formatApiKey('short', secret)).toThrow();
  });
  it('reads Bearer tokens only', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer   abc  ')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe('CSV', () => {
  it('neutralizes formula triggers in text cells (OWASP), also after leading spaces', () => {
    for (const v of ['=1+1', '+40', '-2+3', '@SUM(A1)', '\t=x', '\r=x', '  =HYPERLINK("http://x")', '=cmd|" /C calc"!A0']) {
      expect(csvText(v).startsWith(`"'`), v).toBe(true);
    }
    expect(csvText('Samsung "Galaxy"')).toBe('"Samsung ""Galaxy"""');
    expect(csvText('a,b\nc')).toBe('"a,b\nc"');
    expect(csvText('')).toBe('');
    expect(csvText(null)).toBe('');
  });
  it('lets only plain decimals through as numbers', () => {
    expect(csvNumber('-12.50')).toBe('-12.50');
    expect(csvNumber(3)).toBe('3');
    expect(csvNumber(null)).toBe('');
    expect(csvNumber('=1+1')).toBe(`"'=1+1"`);
    expect(csvNumber(Number.NaN)).toBe('');
  });
  it('writes a BOM, a quoted header and CRLF lines', () => {
    expect(toCsv(['sku', 'pret'], [[{ text: 'A' }, { num: '1.00' }], [{ text: '=x' }, { num: null }]])).toBe('﻿"sku","pret"\r\n"A",1.00\r\n"\'=x",\r\n');
  });
  it('formats bani as lei decimals', () => {
    expect(baniToLeiString(123456)).toBe('1234.56');
    expect(baniToLeiString(5)).toBe('0.05');
    expect(baniToLeiString(-150)).toBe('-1.50');
    expect(baniToLeiString(null)).toBeNull();
  });
});
