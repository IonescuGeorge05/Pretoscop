import { describe, expect, it } from 'vitest';
import { contentHash } from '../src/hash';
import { route, scorePair, type MatchSide, type OfferIdentity } from '../src/matching';
import { normalizeOffer } from '../src/normalize';
import type { RawOffer } from '../src/raw-offer';
import { categorize, categoriesCompatible, categoryVertical, LAUNCH_TAXONOMY, TAXONOMY, taxonomyPath } from '../src/taxonomy';

// M29: books and beauty subtrees, their matching rules and normalization.

describe('taxonomy subtrees', () => {
  it('adds the books and beauty subtrees after the launch taxonomy, slugs unique, parents present', () => {
    const slugs = TAXONOMY.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const n of TAXONOMY) if (n.parent) expect(slugs).toContain(n.parent);
    expect(LAUNCH_TAXONOMY.every((n) => !n.vertical)).toBe(true);
    expect(TAXONOMY.slice(0, LAUNCH_TAXONOMY.length)).toEqual(LAUNCH_TAXONOMY); // sort orders of launch nodes unchanged
    expect(taxonomyPath('carti-pentru-copii')).toBe('carti/carti-pentru-copii');
    expect(taxonomyPath('parfumuri')).toBe('frumusete/parfumuri');
    // Romanian names use comma-below ș/ț, never the cedilla forms.
    expect(TAXONOMY.some((n) => /[şţŞŢ]/.test(n.nameRo))).toBe(false);
  });

  it.each([
    ['Harry Potter si Printul Semisange - J.K. Rowling', 'Carti > Beletristica > SF & Fantasy > Romane Fantasy', null, 'beletristica'],
    ['Harry Potter si Printul Semisange - J.K. Rowling', 'Romane Fantasy', '09786303218656', 'beletristica'],
    ['Pisicile Razboinice Vol.1', 'Carti > Carti Pentru Copii > Literatura Fantasy', null, 'carti-pentru-copii'],
    ['Tup. Imposibil e doar un cuvant', 'Carti > Carte > Carti pentru copii > Povesti si povestiri', '09786064402332', 'carti-pentru-copii'],
    ['Lupii ghetii', 'Carti > Carti pentru adolescenti / Young Adult', null, 'young-adult'],
    ['Sapiens', 'Carti > Stiinte umaniste > Istorie', null, 'istorie'],
    ['Telefonul - roman', null, '09789734612345', 'carti'], // an ISBN alone: the books root, never a phone
    ['Joc de cuvinte', 'Carti > Beletristica > Poezie', null, 'beletristica'], // not video games
    ['Apă de toaletă Dior Sauvage 100 ml', null, null, 'parfumuri'],
    ['Dior Sauvage EDT 100ml', null, null, 'parfumuri'],
    ['Ruj Maybelline SuperStay Matte Ink 20', null, null, 'machiaj'],
    ['Cremă de față Nivea Q10 50 ml', null, null, 'ingrijire-ten'],
    ['Șampon Head & Shoulders 400 ml', null, null, 'ingrijire-par'],
    ['Gel de duș Nivea Men 500 ml', null, null, 'ingrijire-corp'],
    ['Ceva frumos', 'Cosmetice > Diverse', null, 'frumusete'],
  ])('%s (%s) → %s', (title, crumb, gtin, slug) => {
    expect(categorize(title, crumb, { gtin14: gtin })).toBe(slug);
  });

  it('launch offers keep their categories', () => {
    expect(categorize('Telefon mobil Samsung Galaxy S26 FE, 128GB')).toBe('telefoane-mobile');
    expect(categorize('Joc EA SPORTS FC 26 pentru PlayStation 5')).toBe('jocuri');
    expect(categorize('Chrystal UE55U8072H 55Inch', 'Acasa > TV si Electronice > Televizoare > Samsung')).toBe('televizoare');
    expect(categorize('Uscator de par Philips', 'Ingrijire personala > Aparate de coafat')).toBeNull();
  });

  it('book genres are compatible with each other; beauty and launch categories are strict', () => {
    expect(categoriesCompatible('beletristica', 'carti-pentru-copii')).toBe(true);
    expect(categoriesCompatible('carti', 'young-adult')).toBe(true);
    expect(categoriesCompatible('parfumuri', 'machiaj')).toBe(false);
    expect(categoriesCompatible('beletristica', 'televizoare')).toBe(false);
    expect(categoriesCompatible('televizoare', 'monitoare')).toBe(false);
    expect(categoryVertical('istorie')).toBe('books');
    expect(categoryVertical('parfumuri')).toBe('beauty');
    expect(categoryVertical('televizoare')).toBeNull();
  });
});

