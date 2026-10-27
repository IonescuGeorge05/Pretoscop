import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseFeed, parseSitemap } from '../src/index';
import { collect, fixture } from './helpers';

const ctx = { shopSlug: 'evomag', observedAt: '2026-10-27T10:00:00Z' };

describe('2Performant feeds', () => {
  it('maps the CSV labels, affiliate links and Active/Other data availability', async () => {
    const offers = await collect(parseFeed('feed-2performant-csv', fixture('feeds/2performant_sample.csv'), ctx));
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      externalId: 'EVO-778899',
      title: 'Telefon mobil Samsung Galaxy S25, Dual SIM, 12GB RAM, 256GB, 5G, Navy',
      price: '3899.99',
      priceFormat: 'decimal',
      oldPrice: '4299.99',
      brand: 'Samsung',
      gtin: '8806095300000',
      availability: 'in stock',
      url: 'https://www.evomag.ro/telefoane-smartphone/samsung-galaxy-s25-256gb-navy-3399.html',
    });
    expect(offers[0]?.affiliateUrl).toMatch(/^https:\/\/event\.2performant\.ro\/events\//);
    expect(offers[1]?.availability).toBe('in_stock');
    expect(offers[2]).toMatchObject({ availability: 'out_of_stock', price: '1799,99' });
    expect(offers[2]?.priceFormat).toBeUndefined();
  });

  it('maps the XML variant', async () => {
    const offers = await collect(parseFeed('feed-2performant-xml', fixture('feeds/2performant_sample.xml'), ctx));
    expect(offers).toEqual([
      expect.objectContaining({ externalId: 'EVO-55DU7172', price: '1899.99', oldPrice: '2199.99', availability: 'in_stock', gtin: '8806095582000' }),
    ]);
  });

  it('inflates gzip streams', async () => {
    const gz = gzipSync(Buffer.from(fixture('feeds/2performant_sample.csv')));
    const stream = Readable.from([gz.subarray(0, 100), gz.subarray(100)]);
    const offers = await collect(parseFeed('feed-2performant-csv', stream, ctx));
    expect(offers).toHaveLength(3);
  });

  it('streams a 100k-row CSV without holding it in memory', async () => {
    const header = '"Product title","Sale price","Product ID","Product URL","Active"\n';
    const rows = 100_000;
    async function* gen() {
      yield header;
      for (let i = 0; i < rows; i += 1000) {
        let chunk = '';
        for (let j = i; j < i + 1000; j++) {
          chunk += `"Produc ${j} Samsung Galaxy Tab S10 FE 128GB","${(1000 + (j % 900)).toFixed(2)}","P${j}","https://www.example.ro/p/${j}","1"\n`;
        }
        yield chunk;
      }
    }
    global.gc?.();
    const before = process.memoryUsage().rss;
    let count = 0;
    let peak = before;
    for await (const _ of parseFeed('feed-2performant-csv', gen(), ctx)) {
      count++;
      if (count % 10_000 === 0) peak = Math.max(peak, process.memoryUsage().rss);
    }
    expect(count).toBe(rows);
    expect((peak - before) / 1024 / 1024).toBeLessThan(200);
  }, 60_000);
});

describe('Google Merchant feeds', () => {
  it('RSS: g: fields, sale price as price, shipping price', async () => {
    const offers = await collect(parseFeed('feed-google-shopping', fixture('feeds/google_sample.rss.xml'), { ...ctx, shopSlug: 'mx' }));
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: 'MX-1001',
      price: '2199.99',
      oldPrice: '2499.99',
      currency: 'RON',
      availability: 'in_stock',
      gtin: '0711719577034',
      mpn: 'CFI-2016',
      shippingCost: '19.99 RON',
      url: 'https://www.magazin-exemplu.ro/ps5-slim-digital',
    });
    expect(offers[1]).toMatchObject({ externalId: 'MX-1002', title: 'Aspirator robot Roborock Q7 Max', availability: 'out_of_stock' });
  });

  it('Atom entries', async () => {
    const offers = await collect(parseFeed('feed-google-shopping', fixture('feeds/google_sample.atom.xml'), ctx));
    expect(offers[0]).toMatchObject({ externalId: 'AT-1', price: '2399.00', availability: 'preorder' });
  });
});

describe('compari.ro XML', () => {
  it('maps Identifier/Manufacturer/EanCode/DeliveryCost and the older names', async () => {
    const offers = await collect(parseFeed('feed-compari-xml', fixture('feeds/compari_sample.xml'), { ...ctx, shopSlug: 'pcgarage' }));
    expect(offers[0]).toMatchObject({
      externalId: 'PCG-77001',
      brand: 'Kingston',
      price: '349,99',
      mpn: 'SNV3S/1000G',
      gtin: '0740617341000',
      shippingCost: '0',
      shippingNote: '2 zile',
      availability: 'in_stock',
    });
    expect(offers[0]?.raw.attributes).toEqual({ Capacitate: '1 TB' });
    expect(offers[1]).toMatchObject({ externalId: 'PCG-77002', price: '2.599,00', shippingCost: '25 RON', availability: 'out_of_stock', gtin: '0730143316000' });
  });
});

describe('generic CSV', () => {
  it('detects ; and maps Romanian headers', async () => {
    const offers = await collect(parseFeed('feed-csv-generic', fixture('feeds/generic_sample.csv'), ctx));
    expect(offers[0]).toMatchObject({ externalId: 'AB-1', price: '1.399,99', oldPrice: '1.599,99', brand: 'Arctic', gtin: '5944008900000', availability: 'da' });
    expect(offers[1]).toMatchObject({ externalId: 'AB-2', availability: 'nu' });
  });
});

describe('sitemaps', () => {
  it('parses an index', () => {
    const r = parseSitemap(fixture('itgalaxy/sitemap-index_2026-10-27.xml'));
    expect(r.urls).toHaveLength(0);
    expect(r.children).toContain('https://www.itgalaxy.ro/data/sitemaps/products-0.xml');
  });

  it('parses a urlset with thousands of entries', () => {
    const r = parseSitemap(fixture('itgalaxy/sitemap-products-latest_2026-10-27.xml'));
    expect(r.urls.length).toBeGreaterThan(5000);
    expect(r.urls[0]?.loc).toMatch(/^https:\/\/www\.itgalaxy\.ro\//);
  });

  it('decodes entities and CDATA, keeps lastmod, ignores image:loc', () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
      <url><loc>https://a.ro/p?x=1&amp;y=2</loc><lastmod>2026-10-27</lastmod><image:image><image:loc>https://a.ro/i.jpg</image:loc></image:image></url>
      <url><loc><![CDATA[https://a.ro/q]]></loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual([
      { loc: 'https://a.ro/p?x=1&y=2', lastmod: '2026-10-27' },
      { loc: 'https://a.ro/q' },
    ]);
  });
});
