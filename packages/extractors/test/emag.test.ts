import { describe, expect, it } from 'vitest';
import { emagPnk, emagSlugMpn, emagSlugTail, isUrlDerivedMpn, parsePage, parsePageDetailed, urlMpnHint } from '../src/index';
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
      availability: 'https://schema.org/InStock',
      mpnHint: 'SM-S741BZVDEUE',
      category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    });
    // A listing states no MPN: the slug tail is a low-trust hint, never `mpn`.
    expect(res.offers[0]?.mpn).toBeUndefined();
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

  it('maps eMAG availability ids (3 in stock, 2 limited, 8 pre-order) and keeps slug codes as hints', () => {
    expect(res.offers.filter((o) => o.availability === 'https://schema.org/LimitedAvailability').length).toBeGreaterThan(0);
    expect(res.offers.filter((o) => o.availability === 'https://schema.org/PreOrder').length).toBeGreaterThan(0);
    expect(res.offers.every((o) => o.availability !== undefined)).toBe(true);
    expect(res.offers.filter((o) => o.mpnHint).length).toBeGreaterThanOrEqual(55);
    expect(res.offers.filter((o) => o.mpn)).toEqual([]);
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
    // The JSON-LD `mpn` is stated by eMAG (a field); the slug tail stays a hint.
    expect(res.meta).toMatchObject({ pnk: 'DF1MLR2BM', mpn: 'SM-S741BZVDEUE', mpnHint: 'SM-S741BZVDEUE', offersCount: 9 });
    for (const o of res.offers) expect(o).toMatchObject({ mpn: 'SM-S741BZVDEUE', mpnHint: 'SM-S741BZVDEUE' });
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
    // A different product's slug yields its own code, never the queried title's words.
    expect(emagSlugMpn('https://www.emag.ro/consola-sony-ps5-slim-2026/pd/DXX1/', 'Consola Sony PS5 Slim')).toBeUndefined();
    // eMAG transliterates ™ → tm and ® → r: the trailing part number is still found.
    expect(
      emagSlugMpn(
        'https://www.emag.ro/laptop-lenovo-yoga-slim-7-14iph11-cu-procesor-intel-coretm-ultra-7-355-pana-la-4-7ghz-14-wuxga-oled-16gb-lpddr5x-ram-1tb-ssd-intelr-graphics-windows-11-home-seashell-3y-on-site-premium-care-83qm0034rm/pd/D2GQL32BM/',
        'Laptop Lenovo Yoga Slim 7 14IPH11 cu procesor Intel Core™ Ultra 7 355 pana la 4.7GHz, 14" WUXGA, OLED, 16GB LPDDR5x RAM, 1TB SSD, Intel® Graphics, Windows 11 Home, Seashell, 3Y On-site Premium Care',
      ),
    ).toBe('83QM0034RM');
    expect(emagSlugMpn('https://www.emag.ro/telefon-mobil-apple-iphone-17-pro-max-256gb-5g-silver-mfym4zd-a/pd/D1/', 'Telefon mobil Apple iPhone 17 Pro Max, 256GB, 5G, Silver')).toBe('MFYM4ZD-A');
  });

  // Slug tails of real offers recorded on 2026-10-27 (titles shortened): [slug, title, hint, structural tail].
  const SLUGS: Array<[string, string, string | undefined, string]> = [
    ['telefon-mobil-samsung-galaxy-s26-dual-sim-8gb-ram-256gb-5g-cobalt-violet-sm-s942bzkgeue', 'Telefon mobil Samsung Galaxy S26, Dual SIM, 8GB RAM, 256GB, 5G, Cobalt Violet', 'SM-S942BZKGEUE', 'SM-S942BZKGEUE'],
    ['televizor-samsung-led-43u8072h-108-cm-smart-4k-ultra-hd-clasa-f-model-2026-ue43u8072huxxh', 'Televizor SAMSUNG LED 43U8072H, 108 cm, Smart, 4K Ultra HD, Clasa F (Model 2026)', 'UE43U8072HUXXH', 'UE43U8072HUXXH'],
    ['consola-portabila-gaming-valve-steam-deck-256gb-negru-b0bhpq5msm', 'Consola portabila gaming Valve Steam Deck 256GB, Negru', undefined, 'B0BHPQ5MSM'],
    ['consola-retro-entertainment-system-cu-620-de-jocuri-incluse-4-butoane-620jocuri', 'Consola retro Entertainment System cu 620 de jocuri incluse, 4 butoane', undefined, '620JOCURI'],
    ['gaming-notebook-16-gb-ram-512-gb-1-tb-ssd-expansiune-erik-ro-b9-grey', 'Gaming Notebook 16 GB RAM 512 GB 1 TB SSD expansiune', undefined, 'ERIK-RO-B9-GREY'],
    ['laptop-acer-nitro-v15-anv15-41-r948-nh-qsgex-00h-15-6-amd-ryzen-7-7735hs-kxg0214352', 'Laptop Acer Nitro V15 ANV15-41-R948, NH.QSGEX.00H, 15.6", AMD Ryzen 7 7735HS', 'KXG0214352', 'KXG0214352'],
  ];

  it.each(SLUGS)('emagSlugTail / emagSlugMpn on %s', (slug, title, hint, tail) => {
    const url = `https://www.emag.ro/${slug}/pd/D1/`;
    expect(emagSlugTail(url, title)).toBe(tail);
    expect(emagSlugMpn(url, title)).toBe(hint);
    expect(urlMpnHint('emag', url, title)).toBe(hint);
    expect(urlMpnHint('altex', url, title)).toBeUndefined();
  });

  it('recognizes stored MPN fields that were really slug tails', () => {
    const [slug, title] = SLUGS[2]!;
    const url = `https://www.emag.ro/${slug}/pd/D1/`;
    expect(isUrlDerivedMpn('emag', url, title, 'B0BHPQ5MSM')).toBe(true);
    expect(isUrlDerivedMpn('emag', url, title, 'SM-S942BZKGEUE')).toBe(false);
    expect(isUrlDerivedMpn('emag', url, title, null)).toBe(false);
    expect(isUrlDerivedMpn('altex', url, title, 'B0BHPQ5MSM')).toBe(false);
  });
});