const book = (title: string, extra: Partial<MatchSide> = {}, attrs: Record<string, unknown> = {}): MatchSide => ({
  title,
  brand: 'Art',
  mpnNorm: null,
  gtin14: null,
  category: 'beletristica',
  attributes: { kind: 'book', bookSet: false, ...attrs },
  ...extra,
});

describe('matching books (scorePair, route)', () => {
  it('equal ISBNs accept across genres and publisher spellings', () => {
    const s = scorePair(book('Harry Potter si Printul Semisange - J.K. Rowling', { gtin14: '09786303218656' }), book('Harry Potter și Prințul Semisânge', { gtin14: '09786303218656', brand: 'Arthur', category: 'carti-pentru-copii' }));
    expect(s).toMatchObject({ score: 1, via: 'gtin', conflicts: [] });
  });

  it('equal ISBNs with conflicting stated facts never accept', () => {
    const s = scorePair(book('Sapiens', { gtin14: '09789734612345' }, { bookFormat: 'hardcover' }), book('Sapiens', { gtin14: '09789734612345' }, { bookFormat: 'ebook' }));
    expect(s.score).toBe(0);
    expect(s.conflicts).toEqual(['bookFormat hardcover≠ebook']);
  });

  it('title-only book matches stay in the gray zone (a listing card without ISBN vs the product with it)', () => {
    const s = scorePair(book('Harry Potter si Printul Semisange - J.K. Rowling', {}, { bookAuthors: ['J.K. Rowling'] }), book('Harry Potter si Printul Semisange - J.K. Rowling', { gtin14: '09786303218656' }, { bookAuthors: ['J.K. Rowling'] }));
    expect(s.via).toBe('title');
    expect(s.score).toBeGreaterThan(0.3);
    expect(s.score).toBeLessThan(0.97);
  });

  it('other books of a series are rejected, not reviewed', () => {
    expect(scorePair(book('Harry Potter și piatra filozofală'), book('Harry Potter și camera secretelor')).conflicts).toContain('title');
    expect(scorePair(book('Cronicile din Narnia Vol.5', {}, { bookVolume: 5 }), book('Cronicile din Narnia Vol.6', {}, { bookVolume: 6 })).score).toBe(0);
  });

  it('a book never matches a product of another vertical', () => {
    const tv: MatchSide = { title: 'Televizor Samsung 55', brand: null, mpnNorm: null, gtin14: null, category: 'televizoare', attributes: { kind: 'tv' } };
    expect(scorePair(book('Ghidul televizorului', { brand: null, category: null }), tv).conflicts).toContain('vertical');
  });

  it('an ISBN creates a product even without a publisher; title-only books stay unmatched', () => {
    const id = (o: Partial<OfferIdentity>): OfferIdentity => ({ gtin14: null, mpnNorm: null, brand: null, category: 'beletristica', condition: 'new', isBundle: false, isAccessory: false, trustedSource: false, hasModelToken: false, ...o });
    expect(route(id({ gtin14: '09786303218656' }), [])).toMatchObject({ decision: 'new_product', reasons: ['valid ISBN'] });
    expect(route(id({ gtin14: '09786303218656', brand: 'Art' }), [])).toMatchObject({ decision: 'new_product', reasons: ['valid ISBN + publisher'] });
    expect(route(id({ brand: 'Art' }), []).decision).toBe('unmatched');
  });
});

describe('matching beauty products', () => {
  const p = (title: string, extra: Partial<MatchSide> = {}, attrs: Record<string, unknown> = {}): MatchSide => ({
    title,
    brand: 'Dior',
    mpnNorm: null,
    gtin14: null,
    category: 'parfumuri',
    attributes: { kind: 'fragrance', giftSet: false, refill: false, tester: false, ...attrs },
    ...extra,
  });

  it('same GTIN accepts; same GTIN with another size never does', () => {
    expect(scorePair(p('Dior Sauvage EDT 100 ml', { gtin14: '03348901250146' }, { volumeMl: 100, concentration: 'edt' }), p('Christian Dior Sauvage Eau de Toilette 100ml', { gtin14: '03348901250146' }, { volumeMl: 100, concentration: 'edt' }))).toMatchObject({ score: 1, via: 'gtin' });
    expect(scorePair(p('Dior Sauvage EDT 100 ml', { gtin14: '03348901250146' }, { volumeMl: 100 }), p('Dior Sauvage EDT 60 ml', { gtin14: '03348901250146' }, { volumeMl: 60 })).score).toBe(0);
  });

  it('flankers and concentrations are other products; title matches stay in review', () => {
    expect(scorePair(p('Dior Sauvage EDP 60 ml', {}, { volumeMl: 60, concentration: 'edp' }), p('Dior Sauvage Elixir 60 ml', {}, { volumeMl: 60 })).conflicts).toContain('flanker elixir');
    expect(scorePair(p('Dior Sauvage EDT 100 ml', {}, { volumeMl: 100, concentration: 'edt' }), p('Dior Sauvage EDP 100 ml', {}, { volumeMl: 100, concentration: 'edp' })).conflicts).toContain('concentration edt≠edp');
    const same = scorePair(p('Apă de toaletă Dior Sauvage 100 ml', {}, { volumeMl: 100, concentration: 'edt' }), p('Dior Sauvage Eau de Toilette 100ml', {}, { volumeMl: 100, concentration: 'edt' }));
    expect(same.conflicts).toEqual([]);
    expect(same.score).toBeGreaterThan(0.3);
    expect(same.score).toBeLessThan(0.97);
  });

  it('different beauty brands and categories conflict', () => {
    expect(scorePair(p('Sauvage EDT 100 ml'), p('Sauvage EDT 100 ml', { brand: 'Chanel' })).conflicts).toContain('brand');
    expect(scorePair(p('Dior Sauvage deodorant', { category: 'ingrijire-corp' }), p('Dior Sauvage EDT')).conflicts).toContain('category');
  });
});

