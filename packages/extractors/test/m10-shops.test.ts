import { describe, expect, it } from 'vitest';
import { decodeEntities, parsePageDetailed, type PageParseResult } from '../src/index';
import { fixture, summary } from './helpers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Parses a recorded fixture with the URL it was finally served from (after redirects). */
function run(shop: string, parser: string, path: string): PageParseResult {
  const meta = JSON.parse(readFileSync(`${root}${path}.meta.json`, 'utf8')) as {
    url: string;
    final_url?: string;
    recorded_at: string;
  };
  return parsePageDetailed(parser, fixture(path), {
    url: meta.final_url ?? meta.url,
    shopSlug: shop,
    observedAt: meta.recorded_at,
  });
}

function expectListingBasics(res: PageParseResult, count: number) {
  expect(res.offers).toHaveLength(count);
  expect(new Set(res.offers.map((o) => o.externalId)).size).toBe(count);
  for (const o of res.offers) {
    expect(o.url).toMatch(/^https:\/\//);
    expect(o.title).not.toMatch(/&(quot|amp|#\d+);/);
    expect(o.price).toMatch(/\d/);
  }
  expect(res.productUrls).toHaveLength(count);
}

describe('IT Galaxy listing (itgalaxy-listing)', () => {
  const res = run('itgalaxy', 'itgalaxy-listing', 'itgalaxy/listing-televizoare_2026-10-27.html');

  it('reads 36 cards with the product id, Romanian-format prices, stock and EAN', () => {
    expectListingBasics(res, 36);
    expect(res.offers.find((o) => o.externalId === '932454')).toMatchObject({
      url: 'https://www.itgalaxy.ro/televizoare/thomson/thomson-24hg2s15cw-24-hd-google-tv-led-12v-white-932454/',
      title:
        'Televizor LED Smart Thomson 24HG2S15CW 24Inch / 60CM HD Google TV Dolby Audio Adaptor 12V Alb',
      price: '868,99 lei',
      priceFormat: 'ro',
      oldPrice: '1.199,99 lei',
      availability: 'in stoc limitat',
      gtin: '9120106663334',
      category: 'TV si Electronice > Televizoare',
    });
    expect(res.offers.filter((o) => o.gtin)).toHaveLength(10);
    expect(res.offers.filter((o) => o.oldPrice)).toHaveLength(11);
    expect(res.offers.every((o) => o.shopLowest30d === undefined)).toBe(true);
  });

  it('the external id is the numeric id of the product URL (the product page JSON-LD sku)', () => {
    for (const o of res.offers) expect(o.url.endsWith(`-${o.externalId}/`)).toBe(true);
  });

  it('follows rel=next to /pagina2/', () => {
    expect(res.nextPageUrl).toBe('https://www.itgalaxy.ro/televizoare/pagina2/');
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('Dedeman listing (dedeman-listing)', () => {
  it('fridges: Magento amounts, crossed price only with a special price, stock as worded', () => {
    const res = run('dedeman', 'dedeman-listing', 'dedeman/listing-frigidere_2026-10-27.html');
    expectListingBasics(res, 23);
    expect(res.offers.find((o) => o.externalId === '3051493')).toMatchObject({
      title: expect.stringMatching(/^Frigider Candy CDG1S514EW/),
      price: '919.00',
      priceFormat: 'decimal',
      oldPrice: '1049.00',
      availability: 'Verifică disponibilitatea online',
      category: 'Electrocasnice > Aparate frigorifice > Frigidere',
      raw: expect.objectContaining({ priceLabel: 'Super Preț', unit: '/bucată', addToCart: true }),
    });
    expect(res.offers.filter((o) => o.oldPrice)).toHaveLength(2);
    expect(res.nextPageUrl).toBeNull();
    for (const o of res.offers) expect(o.url.endsWith(`/p/${o.externalId}`)).toBe(true);
    expect(res.offers.map(summary)).toMatchSnapshot();
  });

  it('cables: 72 cards per page and the next page from "Pagina 1 din 2"', () => {
    const res = run('dedeman', 'dedeman-listing', 'dedeman/listing_2026-10-27.html');
    expectListingBasics(res, 72);
    expect(res.offers[0]).toMatchObject({
      externalId: '1071660',
      price: '36.99',
      availability: 'Disponibil online',
      oldPrice: undefined,
    });
    expect(res.nextPageUrl).toBe(
      'https://www.dedeman.ro/ro/cabluri-audio-video-si-adaptoare/c/6729?page=2',
    );
  });

  it('skips cards priced per another unit than the piece', () => {
    const html = `<div class="item product product-item"><div class="product-item-info"><a class="product-item-link" href="https://www.dedeman.ro/ro/gresie-x/p/123">Gresie X</a>
      <div class="price-box"><span class="final-price"><span data-price-amount="39.90" data-price-type="oldPrice"></span><span class="price-sale-unit">/mp</span></span></div>
      <form data-product-sku="123"></form></div></div>`;
    const res = parsePageDetailed('dedeman-listing', html, {
      url: 'https://www.dedeman.ro/ro/gresie/c/1',
      shopSlug: 'dedeman',
      observedAt: '2026-10-27T00:00:00Z',
    });
    expect(res.offers).toEqual([]);
    expect(res.meta).toMatchObject({ unitPriced: 1, items: 1 });
  });
});

describe('Carrefour listing (carrefour-listing)', () => {
  const res = run(
    'carrefour',
    'carrefour-listing',
    'carrefour/listing-televizoare-smart_2026-10-27.html',
  );

  it('reads the card, never the wishlist link that carries another product', () => {
    expectListingBasics(res, 24);
    expect(res.offers.find((o) => o.externalId === '44503250')).toMatchObject({
      url: 'https://carrefour.ro/produse/televizor-smart-qled-tcl-85t69c-214-cm-google-tv-4k-ultra-hd-clasa-f-negru-19-44503250',
      title: 'Televizor Smart QLED TCL 85T69C, 214 cm, Google TV, 4K Ultra HD, Clasa F, Negru',
      price: '4099.99',
      oldPrice: '5399.99',
      brand: 'TCL',
      availability: 'https://schema.org/InStock',
      category: 'TV, Audio & Home cinema > Televizoare & Accesorii > Televizoare SMART',
    });
    expect(res.offers.find((o) => o.externalId === '44503097')).toMatchObject({
      price: '4299.99',
      oldPrice: undefined,
      brand: 'Sony',
      availability: 'available',
    });
    expect(res.offers.filter((o) => o.oldPrice)).toHaveLength(17);
    for (const o of res.offers) expect(o.url.endsWith(`-${o.externalId}`)).toBe(true);
  });

  it('paginates with rel=next ?p=2 and the product page agrees on the id', () => {
    expect(res.nextPageUrl).toBe(
      'https://carrefour.ro/tv-audio-home-cinema/televizoare-accesorii/televizoare-smart?p=2',
    );
    const product = run('carrefour', 'jsonld-product', 'carrefour/product_2026-10-27.html');
    expect(product.offers[0]).toMatchObject({ externalId: '44503250', price: '4099.99' });
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('Auchan / VTEX state (vtex-listing)', () => {
  const res = run('auchan', 'vtex-listing', 'auchan/listing-televizoare_2026-10-27.html');

  it('emits the priced products with EAN and counts the unavailable ones', () => {
    expect(res.offers).toHaveLength(4);
    expect(res.meta).toMatchObject({ items: 24, unpriced: 20, recordsFiltered: 117 });
    expect(res.offers[0]).toMatchObject({
      externalId: '351429',
      url: 'https://www.auchan.ro/televizor-qd-mini-led-smart-tcl-55c61ks-google-tv-139cm/p',
      title: 'Televizor QD-Mini LED Smart TCL 55C61KS, Google TV, 4K Ultra HD, 139 cm',
      price: '2399.99',
      priceFormat: 'decimal',
      oldPrice: undefined,
      gtin: '5901292526894',
      brand: 'AEC',
      availability: 'https://schema.org/InStock',
      sellerName: 'Auchan Romania',
      isMarketplaceSeller: undefined,
      category: 'Electro, Climatizare si Aparate ingrijire > Electronice > Televizoare',
    });
    expect(res.offers.map(summary)).toMatchSnapshot();
  });

  it('builds the next page as ?page=2 (the site links ?map=, which robots.txt disallows)', () => {
    expect(res.nextPageUrl).toBe(
      'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c?page=2',
    );
    const p2 = parsePageDetailed(
      'vtex-listing',
      fixture('auchan/listing-televizoare_2026-10-27.html'),
      {
        url: 'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c?page=2',
        shopSlug: 'auchan',
        observedAt: '2026-10-27T00:00:00Z',
      },
    );
    expect(p2.nextPageUrl).toBe(
      'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c?page=3',
    );
  });

  it('a page of unavailable products lists items without offers; a page without state lists nothing', () => {
    const state = {
      'Product:sp-1': {
        productId: '1',
        productName: 'Televizor A',
        link: '/televizor-a/p',
        brand: 'X',
      },
      'Product:sp-1.items({"filter":"ALL_AVAILABLE"}).0': {
        itemId: '1',
        ean: '5901292526894',
        sellers: [{ type: 'id', id: 'Product:sp-1.items({"filter":"ALL_AVAILABLE"}).0.sellers.0' }],
      },
      'Product:sp-1.items({"filter":"ALL_AVAILABLE"}).0.sellers.0': {
        sellerId: '1',
        sellerName: 'Auchan Romania',
        sellerDefault: true,
        commertialOffer: { type: 'id', id: '$co1' },
      },
      $co1: { Price: 0, ListPrice: 0, AvailableQuantity: 0 },
    };
    const html = `<template data-type="json" data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template>`;
    const empty = parsePageDetailed('vtex-listing', html, {
      url: 'https://www.auchan.ro/x/c',
      shopSlug: 'auchan',
      observedAt: '2026-10-27T00:00:00Z',
    });
    expect(empty.offers).toEqual([]);
    expect(empty.meta).toMatchObject({ items: 1, unpriced: 1 });
    const none = parsePageDetailed('vtex-listing', '<html></html>', {
      url: 'https://www.auchan.ro/x/c',
      shopSlug: 'auchan',
      observedAt: '2026-10-27T00:00:00Z',
    });
    expect(none.meta).toMatchObject({ items: 0 });
  });
});

describe('Bonami listing (bonami-listing)', () => {
  it('reads __NEXT_DATA__ money exactly, the crossed retail price, brand and stock', () => {
    const res = run(
      'bonami',
      'bonami-listing',
      'bonami/listing-aparate-de-bucatarie_2026-10-27.html',
    );
    expectListingBasics(res, 48);
    expect(res.offers.find((o) => o.externalId === '1932698')).toMatchObject({
      url: 'https://www.bonami.ro/p/air-fryer-bej-putty-haden',
      title: 'Air fryer bej Putty – Haden',
      price: '717.00',
      oldPrice: '844.00',
      brand: 'Haden',
      availability: 'https://schema.org/InStock',
      category: 'Bucătărie și servirea mesei > Electrocasnice de bucătărie',
    });
    expect(res.offers.find((o) => o.externalId === '1932706')).toMatchObject({
      price: '439.00',
      oldPrice: undefined,
    });
    expect(res.nextPageUrl).toBe('https://www.bonami.ro/c/aparate-de-bucatarie?p=1');
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('forit listing through the generic parser (jsonld-product)', () => {
  const res = run('forit', 'jsonld-product', 'forit/listing-televizoare_2026-10-27.html');

  it('reads the JSON-LD ItemList: 60 offers, absolute URLs, offer delivery cost, decoded entities', () => {
    expectListingBasics(res, 60);
    expect(res.offers[0]).toMatchObject({
      externalId: 'LEDV24MFZHN',
      url: 'https://www.forit.ro/televizor-vortex-led-v24mfzhn-hd-60cm-bp841273',
      price: '410.49',
      mpn: 'LEDV24MFZHN',
      brand: 'Vortex',
      shippingCost: '21.99',
      category: 'Televizoare',
    });
    expect(res.offers[1]).toMatchObject({ externalId: 'V32H501VS', shippingCost: '0.00' });
    expect(res.offers.find((o) => o.externalId === 'UE32H5002FKXXH')?.title).toBe(
      'Televizor Samsung UE32H5002FK 81.3 cm (32") HD Smart TV Wi-Fi Black',
    );
    expect(res.offers.find((o) => o.externalId === '98RM9L')?.title).toContain('Bang & Olufsen');
  });

  it('paginates with rel=next and agrees with the product page on the id', () => {
    expect(res.nextPageUrl).toBe('https://www.forit.ro/televizoare/p2/c');
    const product = run('forit', 'jsonld-product', 'forit/product_2026-10-27.html');
    expect(product.offers).toHaveLength(1);
    expect(product.offers[0]).toMatchObject({
      externalId: 'LEDV24MFZHN',
      price: '410.49',
      shippingCost: '21.99',
    });
    expect(product.nextPageUrl).toBeUndefined();
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('Flip product page (flip-product)', () => {
  it('refurbished, grade out of the title, stock and page data instead of the wrong JSON-LD bits', () => {
    const res = run('flip', 'flip-product', 'flip/product_2026-10-27.html');
    expect(res.offers).toHaveLength(1);
    expect(res.offers[0]).toMatchObject({
      externalId: '7991',
      url: 'https://flip.ro/magazin/apple/telefon-mobil-apple-iphone-12-128gb-black/1105/',
      title: 'Apple iPhone 12, Black, 128 GB',
      price: '1419.99',
      condition: 'https://schema.org/RefurbishedCondition',
      availability: 'https://schema.org/InStock',
      brand: 'Apple',
      category: 'Telefon mobil > Apple > iPhone 12',
      shippingCost: undefined,
      oldPrice: undefined,
      raw: expect.objectContaining({
        grade: 'Excelent',
        stock: 29,
        retailPrice: 2250,
        courierPrice: 19.99,
        lockerPrice: 11.99,
        jsonLdShippingCost: '0',
      }),
    });
    // The generic parser on the same page would record it as used, with free delivery.
    const generic = run('flip', 'jsonld-product', 'flip/product_2026-10-27.html');
    expect(generic.offers[0]).toMatchObject({
      condition: 'https://schema.org/UsedCondition',
      shippingCost: '0',
    });
  });
});

describe('decodeEntities', () => {
  it('decodes the entities shops leave in JSON-LD strings and nothing else', () => {
    expect(decodeEntities('32&quot; Bang &amp; Olufsen &#039;x&#x27; &lt;b&gt;')).toBe(
      "32\" Bang & Olufsen 'x' <b>",
    );
    expect(decodeEntities('AT&T R&D &unknown; &#0;')).toBe('AT&T R&D &unknown; &#0;');
  });
});
