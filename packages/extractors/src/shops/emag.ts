import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import { extractBreadcrumb, extractJsonLd } from '../structured/jsonld';
import type { PageContext, PageParseResult } from '../types';
import {
  absoluteUrl,
  canonicalUrl,
  collapse,
  extractBalanced,
  isRecord,
  jsonAfter,
  nonEmpty,
  slugLike,
  str,
} from '../util';

/**
 * eMAG (ADR-013: crawled only under the founders' decision, behind a kill switch).
 *
 * Offer identity: the eMAG *offer id* (one seller's offer of one product). Listing cards show the
 * buy-box offer without naming its seller; product pages name every seller (`EM.offer`,
 * `EM.multiple_offers`, `EM.used_offers`). eMAG's crossed price is, by eMAG's own definition, the
 * lowest price of the last 30 days, so it is both `oldPrice` and `shopLowest30d`; the
 * manufacturer's recommended price ("PRP") is kept in `raw.rrp` and never used as a reference.
 */

export const EMAG_VENDOR_ID = 1;

const PNK_RE = /\/pd\/([A-Z0-9]{6,12})\/?/;

/**
 * eMAG's card `data-availability-id`, observed on the 2026-10-27 fixtures: 3 = in stock (with or
 * without a visible label), 2 = limited stock ("ultimul produs in stoc"), 8 = pre-order
 * ("Precomandă"). Mapped to schema.org values the normalizer understands.
 */
const EMAG_AVAILABILITY: Record<string, string> = {
  '3': 'https://schema.org/InStock',
  '2': 'https://schema.org/LimitedAvailability',
  '8': 'https://schema.org/PreOrder',
};

/** `…/telefon-mobil-…-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/` → `DF1MLR2BM`. */
export function emagPnk(url: string): string | undefined {
  return PNK_RE.exec(url)?.[1];
}

/**
 * eMAG slugs are the slugified title followed by the manufacturer part number, e.g.
 * `telefon-mobil-samsung-galaxy-s26-fe-…-blueberry-sm-s741bzvdeue` → `SM-S741BZVDEUE`.
 * Returns undefined unless the remainder looks like a part number.
 */
export function emagSlugMpn(url: string, title: string): string | undefined {
  const m = /emag\.ro\/([^/]+)\/pd\//.exec(url);
  if (!m?.[1]) return undefined;
  const slug = m[1].toLowerCase();
  const titleSlug = slugLike(title);
  if (!titleSlug || !slug.startsWith(`${titleSlug}-`)) return undefined;
  const rest = slug.slice(titleSlug.length + 1);
  if (rest.length < 4 || rest.length > 40 || !/\d/.test(rest) || !/[a-z]/.test(rest)) return undefined;
  if (rest.split('-').length > 4) return undefined;
  return rest.toUpperCase();
}

function textOf(html: string): string {
  return collapse(load(html).text());
}

