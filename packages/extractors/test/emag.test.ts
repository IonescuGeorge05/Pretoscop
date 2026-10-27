import { describe, expect, it } from 'vitest';
import { emagPnk, emagSlugMpn, parsePage, parsePageDetailed } from '../src/index';
import { fixture, fixtureMeta, summary } from './helpers';

const LISTING = 'emag/listing_2026-10-27.html';
const VENDOR_LISTING = 'emag/listing-vendor-emag_2026-10-27.html';
const PRODUCT = 'emag/product_2026-10-27.html';

function ctx(path: string) {
  const m = fixtureMeta(path);
  return { url: m.url, shopSlug: 'emag', observedAt: m.recorded_at };
}

describe('eMAG listing', () => {
  const res = parsePageDetailed('emag-listing', fixture(LISTING), ctx(LISTING));

  it('reads all 60 product cards and the next page', () => {
    expect(res.offers).toHaveLength(60);
    expect(res.productUrls).toHaveLength(60);
    expect(res.nextPageUrl).toBe('https://www.emag.ro/telefoane-mobile/p2/c');
    expect(res.meta).toMatchObject({ skipped: 0, page: 1 });
  });

  it('extracts the first card exactly', () => {
    expect(res.offers[0]).toMatchObject({
      shopSlug: 'emag',
      externalId: '421625672',
      url: 'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/',
      title: 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry',
      price: '3.170,99 Lei',
      priceFormat: 'ro',
      availability: 'in_stock',
      mpn: 'SM-S741BZVDEUE',
      category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    });
    expect(res.offers[0]?.raw).toMatchObject({ pnk: 'DF1MLR2BM', productId: '138231929', rating: 4.2, reviews: 5, sellerUnknown: true });
  });

  it('uses the crossed price (lowest 30 days) as reference and keeps PRP out of it', () => {
    const crossed = res.offers.filter((o) => o.oldPrice);
    expect(crossed.length).toBe(4);
    for (const o of crossed) expect(o.shopLowest30d).toBe(o.oldPrice);
    const withRrp = res.offers.find((o) => o.raw.rrp);
    expect(withRrp?.oldPrice).toBeUndefined();
    expect(String(withRrp?.raw.rrp)).toMatch(/Lei$/);
  });

  it('maps limited stock classes and recovers MPNs from slugs', () => {
    expect(res.offers.some((o) => o.availability === 'limited_stock_qty')).toBe(true);
    expect(res.offers.filter((o) => o.mpn).length).toBeGreaterThanOrEqual(55);
  });

  it('parses the vendor-filtered listing too', () => {
    const v = parsePage('emag-listing', fixture(VENDOR_LISTING), fixtureMeta(VENDOR_LISTING).url, { shopSlug: 'emag' });
    expect(v).toHaveLength(60);
  });

  it('matches the snapshot', () => {
    expect(res.offers.slice(0, 8).map(summary)).toMatchSnapshot();
  });
});

describe('eMAG product page', () => {
  const res = parsePageDetailed('emag-product', fixture(PRODUCT), ctx(PRODUCT));

  it('returns one offer per seller, with sellers named', () => {
    expect(res.offers).toHaveLength(9);
    expect(res.meta).toMatchObject({ pnk: 'DF1MLR2BM', mpn: 'SM-S741BZVDEUE', offersCount: 9 });
    const main = res.offers[0]!;
    expect(main).toMatchObject({
      externalId: '421625672',
      sellerName: 'TelefonulTau',
      isMarketplaceSeller: true,
      price: '3170.99',
      priceFormat: 'decimal',
      availability: 'in_stock',
      brand: 'Samsung',
      mpn: 'SM-S741BZVDEUE',
    });
    const emag = res.offers.find((o) => o.sellerName === 'eMAG');
    expect(emag).toMatchObject({ externalId: '410910082', isMarketplaceSeller: false, price: '3312.98' });
    expect(res.offers.map((o) => o.sellerName)).toEqual(
      expect.arrayContaining(['evomag', 'VEXIO', 'Flanco']),
    );
  });

  it('never assumes availability for offers known only from the analytics array', () => {
    const secondary = res.offers.filter((o) => o.raw.offerKind === 'secondary');
    expect(secondary.length).toBe(7);
    for (const o of secondary) expect(o.availability).toBeUndefined();
  });

  it('matches the snapshot', () => {
    expect(res.offers.map(summary)).toMatchSnapshot();
  });
});

describe('eMAG helpers', () => {
  it('emagPnk', () => {
    expect(emagPnk('https://www.emag.ro/x/pd/DF1MLR2BM/')).toBe('DF1MLR2BM');
    expect(emagPnk('https://www.emag.ro/telefoane-mobile/c')).toBeUndefined();
  });

  it('emagSlugMpn only returns plausible part numbers', () => {
    expect(emagSlugMpn('https://www.emag.ro/consola-sony-ps5-slim-cfi-2016/pd/DXX1/', 'Consola Sony PS5 Slim')).toBe('CFI-2016');
    expect(emagSlugMpn('https://www.emag.ro/consola-sony-ps5-slim/pd/DXX1/', 'Consola Sony PS5 Slim')).toBeUndefined();
    expect(emagSlugMpn('https://www.emag.ro/alt-produs-abc123/pd/DXX1/', 'Consola Sony PS5 Slim')).toBeUndefined();
  });
});
