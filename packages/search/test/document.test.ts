import { describe, expect, it } from 'vitest';
import { buildProductDocument, compactModels, specPhrases, type ProductRow } from '../src/document';
import { SCHEMA_VERSION } from '../src/sync';
import { buildSynonyms, synonymIssues } from '../src/synonyms';
import { PRODUCT_SETTINGS, indexNames } from '../src/settings';

function row(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 42,
    slug: 'samsung-galaxy-a57-42',
    title: 'Telefon mobil Samsung Galaxy A57, Dual SIM, 8GB RAM, 128GB, 5G, Awesome Navy',
    titleAscii: 'telefon mobil samsung galaxy a57, dual sim, 8gb ram, 128gb, 5g, awesome navy',
    mpn: 'SM-A576BDBBEUE',
    mpnNorm: 'SMA576BDBBEUE',
    attributes: { kind: 'phone', color: 'blue', colorRo: 'albastru', ramGb: 8, storageGb: 128, connectivity: ['5g', 'dual_sim'] },
    provisional: false,
    popularity: 2,
    brand: 'Samsung',
    brandSlug: 'samsung',
    brandAliases: [],
    categorySlug: 'telefoane-mobile',
    categoryName: 'Telefoane mobile',
    categoryPath: 'telefoane-tablete/telefoane-mobile',
    parentSlug: 'telefoane-tablete',
    parentName: 'Telefoane și tablete',
    family: 'Samsung Galaxy A57',
    familyId: 7,
    image: null,
    gtins: ['08806095530000'],
    observationsDays: 3,
    currentShopBani: 189_999,
    verdict: 'insufficient_data',
    historyStartedAt: '2026-10-25',
    offerCount: 2,
    shopCount: 2,
    shopSlugs: ['itgalaxy', 'emag'],
    minPriceBani: 189_999,
    minTotalBani: 189_999,
    minShop: 'eMAG',
    inStockCount: 2,
    lastChangeAt: new Date('2026-10-27T10:00:00Z'),
    updatedAt: new Date('2026-10-27T11:00:00Z'),
    ...over,
  };
}

describe('buildProductDocument', () => {
  it('maps a product row to the index document', () => {
    const d = buildProductDocument(row());
    expect(d).toMatchObject({
      id: 42,
      brand: 'Samsung',
      brand_slug: 'samsung',
      category_slug: 'telefoane-mobile',
      category_slugs: ['telefoane-tablete', 'telefoane-mobile'],
      category_names: ['Telefoane și tablete', 'Telefoane mobile'],
      min_total_bani: 189_999,
      min_shop: 'eMAG',
      offer_count: 2,
      shop_count: 2,
      shop_slugs: ['emag', 'itgalaxy'],
      in_stock: true,
      has_history: false,
      verdict: 'insufficient_data',
      indexable: true,
      provisional: false,
      gtins: ['08806095530000'],
      last_change_at: Date.parse('2026-10-27T10:00:00Z') / 1000,
    });
    expect(d.model_compact).toContain('sma576bdbbeue');
    expect(d.specs).toEqual(expect.arrayContaining(['128GB', '8GB RAM', 'albastru', 'blue', '5G', 'Dual SIM']));
    expect(d.attributes).toEqual({ storageGb: 128, ramGb: 8, color: 'blue', colorRo: 'albastru' });
  });

  it('applies the index policy: provisional, single offer without history, no live offer', () => {
    expect(buildProductDocument(row({ provisional: true })).indexable).toBe(false);
    expect(buildProductDocument(row({ offerCount: 1, shopCount: 1, observationsDays: 3 })).indexable).toBe(false);
    expect(buildProductDocument(row({ offerCount: 1, shopCount: 1, observationsDays: 14 })).indexable).toBe(true);
    const none = buildProductDocument(row({ offerCount: 0, shopCount: 0, observationsDays: 60, minTotalBani: null, minPriceBani: null }));
    expect(none).toMatchObject({ indexable: false, in_stock: false, min_shop: null, has_history: true });
  });

  it('adds dictionary aliases for the brand', () => {
    const d = buildProductDocument(row({ brand: 'HP', brandSlug: 'hp' }));
    expect(d.aliases.length).toBeGreaterThan(0);
    expect(d.aliases.map((a) => a.toLowerCase())).not.toContain('hp');
  });
});

describe('spec phrases and model codes', () => {
  it('spells capacities and screens the way people type them', () => {
    expect(specPhrases({ storageGb: 1024, screenInches: 15.6, resolution: 'fhd', energyClass: 'F', capacityL: 384, capacityKg: 8.5 })).toEqual(
      expect.arrayContaining(['1TB', '15.6 inch', '15,6 inch', 'FHD', 'clasa F', '384 litri', '8,5 kg']),
    );
    expect(specPhrases({})).toEqual([]);
  });

  it('compacts MPNs and hyphenated model codes, not units', () => {
    expect(compactModels('QE55LS03HAUXXH', null, 'Televizor Samsung QE55LS03HAUXXH')).toEqual(['qe55ls03hauxxh']);
    expect(compactModels(null, null, 'Consola PlayStation 5 CFI-2016, 1TB')).toContain('cfi2016');
    expect(compactModels(null, null, 'Laptop 15.6", 16-GB')).toEqual([]);
  });
});

describe('settings and synonyms', () => {
  it('has a clean synonym list of 200–500 entries', () => {
    expect(synonymIssues()).toEqual([]);
    const n = Object.keys(buildSynonyms()).length;
    expect(n).toBeGreaterThanOrEqual(200);
    expect(n).toBeLessThanOrEqual(500);
    expect(buildSynonyms().ps5).toContain('playstation 5');
    expect(buildSynonyms().negru).toContain('black');
    expect(buildSynonyms().televizoare).toContain('tv');
  });

  it('keeps model numbers exact and ranks by popularity after relevance', () => {
    expect(PRODUCT_SETTINGS.typoTolerance.disableOnAttributes).toContain('model_compact');
    expect(PRODUCT_SETTINGS.typoTolerance.disableOnNumbers).toBe(true);
    expect(PRODUCT_SETTINGS.rankingRules.slice(-2)).toEqual(['popularity:desc', 'offer_count:desc']);
    expect(SCHEMA_VERSION).toMatch(/^[0-9a-f]{16}$/);
  });

  it('prefixes index names and refuses odd prefixes', () => {
    expect(indexNames('e2e_')).toEqual({ products: 'e2e_products', categories: 'e2e_categories', brands: 'e2e_brands', meta: 'e2e_pretoscop_sync' });
    expect(() => indexNames('../x')).toThrow();
  });
});