/** Category listing (`/telefoane-mobile/c`, `/…/p2/c`, `/…/vendor/emag/c`). */
export function parseEmagListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  let skipped = 0;
  $('div.card-item.js-product-data').each((_, node) => {
    const card = $(node);
    const offerId = card.attr('data-offer-id');
    const title = nonEmpty(card.attr('data-name')) ?? nonEmpty(card.find('.card-v2-title').first().text());
    const url = absoluteUrl(card.attr('data-url') ?? card.find('a.js-product-url').attr('href'), ctx.url);
    const priceText = nonEmpty(card.find('p.product-new-price').first().text());
    if (!offerId || !title || !url || !priceText) {
      skipped++;
      return;
    }
    const canonical = canonicalUrl(url);
    productUrls.push(canonical);

    let oldPrice: string | undefined;
    let rrp: string | undefined;
    card.find('p.pricing span.rrp-lp30d-content').each((_, span) => {
      const s = $(span);
      const t = collapse(s.text());
      if (!t) return;
      if (s.find('s').length > 0) oldPrice = collapse(s.find('s').first().text());
      else if (/^PRP/i.test(t)) rrp = t.replace(/^PRP:?\s*/i, '');
    });

    const availEl = card.find('[class*="text-availability-"]').first();
    const availClass = /text-availability-([a-z_]+)/.exec(availEl.attr('class') ?? '')?.[1];
    const ratingText = nonEmpty(card.find('.average-rating').first().text());
    const reviewsMatch = /(\d[\d.]*)/.exec(card.find('.star-rating-text .hidden-xs').first().text());
    const badges = card
      .find('.card-v2-badge')
      .map((__, b) => ($(b).attr('class') ?? '').replace('card-v2-badge', '').trim())
      .get()
      .filter(Boolean);

    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: offerId,
      url: canonical,
      title,
      price: priceText,
      priceFormat: 'ro',
      oldPrice,
      currency: 'RON',
      availability: EMAG_AVAILABILITY[card.attr('data-availability-id') ?? ''] ?? availClass ?? nonEmpty(availEl.text()),
      mpn: emagSlugMpn(canonical, title),
      category: nonEmpty(card.attr('data-category-trail'))?.replace(/\//g, ' > '),
      shopLowest30d: oldPrice,
      observedAt: ctx.observedAt,
      raw: {
        pnk: emagPnk(canonical) ?? null,
        productId: card.attr('data-product-id') ?? null,
        categoryId: card.attr('data-category-id') ?? null,
        categoryName: card.attr('data-category-name') ?? null,
        availabilityId: card.attr('data-availability-id') ?? null,
        availabilityText: nonEmpty(availEl.text()) ?? null,
        position: Number(card.attr('data-position') ?? NaN) || null,
        rrp: rrp ?? null,
        rating: ratingText ? Number(ratingText.replace(',', '.')) || null : null,
        reviews: reviewsMatch?.[1] ? Number(reviewsMatch[1].replace(/\./g, '')) : 0,
        badges,
        sellerUnknown: true,
      },
    });
  });

  const current = Number(/\/p(\d+)\/c/.exec(ctx.url)?.[1] ?? '1');
  const nextPath = new URL(ctx.url).pathname.replace(/(\/p\d+)?\/c\/?$/, `/p${current + 1}/c`);
  const hasNext = $(`a[href*="/p${current + 1}/c"]`).length > 0 && nextPath !== new URL(ctx.url).pathname;
  return {
    offers,
    productUrls,
    nextPageUrl: hasNext ? new URL(nextPath, ctx.url).toString() : null,
    meta: { cards: offers.length + skipped, skipped, page: current },
  };
}

interface EmagOfferJson {
  id?: number;
  price?: {
    current?: number;
    initial?: number;
    currency?: { name?: { default?: string } };
    recommended_retail_price?: { amount?: number; is_visible?: boolean };
    lowest_price_30_days?: { amount?: number; is_visible?: boolean };
  };
  vendor?: { id?: number; name?: { default?: string; display?: string } };
  vendor_type?: number;
  availability?: { code?: string; text?: string };
  flags?: { is_main?: boolean; is_used?: boolean; is_fulfilment_by_emag?: boolean; is_open_package?: boolean };
  warranties?: unknown;
}

/** `EM.offer = { availability: {…}, price: {…}, id: 1, vendor: {…}, … }` is a JS literal. */
function parseJsLiteralOffer(html: string): EmagOfferJson | undefined {
  const at = html.indexOf('EM.offer = {');
  if (at < 0) return undefined;
  const body = extractBalanced(html, html.indexOf('{', at));
  if (!body) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of ['availability', 'price', 'vendor', 'flags']) {
    const m = new RegExp(`(?:^|[\\s,{])${key}:\\s*`).exec(body);
    if (!m) continue;
    const start = m.index + m[0].length;
    const value = extractBalanced(body, start);
    if (!value) continue;
    try {
      out[key] = JSON.parse(value);
    } catch {
      // ignore malformed piece
    }
  }
  const id = /(?:^|[\s,{])id:\s*(\d+)/.exec(body)?.[1];
  const vt = /vendor_type:\s*(\d+)/.exec(body)?.[1];
  if (id) out.id = Number(id);
  if (vt) out.vendor_type = Number(vt);
  return out as EmagOfferJson;
}

function money(v: number | undefined): string | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v.toFixed(2) : undefined;
}

