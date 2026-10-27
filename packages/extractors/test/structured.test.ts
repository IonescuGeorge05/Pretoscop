import { describe, expect, it } from 'vitest';
import { parsePage, parsePageDetailed } from '../src/index';
import { fixture, fixtureMeta, summary } from './helpers';

const page = (body: string) => `<!doctype html><html><head>${body}</head><body></body></html>`;
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const URL_ = 'https://shop.example.ro/p/123';
const parse = (html: string) => parsePage('jsonld-product', html, URL_, { shopSlug: 'test', observedAt: '2026-10-27T10:00:00Z' });

describe('real product pages (generic parser)', () => {
  it('IT Galaxy: JSON-LD Product with sku, brand and breadcrumb names', () => {
    const path = 'itgalaxy/product_2026-10-27.html';
    const res = parsePageDetailed('jsonld-product', fixture(path), { url: fixtureMeta(path).url, shopSlug: 'itgalaxy', observedAt: fixtureMeta(path).recorded_at });
    expect(res.offers).toHaveLength(1);
    expect(res.offers[0]).toMatchObject({ externalId: '987970', price: '1975.99', priceFormat: 'decimal', currency: 'RON', brand: 'Samsung' });
    expect(res.offers[0]?.category).not.toMatch(/https?:/);
    expect(res.offers.map(summary)).toMatchSnapshot();
  });

  it('Dedeman: microdata fallback', () => {
    const path = 'dedeman/product_2026-10-27.html';
    const res = parsePageDetailed('jsonld-product', fixture(path), { url: fixtureMeta(path).url, shopSlug: 'dedeman', observedAt: fixtureMeta(path).recorded_at });
    expect(res.meta).toMatchObject({ sources: ['microdata'] });
    expect(res.offers[0]).toMatchObject({ price: '36.99', currency: 'RON' });
    expect(res.offers[0]?.title).toMatch(/^Cablu de conectare SAT Hama 205251/);
  });
});

describe('JSON-LD edge cases', () => {
  it('reads @graph, gtin13, brand objects and seller', () => {
    const [o] = parse(
      page(
        ld({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebPage', name: 'x' },
            {
              '@type': 'Product',
              name: 'Aspirator Dyson V15 Detect',
              sku: 'DY-15',
              gtin13: '5025155071000',
              brand: { '@type': 'Brand', name: 'Dyson' },
              offers: { '@type': 'Offer', price: 3499, priceCurrency: 'RON', availability: 'https://schema.org/InStock', seller: { name: 'Shop SRL' } },
            },
          ],
        }),
      ),
    );
    expect(o).toMatchObject({ externalId: 'DY-15', price: '3499', priceFormat: 'decimal', gtin: '5025155071000', brand: 'Dyson', sellerName: 'Shop SRL' });
  });

  it('uses priceSpecification and its StrikethroughPrice as the old price', () => {
    const [o] = parse(
      page(
        ld({
          '@type': 'Product',
          name: 'Monitor LG 27GR75Q',
          offers: {
            '@type': 'Offer',
            priceSpecification: [
              { '@type': 'UnitPriceSpecification', price: '1299.00', priceCurrency: 'RON' },
              { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '1499.00' },
            ],
          },
        }),
      ),
    );
    expect(o).toMatchObject({ price: '1299.00', oldPrice: '1499.00' });
  });

  it('expands ProductGroup variants and keeps the group brand', () => {
    const offers = parse(
      page(
        ld({
          '@type': 'ProductGroup',
          name: 'iPhone 17',
          brand: 'Apple',
          hasVariant: [
            { '@type': 'Product', name: 'iPhone 17 128GB', sku: 'A', offers: { '@type': 'Offer', price: '4999.99' } },
            { '@type': 'Product', name: 'iPhone 17 256GB', sku: 'B', offers: { '@type': 'Offer', price: '5599.99' } },
          ],
        }),
      ),
    );
    expect(offers.map((o) => [o.externalId, o.price, o.brand])).toEqual([
      ['A', '4999.99', 'Apple'],
      ['B', '5599.99', 'Apple'],
    ]);
  });

  it('skips an AggregateOffer that spans several prices, accepts one that collapses', () => {
    expect(parse(page(ld({ '@type': 'Product', name: 'X', offers: { '@type': 'AggregateOffer', lowPrice: '10', highPrice: '20', offerCount: 3 } })))).toHaveLength(0);
    expect(parse(page(ld({ '@type': 'Product', name: 'X', offers: { '@type': 'AggregateOffer', lowPrice: '10', highPrice: '10', offerCount: 1 } })))).toHaveLength(1);
  });

  it('tolerates trailing commas and raw newlines in JSON-LD', () => {
    const broken = '<script type="application/ld+json">{"@type":"Product","name":"Mixer\nBosch","offers":{"@type":"Offer","price":"199.99",},}</script>';
    expect(parse(page(broken))[0]).toMatchObject({ title: 'Mixer Bosch', price: '199.99' });
  });

  it('falls back to OpenGraph product tags', () => {
    const [o] = parse(
      page(
        '<meta property="og:title" content="Fierbator Philips HD9350"><meta property="product:price:amount" content="149.99"><meta property="product:price:currency" content="RON"><meta property="product:retailer_item_id" content="PH-1">',
      ),
    );
    expect(o).toMatchObject({ externalId: 'PH-1', price: '149.99', currency: 'RON', title: 'Fierbator Philips HD9350' });
  });

  it('reads ItemList products on listing-style pages', () => {
    const offers = parse(
      page(
        ld({
          '@type': 'ItemList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, item: { '@type': 'Product', name: 'A', sku: '1', offers: { '@type': 'Offer', price: '10.00' } } },
            { '@type': 'ListItem', position: 2, item: { '@type': 'Product', name: 'B', sku: '2', offers: { '@type': 'Offer', price: '20.00' } } },
          ],
        }),
      ),
    );
    expect(offers.map((o) => o.externalId)).toEqual(['1', '2']);
  });
});
