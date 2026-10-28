import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import { extractBreadcrumb } from '../structured/jsonld';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, collapse, nonEmpty, withoutHomeCrumb } from '../util';

/**
 * IT Galaxy category listing (`/televizoare/`, `/televizoare/pagina2/`): 36 product boxes per page,
 * server-rendered (recorded 2026-10-27). Each box carries the product id (the same numeric id the
 * product page's JSON-LD uses as `sku`, so listing and product-page offers share one external id),
 * the title, the price and the crossed price as displayed (`868,99 lei`, Romanian format), the
 * stock text (`in stoc limitat`, `in stoc depozit/furnizor`) and, for many products, the EAN in the
 * short spec list ("Cod EAN: 9120106663334"). The crossed price is the shop's own reference; IT
 * Galaxy does not say it is a 30-day minimum, so it is never `shopLowest30d`.
 */
export function parseItGalaxyListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  const category = withoutHomeCrumb(extractBreadcrumb($));
  let skipped = 0;
  $('article.product-box').each((_, node) => {
    const box = $(node);
    const link = box.find('h2.name a').first();
    const url = absoluteUrl(link.attr('href'), ctx.url);
    const title = nonEmpty(link.text());
    const id =
      nonEmpty(box.find('button[data-prod]').first().attr('data-prod')) ??
      nonEmpty(link.attr('data-ecpid')) ??
      (url ? /-(\d+)\/?$/.exec(new URL(url).pathname)?.[1] : undefined);
    const priceText = id ? nonEmpty(box.find(`#price-${id}`).first().text()) : undefined;
    if (!id || !url || !title || !priceText) {
      skipped++;
      return;
    }
    const canonical = canonicalUrl(url);
    productUrls.push(canonical);
    const specs = box
      .find('.description li')
      .map((__, li) => collapse($(li).text()))
      .get();
    const ean = specs.map((s) => /^Cod EAN:\s*(\d{8,14})$/i.exec(s)?.[1]).find(Boolean);
    const availability = nonEmpty(box.find('.availability').first().text());
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: id,
      url: canonical,
      title,
      price: priceText,
      priceFormat: 'ro',
      oldPrice: nonEmpty(box.find('.old-price').first().text()),
      currency: 'RON',
      availability,
      gtin: ean,
      category,
      observedAt: ctx.observedAt,
      raw: {
        source: 'itgalaxy-listing',
        dataPrice: box.find('button[data-prod]').first().attr('data-pprice') ?? null,
        badge: nonEmpty(box.find('.product-icons.discount').first().text()) ?? null,
        specs,
      },
    });
  });
  const next = absoluteUrl($('link[rel="next"]').first().attr('href'), ctx.url) ?? null;
  return {
    offers,
    productUrls,
    nextPageUrl: next && next !== ctx.url ? next : null,
    meta: { cards: offers.length + skipped, skipped, items: offers.length + skipped },
  };
}