describe('normalizeOffer for the verticals', () => {
  const raw = (o: Partial<RawOffer>): RawOffer => ({ shopSlug: 'test', externalId: 'x1', url: 'https://example.com/x1', title: 'T', price: '49.99', priceFormat: 'decimal', observedAt: '2026-11-09T08:00:00Z', raw: {}, ...o });
  const norm = (o: Partial<RawOffer>) => normalizeOffer(raw(o), { shop: { slug: 'test' }, observedAt: new Date('2026-11-09T08:00:00Z'), hash: contentHash });

  it('a feed book with an ISBN-10 field and the publisher as brand', () => {
    const n = norm({ title: 'Ion - Liviu Rebreanu', gtin: '9734600036', brand: 'Editura Polirom', category: 'Carti > Literatura romana' });
    expect(n).toMatchObject({ ok: true, gtin14: '09789734600038', brandName: 'Polirom', brandKnown: true, productKind: 'book', mpnNorm: null, isBundle: false });
    expect(n.attributes).toMatchObject({ kind: 'book', bookAuthors: ['Liviu Rebreanu'] });
    expect(n.warnings).toContain('gtin_replaced_by_isbn');
  });

  it('an ISBN written in the title becomes the GTIN and leaves the title', () => {
    const n = norm({ title: 'Enigma Otiliei - George Călinescu, ISBN 978-973-46-1234-5', category: 'Carti > Beletristica' });
    expect(n).toMatchObject({ gtin14: '09789734612345', titleClean: 'Enigma Otiliei - George Călinescu', productKind: 'book' });
    expect(n.warnings).toContain('isbn_from_title');
    expect(n.mpnCandidates).toEqual([]);
  });

  it('book titles never become accessories, bundles or a title-guessed brand', () => {
    const n = norm({ title: 'Ghid complet pentru telefon mobil. Set de exerciții', gtin: '9789734612345' });
    expect(n).toMatchObject({ isAccessory: false, isBundle: false, brandName: null, productKind: 'book' });
    const acc = norm({ title: 'Semn de carte magnetic', category: 'Carti > Accesorii > Semne de carte' });
    expect(acc.isAccessory).toBe(true);
  });

  it('a beauty offer: dictionary brand, size and concentration, no title MPN', () => {
    const n = norm({ title: 'Apă de toaletă Christian Dior Sauvage, 100 ml, pentru bărbați', gtin: '3348901250146' });
    expect(n).toMatchObject({ ok: true, brandName: 'Dior', brandKnown: true, productKind: 'fragrance', mpnNorm: null, isBundle: false });
    expect(n.attributes).toMatchObject({ kind: 'fragrance', volumeMl: 100, concentration: 'edt', gender: 'male', tester: false, giftSet: false, refill: false });
    const set = norm({ title: 'Set cadou Rabanne 1 Million: Apă de toaletă 100 ml + Deodorant 150 ml' });
    expect(set).toMatchObject({ brandName: 'Rabanne', isBundle: false });
    expect(set.attributes).toMatchObject({ giftSet: true });
  });

  it('a launch offer is untouched by the verticals', () => {
    const n = norm({ title: 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry', price: '2999', mpn: 'SM-S741BZVDEUE' });
    expect(n).toMatchObject({ productKind: 'phone', brandName: 'Samsung', mpnNorm: 'SMS741BZVDEUE' });
    expect((n.attributes as Record<string, unknown>).bookSet).toBeUndefined();
  });
});
