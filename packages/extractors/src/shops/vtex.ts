import type { RawOffer } from '@pretoscop/core';
import type { PageContext, PageParseResult } from '../types';
import { absoluteUrl, canonicalUrl, isRecord, nonEmpty, str } from '../util';

/**
 * VTEX IO store pages (Auchan): the server-rendered HTML embeds the page's Apollo cache as JSON in
 * `<template data-varname="__STATE__"><script>{…}</script></template>`. That is page data, read
 * like eMAG's `EM.offer` or a `__NEXT_DATA__` blob; no API is called (the platform's catalogue
 * JSON endpoints are not used: docs/12, CLAUDE.md never-list).
 *
 * A category page (`/…/televizoare/c`, `?page=2`) lists 24 products (`ROOT_QUERY.productSearch`,
 * with `recordsFiltered` for pagination); a product page (`/<slug>/p`) holds one. Per product:
 * `productId` (= the JSON-LD `sku`, our external id), `productName`, `link`, the category path,
 * and per SKU the `ean` and each seller's `commertialOffer` (`Price`, `ListPrice`,
 * `AvailableQuantity`). VTEX shows an unavailable product with price 0 and quantity 0: such
 * products carry no price and are skipped (counted in `meta.unpriced`), so a page of unavailable
 * products is not a layout change. `ListPrice` above `Price` is the shop's crossed reference price.
 * The brand field is not reliable at Auchan (TCL televisions carry the supplier "AEC"); it is
 * passed as seen and the normalizer prefers a known brand named in the title.
 */
export function parseVtexListing(html: string, ctx: PageContext): PageParseResult {
  const state = vtexState(html);
  if (!state)
    return { offers: [], productUrls: [], nextPageUrl: null, meta: { items: 0, state: false } };
  const search = productSearch(state);
  const ids = search
    ? search.products
    : Object.keys(state).filter((k) => /^Product:sp-\d+$/.test(k));
  const offers: RawOffer[] = [];
  const productUrls: string[] = [];
  let unpriced = 0;
  let skipped = 0;
  for (const id of ids) {
    const p = state[id];
    if (!isRecord(p)) {
      skipped++;
      continue;
    }
    const productId = str(p.productId);
    const title = nonEmpty(str(p.productName));
    const url = absoluteUrl(str(p.link), ctx.url);
    if (!productId || !title || !url) {
      skipped++;
      continue;
    }
    const canonical = canonicalUrl(url);
    productUrls.push(canonical);
    const item = firstItem(state, id);
    const seller = item ? firstSeller(state, item) : undefined;
    const offer = seller ? deref(state, seller.commertialOffer) : undefined;
    const price = offer ? Number(offer.Price) : 0;
    if (!offer || !Number.isFinite(price) || price <= 0) {
      unpriced++;
      continue;
    }
    const listPrice = Number(offer.ListPrice);
    const quantity = Number(offer.AvailableQuantity);
    const categories =
      isRecord(p.categories) && Array.isArray(p.categories.json) ? p.categories.json : [];
    const sellerId = str(seller?.sellerId);
    offers.push({
      shopSlug: ctx.shopSlug,
      externalId: productId,
      url: canonical,
      title,
      price: String(price),
      priceFormat: 'decimal',
      oldPrice: Number.isFinite(listPrice) && listPrice > price ? String(listPrice) : undefined,
      currency: 'RON',
      availability: Number.isFinite(quantity)
        ? quantity > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock'
        : undefined,
      gtin: nonEmpty(str(item?.ean)),
      brand: nonEmpty(str(p.brand)),
      category: categoryPath(categories[0]),
      sellerName: nonEmpty(str(seller?.sellerName)),
      sellerId,
      isMarketplaceSeller: sellerId !== undefined && sellerId !== '1' ? true : undefined,
      observedAt: ctx.observedAt,
      raw: {
        source: 'vtex-state',
        itemId: str(item?.itemId) ?? null,
        productReference: str(p.productReference) ?? null,
        priceWithoutDiscount: offer.PriceWithoutDiscount ?? null,
        availableQuantity: Number.isFinite(quantity) ? quantity : null,
      },
    });
  }
  return {
    offers,
    productUrls,
    nextPageUrl: search ? nextPageUrl(ctx.url, search) : null,
    meta: {
      items: ids.length,
      unpriced,
      skipped,
      recordsFiltered: search?.recordsFiltered ?? null,
    },
  };
}

type State = Record<string, unknown>;
type Rec = Record<string, unknown>;

/** The JSON inside `<template data-varname="__STATE__"><script>…</script></template>`. */
function vtexState(html: string): State | undefined {
  const at = html.indexOf('data-varname="__STATE__"');
  if (at < 0) return undefined;
  const start = html.indexOf('<script>', at);
  const end = start < 0 ? -1 : html.indexOf('</script>', start);
  if (start < 0 || end < 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(html.slice(start + '<script>'.length, end));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function deref(state: State, ref: unknown): Rec | undefined {
  if (isRecord(ref) && typeof ref.id === 'string') {
    const v = state[ref.id];
    return isRecord(v) ? v : undefined;
  }
  return isRecord(ref) ? ref : undefined;
}

interface Search {
  products: string[];
  recordsFiltered: number | null;
  from: number;
  to: number;
}

function productSearch(state: State): Search | undefined {
  const root = state.ROOT_QUERY;
  if (!isRecord(root)) return undefined;
  const key = Object.keys(root).find((k) => k.startsWith('productSearch('));
  if (!key) return undefined;
  const result = deref(state, root[key]);
  if (!result || !Array.isArray(result.products)) return undefined;
  const products = result.products
    .map((r) => (isRecord(r) && typeof r.id === 'string' ? r.id : ''))
    .filter(Boolean);
  const from = Number(/"from":(\d+)/.exec(key)?.[1] ?? 0);
  const to = Number(/"to":(\d+)/.exec(key)?.[1] ?? from + products.length - 1);
  const total = Number(result.recordsFiltered);
  return { products, recordsFiltered: Number.isFinite(total) ? total : null, from, to };
}

function firstItem(state: State, productKey: string): Rec | undefined {
  const key = Object.keys(state).find(
    (k) => k.startsWith(`${productKey}.items(`) && /\)\.0$/.test(k),
  );
  const v = key ? state[key] : undefined;
  return isRecord(v) ? v : undefined;
}

function firstSeller(state: State, item: Rec): Rec | undefined {
  const sellers = Array.isArray(item.sellers) ? item.sellers : [];
  const all = sellers.map((s) => deref(state, s)).filter((s): s is Rec => s !== undefined);
  return all.find((s) => s.sellerDefault === true) ?? all[0];
}

/** "/Electro, Climatizare si Aparate ingrijire/Electronice/Televizoare/" → "… > Electronice > Televizoare". */
function categoryPath(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const parts = s
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' > ') : undefined;
}

/** Next category page as `?page=N` (allowed by Auchan's robots.txt; its own `?map=` links are not). */
function nextPageUrl(current: string, search: Search): string | null {
  if (search.recordsFiltered === null || search.to + 1 >= search.recordsFiltered) return null;
  const u = new URL(current);
  const page = Number(u.searchParams.get('page') ?? '1');
  const next = new URL(u.origin + u.pathname);
  next.searchParams.set('page', String((Number.isFinite(page) && page > 0 ? page : 1) + 1));
  return next.toString();
}
