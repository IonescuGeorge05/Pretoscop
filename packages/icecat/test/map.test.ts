import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ICECAT_ROBOTS_DISALLOW_AGENTS,
  hasContent,
  icecatAttribution,
  icecatImageLicense,
  isIcecatSource,
  isProductResponse,
  mapIcecatProduct,
  type IcecatProductResponse,
} from '../src/index';

const load = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as IcecatProductResponse;

describe('mapIcecatProduct', () => {
  const dell = load('product-dell-g5-5587_ro_synthetic.json');

  it('maps features in Icecat group and sort order with presentation value and unit', () => {
    const m = mapIcecatProduct(dell, 'RO', { by: 'gtin', key: '5397184119709' });
    expect(m.specs.locale).toBe('ro');
    expect(m.specs.features.map((f) => `${f.group} / ${f.name}`)).toEqual([
      'Afișaj / Diagonala ecranului',
      'Afișaj / Rezoluție display',
      'Procesor / Familie procesor',
      'Procesor / Model procesor',
      'Procesor / Frecvență procesor',
      'Memorie / Memorie internă',
      'Memorie / Tip memorie internă',
      'Software / Sistem de operare instalat',
    ]);
    expect(m.specs.features[0]).toEqual({
      group: 'Afișaj',
      name: 'Diagonala ecranului',
      value: '39,6 cm (15.6")',
      unit: '"',
      raw: '15.6',
      type: 'numerical',
    });
    expect(m.specs.features[1]).toMatchObject({ value: '1920 x 1080 Pixel', unit: 'Pixel' });
    // A feature without a value ("Ecran tactil": empty) is dropped.
    expect(m.specs.features.some((f) => f.name === 'Ecran tactil')).toBe(false);
  });

  it('keeps identity, summary and provenance; empty marketing text stays null', () => {
    const m = mapIcecatProduct(dell, 'RO', { by: 'gtin', key: '5397184119709' });
    expect(m.specs).toMatchObject({
      title: expect.stringMatching(/^DELL G5 5587 Laptop 39,6 cm/),
      brand: 'DELL',
      productName: 'G5 5587',
      mpn: '5587-SYNTH-01',
      gtins: ['5397184119709'],
      category: 'Laptopuri',
      icecatId: '56195846',
      quality: 'ICECAT',
      matchedBy: 'gtin',
      matchedKey: '5397184119709',
      demoAccount: true,
      source: 'open-icecat',
      marketingText: null,
      bulletPoints: [],
    });
    expect(m.specs.summary).toMatch(/^DELL G5 5587\. Tipul de produs: Laptop/);
    expect(hasContent(m)).toBe(true);
  });

  it('copies public product pictures only, main first, and falls back to HighPic', () => {
    const m = mapIcecatProduct(dell, 'RO', { by: 'gtin', key: '5397184119709' });
    expect(m.images.map((i) => [i.icecatImageId, i.isMain])).toEqual([
      ['90000001', true],
      ['90000002', false],
    ]);
    const philips = mapIcecatProduct(load('product-philips-hd9252-90_ro_synthetic.json'), 'RO', {
      by: 'brand_mpn',
      key: 'Philips HD9252/90',
    });
    expect(philips.images).toEqual([
      {
        url: 'https://images.icecat.biz/img/gallery/99000456_synth-main.jpg',
        icecatImageId: null,
        width: 800,
        height: 800,
        isMain: true,
        position: 1,
      },
    ]);
    // Romanian marketing text is stored exactly as Icecat sends it (cedilla included).
    expect(philips.specs.marketingText).toContain('mai puţină grăsime');
    expect(philips.specs.bulletPoints).toEqual(['Tehnologie RapidAir', 'Capacitate 4,1 L']);
  });

  it('recognizes error documents and empty datasheets', () => {
    const errors = JSON.parse(
      readFileSync(new URL('../fixtures/errors_synthetic.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    expect(isProductResponse(errors.notFound)).toBe(false);
    expect(isProductResponse(dell)).toBe(true);
    const empty = mapIcecatProduct({ data: { GeneralInfo: { Title: 'X' } } }, 'EN', {
      by: 'gtin',
      key: '1',
    });
    expect(hasContent(empty)).toBe(false);
    expect(empty.specs.locale).toBe('en');
  });
});

describe('licence texts', () => {
  it('carry the credit, the database-right notice and the AS IS disclaimer', () => {
    expect(icecatAttribution(2026)).toBe(
      'Specs Icecat (https://icecat.biz). Database Right data-sheet 2026 Icecat. All rights reserved. Datele sunt oferite „ca atare” (AS IS), fără nicio garanție.',
    );
    expect(icecatImageLicense(2026, '56195846', '90000001')).toMatch(
      /^Open Icecat, Open Content Licence: Specs Icecat .*Icecat product 56195846, image 90000001.*Not for AI training/,
    );
    expect(isIcecatSource('icecat')).toBe(true);
    expect(isIcecatSource('feed')).toBe(false);
    expect(ICECAT_ROBOTS_DISALLOW_AGENTS).toContain('GPTBot');
    expect(ICECAT_ROBOTS_DISALLOW_AGENTS).toContain('CCBot');
  });
});
