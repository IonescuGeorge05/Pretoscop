import { describe, expect, it } from 'vitest';
import { detectProduct } from '../src/detect';
import { shopById, type ShopDef, type ShopId } from '../src/shops';
import { cheerioPage, recordedUrl, repoFile } from './cheerio-page';

const shop = (id: ShopId): ShopDef => shopById(id)!;
const EMAG = 'packages/extractors/fixtures/emag';
const FIX = 'apps/extension/fixtures';

function detectFile(path: string, url: string, id: ShopId, afterNavigation = false) {
  return detectProduct(cheerioPage(repoFile(path), url), shop(id), { afterNavigation });
}

const EMAG_PRODUCT = `${EMAG}/product_2026-10-27.html`;
const EMAG_CANONICAL = 'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/';

describe('eMAG (recorded pages, M03)', () => {
  it('reads the product page: canonical address, brand and part number from its JSON-LD Product', () => {
    expect(detectFile(EMAG_PRODUCT, recordedUrl(EMAG_PRODUCT), 'emag')).toEqual({
      productPage: true,
      ids: { url: EMAG_CANONICAL, brand: 'Samsung', mpn: 'SM-S741BZVDEUE' },
      sources: ['jsonld', 'url'],
    });
  });

  it('sends the address without query or fragment (search ids, tracking)', () => {
    const d = detectFile(EMAG_PRODUCT, `${EMAG_CANONICAL}?X-Search-Id=abc&ref=hdr#reviews`, 'emag');
    expect(d.ids?.url).toBe(EMAG_CANONICAL);
  });

  it('treats listings as no product page and sends nothing', () => {
    for (const f of ['listing_2026-10-27.html', 'listing-vendor-emag_2026-10-27.html']) {
      const path = `${EMAG}/${f}`;
      expect(detectFile(path, recordedUrl(path), 'emag')).toEqual({ productPage: false, ids: null, sources: [] });
    }
  });

  it('after an in-page navigation, ignores structured data of another address and the old canonical link', () => {
    const next = 'https://www.emag.ro/telefon-mobil-samsung-galaxy-a57/pd/DXVS722BM/';
    expect(detectFile(EMAG_PRODUCT, next, 'emag', true)).toEqual({ productPage: true, ids: { url: next }, sources: ['url'] });
    // The same address as the JSON-LD: still read.
    expect(detectFile(EMAG_PRODUCT, EMAG_CANONICAL, 'emag', true).ids).toEqual({ url: EMAG_CANONICAL, brand: 'Samsung', mpn: 'SM-S741BZVDEUE' });
  });

  it('never reads a page of another site, even with the shop’s markup', () => {
    expect(detectFile(EMAG_PRODUCT, 'https://emag.ro.example.com/x/pd/DF1MLR2BM/', 'emag').productPage).toBe(false);
    expect(detectFile(EMAG_PRODUCT, 'https://www.altex.ro/x/pd/DF1MLR2BM/', 'emag').productPage).toBe(false);
  });
});

describe('synthetic pages of shops we may not fetch', () => {
  it('Altex: EAN and brand of the product object whose url_key is in the address (__NEXT_DATA__)', () => {
    const url = 'https://altex.ro/telefon-samsung-galaxy-a17-5g-128gb-4gb-ram-dual-sim-gray/cpd/TELA176BGR/';
    // Brand without a part number is not sent (they travel together).
    expect(detectFile(`${FIX}/altex/product_synthetic.html`, url, 'altex')).toEqual({
      productPage: true,
      ids: { url, gtin: '8806097640226' },
      sources: ['next-data', 'url'],
    });
  });

  it('Altex: a related product clicked in the shop (address changed, old __NEXT_DATA__) gives its own EAN, never the previous one', () => {
    const url = 'https://altex.ro/telefon-samsung-galaxy-a26-5g-256gb-8gb-ram-dual-sim-black/cpd/TELA266BBK/';
    expect(detectFile(`${FIX}/altex/product_synthetic.html`, url, 'altex', true).ids).toEqual({ url, gtin: '8806097123408' });
    const unknown = 'https://altex.ro/alt-produs/cpd/TELX1/';
    expect(detectFile(`${FIX}/altex/product_synthetic.html`, unknown, 'altex', true).ids).toEqual({ url: unknown });
  });

  it('Flanco: microdata Product (brand, mpn), canonical .html address', () => {
    expect(detectFile(`${FIX}/flanco/product_synthetic.html`, 'https://www.flanco.ro/telefon-mobil-samsung-galaxy-a56-5g-128gb-8gb-ram-dual-sim-awesome-graphite.html?utm_source=x', 'flanco')).toEqual({
      productPage: true,
      ids: { url: 'https://www.flanco.ro/telefon-mobil-samsung-galaxy-a56-5g-128gb-8gb-ram-dual-sim-awesome-graphite.html', brand: 'Samsung', mpn: 'SM-A566BZKAEUE' },
      sources: ['microdata', 'url'],
    });
  });

  it('Flanco: falls back to the GA4 view_item event when the markup gives no part number', () => {
    const html = repoFile(`${FIX}/flanco/product_synthetic.html`).replace('<meta itemprop="mpn" content="SM-A566BZKAEUE">', '');
    const d = detectProduct(cheerioPage(html, 'https://www.flanco.ro/telefon-mobil-samsung-galaxy-a56-5g-128gb-8gb-ram-dual-sim-awesome-graphite.html'), shop('flanco'));
    expect(d.ids).toMatchObject({ brand: 'Samsung', mpn: 'SM-A566BZKAEUE' });
    expect(d.sources).toEqual(['microdata', 'datalayer', 'url']);
  });

  it('PC Garage: the product page’s JSON-LD Product; the listing’s ItemList products never count', () => {
    const url = 'https://www.pcgarage.ro/placi-video/palit/geforce-rtx-5080-gamingpro-16gb-gddr7-256-bit/';
    expect(detectFile(`${FIX}/pcgarage/product_synthetic.html`, url, 'pcgarage')).toEqual({
      productPage: true,
      ids: { url, brand: 'Palit', mpn: 'NE75080019T2-GB2035S' },
      sources: ['jsonld', 'url'],
    });
  });

  it('evoMAG: JSON-LD Product (brand, mpn)', () => {
    const url = 'https://www.evomag.ro/componente-pc-gaming-placi-video/asus-placa-video-asus-geforce-rtx-3060-dual-oc-v2-12gb-gddr6-192-bit-3817073.html';
    expect(detectFile(`${FIX}/evomag/product_synthetic.html`, url, 'evomag').ids).toEqual({ url, brand: 'ASUS', mpn: 'DUAL-RTX3060-O12G-V2' });
  });

  it.each([
    ['altex', 'altex/listing_synthetic.html', 'https://altex.ro/telefoane/cpl/'],
    ['flanco', 'flanco/category_synthetic.html', 'https://www.flanco.ro/telefoane-tablete/smartphone.html'],
    ['pcgarage', 'pcgarage/listing_synthetic.html', 'https://www.pcgarage.ro/placi-video/'],
    ['evomag', 'evomag/listing_synthetic.html', 'https://www.evomag.ro/componente-pc-gaming-placi-video/'],
  ] as const)('%s: a listing is no product page', (id, file, url) => {
    expect(detectFile(`${FIX}/${file}`, url, id)).toEqual({ productPage: false, ids: null, sources: [] });
  });
});

