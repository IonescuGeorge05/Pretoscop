import { describe, expect, it } from 'vitest';
import { extractMpnCandidates, normalizeMpn } from './mpn';

const best = (title: string, productCode?: string): string | null =>
  extractMpnCandidates(title, { productCode: productCode ?? null })[0]?.norm ?? null;
const all = (title: string): string[] => extractMpnCandidates(title).map((c) => c.norm);

describe('normalizeMpn', () => {
  it('upper-cases and strips separators', () => {
    expect(normalizeMpn('MXU23ZD/A')).toBe('MXU23ZDA');
    expect(normalizeMpn('cfi-2016')).toBe('CFI2016');
    expect(normalizeMpn('SM-S938BZKDEUE')).toBe('SMS938BZKDEUE');
    expect(normalizeMpn(' ECAM 220.21.B ')).toBe('ECAM22021B');
    expect(normalizeMpn('rb34c632esa_ef')).toBe('RB34C632ESAEF');
  });

  it('drops placeholders and too-short values', () => {
    for (const v of [
      '',
      '  ',
      'N/A',
      'n.a.',
      '-',
      'none',
      'Generic',
      '0000',
      'AB',
      null,
      undefined,
    ]) {
      expect(normalizeMpn(v), String(v)).toBeNull();
    }
  });
});

describe('extractMpnCandidates', () => {
  it.each([
    ['Consola Sony PlayStation 5 Slim, 1TB, CFI-2016', 'CFI2016'],
    ['Telefon Apple iPhone 16 128GB Black MXU23ZD/A', 'MXU23ZDA'],
    ['Televizor Samsung UE55DU7172UXXH, 138 cm', 'UE55DU7172UXXH'],
    ['Televizor LED Samsung 55DU7172, 138 cm, Smart, 4K Ultra HD, Clasa G', '55DU7172'],
    ['Telefon mobil Samsung Galaxy S25, SM-S938BZKDEUE', 'SMS938BZKDEUE'],
    ['Masina de spalat rufe Arctic APL81222XLAB4, 8 kg, 1200 RPM', 'APL81222XLAB4'],
    ['Laptop ASUS Vivobook 16 X1605VA cu procesor Intel Core i5-13420H', 'X1605VA'],
    ["Espressor automat De'Longhi ECAM220.21.B, 1450 W", 'ECAM22021B'],
    ['Aer conditionat Daikin Sensira FTXF35E, 12000 BTU', 'FTXF35E'],
    ['Cafetiera Russell Hobbs Heaven 26960-56, 1.25 l', '2696056'],
    ['Mouse Logitech G502 X Plus 910-006162', '910006162'],
    ['Televizor LED Philips 50PUS8009/12, 126 cm', '50PUS800912'],
  ])('%s → %s', (title, expected) => {
    expect(best(title)).toBe(expected);
  });

  it('excludes units, specs, CPU and GPU models, chipsets and model names', () => {
    expect(
      all(
        'Laptop Gaming, Intel Core i7-13650HX, AMD Ryzen 7 7840HS, 9800X3D, RTX4070, RTX 4070 Ti, 16GB, 512GB, 55inch, 4K, 5G, WiFi6, Wi-Fi 6E, USB-C, DDR5, LPDDR5X, M.2, A+++, 2x16GB, 10-core, 256-bit, 144Hz, 5000mAh, HDR10+, IP68, CL30, B650-A, Fold7, Watch8, HERO13, 2024, 3-pack, 2.8K, 1080p, x360, Gen5, 13th',
      ),
    ).toEqual([]);
  });

  it('requires mixed letters and digits and at least 5 characters (4 with a separator)', () => {
    expect(all('Router TP-Link Archer AX55')).toEqual([]);
    expect(all('Telefon vivo X200 FE')).toEqual([]);
    expect(all('Cooler Noctua NH-D15')).toEqual(['NHD15']);
    expect(all('Placa de par Remington S9100')).toEqual(['S9100']);
  });

  it('keeps short slash suffixes but not lists of short tokens', () => {
    expect(all('Volan Logitech G923 pentru PS5/PS4/PC')).toEqual([]);
    expect(all('Curea 42/44/45/46mm')).toEqual([]);
    expect(all('Telefon 8GB/256GB')).toEqual([]);
    expect(best('Combina Samsung RB34C632ESA/EF, 344 l')).toBe('RB34C632ESAEF');
  });

  it('ranks a trailing "cod produs" code first', () => {
    expect(best('Laptop Lenovo IdeaPad Slim 3 15ABR8, 8GB', '82XM00F2RM')).toBe('82XM00F2RM');
    expect(best('Laptop Lenovo IdeaPad Slim 3 15ABR8, 8GB')).toBe('15ABR8');
  });

  it('skips the brand itself and deduplicates', () => {
    expect(
      extractMpnCandidates('Casti JBL T520BT T520BT', { brand: 'JBL' }).map((c) => c.norm),
    ).toEqual(['T520BT']);
    expect(extractMpnCandidates('Lenovo LOQ 15IAX9', { brand: 'Lenovo' })[0]?.source).toBe('title');
    expect(extractMpnCandidates(null)).toEqual([]);
  });
});
