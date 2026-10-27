import type { CheerioAPI } from 'cheerio';
import { nonEmpty } from '../util';
import type { SdProduct } from './jsonld';

function meta($: CheerioAPI, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = $(`meta[property="${k}"]`).attr('content') ?? $(`meta[name="${k}"]`).attr('content');
    const t = nonEmpty(v);
    if (t) return t;
  }
  return undefined;
}

/** OpenGraph / Facebook product tags (`product:price:amount` …), last resort. */
export function extractOpenGraph($: CheerioAPI): SdProduct[] {
  const price = meta($, 'product:price:amount', 'og:price:amount');
  if (!price) return [];
  return [
    {
      source: 'opengraph',
      name: meta($, 'og:title'),
      sku: meta($, 'product:retailer_item_id', 'product:sku'),
      gtin: meta($, 'product:ean', 'product:gtin', 'product:upc'),
      brand: meta($, 'product:brand', 'og:brand'),
      category: meta($, 'product:category'),
      url: meta($, 'og:url'),
      itemCondition: meta($, 'product:condition'),
      offers: [
        {
          price,
          priceCurrency: meta($, 'product:price:currency', 'og:price:currency'),
          availability: meta($, 'product:availability', 'og:availability'),
          oldPrice: meta($, 'product:original_price:amount'),
        },
      ],
    },
  ];
}
