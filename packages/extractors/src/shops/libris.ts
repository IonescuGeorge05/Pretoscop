import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, collapse, nonEmpty } from '../util';

/**
 * Libris category listing (`/carti/carti-pentru-copii/literatura-fantasy`, `?iv.pg=2`): 40 book
 * cards per page, server-rendered (recorded 2026-11-09). The card's analytics attributes carry the
 * book id, title, publisher and category path; the price is read from the card's visible price.
 *
 * - External id = `data-gtm-item_id`, the id at the end of the product URL
 *   (`/carte/<slug>/42444997`) and the product page's JSON-LD `sku`, so a listing offer and its
 *   product page (`jsonld-product`, which adds the ISBN) are one offer.
 * - Title = the card heading, written without diacritics exactly as the product page's JSON-LD
 *   `name` ("Harry Potter si Printul Semisange - J.K. Rowling"): one offer keeps one title whichever
 *   page refreshed it. The author follows " - " (normalization reads it).
 * - Price = the visible price (`.price-discount-containerx .price-reduced`, "39.99 Lei", decimal
 *   point). The analytics price is not used (it carries a third decimal: 39.992). The crossed price
 *   is labelled "PRP" (the publisher's recommended price): kept in `raw.rrp` only, never as an old
 *   price (as for eMAG's PRP): it is not a price Libris charged before.
 * - Availability: "in stoc" when the card has its add-to-cart button, unknown otherwise (never
 *   assumed). No ISBN on the card: it comes from the product page or a feed.
 * - Next page = the pagination link to `?iv.pg=<current + 1>` (robots.txt allows `iv.pg`).
 * - Cover images are never read (ADR-008: images only from licensed sources).
 */
export function parseLibrisListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const offers: RawOffer[] = [];
  let skipped = 0;
  $('li.categ-prod-item[data-gtm-item_id]').each((_, node) => {
    const card = $(node);
    const id = nonEmpty(card.attr('data-gtm-item_id'));
    const link = card.find('a[href*="/carte/"], a[href*="/produs/"], a[href*="/joc/"]').first();
    const url = absoluteUrl(link.attr('href'), ctx.url);
    const title = nonEmpty(collapse(card.find('h3.pr-title-categ-pg').first().text())) ?? nonEmpty(card.attr('data-gtm-item_name'));
    const priceBox = card.find('.price-discount-containerx .price-reduced').first();
    const price = priceFrom(priceBox.clone().children('.price-normal').remove().end().text());
    if (!id || !url || !title || !price) {
      skipped++;
      return;
    }
    const rrp = priceFrom(priceBox.find('.price-normal').first().text()) ?? priceFrom(card.find('.box-pr-price-prp').first().text());
    const publisher = nonEmpty(card.attr('data-gtm-brand'));
    const category = nonEmpty(card.attr('data-gtm-item_category')?.replace(/^Librarie online\//i, '').replace(/\//g, ' > '));
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: id,
      url: canonicalUrl(url),
      title,
      price,
      priceFormat: 'decimal',
      currency: 'RON',
      availability: card.find('a.adauga-in-cos').length > 0 ? 'in stoc' : undefined,
      brand: publisher,
      category,
      ...(publisher ? { specs: { publisher } } : {}),
      observedAt: ctx.observedAt,
      raw: {
        source: 'libris-listing',
        // The cover's alt text spells the title with diacritics ("Coperta cărții 'Harry Potter și
        // Prințul Semisânge - J.K. Rowling'"): kept for audit and the matching eval, not as the title.
        altTitle: nonEmpty(/^Coperta c[aă]r[tț]ii\s+'(.+)'$/i.exec(collapse(card.find('img').first().attr('alt') ?? ''))?.[1]) ?? null,
        rrp: rrp && rrp !== price ? rrp : null,
        discountBadge: nonEmpty(collapse(card.find('.pr-discaunt-icon').first().text())) ?? null,
        isNew: card.find('.pr-new-icon').length > 0,
        position: Number(card.attr('data-gtm-index') ?? NaN),
      },
    });
  });
  return {
    offers,
    productUrls: [...new Set(offers.map((o) => o.url))],
    nextPageUrl: nextPage($, ctx.url),
    meta: { cards: offers.length + skipped, skipped, items: offers.length + skipped, total: totalTitles($) },
  };
}

/** "39.99 Lei" → "39.99"; null without a price. */
function priceFrom(text: string | undefined): string | undefined {
  const m = /(\d{1,6}(?:[.,]\d{1,2})?)\s*lei/i.exec(collapse(text ?? ''));
  return m ? m[1]!.replace(',', '.') : undefined;
}

function nextPage($: ReturnType<typeof load>, base: string): string | null {
  const current = Number(nonEmpty($('.pagination-list .pagination-num-active').first().text()) ?? '1');
  let next: string | null = null;
  $('.pagination-list a[href*="iv.pg="]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const n = Number(/[?&]iv\.pg=(\d+)/.exec(href)?.[1] ?? NaN);
    if (n === current + 1 && !next) next = absoluteUrl(href, base) ?? null;
  });
  return next;
}

function totalTitles($: ReturnType<typeof load>): number | null {
  const m = /din\s+([\d.]+)\s+de\s+titluri/i.exec(collapse($('.pagination-ct').first().text()));
  return m ? Number(m[1]!.replace(/\./g, '')) : null;
}
