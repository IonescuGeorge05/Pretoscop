import { load } from 'cheerio';
import type { OfferSpecs, RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, collapse, nonEmpty } from '../util';

/**
 * Elefant category listing (`/list/carti/carte/carti-pentru-copii`, `?pag=2`), recorded
 * 2026-11-09: discovery only. The page lists 59 product links but loads every tile (title,
 * price) afterwards from `/INTERSHOP/web/WFS/…/ViewProductTileAsync`, a path robots.txt disallows,
 * so the listing yields product URLs and the next page and no offer. The recorder runs such a
 * source with `config.discovery: true` (crawl URLs only); `elefant-product` reads the prices.
 */
export function parseElefantListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const urls: string[] = [];
  $('.product-list-item a.product-list-item__sold-out-wrapper[href]').each((_, a) => {
    const u = absoluteUrl($(a).attr('href'), ctx.url);
    // Product URLs end with the product's UUID ("…-cartea-intai_d5566ae4-f147-…").
    if (u && /_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(new URL(u).pathname)) urls.push(canonicalUrl(u));
  });
  const productUrls = [...new Set(urls)];
  const next = absoluteUrl($('link[rel="next"]').first().attr('href'), ctx.url) ?? null;
  return {
    offers: [],
    productUrls,
    nextPageUrl: next && next !== ctx.url ? next : null,
    meta: { items: productUrls.length, discoveryOnly: true },
  };
}

/** The spec list of a product page: `<dl class="ish-productAttributes"><dt>…</dt><dd>…</dd>`. */
function specTable($: ReturnType<typeof load>): Map<string, string> {
  const out = new Map<string, string>();
  $('dl.ish-productAttributes dt').each((_, dt) => {
    const key = collapse($(dt).text()).toLowerCase();
    const value = nonEmpty(collapse($(dt).next('dd').text()));
    if (key && value && !out.has(key)) out.set(key, value);
  });
  return out;
}

/** The analytics product object (`window.ish.GTMproductDetail.push({...})`): category path. */
function gtmCategory(html: string): string | undefined {
  const m = /GTMproductDetail\.push\(\s*\{[\s\S]{0,2000}?"category"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!m) return undefined;
  return nonEmpty(m[1]!.replace(/\\\//g, '/').replace(/\\"/g, '"'))?.replace(/\//g, ' > ');
}

/**
 * Elefant product page (Intershop; recorded 2026-11-09: no JSON-LD Product). External id = the
 * product UUID (`.js-sku`, also the URL tail and the listing's `data-sku`). Price and crossed price
 * as displayed ("41,4 lei", "69,0 lei": the shop's reference price), seller from "Vândut și livrat
 * de" (`isElefant` false → a marketplace seller), stock from the selected variant's
 * `data-available`, condition from the "Stare" row. The spec list gives the barcode ("Cod de bare",
 * the GTIN-13), the ISBN, the publisher ("Editura", the book's brand), author, cover type, year
 * ("2.019" as written), pages and language (`RawOffer.specs`); the category path comes from the
 * page's analytics object. Delivery: "va fi calculat în pagina de comandă" → unknown. Images are
 * never read (ADR-008).
 */
export function parseElefantProduct(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const id = nonEmpty(collapse($('.js-sku').first().text())) ?? nonEmpty($('input[name="SKU"]').first().attr('value'));
  const title = nonEmpty(collapse($('h1.product-title').first().text()));
  const priceBox = $('.product-price.js-vendor-price').first();
  const price = nonEmpty(collapse(priceBox.find('.current-price').first().text()));
  const url = canonicalUrl(absoluteUrl($('link[rel="canonical"]').attr('href'), ctx.url) ?? ctx.url);
  if (!id || !title || !price) return { offers: [], meta: { reason: 'no product price', id: id ?? null } };
  const specs = specTable($);
  const vendor = $('.js-vendor-offer-name').first();
  const sellerName = nonEmpty(collapse(vendor.find('b').first().text()));
  const isElefant = /isElefant\s+(true|false)/.exec(vendor.html() ?? '')?.[1];
  const variant = $(`option[data-sku="${id}"]`).first();
  const available = variant.attr('data-available');
  const availability =
    available === 'true' ? 'in stoc' : available === 'false' ? 'stoc epuizat' : $('button.js-add-to-cart').length > 0 ? 'in stoc' : undefined;
  const bookSpecs: OfferSpecs = {};
  const set = (k: keyof OfferSpecs, v: string | undefined) => {
    if (v) (bookSpecs as Record<string, string>)[k] = v;
  };
  set('author', specs.get('autor') ?? nonEmpty(collapse($('h2.product-brand').first().text())));
  set('publisher', specs.get('editura'));
  set('format', specs.get('tip coperta'));
  set('language', specs.get('limba'));
  set('pages', specs.get('numar de pagini'));
  set('year', specs.get('anul aparitiei'));
  set('isbn', specs.get('isbn'));
  set('edition', specs.get('editia') ?? specs.get('editie'));
  const offer: RawOffer = {
    shopSlug: ctx.shopSlug,
    externalId: id,
    url,
    title,
    price,
    priceFormat: 'ro',
    oldPrice: nonEmpty(collapse(priceBox.find('.old-price').first().text())),
    currency: 'RON',
    availability,
    condition: specs.get('stare'),
    gtin: specs.get('cod de bare') ?? specs.get('isbn') ?? specs.get('ean'),
    brand: specs.get('editura') ?? specs.get('brand') ?? specs.get('producator'),
    category: gtmCategory(html),
    sellerName,
    isMarketplaceSeller: isElefant === 'false' ? true : undefined,
    shippingNote: nonEmpty(collapse($('.product-vendor-shipping span').first().text())),
    ...(Object.keys(bookSpecs).length ? { specs: bookSpecs } : {}),
    observedAt: ctx.observedAt,
    raw: {
      source: 'elefant-product',
      vendorOfferId: nonEmpty($('input.js-vendor-offer-id').first().attr('value')) ?? null,
      collection: specs.get('colectie') ?? null,
      age: specs.get('varsta') ?? null,
      dimensions: specs.get('format') ?? null,
      bonusPoints: nonEmpty(collapse($('.bonus-points').first().text())) ?? null,
    },
  };
  return { offers: [offer], meta: { specs: specs.size } };
}
