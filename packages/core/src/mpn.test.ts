import { describe, expect, it } from 'vitest';
import { extractMpnCandidates, isSpecToken, mpnHintOf, normalizeMpn } from './mpn';

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

  // Live eMAG run, 2026-10-27: specs and chips the first version took for part numbers.
  it.each([
    'Laptop 14" cu procesor Intel Celeron J4105, 8GB RAM, 128GB SSD',
    'Laptop Xiaman 14, Intel Atom A3950, 12GB RAM, SSD 256GB',
    'Laptop AUUSDA, Procesor AMD 3 3250C(pana la 3.6 GHz), 16GB RAM',
    'Consola retro portabila R36S 64GB cu jocuri, quad core Cortex-A53 1.5GHz, 1GB DDR3L',
    'Consola retro portabila R36S, CPU RK3326, GPU MALI-G31MP2, 1GB DDR3L',
    'Consola portabila jocuri, NUODWELL, Acumulator 1500 mah, ABS, 17.5x7.5cm, Gri',
    'Consola de jocuri, Evercade, VS-R, Full HD 1080p, dimensiuni 197x126x48mm',
    'Telefon mobil iHunt Primo 4G, Dual SIM, Ecran 2.4-inch, Butoane Mari',
    'Mini Laptop 8" 2-in-1, Laptop Computer Win 11, Intel N95(up to 3.4GHz)',
    'Kiano Slim TV Travel Televizor 19" | LED HD TV | Tuner DVB-T2/S2 | Negru |',
    'Laptop Blackview Acebook 10,16GB DDR4 512GB SSD+2TB TF',
    'Consola retro portabila R36S, Bedee, Doua carduri 32GB+128G',
    'Telefon mobil Blackview Wave 7C, 16GB+128GB（2TB TF),6.56"HD+ IPS',
    'Consola retro portabila R36TMAX, Bedee, 64GB',
    'Consolă de jocuri Bedee X12plus, 7 inch, 16GB, design ergonomic, multicolor',
    'Consola portabila gaming dual rocker gameplayer, Bedee®, X12-plus, 16 GB',
    'Laptop Energizer EnergyBook Pro cu procesor Intel® Pentium® Gold 6500Y',
    'Laptop Dell 16Inch Full HD+ 16GB RAM DDR5-SDRAM 512 GB SSD Wi-Fi 6E (802.11ax) Windows 11 Pro',
    'Laptop Auusda 15.6" cu procesor AMD Ryzen 3 3250 3.5GHz 8GB DDR4 512GB, WIFI6.Windows 11 Pro',
  ])('%s → no part number', (title) => {
    expect(all(title)).toEqual([]);
  });

  it('keeps model codes next to the filtered chips', () => {
    expect(best('Consola portabila retro ANBERNIC RG35XX H cu jocuri, quad core Cortex-A53')).toBe(
      'RG35XX',
    );
    expect(best('Laptop ASUS ExpertBook B1 B1503CVA cu procesor Intel Core 5 120U')).toBe(
      'B1503CVA',
    );
  });
});

describe('isSpecToken', () => {
  it.each(['67INCH', '2.4-inch', '175X75CM', '197X126X48MM', 'CORTEXA35', 'Cortex-A7', 'RK3326'])(
    '%s is a spec',
    (token) => {
      expect(isSpecToken(token)).toBe(true);
    },
  );

  it.each(['MALIG31MP2', 'J4105', 'DVB-T2', '16GB', '2-in-1'])('%s is a spec', (token) => {
    expect(isSpecToken(token)).toBe(true);
  });

  it.each(['UE43U8072HUXXH', 'NH.QSGEX.00H', 'B1503CVA', 'SM-S938BZKDEUE', '', null])(
    '%s is not a spec',
    (token) => {
      expect(isSpecToken(token)).toBe(false);
    },
  );
});

describe('mpnHintOf (URL slug tails, live eMAG run 2026-10-27)', () => {
  it.each([
    ['SM-S741BZVDEUE', 'SMS741BZVDEUE'],
    ['MFYM4ZD-A', 'MFYM4ZDA'],
    ['UE43U8072HUXXH', 'UE43U8072HUXXH'],
    ['83QM0034RM', '83QM0034RM'],
    ['CFI-2016', 'CFI2016'],
    // Plausible but possibly a seller's SKU: kept as a guess.
    ['KXG0214352', 'KXG0214352'],
  ])('%s → %s', (raw, norm) => {
    expect(mpnHintOf(raw)).toBe(norm);
  });

  it.each([
    'B0BHPQ5MSM', // Amazon ASIN
    'CONSOLA620JOCURI',
    '620JOCURI',
    'ERIK-RO-B9-GREY',
    'XS18PRO-A-PINK',
    '3800234790831YELLOW',
    '67-INCH', // spec
    'RK3326', // chip
    'MSEL-87-33-199272526568', // longer than any manufacturer code
    '2026',
    'ABCDEF',
    'AB12',
    '',
    null,
  ])('%s → null', (raw) => {
    expect(mpnHintOf(raw)).toBeNull();
  });
});