/** Product page (`/…/pd/PNK/`): one RawOffer per seller offer shown on the page. */
export function parseEmagProduct(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const ld = extractJsonLd($).find((p) => p.name);
  const breadcrumb = extractBreadcrumb($);
  const canonical = canonicalUrl(
    absoluteUrl($('link[rel="canonical"]').attr('href'), ctx.url) ?? ld?.url ?? ctx.url,
  );
  const title = ld?.name ?? nonEmpty($('h1').first().text());
  if (!title) return { offers: [], meta: { reason: 'no product title' } };

  const pnk = ld?.sku ?? emagPnk(canonical);
  const mpn = ld?.mpn ?? ld?.productId ?? emagSlugMpn(canonical, title);
  const brand = ld?.brand;
  const category = breadcrumb ?? ld?.category;
  const productId = /EM\.product_id\s*=\s*(\d+)/.exec(html)?.[1];

  const main = parseJsLiteralOffer(html);
  const multiple = (jsonAfter(html, 'EM.multiple_offers =') as EmagOfferJson[] | undefined) ?? [];
  const used = (jsonAfter(html, 'EM.used_offers =') as EmagOfferJson[] | undefined) ?? [];

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  const push = (o: EmagOfferJson, kind: 'main' | 'other' | 'used') => {
    if (!o.id || seen.has(String(o.id))) return;
    const price = money(o.price?.current);
    if (!price) return;
    seen.add(String(o.id));
    const lp30 = o.price?.lowest_price_30_days;
    const lowest = lp30?.is_visible ? money(lp30.amount) : undefined;
    const vendorId = o.vendor?.id;
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: String(o.id),
      url: canonical,
      title,
      price,
      priceFormat: 'decimal',
      oldPrice: lowest,
      shopLowest30d: lowest,
      currency: o.price?.currency?.name?.default ?? 'RON',
      availability: o.availability?.code ?? o.availability?.text,
      condition: kind === 'used' || o.flags?.is_used ? 'resigilat' : 'new',
      mpn,
      brand,
      category,
      sellerName: o.vendor?.name?.display ?? o.vendor?.name?.default,
      sellerId: vendorId !== undefined ? String(vendorId) : undefined,
      isMarketplaceSeller: vendorId !== undefined ? vendorId !== EMAG_VENDOR_ID : undefined,
      observedAt: ctx.observedAt,
      raw: {
        pnk: pnk ?? null,
        productId: productId ?? null,
        offerKind: kind,
        vendorType: o.vendor_type ?? null,
        rrp: o.price?.recommended_retail_price?.is_visible ? money(o.price.recommended_retail_price.amount) ?? null : null,
        initial: money(o.price?.initial) ?? null,
        fulfilledByEmag: o.flags?.is_fulfilment_by_emag ?? null,
      },
    });
  };

  if (main) push(main, 'main');
  for (const o of multiple) if (isRecord(o)) push(o, 'other');
  for (const o of used) if (isRecord(o)) push(o, 'used');

  // The analytics `secondary_offers` array names every other seller with a price; offers not
  // already read from the embedded state are added with unknown availability (never assumed).
  const secondary = (jsonAfter(html, '"secondary_offers":') as Array<Record<string, unknown>> | undefined) ?? [];
  for (const s of secondary) {
    const id = s.id;
    const price = money(typeof s.price === 'number' ? s.price : Number(s.price));
    if ((typeof id !== 'number' && typeof id !== 'string') || !price || seen.has(String(id))) continue;
    seen.add(String(id));
    const vendor = str(s.vendor);
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: String(id),
      url: canonical,
      title,
      price,
      priceFormat: 'decimal',
      currency: 'RON',
      condition: 'new',
      mpn,
      brand,
      category,
      sellerName: vendor,
      isMarketplaceSeller: vendor ? !/^emag$/i.test(vendor) : undefined,
      observedAt: ctx.observedAt,
      raw: { pnk: pnk ?? null, productId: productId ?? null, offerKind: 'secondary' },
    });
  }

  // Fallback: the JSON-LD buy-box offer when the embedded state could not be read.
  if (offers.length === 0 && ld) {
    const o = ld.offers[0];
    const offerId = /EM\.offer_id\s*=\s*(\d+)/.exec(html)?.[1];
    if (o?.price && offerId) {
      offers.push({
        shopSlug: ctx.shopSlug,
        externalId: offerId,
        url: canonical,
        title,
        price: o.price,
        priceFormat: 'decimal',
        currency: o.priceCurrency ?? 'RON',
        availability: o.availability,
        condition: o.itemCondition ?? ld.itemCondition,
        mpn,
        brand,
        category,
        sellerName: o.sellerName,
        isMarketplaceSeller: o.sellerName ? !/^emag$/i.test(o.sellerName) : undefined,
        observedAt: ctx.observedAt,
        raw: { pnk: pnk ?? null, productId: productId ?? null, offerKind: 'jsonld' },
      });
    }
  }

  return {
    offers,
    meta: {
      pnk,
      mpn,
      offersCount: Number(/EM\.offers_count\s*=\s*(\d+)/.exec(html)?.[1] ?? NaN) || null,
      fromEmbedded: offers.length,
      jsonLdSeller: ld?.offers[0]?.sellerName ?? null,
      title: textOf(`<b>${title}</b>`),
      breadcrumb: str(category) ?? null,
    },
  };
}
