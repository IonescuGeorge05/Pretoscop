import { describe, expect, it } from 'vitest';
import {
  asciiFold,
  cleanTitle,
  cleanTitleDetailed,
  foldLower,
  isHexJunkTitle,
  matchTokens,
  normalizeText,
  slugify,
  titleForMatch,
} from './text';
import { cmToScreenInches, screenContextOf } from './units';

describe('normalizeText', () => {
  it('converts legacy cedilla letters to comma-below', () => {
    expect(normalizeText('şi ţară ŞŢ')).toBe('și țară ȘȚ');
  });

  it('composes decomposed sequences (NFC) and then fixes the cedilla', () => {
    // "s" + combining cedilla, "t" + combining comma below
    expect(normalizeText('şță')).toBe('șță');
  });

  it('collapses every kind of whitespace, including NBSP and narrow NBSP', () => {
    expect(normalizeText('  Telefon\u{A0}mobil\u{202F}Samsung\t\n Galaxy  ')).toBe(
      'Telefon mobil Samsung Galaxy',
    );
  });

  it('strips control, zero-width and soft-hyphen characters', () => {
    expect(normalizeText('Lap\u{AD}top\u{200B} A\x07SUS\u{FEFF}')).toBe('Laptop ASUS');
  });

  it('normalizes typographic quotes and dashes', () => {
    expect(normalizeText('Monitor 27” – De’Longhi „super”')).toBe(
      'Monitor 27" - De\'Longhi "super"',
    );
    expect(normalizeText('−10% — nou')).toBe('-10% - nou');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('asciiFold', () => {
  it('folds Romanian diacritics in both forms and keeps case', () => {
    expect(asciiFold('Ștefan Țară ăâî ĂÂÎ şţ')).toBe('Stefan Tara aai AAI st');
  });

  it('folds other European diacritics and special letters', () => {
    expect(asciiFold('Kärcher Ñandú Straße Øresund Łódź')).toBe(
      'Karcher Nandu Strasse Oresund Lodz',
    );
  });

  it('foldLower combines normalization, folding and lower case', () => {
    expect(foldLower('  MAȘINĂ  de  spălat ')).toBe('masina de spalat');
  });
});

describe('slugify', () => {
  it('produces ascii, lower-case, dash-separated slugs', () => {
    expect(slugify('Mașină de spălat rufe Arctic, 8 kg')).toBe('masina-de-spalat-rufe-arctic-8-kg');
  });

  it('handles apostrophes, ampersands and a trailing plus', () => {
    expect(slugify("De'Longhi")).toBe('delonghi');
    expect(slugify('Bang & Olufsen')).toBe('bang-olufsen');
    expect(slugify('Galaxy S25+')).toBe('galaxy-s25-plus');
    expect(slugify('Clasa A+++')).toBe('clasa-a');
  });

  it('caps the length at 80 characters on a word boundary without a trailing dash', () => {
    const slug = slugify(
      'Laptop ASUS Vivobook 16 X1605VA cu procesor Intel Core i5-13420H pana la 4.60 GHz, 16", WUXGA, 16GB',
    );
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('laptop-asus-vivobook-16-x1605va')).toBe(true);
  });

  it('hard-cuts a single very long word', () => {
    expect(slugify('a'.repeat(120))).toHaveLength(80);
  });

  it('returns an empty string when nothing is left', () => {
    expect(slugify('—™—')).toBe('');
  });
});

describe('cleanTitle', () => {
  it('removes shop suffixes', () => {
    expect(cleanTitle('Telefon mobil Samsung Galaxy S25, 256GB - eMAG.ro')).toBe(
      'Telefon mobil Samsung Galaxy S25, 256GB',
    );
    expect(cleanTitle('Televizor LED Samsung 43DU7172, 108 cm | Altex')).toBe(
      'Televizor LED Samsung 43DU7172, 108 cm',
    );
    expect(cleanTitle('Placa video ASUS GeForce RTX 5070 - PC Garage')).toBe(
      'Placa video ASUS GeForce RTX 5070',
    );
    expect(cleanTitle('Carte de bucate – Libris')).toBe('Carte de bucate');
    expect(cleanTitle('Laptop Lenovo IdeaPad | evoMAG.ro')).toBe('Laptop Lenovo IdeaPad');
  });

  it('removes the "Cumpara … la pret …" wrapper', () => {
    expect(
      cleanTitle('Cumpara Telefon mobil Samsung Galaxy A26 5G, 128GB, Black la pret mic - eMAG.ro'),
    ).toBe('Telefon mobil Samsung Galaxy A26 5G, 128GB, Black');
    expect(cleanTitle('Cumpără Frigider Arctic online')).toBe('Frigider Arctic');
  });

  it('keeps shop names that are ordinary words unless written as domains', () => {
    expect(cleanTitle('Boxa portabila JBL Flip')).toBe('Boxa portabila JBL Flip');
    expect(cleanTitle('Jucarie de plus - Elefant')).toBe('Jucarie de plus - Elefant');
    expect(cleanTitle('Jucarie de plus - Elefant.ro')).toBe('Jucarie de plus');
  });

  it('removes a trailing product code and reports it', () => {
    const r = cleanTitleDetailed(
      'Laptop Lenovo IdeaPad Slim 3, 8GB, 512GB SSD, cod produs 82XM00F2RM',
    );
    expect(r.title).toBe('Laptop Lenovo IdeaPad Slim 3, 8GB, 512GB SSD');
    expect(r.productCode).toBe('82XM00F2RM');
    expect(cleanTitle('Bormasina Bosch GSB 18V-55 (Cod: 06019H5300)')).toBe(
      'Bormasina Bosch GSB 18V-55',
    );
  });

  it('does not treat a game abbreviation "COD" as a product code', () => {
    expect(cleanTitle('Joc COD MW3')).toBe('Joc COD MW3');
  });

  it('keeps condition words and removes promo prefixes', () => {
    expect(cleanTitle('OFERTA! Telefon Apple iPhone 15, 128GB, Resigilat')).toBe(
      'Telefon Apple iPhone 15, 128GB, Resigilat',
    );
  });
});

describe('titleForMatch', () => {
  it('normalizes storage units and case', () => {
    expect(titleForMatch('SSD Samsung 990 PRO 1 TB')).toBe('ssd samsung 990 pro 1tb');
    expect(titleForMatch('Telefon 16 GB RAM, 256GB')).toBe('telefon 16gb ram 256gb');
  });

  it('unifies inch notations', () => {
    expect(titleForMatch('Monitor 27"')).toBe('monitor 27in');
    expect(titleForMatch('Televizor 55 inch')).toBe('televizor 55in');
    expect(titleForMatch('Televizor 55 inchi')).toBe('televizor 55in');
    expect(titleForMatch("Laptop 15.6''")).toBe('laptop 15.6in');
    expect(titleForMatch('Telefon ecran 6,7"')).toBe('telefon ecran 6.7in');
  });

  it('converts centimetres to inches only for TVs, monitors and laptops', () => {
    expect(titleForMatch('Televizor LED Samsung 55DU7172, 138 cm, Smart')).toBe(
      'televizor led samsung 55du7172 55in smart',
    );
    expect(titleForMatch('Televizor LG 139 cm')).toBe('televizor lg 55in');
    expect(titleForMatch('Frigider Arctic, H 185 cm')).toBe('frigider arctic h 185cm');
  });

  it('normalizes Wi-Fi, USB-C, Full HD and resolutions', () => {
    expect(titleForMatch('Router Wi-Fi 6E, USB Type-C, Full HD 1920 x 1080')).toBe(
      'router wifi6e usbc fullhd 1920x1080',
    );
    expect(titleForMatch('WiFi')).toBe('wifi');
  });

  it('drops trademark symbols and turns a model plus into "plus"', () => {
    expect(titleForMatch('Intel® Core™ i5 Galaxy S25+')).toBe('intel core i5 galaxy s25 plus');
  });

  it('removes thousands dots before power units', () => {
    expect(titleForMatch('Aspirator 2.000 W')).toBe('aspirator 2000w');
    expect(titleForMatch('Aer conditionat 12.000 BTU')).toBe('aer conditionat 12000btu');
  });

  it('does not read "2 in 1" as a screen size', () => {
    expect(titleForMatch('Laptop 2 in 1 HP')).toBe('laptop 2 in 1 hp');
  });

  it('matchTokens splits the match form', () => {
    expect(matchTokens('Consola PS5 Slim, 1TB')).toEqual(['consola', 'ps5', 'slim', '1tb']);
    expect(matchTokens('')).toEqual([]);
  });
});

describe('isHexJunkTitle', () => {
  it('flags cel.ro decoy names', () => {
    expect(isHexJunkTitle('Husa Pro b6fc26eb')).toBe(true);
    expect(isHexJunkTitle('Carcasa Elegance f58373a6')).toBe(true);
    expect(isHexJunkTitle('a3f9c2e17b')).toBe(true);
    expect(isHexJunkTitle('8dd554e7ba 3c9a0f12 husa')).toBe(true);
  });

  it('does not flag real titles with model codes', () => {
    expect(isHexJunkTitle('Televizor LED Samsung 55DU7172, 138 cm, Smart, 4K Ultra HD')).toBe(
      false,
    );
    expect(isHexJunkTitle('Masina de spalat rufe Arctic APL81222XLAB4, 8 kg')).toBe(false);
    expect(isHexJunkTitle('Memorie Kingston FURY 16GB DDR5 kf552c40bbk2')).toBe(false);
    expect(isHexJunkTitle('Cablu HDMI 2m')).toBe(false);
    expect(isHexJunkTitle('')).toBe(false);
  });
});

describe('units', () => {
  it('detects the screen context', () => {
    expect(screenContextOf('televizor led samsung')).toBe('tv');
    expect(screenContextOf('monitor gaming lg')).toBe('monitor');
    expect(screenContextOf('laptop asus vivobook')).toBe('laptop');
    expect(screenContextOf('frigider arctic')).toBeNull();
    expect(screenContextOf('comoda tv 160 cm')).toBeNull();
  });

  it('snaps TV centimetres to marketed sizes', () => {
    expect(cmToScreenInches(138, 'tv')).toBe(55);
    expect(cmToScreenInches(139, 'tv')).toBe(55);
    expect(cmToScreenInches(108, 'tv')).toBe(43);
    expect(cmToScreenInches(106, 'tv')).toBe(42);
    expect(cmToScreenInches(80, 'tv')).toBe(32);
    expect(cmToScreenInches(164, 'tv')).toBe(65);
    expect(cmToScreenInches(189, 'tv')).toBe(75);
    expect(cmToScreenInches(218, 'tv')).toBe(86);
    expect(cmToScreenInches(248, 'tv')).toBe(98);
    expect(cmToScreenInches(20, 'tv')).toBeNull();
  });

  it('rounds laptop centimetres to one decimal', () => {
    expect(cmToScreenInches(39.6, 'laptop')).toBe(15.6);
    expect(cmToScreenInches(35.6, 'laptop')).toBe(14);
    expect(cmToScreenInches(33.8, 'laptop')).toBe(13.3);
    expect(cmToScreenInches(60, 'laptop')).toBeNull();
  });
});
