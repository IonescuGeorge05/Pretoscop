import { describe, expect, it } from 'vitest';
import {
  breadcrumbList,
  gtinProperty,
  itemList,
  organization,
  productJsonLd,
  validateStructuredData,
  website,
  type ProductLdInput,
  type ProductLdOffer,
} from '../structured-data';

const BASE = 'https://pretoscop.ro';
const offer = (over: Partial<ProductLdOffer> = {}): ProductLdOffer => ({
  price: '2149.00',
  total: '2168.99',
  shippingCost: '19.99',
  availability: 'in_stock',
  condition: 'new',
  url: 'https://www.emag.ro/telefon/pd/D1',
  seller: 'eMAG',
  stale: false,
  ...over,
});
const product = (over: Partial<ProductLdInput> = {}): ProductLdInput => ({
  path: '/p/telefon-samsung-galaxy-a57-12',
  title: 'Telefon mobil Samsung Galaxy A57, 8GB RAM, 128GB, 5G',
  brand: 'Samsung',
  mpn: 'SM-A576B',
  gtins: ['08806095530003'],
  category: 'Telefoane mobile',
  images: [],
  offers: [offer()],
  ...over,
});

// Ten product fixtures covering what real pages produce (M16 acceptance: JSON-LD validated for 10 fixtures).
const FIXTURES: Array<[string, ProductLdInput]> = [
  ['one shop offer with delivery', product()],
  ['several shops, sorted, low/high from item prices', product({ offers: [offer({ price: '2249.99', total: '2249.99', shippingCost: '0.00' }), offer({ price: '2179.00', total: '2179.00', shippingCost: null, seller: 'IT Galaxy', url: 'https://www.itgalaxy.ro/x' }), offer()] })],
  ['marketplace seller named as seller', product({ offers: [offer({ seller: 'Gadget Store SRL' })] })],
  ['refurbished and used conditions', product({ offers: [offer({ condition: 'refurbished' }), offer({ condition: 'used', price: '1500.00', total: '1500.00' })] })],
  ['out-of-stock offer left out while one is in stock', product({ offers: [offer(), offer({ availability: 'out_of_stock', price: '1999.00', total: '1999.00' })] })],
  ['stale offers left out', product({ offers: [offer(), offer({ stale: true, price: '999.00', total: '999.00' })] })],
  ['no brand, no MPN, no GTIN', product({ brand: null, mpn: null, gtins: [] })],
  ['UPC (GTIN-12) and licensed image', product({ gtins: ['00012345678905'], images: ['/media/images/p/12_800.jpg'] })],
  ['more than ten offers capped at ten', product({ offers: Array.from({ length: 14 }, (_, i) => offer({ price: `${2000 + i}.00`, total: `${2000 + i}.00`, url: `https://shop${i}.ro/p` })) })],
  ['pre-order only: the AggregateOffer describes it as PreOrder', product({ offers: [offer({ availability: 'preorder' })] })],
];

