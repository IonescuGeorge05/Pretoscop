import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, nonEmpty, priceFormatOf } from '../util';
import { extractBreadcrumb, extractJsonLd, type SdOffer, type SdProduct } from './jsonld';
import { extractMicrodata } from './microdata';
import { extractOpenGraph } from './opengraph';

/** Product data in order of trust: JSON-LD → microdata → OpenGraph (docs/03 §6.2). */
export function structuredProducts(html: string): {
  products: SdProduct[];
  breadcrumb?: string;
  title?: string;
  canonical?: string;
  /** `<link rel="next">` (listing pagination), as written in the page. */
  next?: string;
} {
  const $ = load(html);
  let products = extractJsonLd($);
  if (!products.some((p) => p.offers.some((o) => o.price))) {
    const md = extractMicrodata($);
    if (md.some((p) => p.offers.some((o) => o.price))) products = md;
    else {
      const og = extractOpenGraph($);
      if (og.length > 0) products = og;
    }
  }
  return {
    products,
    breadcrumb: extractBreadcrumb($),
    title: nonEmpty($('title').first().text()),
    canonical: nonEmpty($('link[rel="canonical"]').attr('href')),
    next: nonEmpty($('link[rel="next"]').first().attr('href')),
  };
}

/** Converts a structured product + offer into a RawOffer; undefined when there is no price. */
export function sdToRawOffer(
  p: SdProduct,
  o: SdOffer,
  ctx: PageContext,
  extra: { canonical?: string; breadcrumb?: string; externalIdFallback?: string } = {},
): RawOffer | undefined {
  // AggregateOffer spanning several prices does not describe one offer: skip it.
  if (o.lowPrice && o.highPrice && o.lowPrice !== o.highPrice && (o.offerCount ?? 2) > 1) return undefined;
  if (!o.price || !p.name) return undefined;
  // Listing pages (forit's ItemList) give site-relative product URLs: resolve them on the page URL.
  const url = canonicalUrl(absoluteUrl(o.url ?? p.url ?? extra.canonical, ctx.url) ?? ctx.url);
  const externalId =
    o.sku ?? p.sku ?? p.productId ?? extra.externalIdFallback ?? new URL(url).pathname.replace(/\/+$/, '');
  return {
    shopSlug: ctx.shopSlug,
    externalId,
    url,
    title: p.name,
    price: o.price,
    priceFormat: priceFormatOf(o.priceRaw ?? o.price),
    oldPrice: o.oldPrice,
    currency: o.priceCurrency,
    availability: o.availability,
    condition: o.itemCondition ?? p.itemCondition,
    gtin: o.gtin ?? p.gtin,
    mpn: p.mpn,
    brand: p.brand,
    category: p.category ?? extra.breadcrumb,
    sellerName: o.sellerName,
    shippingCost: o.shippingCost,
    observedAt: ctx.observedAt,
    raw: { source: p.source, sku: p.sku ?? null, productId: p.productId ?? null },
  };
}

/**
 * Generic product page parser (`jsonld-product`): works for any shop with structured data.
 * It also reads listing pages that publish a JSON-LD `ItemList` of Products with offers (forit:
 * 60 per page): then every product is an offer, `productUrls` lists them and `<link rel="next">`
 * gives the next listing page. A product page never has `rel="next"`, so nothing changes there.
 */
export function parseStructuredProductPage(html: string, ctx: PageContext): PageParseResult {
  const { products, breadcrumb, canonical, next } = structuredProducts(html);
  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  const listing = products.length > 1;
  for (const p of products) {
    for (const o of p.offers) {
      const raw = sdToRawOffer(p, o, ctx, { canonical, breadcrumb });
      if (!raw || seen.has(raw.externalId)) continue;
      seen.add(raw.externalId);
      offers.push(raw);
    }
  }
  const nextPageUrl = next ? (absoluteUrl(next, ctx.url) ?? null) : null;
  return {
    offers,
    ...(listing ? { productUrls: [...new Set(offers.map((o) => o.url))] } : {}),
    ...(nextPageUrl && nextPageUrl !== ctx.url ? { nextPageUrl } : {}),
    meta: { products: products.length, sources: [...new Set(products.map((p) => p.source))] },
  };
}
