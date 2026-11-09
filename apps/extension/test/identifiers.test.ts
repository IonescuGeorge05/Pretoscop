import { describe, expect, it } from 'vitest';
import { cleanBrand, cleanGtin, cleanMpn, gtinCheckOk, shopPageUrl, validateIds } from '../src/identifiers';
import { shopById, shopForHost } from '../src/shops';

const emag = shopById('emag')!;

describe('GTIN', () => {
  it('checks the GS1 check digit on 8, 12, 13 and 14 digits', () => {
    for (const ok of ['8806097640226', '4006381333931', '036000291452', '96385074', '08806097640226']) expect(gtinCheckOk(ok)).toBe(true);
    for (const bad of ['8806097640227', '0000000000000', '123', '880609764022a', '880609764022612']) expect(gtinCheckOk(bad)).toBe(false);
  });
  it('cleans spaces and dashes, refuses anything else', () => {
    expect(cleanGtin(' 880-6097 640226 ')).toBe('8806097640226');
    expect(cleanGtin(8806097640226)).toBe('8806097640226');
    expect(cleanGtin({})).toBeUndefined();
    expect(cleanGtin('EAN: 8806097640226')).toBeUndefined();
  });
});

describe('part numbers and brands', () => {
  it('keeps part numbers as stated, refuses markup, placeholders and odd lengths', () => {
    expect(cleanMpn('SM-A566BZKAEUE')).toBe('SM-A566BZKAEUE');
    expect(cleanMpn('MFYM4ZD/A')).toBe('MFYM4ZD/A');
    expect(cleanMpn('  DUAL-RTX3060-O12G-V2 ')).toBe('DUAL-RTX3060-O12G-V2');
    for (const bad of ['<script>', 'a', 'N/A', 'none', '0000', 'X'.repeat(65), 'SM\u0000A1', '-SM', 'SM"A1']) expect(cleanMpn(bad)).toBeUndefined();
  });
  it('keeps brand names, refuses placeholders, control characters and overlong text', () => {
    expect(cleanBrand('Samsung')).toBe('Samsung');
    expect(cleanBrand(' Bosch   Home ')).toBe('Bosch Home');
    for (const bad of ['', '   ', 'Generic', 'fără brand', 'N/A', '---', 'Sam\u0007sung', 'B'.repeat(81)]) expect(cleanBrand(bad)).toBeUndefined();
    expect(cleanBrand(42)).toBeUndefined();
  });
});

describe('shop addresses', () => {
  it('knows only the shops’ own hosts', () => {
    expect(shopForHost('www.emag.ro')?.id).toBe('emag');
    expect(shopForHost('EMAG.RO.')?.id).toBe('emag');
    expect(shopForHost('altex.ro')?.id).toBe('altex');
    expect(shopForHost('emag.ro.evil.example')).toBeNull();
    expect(shopForHost('fake-emag.ro')).toBeNull();
    expect(shopForHost('marketplace.emag.ro')).toBeNull();
  });
  it('keeps origin + path of a page of that shop only', () => {
    expect(shopPageUrl('https://www.emag.ro/x/pd/D1/?a=1#b', emag)).toBe('https://www.emag.ro/x/pd/D1/');
    expect(shopPageUrl('/x/pd/D1/', emag, 'https://www.emag.ro/y')).toBe('https://www.emag.ro/x/pd/D1/');
    for (const bad of ['javascript:alert(1)', 'https://u:p@www.emag.ro/x', 'https://www.altex.ro/x', 'ftp://www.emag.ro/x', `https://www.emag.ro/${'a'.repeat(2100)}`, 42]) {
      expect(shopPageUrl(bad, emag)).toBeUndefined();
    }
  });
});

describe('validateIds (what the background worker accepts from a content script)', () => {
  const url = 'https://www.emag.ro/x/pd/DF1MLR2BM/';
  it('accepts the four identifiers, cleaned', () => {
    expect(validateIds({ url, gtin: '8806097640226', brand: ' Samsung ', mpn: 'SM-S741BZVDEUE' }, emag)).toEqual({ url, gtin: '8806097640226', brand: 'Samsung', mpn: 'SM-S741BZVDEUE' });
    expect(validateIds({ url }, emag)).toEqual({ url });
  });
  it('refuses anything else: other fields, another shop, bad codes, a brand without part number', () => {
    expect(validateIds({ url, title: 'Telefon' }, emag)).toBeNull();
    expect(validateIds({ url, cookie: 'x' }, emag)).toBeNull();
    expect(validateIds({ url: 'https://www.altex.ro/x/cpd/A1/' }, emag)).toBeNull();
    expect(validateIds({ url, gtin: '8806097640227' }, emag)).toBeNull();
    expect(validateIds({ url, brand: 'Samsung' }, emag)).toBeNull();
    expect(validateIds({ url, mpn: 'SM-1' }, emag)).toBeNull();
    expect(validateIds({ gtin: '8806097640226' }, emag)).toBeNull();
    expect(validateIds([url], emag)).toBeNull();
    expect(validateIds(null, emag)).toBeNull();
  });
});