const page = (body: string, head = '') => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const EMAG_URL = 'https://www.emag.ro/produs/pd/DABC123XY/';

describe('untrusted page data', () => {
  it('two different products on one page give no structured identifiers', () => {
    const html = page('', ld({ '@type': 'Product', brand: 'Samsung', mpn: 'SM-A1' }) + ld({ '@type': 'Product', brand: 'Samsung', mpn: 'EF-COVER' }));
    expect(detectProduct(cheerioPage(html, EMAG_URL), shop('emag'))).toEqual({ productPage: true, ids: { url: EMAG_URL }, sources: ['url'] });
  });

  it('a minimal Product next to the full one is the same product', () => {
    const html = page('', ld({ '@type': 'Product', name: 'Telefon' }) + ld({ '@graph': [{ '@type': ['Product'], brand: { name: 'Samsung' }, mpn: 'SM-A1', gtin13: '8806097640226' }] }));
    expect(detectProduct(cheerioPage(html, EMAG_URL), shop('emag')).ids).toEqual({ url: EMAG_URL, gtin: '8806097640226', brand: 'Samsung', mpn: 'SM-A1' });
  });

  it('drops values that are not identifiers: bad check digits, markup, placeholders, control characters, overlong text', () => {
    const cases: Array<Record<string, unknown>> = [
      { gtin13: '8806097640227', brand: 'Samsung', mpn: '<img src=x onerror=alert(1)>' },
      { gtin13: '0000000000000', brand: 'Generic', mpn: 'SM-A1' },
      { gtin: 'abc', brand: 'Sam\u0007sung', mpn: 'SM-A1' },
      { brand: 'S'.repeat(81), mpn: 'SM-A1' },
      { brand: 'Samsung', mpn: 'X'.repeat(65) },
      { brand: 'Samsung', mpn: 'N/A' },
    ];
    for (const c of cases) {
      expect(detectProduct(cheerioPage(page('', ld({ '@type': 'Product', ...c })), EMAG_URL), shop('emag')).ids).toEqual({ url: EMAG_URL });
    }
  });

  it('ignores a canonical link to another site', () => {
    const html = page('', `<link rel="canonical" href="https://evil.example/x/pd/DABC123XY/">${ld({ '@type': 'Product', brand: 'Samsung', mpn: 'SM-A1' })}`);
    expect(detectProduct(cheerioPage(html, EMAG_URL), shop('emag')).ids?.url).toBe(EMAG_URL);
  });

  it('survives JSON with raw line breaks and broken JSON', () => {
    const raw = `<script type="application/ld+json">{"@type":"Product","brand":"Samsung","mpn":"SM-A1","description":"rând 1\nrând 2"}</script><script type="application/ld+json">{not json</script>`;
    expect(detectProduct(cheerioPage(page('', raw), EMAG_URL), shop('emag')).ids).toEqual({ url: EMAG_URL, brand: 'Samsung', mpn: 'SM-A1' });
  });

  it('a page without product markup or a product address is no product page', () => {
    expect(detectProduct(cheerioPage(page('<a href="/x/pd/DABC123XY/">x</a>'), 'https://www.emag.ro/'), shop('emag')).productPage).toBe(false);
    expect(detectProduct(cheerioPage(page(''), 'https://www.pcgarage.ro/placi-video/palit/x/'), shop('pcgarage')).productPage).toBe(false);
  });
});
