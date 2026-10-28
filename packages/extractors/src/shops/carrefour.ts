import { type Cheerio, load } from 'cheerio';
import type { Element } from 'domhandler';
import type { RawOffer } from '@pretoscop/core';
import { extractBreadcrumb } from '../structured/jsonld';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, collapse, nonEmpty, withoutHomeCrumb } from '../util';

/**
 * Carrefour category listing (`/tv-audio-home-cinema/televizoare-accesorii/televizoare-smart`,
 * `?p=2`): 24 product cards per page, server-rendered by Carrefour's Magento 2 theme (recorded
 * 2026-10-27). External id = the article code in the add-to-cart button (`data-id`), which is
 * also the product page's JSON-LD `sku` and the tail of the product URL (`…-19-44503250`).
 *
 * Read from the card only: the wishlist link of a card carries another product's data (observed:
 * the TCL 85T69C card's wishlist link names the TCL 75T8D), so it is never used. Price from the
 * card's `meta[itemprop=price]` (machine format); the crossed price (`.price-old`, the shop's
 * reference, not a stated 30-day minimum) is rebuilt from its integer and decimal spans; brand and
 * availability (`data-dimension10="available"`) from the add-to-cart button.
 */
export function parseCarrefourListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  const category = withoutHomeCrumb(extractBreadcrumb($));
  let skipped = 0;
  $('li.product[data-product-id]').each((_, node) => {
    const card = $(node);
    const link = card.find('.productItem-name a').first();
    const url = absoluteUrl(link.attr('href'), ctx.url);
    const title = nonEmpty(link.attr('title')) ?? nonEmpty(link.text());
    const button = card.find('button.tocart[data-id]').first();
    const code =
      nonEmpty(button.attr('data-id')) ?? (url ? /-(\d{6,})\/?$/.exec(url)?.[1] : undefined);
    const box = card.find('.price-box').first();
    const price =
      nonEmpty(box.find('meta[itemprop="price"]').first().attr('content')) ??
      nonEmpty(button.attr('data-price'));
    if (!url || !title || !code || !price) {
      skipped++;
      return;
    }
    const canonical = canonicalUrl(url);
    productUrls.push(canonical);
    const oldPrice = splitPrice(box.find('.price-old').first());
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: code,
      url: canonical,
      title,
      price,
      priceFormat: 'decimal',
      oldPrice: oldPrice && oldPrice !== price ? oldPrice : undefined,
      currency:
        nonEmpty(box.find('meta[itemprop="priceCurrency"]').first().attr('content')) ?? 'RON',
      availability:
        nonEmpty(box.find('link[itemprop="availability"]').first().attr('href')) ??
        nonEmpty(button.attr('data-dimension10')),
      brand: nonEmpty(button.attr('data-brand')),
      category,
      observedAt: ctx.observedAt,
      raw: {
        source: 'carrefour-listing',
        productId: card.attr('data-product-id') ?? null,
        discountBadge: nonEmpty(card.find('.badge-discount').first().text()) ?? null,
        listCategory: nonEmpty(button.attr('data-category')) ?? null,
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

/** `<span>5.399</span> <span><span>99</span><span>Lei</span></span>` → "5399.99". */
function splitPrice(el: Cheerio<Element>): string | undefined {
  if (el.length === 0) return undefined;
  const parts = collapse(el.text()).match(/\d[\d.]*/g);
  if (!parts || parts.length === 0) return undefined;
  const whole = parts[0]!.replace(/\./g, '');
  const cents = parts[1] && /^\d{2}$/.test(parts[1]) ? parts[1] : '00';
  return /^\d+$/.test(whole) ? `${whole}.${cents}` : undefined;
}
