import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, isRecord, lenientJsonParse, nonEmpty, str } from '../util';

/**
 * Bonami category listing (`/c/aparate-de-bucatarie`, `?p=1` for the second page): the Next.js page
 * data (`<script id="__NEXT_DATA__">`) holds the page's product list (48 per page, recorded
 * 2026-10-27) with exact money amounts (`{units: 71700, scale: 2}` = 717,00 lei), the crossed
 * `retailPrice` (the shop's reference; the listing does not say it is a 30-day minimum), stock,
 * brand and slug (`/p/<slug>`). Variants grouped under a product (other colours) carry no price on
 * the listing and are not emitted. External id = Bonami's numeric product id.
 */
export function parseBonamiListing(html: string, ctx: PageContext): PageParseResult {
  const $ = load(html);
  const data = lenientJsonParse($('script#__NEXT_DATA__').first().text());
  const state = dig(data, ['props', 'pageProps', 'initialCataloguePageState']);
  const list =
    isRecord(state) && isRecord(state.productList) && Array.isArray(state.productList.products)
      ? state.productList.products
      : null;
  if (!isRecord(state) || !list)
    return { offers: [], productUrls: [], nextPageUrl: null, meta: { items: 0, nextData: false } };

  const category = breadcrumb(state);
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  let skipped = 0;
  for (const p of list) {
    if (!isRecord(p)) {
      skipped++;
      continue;
    }
    const id = str(p.id);
    const slug = str(p.slug);
    const title = nonEmpty(str(p.name));
    const price = money(p.customerPrice);
    if (!id || !slug || !title || !price) {
      skipped++;
      continue;
    }
    const url = canonicalUrl(new URL(`/p/${slug}`, ctx.url).toString());
    productUrls.push(url);
    const retail = money(p.retailPrice);
    const availability = isRecord(p.availability) ? str(p.availability.type) : undefined;
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: id,
      url,
      title,
      price: price.value,
      priceFormat: 'decimal',
      oldPrice: retail && retail.bani > price.bani ? retail.value : undefined,
      currency: price.currency,
      availability:
        p.available === true
          ? 'https://schema.org/InStock'
          : p.available === false
            ? 'https://schema.org/OutOfStock'
            : availability,
      brand: isRecord(p.brand) ? nonEmpty(str(p.brand.name)) : undefined,
      category,
      observedAt: ctx.observedAt,
      raw: {
        source: 'bonami-next-data',
        parameters: nonEmpty(str(p.parametersName)) ?? null,
        productType: nonEmpty(str(p.productTypeName)) ?? null,
        availabilityType: availability ?? null,
        usableStock: isRecord(p.availability) ? (p.availability.usableStock ?? null) : null,
        badges: Array.isArray(p.badges) ? p.badges : [],
        variants: Array.isArray(p.variants) ? p.variants.length : 0,
      },
    });
  }
  const nextPath = str(state.nextPagePath);
  const next = nextPath ? (absoluteUrl(nextPath, ctx.url) ?? null) : null;
  return {
    offers,
    productUrls,
    nextPageUrl: next && next !== ctx.url && offers.length > 0 ? next : null,
    meta: {
      items: list.length,
      skipped,
      total: isRecord(state.productList)
        ? (state.productList.totalCollapsedProductsCount ?? null)
        : null,
    },
  };
}

function dig(v: unknown, path: string[]): unknown {
  let cur = v;
  for (const k of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** `{amount: {units: 71700, scale: 2}, currency: "RON"}` → "717.00" (exact, integer arithmetic). */
function money(v: unknown): { value: string; bani: number; currency: string } | undefined {
  if (!isRecord(v) || !isRecord(v.amount)) return undefined;
  const units = Number(v.amount.units);
  const scale = Number(v.amount.scale ?? 0);
  if (
    !Number.isSafeInteger(units) ||
    units <= 0 ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 6
  )
    return undefined;
  const digits = String(units).padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const frac = scale > 0 ? digits.slice(-scale) : '';
  const bani = scale >= 2 ? Math.round(units / 10 ** (scale - 2)) : units * 10 ** (2 - scale);
  return { value: frac ? `${whole}.${frac}` : whole, bani, currency: str(v.currency) ?? 'RON' };
}

function breadcrumb(state: Record<string, unknown>): string | undefined {
  const blocks = Array.isArray(state.blocks) ? state.blocks : [];
  const nav = blocks.find((b) => isRecord(b) && b.type === 'Navigation');
  const crumbs = isRecord(nav) && Array.isArray(nav.breadcrumbs) ? nav.breadcrumbs : [];
  const names = crumbs
    .map((c) => (isRecord(c) ? nonEmpty(str(c.name)) : undefined))
    .filter((n): n is string => !!n && !/^categorii$/i.test(n));
  return names.length > 0 ? names.join(' > ') : undefined;
}
