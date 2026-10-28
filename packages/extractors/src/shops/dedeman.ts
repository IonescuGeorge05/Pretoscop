import { type CheerioAPI, load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, collapse, nonEmpty } from '../util';

/**
 * Dedeman category listing (`/ro/frigidere/c/1147`, `?page=2`): up to 72 Magento product cards per
 * page, server-rendered (recorded 2026-10-27). External id = the Dedeman product code
 * (`data-product-sku`, also the `/p/<code>` tail of the product URL).
 *
 * Prices are Magento's machine amounts (`data-price-amount="919.00"`). Dedeman marks the only price
 * of an undiscounted card with `data-price-type="oldPrice"` inside `.final-price`; a discounted
 * card has `.special-price` (the price, labelled e.g. "Super Preț") and `.old-price` (the shop's
 * crossed reference price, never treated as a 30-day minimum). Prices are per piece (`/bucată`);
 * a card priced per another unit (m², kg) is skipped, it is not a product price.
 *
 * Availability is the online line as shown: "Disponibil online" (in stock) or, for large
 * appliances whose delivery depends on the locality, "Verifică disponibilitatea online" (unknown).
 */
export function parseDedemanListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  const category = breadcrumb($);
  let skipped = 0;
  let unitPriced = 0;
  $('div.product-item-info').each((_, node) => {
    // The info block and the add-to-cart form are siblings inside `.product-item`.
    const card =
      $(node).closest('.product-item').length > 0 ? $(node).closest('.product-item') : $(node);
    const link = card.find('a.product-item-link').first();
    const url = absoluteUrl(link.attr('href'), ctx.url);
    const title = nonEmpty(link.text());
    const sku =
      nonEmpty(card.find('form[data-product-sku]').first().attr('data-product-sku')) ??
      (url ? /\/p\/(\d+)\/?$/.exec(new URL(url).pathname)?.[1] : undefined);
    const box = card.find('.price-box').first();
    const special = box.find('.special-price [data-price-amount]').first();
    const price = nonEmpty(
      (special.length > 0 ? special : box.find('[data-price-amount]').first()).attr(
        'data-price-amount',
      ),
    );
    if (!url || !title || !sku || !price) {
      skipped++;
      return;
    }
    const unit = nonEmpty(box.find('.price-sale-unit').first().text());
    if (unit && !/buc/i.test(unit)) {
      unitPriced++;
      return;
    }
    const canonical = canonicalUrl(url);
    productUrls.push(canonical);
    const oldPrice =
      special.length > 0
        ? nonEmpty(box.find('.old-price [data-price-amount]').first().attr('data-price-amount'))
        : undefined;
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: sku,
      url: canonical,
      title,
      price,
      priceFormat: 'decimal',
      oldPrice: oldPrice && oldPrice !== price ? oldPrice : undefined,
      currency: 'RON',
      availability: nonEmpty(card.find('.online-wrapper .text-availability').first().text()),
      category,
      observedAt: ctx.observedAt,
      raw: {
        source: 'dedeman-listing',
        productId: box.attr('data-price-box')?.replace(/^product-id-/, '') ?? null,
        status: card.closest('[data-status]').attr('data-status') ?? null,
        priceLabel: nonEmpty(box.find('.price-label').first().text()) ?? null,
        unit: unit ?? null,
        storeAvailability:
          nonEmpty(card.find('.store-wrapper .text-availability').first().text()) ?? null,
        // Orderable online (enabled add-to-cart). Kept as evidence only: Dedeman does not state
        // stock for locality-dependent deliveries, so availability stays as the shop words it.
        addToCart: card.find('button.tocart:not([disabled])').length > 0,
      },
    });
  });
  return {
    offers,
    productUrls,
    nextPageUrl: nextPage($, ctx.url),
    meta: {
      cards: offers.length + skipped + unitPriced,
      skipped,
      unitPriced,
      items: offers.length + skipped + unitPriced,
    },
  };
}

/** "Electrocasnice > Aparate frigorifice > Frigidere" from the page breadcrumb (without "Dedeman"). */
function breadcrumb($: CheerioAPI): string | undefined {
  const names = $('.breadcrumbs li.item')
    .map((_, li) => collapse($(li).text()))
    .get()
    .filter((n, i) => n !== '' && !(i === 0 && /^dedeman$/i.test(n)));
  return names.length > 0 ? names.join(' > ') : nonEmpty($('h1.page-title').first().text());
}

/** "Pagina 1 din 2" + the pagination-next link; null on the last (or only) page. */
function nextPage($: CheerioAPI, base: string): string | null {
  const label = /Pagina\s+(\d+)\s+din\s+(\d+)/i.exec($('.pagination-label').first().text());
  if (!label || Number(label[1]) >= Number(label[2])) return null;
  const next = absoluteUrl($('a.pagination-next').first().attr('href'), base);
  return next && next !== base ? next : null;
}
