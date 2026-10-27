import { describe, expect, it } from 'vitest';
import { familyKey, familyTitle, tokenSets, mpnVariant, route, scorePair, type MatchSide } from '../src/matching';

const side = (title: string, extra: Partial<MatchSide> = {}): MatchSide => ({
  title,
  brand: 'Samsung',
  mpnNorm: null,
  gtin14: null,
  category: 'telefoane-mobile',
  attributes: {},
  ...extra,
});

describe('tokens', () => {
  it('glues units, drops stopwords, separates model and edition tokens', () => {
    const t = tokenSets('Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8 GB RAM, 128GB, 5G, Blueberry');
    expect(t.model).toEqual(new Set(['s26']));
    expect(t.edition).toEqual(new Set(['fe']));
    expect(t.all.has('128gb')).toBe(true);
    expect(t.all.has('telefon')).toBe(false);
  });
});

describe('scorePair', () => {
  it('GTIN equality accepts, unless the edition contradicts', () => {
    expect(scorePair(side('Galaxy S26', { gtin14: '08806095300000' }), side('Samsung Galaxy S26', { gtin14: '08806095300000' })).score).toBe(1);
    expect(scorePair(side('Galaxy S26 Ultra', { gtin14: '08806095300000' }), side('Samsung Galaxy S26', { gtin14: '08806095300000' })).conflicts).toContain('edition');
  });

  it('brand + MPN equality accepts; a different MPN of the same brand conflicts', () => {
    expect(scorePair(side('x', { mpnNorm: 'SMS741BZVDEUE' }), side('y', { mpnNorm: 'SMS741BZVDEUE' })).score).toBe(0.98);
    expect(scorePair(side('Galaxy S26 FE', { mpnNorm: 'SMS741BZVDEUE' }), side('Galaxy S26 FE', { mpnNorm: 'SMS741BZKDEUE' })).conflicts).toContain('mpn');
  });

  it('two title-guessed MPNs (series codes) also need the titles to agree', () => {
    const lenovo = (t: string) => side(t, { brand: 'Lenovo', category: 'laptopuri', mpnNorm: '14IPH11', mpnFromTitle: true, attributes: { storageGb: 1024, ramGb: 16 } });
    expect(scorePair(lenovo('Laptop Lenovo IdeaPad Slim 5 14IPH11 Ultra 7 355 16GB 1TB'), lenovo('Laptop Lenovo Yoga Slim 7 14IPH11 Ultra 7 355 16GB 1TB')).conflicts).toContain('model');
    expect(scorePair(lenovo('Laptop Lenovo Yoga Slim 7 14IPH11 Ultra 7 355 16GB 1TB'), lenovo('Laptop Lenovo Yoga Slim 7 14IPH11 Ultra 7 355 16GB 1TB')).score).toBe(0.97);
  });

  it('regional MPN suffixes match when the title agrees', () => {
    expect(mpnVariant('UE55U8072HXXH', 'UE55U8072H')).toBe(true);
    expect(mpnVariant('SMS741B', 'SMS741BZVDEUE')).toBe(false);
    const s = scorePair(
      side('Televizor LED Smart Samsung UE55U8072H 55Inch 4K', { mpnNorm: 'UE55U8072H', category: 'televizoare' }),
      side('Televizor Samsung 55U8072H, 138 cm, Smart, 4K', { mpnNorm: 'UE55U8072HXXH', category: 'televizoare' }),
    );
    expect(s.via).toBe('mpn_variant');
    expect(s.score).toBeGreaterThanOrEqual(0.9);
  });

  it('never accepts across conflicting storage, colour or model numbers', () => {
    expect(scorePair(side('Galaxy S26 FE 128GB', { attributes: { storageGb: 128 } }), side('Galaxy S26 FE 256GB', { attributes: { storageGb: 256 } })).conflicts).toEqual(['storageGb 128≠256']);
    expect(scorePair(side('Galaxy S26', { attributes: { color: 'black' } }), side('Galaxy S26', { attributes: { color: 'blue' } })).score).toBe(0);
    expect(scorePair(side('Samsung Galaxy S25 256GB'), side('Samsung Galaxy S26 256GB')).conflicts).toContain('model');
    expect(scorePair(side('Apple iPhone 17 Pro 256GB', { brand: 'Apple' }), side('Apple iPhone 17 Pro Max 256GB', { brand: 'Apple' })).conflicts).toContain('edition');
  });

  it('title-only scores stay below auto-accept', () => {
    const s = scorePair(side('Samsung Galaxy S26 FE 128GB Blueberry'), side('Telefon mobil Samsung Galaxy S26 FE, 128GB, 5G, Blueberry'));
    expect(s.conflicts).toEqual([]);
    expect(s.score).toBeGreaterThan(0.3);
    expect(s.score).toBeLessThan(0.97);
  });
});

describe('route', () => {
  const id = { gtin14: null, mpnNorm: 'SMS741BZVDEUE', brand: 'Samsung', category: 'telefoane-mobile', condition: 'new' as const, isBundle: false, isAccessory: false, trustedSource: true, hasModelToken: true };
  it('accepts the best strong candidate', () => {
    expect(route(id, [{ productId: 7, score: { score: 0.98, conflicts: [], via: 'mpn', features: {} } }])).toMatchObject({ decision: 'accept', productId: 7 });
  });
  it('gray zone goes to review, nothing creates a product from brand + MPN', () => {
    expect(route(id, [{ productId: 7, score: { score: 0.6, conflicts: [], via: 'title', features: {} } }]).decision).toBe('needs_review');
    expect(route(id, []).decision).toBe('new_product');
  });
  it('refurbished, bundles and accessories stay unmatched', () => {
    expect(route({ ...id, condition: 'refurbished' }, []).decision).toBe('unmatched');
    expect(route({ ...id, isBundle: true }, []).decision).toBe('unmatched');
    expect(route({ ...id, isAccessory: true }, []).decision).toBe('unmatched');
  });
  it('without identifiers, only trusted sources create products', () => {
    const bare = { ...id, mpnNorm: null };
    expect(route(bare, []).decision).toBe('new_product');
    expect(route({ ...bare, trustedSource: false }, []).decision).toBe('unmatched');
  });
  it('two strong title candidates mean a duplicate: review', () => {
    const s = { score: 0.98, conflicts: [], via: 'title' as const, features: {} };
    expect(route(id, [{ productId: 1, score: s }, { productId: 2, score: s }]).decision).toBe('needs_review');
  });
});

describe('families', () => {
  it('groups storage and colour variants', () => {
    expect(familyTitle('Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry')).toBe('Samsung Galaxy S26 FE');
    expect(familyKey('Samsung', 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 256GB, 5G, Black')).toBe(
      familyKey('Samsung', 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry'),
    );
    expect(familyKey('Apple', 'Apple iPhone 17 Pro 256GB')).not.toBe(familyKey('Apple', 'Apple iPhone 17 Pro Max 256GB'));
  });
});