describe('productJsonLd (10 fixtures)', () => {
  it.each(FIXTURES)('%s: valid', (_name, input) => {
    const ld = productJsonLd(BASE, input)!;
    expect(validateStructuredData(ld)).toEqual([]);
  });

  it('builds the AggregateOffer from live, in-stock item prices with delivery as shippingDetails', () => {
    const ld = productJsonLd(BASE, FIXTURES[1]![1]) as unknown as { offers: { lowPrice: string; highPrice: string; offerCount: number; offers: Array<{ price: string; seller: { name: string }; shippingDetails?: unknown }> } };
    expect(ld.offers).toMatchObject({ lowPrice: '2149.00', highPrice: '2249.99', offerCount: 3 });
    expect(ld.offers.offers.map((o) => o.seller.name)).toEqual(['eMAG', 'IT Galaxy', 'eMAG']);
    expect(ld.offers.offers[1]!.shippingDetails).toBeUndefined();
  });

  type Agg = { offers: { lowPrice: string; highPrice: string; offerCount: number; offers: Array<{ price: string; availability?: string; seller?: { name: string } }> } };
  const agg = (input: ProductLdInput) => (productJsonLd(BASE, input) as unknown as Agg).offers;

  it('omits stale offers, caps at ten, and describes one set: in-stock offers when there are any', () => {
    // An in-stock offer at 2149 and an out-of-stock one at 1999: only the in-stock one is described.
    expect(agg(FIXTURES[4]![1])).toMatchObject({ offerCount: 1, lowPrice: '2149.00', highPrice: '2149.00' });
    expect(agg(FIXTURES[4]![1]).offers.map((o) => o.price)).toEqual(['2149.00']);
    expect(agg(FIXTURES[5]![1])).toMatchObject({ offerCount: 1, lowPrice: '2149.00' });
    expect(agg(FIXTURES[8]![1])).toMatchObject({ offerCount: 14 });
    expect(agg(FIXTURES[8]![1]).offers).toHaveLength(10);
    expect(agg(FIXTURES[9]![1])).toMatchObject({ offerCount: 1, offers: [{ availability: 'https://schema.org/PreOrder' }] });
  });

  it('without an in-stock offer, every live offer is described; without a live offer there is no Product', () => {
    const outOfStock = product({ offers: [offer({ availability: 'out_of_stock', price: '1999.00', total: '1999.00' }), offer({ availability: 'out_of_stock' })] });
    expect(validateStructuredData(productJsonLd(BASE, outOfStock))).toEqual([]);
    expect(agg(outOfStock)).toMatchObject({ offerCount: 2, lowPrice: '1999.00', highPrice: '2149.00' });
    expect(agg(outOfStock).offers.every((o) => o.availability === 'https://schema.org/OutOfStock')).toBe(true);
    expect(productJsonLd(BASE, product({ offers: [offer({ stale: true })] }))).toBeNull();
    expect(productJsonLd(BASE, product({ offers: [] }))).toBeNull();
  });

  it('states only what we observed: no availability when unknown, no seller when a marketplace offer names none', () => {
    const o = agg(product({ offers: [offer({ availability: 'unknown', seller: null })] })).offers[0]!;
    expect(o.availability).toBeUndefined();
    expect(o.seller).toBeUndefined();
    expect(validateStructuredData(productJsonLd(BASE, product({ offers: [offer({ availability: 'unknown', seller: null })] })))).toEqual([]);
  });

  it('uses the most specific GTIN property and absolute URLs', () => {
    expect(gtinProperty('08806095530003')).toEqual({ gtin13: '8806095530003' });
    expect(gtinProperty('00012345678905')).toEqual({ gtin12: '012345678905' });
    expect(gtinProperty('00000040170725')).toEqual({ gtin8: '40170725' });
    expect(gtinProperty('18806095530000')).toEqual({ gtin14: '18806095530000' });
    const ld = productJsonLd(BASE, FIXTURES[7]![1]) as unknown as { url: string; image: string[] };
    expect(ld).not.toBeNull();
    expect(ld.url).toBe('https://pretoscop.ro/p/telefon-samsung-galaxy-a57-12');
    expect(ld.image).toEqual(['https://pretoscop.ro/media/images/p/12_800.jpg']);
  });

  it('the validator catches broken markup', () => {
    const bad = { ...productJsonLd(BASE, product()), offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: '10', highPrice: '5.00', offerCount: 0, offers: [] } };
    expect(validateStructuredData(bad)).toEqual(
      expect.arrayContaining(['AggregateOffer: priceCurrency must be RON', 'AggregateOffer: lowPrice/highPrice must be prices with two decimals', 'AggregateOffer: offerCount must be a positive integer']),
    );
    const noOffers: Record<string, unknown> = { ...productJsonLd(BASE, product())! };
    delete noOffers.offers;
    expect(validateStructuredData(noOffers)).toContain('Product: offers, review or aggregateRating required');
  });
});

describe('other types', () => {
  it('BreadcrumbList, ItemList, Organization and WebSite + SearchAction are valid', () => {
    const all = [
      breadcrumbList(BASE, [
        { name: 'Pretoscop', href: '/' },
        { name: 'TV și audio', href: '/c/tv-audio' },
        { name: 'Televizoare', href: '/c/tv-audio/televizoare' },
      ]),
      itemList(BASE, 'Televizoare', ['/p/a-1', '/p/b-2'], 25),
      organization(BASE),
      website(BASE),
    ];
    expect(validateStructuredData(all)).toEqual([]);
    expect((website(BASE).potentialAction.target as { urlTemplate: string }).urlTemplate).toBe('https://pretoscop.ro/cauta?q={search_term_string}');
    expect((itemList(BASE, 'x', ['/p/a-1'], 25).itemListElement[0] as { position: number }).position).toBe(25);
  });
});
