import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { parsePageDetailed, parseSitemap, type PageParseResult } from '../src/index';
import { fixture, summary } from './helpers';

// M29 (books): fixtures recorded 2026-11-09 with the polite recorder (3 pages per shop).

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

function run(shop: string, parser: string, path: string): PageParseResult {
  const meta = JSON.parse(readFileSync(`${root}${path}.meta.json`, 'utf8')) as { url: string; final_url?: string; recorded_at: string };
  return parsePageDetailed(parser, fixture(path), { url: meta.final_url ?? meta.url, shopSlug: shop, observedAt: meta.recorded_at });
}

const norm = (o: PageParseResult['offers'][number]) => normalizeOffer(o, { shop: { slug: o.shopSlug }, observedAt: new Date(o.observedAt), hash: contentHash });

describe('Libris listing (libris-listing)', () => {
  const res = run('libris', 'libris-listing', 'libris/listing-carti-copii-fantasy_2026-11-09.html');

  it('reads 40 cards: id, title, visible price, publisher and category path', () => {
    expect(res.offers).toHaveLength(40);
    expect(new Set(res.offers.map((o) => o.externalId)).size).toBe(40);
    expect(res.offers.find((o) => o.externalId === '42444997')).toMatchObject({
      url: 'https://www.libris.ro/carte/harry-potter-si-printul-semisange-j-k-rowling/42444997',
      title: 'Harry Potter si Printul Semisange - J.K. Rowling',
      price: '78.78',
      priceFormat: 'decimal',
      availability: 'in stoc',
      brand: 'GRUPUL EDITORIAL ART',
      category: 'Carti > Beletristica > SF & Fantasy > Romane Fantasy',
      specs: { publisher: 'GRUPUL EDITORIAL ART' },
    });
    expect(res.offers.every((o) => o.url.endsWith(`/${o.externalId}`))).toBe(true);
    expect(res.offers.every((o) => o.gtin === undefined && o.imageUrl === undefined)).toBe(true);
  });

  it('the crossed PRP is the recommended price, never an old price; the 3-decimal analytics price is ignored', () => {
    const fetita = res.offers.find((o) => o.externalId === '44403653')!;
    expect(fetita.price).toBe('39.99');
    expect(fetita.oldPrice).toBeUndefined();
    expect(fetita.raw).toMatchObject({ rrp: '49.99', discountBadge: '-20%' });
    expect(res.offers.every((o) => o.oldPrice === undefined)).toBe(true);
    expect(res.offers.filter((o) => o.raw.rrp)).toHaveLength(14);
  });

  it('pages through ?iv.pg=N and reports the title count', () => {
    expect(res.nextPageUrl).toBe('https://www.libris.ro/carti/carti-pentru-copii/literatura-fantasy?iv.pg=2');
    expect(res.meta).toMatchObject({ cards: 40, skipped: 0, total: 290 });
    expect(res.productUrls).toHaveLength(40);
  });

  it('normalizes as books: publisher brand, author from the title, volume, no MPN, no bundle', () => {
    const offers = res.offers.map(norm);
    expect(offers.every((n) => n.ok && n.productKind === 'book' && n.mpnNorm === null && !n.isBundle && !n.isAccessory)).toBe(true);
    const hp = offers.find((n) => n.externalId === '42444997')!;
    expect(hp).toMatchObject({ brandName: 'Art', brandKnown: true, priceBani: 7878 });
    expect(hp.attributes).toMatchObject({ kind: 'book', bookAuthors: ['J.K. Rowling'], bookSet: false });
    const pisici = offers.find((n) => n.externalId === '857051')!;
    expect(pisici.attributes).toMatchObject({ bookVolume: 2, bookAuthors: ['Erin Hunter'] });
    expect(pisici.brandName).toBe('All');
    // "BUCURESTI" in the publisher field is a city: no brand.
    const motanic = offers.find((n) => n.externalId === '48751682')!;
    expect(motanic.brandName).toBeNull();
    expect(motanic.attributes).toMatchObject({ bookAuthors: ['Arthur Lazar-Abdulvoap'] });
  });

  it('snapshot', () => {
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('Libris product page (jsonld-product, JSON-LD Product+Book)', () => {
  const res = run('libris', 'jsonld-product', 'libris/product-harry-potter-printul-semisange_2026-11-09.html');

  it('keeps the listing id as external id and adds the ISBN and the Book facts', () => {
    expect(res.offers).toHaveLength(1);
    expect(res.offers[0]).toMatchObject({
      externalId: '42444997',
      title: 'Harry Potter si Printul Semisange - J.K. Rowling',
      price: '78.78',
      gtin: '9786303218656',
      mpn: 'ART978-630-321-865-6',
      brand: 'GRUPUL EDITORIAL ART',
      shippingCost: '12.90',
      specs: {
        author: 'J.K. Rowling',
        publisher: 'GRUPUL EDITORIAL ART',
        format: 'https://schema.org/Hardcover',
        language: 'ro',
        edition: 'Cartonata',
        pages: '616',
        year: '2025',
        isbn: '9786303218656',
      },
    });
  });

  it('normalizes the ISBN to a GTIN-14 and drops the publisher-coded MPN', () => {
    const n = norm(res.offers[0]!);
    expect(n).toMatchObject({ ok: true, gtin14: '09786303218656', gtinQuality: 'valid', mpnNorm: null, mpnSource: null, brandName: 'Art', productKind: 'book' });
    expect(n.attributes).toMatchObject({ bookFormat: 'hardcover', bookLanguage: 'ro', bookPages: 616, bookYear: 2025, bookAuthors: ['J.K. Rowling'] });
  });
});

describe('Libris category sitemap', () => {
  it('lists the category tree (5,272 URLs), books under /carti', () => {
    const sm = parseSitemap(fixture('libris/sitemap-categorii_2026-11-09.xml'));
    expect(sm.urls).toHaveLength(5272);
    expect(sm.urls.map((u) => u.loc)).toContain('https://www.libris.ro/carti/carti-pentru-copii/literatura-fantasy');
    expect(sm.urls.map((u) => u.loc)).toContain('https://www.libris.ro/sf-fantasy/romane-fantasy');
  });
});

describe('Elefant listing (elefant-listing, discovery only)', () => {
  const res = run('elefant', 'elefant-listing', 'elefant/listing-carti-pentru-copii_2026-11-09.html');

  it('yields 59 product links and the next page, no offer (tiles load from a robots-disallowed path)', () => {
    expect(res.offers).toHaveLength(0);
    expect(res.productUrls).toHaveLength(59);
    expect(res.productUrls).toContain('https://www.elefant.ro/tup-imposibil-e-doar-un-cuvant-cartea-intai-editia-a-iii-a_d5566ae4-f147-4c46-948c-1c817d6ae3a1');
    expect(res.productUrls!.every((u) => !u.includes('/INTERSHOP/'))).toBe(true);
    expect(res.nextPageUrl).toBe('https://www.elefant.ro/list/carti/carte/carti-pentru-copii?pag=2');
    expect(res.meta).toMatchObject({ items: 59, discoveryOnly: true });
  });
});

describe('Elefant product page (elefant-product)', () => {
  const res = run('elefant', 'elefant-product', 'elefant/product-tup-imposibil-cartea-intai_2026-11-09.html');

  it('reads the price as displayed, the spec list and the seller', () => {
    expect(res.offers).toHaveLength(1);
    expect(res.offers[0]).toMatchObject({
      externalId: 'd5566ae4-f147-4c46-948c-1c817d6ae3a1',
      url: 'https://www.elefant.ro/tup-imposibil-e-doar-un-cuvant-cartea-intai-editia-a-iii-a_d5566ae4-f147-4c46-948c-1c817d6ae3a1',
      title: 'Tup. Imposibil e doar un cuvant. Cartea intai. Editia a III-a',
      price: '41,4 lei',
      priceFormat: 'ro',
      oldPrice: '69,0 lei',
      availability: 'in stoc',
      condition: 'Noua',
      gtin: '9786064402332',
      brand: 'Curtea Veche Publishing',
      category: 'Carti > Carte > Carti pentru copii > Povesti si povestiri',
      sellerName: 'Elefant',
      specs: { author: 'Alex Donovici', publisher: 'Curtea Veche Publishing', format: 'Cartonata', language: 'Romana', pages: '96', year: '2.019', isbn: '978-606-44-0233-2' },
    });
    expect(res.offers[0]!.isMarketplaceSeller).toBeUndefined();
    expect(res.offers[0]!.imageUrl).toBeUndefined();
  });

  it('normalizes as a children’s book: volume 1, edition 3, hardcover, 2019, Curtea Veche', () => {
    const n = norm(res.offers[0]!);
    expect(n).toMatchObject({ ok: true, priceBani: 4140, oldPriceBani: 6900, gtin14: '09786064402332', brandName: 'Curtea Veche', condition: 'new', availability: 'in_stock' });
    expect(n.attributes).toMatchObject({ kind: 'book', bookVolume: 1, bookEdition: 3, bookFormat: 'hardcover', bookLanguage: 'ro', bookYear: 2019, bookPages: 96, bookAuthors: ['Alex Donovici'] });
    expect(n.shippingBani).toBeNull();
  });
});
