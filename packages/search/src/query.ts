import { normalizeGtin } from '@pretoscop/core';
import type { ProductDocument } from './document';

/**
 * Search parameters as they appear in Romanian URLs (`/cauta?q=…&marca=samsung&pret_max=3000`),
 * their validation, and the Meilisearch requests built from them. Pure: no I/O.
 */
export const SORTS = ['relevanta', 'populare', 'pret-asc', 'pret-desc', 'magazine', 'reducere'] as const;
export type SortKey = (typeof SORTS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  relevanta: 'Relevanță',
  populare: 'Populare',
  'pret-asc': 'Preț crescător',
  'pret-desc': 'Preț descrescător',
  magazine: 'Cele mai multe magazine',
  reducere: 'Cea mai mare scădere verificată',
};

export interface SearchParams {
  q: string;
  /** Category slug (leaf or root). */
  category: string | null;
  /** Brand slugs (OR). */
  brands: string[];
  /** Shop slug. */
  shop: string | null;
  /** Total price bounds in lei (integers). */
  priceMin: number | null;
  priceMax: number | null;
  inStock: boolean;
  hasHistory: boolean;
  sort: SortKey;
  page: number;
}

export const PER_PAGE = 24;
export const MAX_PAGE = 100;
export const MAX_QUERY_LENGTH = 100;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function all(input: RawParams, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const v = input[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
const first = (input: RawParams, key: string) => all(input, key)[0];

/**
 * Whole lei from a price box: "3000", "3.000" and "3 000" (Romanian thousands), "2.999,99" and
 * "2999.99" (decimals dropped). Anything else is ignored.
 */
export function parseLei(v: string | undefined | null): number | null {
  const s = (v ?? '').replace(/\s/g, '').replace(/lei$/i, '');
  if (!s) return null;
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = Number(s.replace(',', '.'));
  else return null;
  return Number.isFinite(n) && n <= 10_000_000 ? Math.floor(n) : null;
}
const lei = parseLei;

/** Collapses whitespace and control characters; keeps diacritics (Meilisearch folds them). */
export function cleanQuery(q: string | undefined | null): string {
  return (q ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function parseSearchParams(input: RawParams): SearchParams {
  const q = cleanQuery(first(input, 'q'));
  const category = first(input, 'categorie') ?? null;
  const shop = first(input, 'magazin') ?? null;
  const brands = [...new Set(all(input, 'marca').flatMap((b) => b.split(',')))].filter((b) => SLUG.test(b)).slice(0, 20);
  let priceMin = lei(first(input, 'pret_min'));
  let priceMax = lei(first(input, 'pret_max'));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  const sortRaw = first(input, 'ordine');
  const sort: SortKey = SORTS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : q ? 'relevanta' : 'populare';
  const pageN = Number(first(input, 'pagina') ?? '1');
  return {
    q,
    category: category && SLUG.test(category) ? category : null,
    brands,
    shop: shop && SLUG.test(shop) ? shop : null,
    priceMin,
    priceMax,
    inStock: first(input, 'stoc') === '1',
    hasHistory: first(input, 'istoric') === '1',
    // Relevance needs words to be relevant to.
    sort: sort === 'relevanta' && !q ? 'populare' : sort,
    page: Number.isInteger(pageN) && pageN >= 1 ? Math.min(pageN, MAX_PAGE) : 1,
  };
}

/** Canonical query string for links (facet toggles, pagination); defaults are omitted. */
export function toQueryString(p: SearchParams, change: Partial<SearchParams> = {}): string {
  const n = { ...p, ...change };
  const u = new URLSearchParams();
  if (n.q) u.set('q', n.q);
  if (n.category) u.set('categorie', n.category);
  for (const b of n.brands) u.append('marca', b);
  if (n.shop) u.set('magazin', n.shop);
  if (n.priceMin !== null) u.set('pret_min', String(n.priceMin));
  if (n.priceMax !== null) u.set('pret_max', String(n.priceMax));
  if (n.inStock) u.set('stoc', '1');
  if (n.hasHistory) u.set('istoric', '1');
  const defaultSort: SortKey = n.q ? 'relevanta' : 'populare';
  if (n.sort !== defaultSort) u.set('ordine', n.sort);
  if (n.page > 1) u.set('pagina', String(n.page));
  return u.toString();
}

/** A barcode typed or scanned into the search box: GTIN-8/12/13/14 with a valid check digit. */
export function gtinQuery(q: string): string | null {
  const digits = q.replace(/[\s-]/g, '');
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return null;
  return normalizeGtin(digits);
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

type FilterPart = 'category' | 'brands' | 'shop' | 'price' | 'inStock' | 'hasHistory';

/** Meilisearch filter (AND of the parts); `except` drops one part for disjunctive facet counts. */
export function buildFilter(p: SearchParams, opts: { except?: FilterPart; gtin?: string | null; extra?: string[] } = {}): string[] {
  const f: string[] = [];
  if (opts.gtin) f.push(`gtins = ${quote(opts.gtin)}`);
  if (p.category && opts.except !== 'category') f.push(`category_slugs = ${quote(p.category)}`);
  if (p.brands.length && opts.except !== 'brands') f.push(`brand_slug IN [${p.brands.map(quote).join(', ')}]`);
  if (p.shop && opts.except !== 'shop') f.push(`shop_slugs = ${quote(p.shop)}`);
  if (opts.except !== 'price') {
    if (p.priceMin !== null) f.push(`min_total_bani >= ${p.priceMin * 100}`);
    if (p.priceMax !== null) f.push(`min_total_bani <= ${p.priceMax * 100}`);
  }
  if (p.inStock && opts.except !== 'inStock') f.push('in_stock = true');
  if (p.hasHistory && opts.except !== 'hasHistory') f.push('has_history = true');
  if (p.sort === 'reducere') f.push('drop_pct > 0');
  return [...f, ...(opts.extra ?? [])];
}

export function buildSort(sort: SortKey): string[] | undefined {
  switch (sort) {
    case 'relevanta':
      return undefined;
    case 'populare':
      return ['popularity:desc', 'min_total_bani:asc'];
    case 'pret-asc':
      return ['min_total_bani:asc'];
    case 'pret-desc':
      return ['min_total_bani:desc'];
    case 'magazine':
      return ['shop_count:desc', 'offer_count:desc', 'min_total_bani:asc'];
    case 'reducere':
      return ['drop_pct:desc', 'popularity:desc'];
  }
}

/** Fields result cards need (keeps responses small). */
export const CARD_FIELDS = [
  'id', 'slug', 'title', 'brand', 'brand_slug', 'image', 'attributes', 'category_slug', 'min_total_bani', 'min_price_bani', 'min_shop',
  'offer_count', 'shop_count', 'in_stock', 'has_history', 'observations_days', 'verdict', 'indexable', 'provisional',
  'drop_pct', 'drop_ref_bani', 'drop_since', 'all_time_low',
] as const satisfies readonly (keyof ProductDocument)[];

export type ProductCard = Pick<ProductDocument, (typeof CARD_FIELDS)[number]>;

export interface MeiliSearchQuery {
  indexUid: string;
  q: string;
  filter?: string[];
  sort?: string[];
  facets?: string[];
  page?: number;
  hitsPerPage?: number;
  limit?: number;
  attributesToRetrieve?: readonly string[];
  matchingStrategy?: 'all' | 'last' | 'frequency';
}

export const FACETS = ['brand_slug', 'category_slug', 'in_stock', 'has_history', 'min_total_bani'] as const;

/**
 * The multi-search for one results page: the hits (with every filter), plus one facet-only query
 * per multi-value facet without its own filter, so the brand list still offers the other brands
 * after one is picked (disjunctive faceting).
 */
export function buildSearchQueries(index: string, p: SearchParams, opts: { matchingStrategy?: 'all' | 'last'; perPage?: number } = {}): MeiliSearchQuery[] {
  const gtin = gtinQuery(p.q);
  const q = gtin ? '' : p.q;
  const matchingStrategy = opts.matchingStrategy ?? 'all';
  const main: MeiliSearchQuery = {
    indexUid: index,
    q,
    filter: buildFilter(p, { gtin }),
    sort: buildSort(p.sort),
    facets: [...FACETS],
    page: p.page,
    hitsPerPage: opts.perPage ?? PER_PAGE,
    attributesToRetrieve: CARD_FIELDS,
    matchingStrategy,
  };
  const facetOnly = (except: FilterPart, facet: string): MeiliSearchQuery => ({
    indexUid: index,
    q,
    filter: buildFilter(p, { except, gtin }),
    facets: [facet],
    limit: 0,
    matchingStrategy,
  });
  return [main, facetOnly('brands', 'brand_slug'), facetOnly('category', 'category_slug')];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SearchResult {
  hits: ProductCard[];
  total: number;
  page: number;
  totalPages: number;
  facets: {
    brands: FacetValue[];
    categories: FacetValue[];
    inStock: number;
    hasHistory: number;
    price: { min: number; max: number } | null;
  };
  /** `last` when no product matched every word and the results are the closest ones. */
  matching: 'all' | 'last';
  gtin: string | null;
  processingMs: number;
}

interface RawSearch {
  hits: ProductCard[];
  totalHits?: number;
  totalPages?: number;
  page?: number;
  estimatedTotalHits?: number;
  facetDistribution?: Record<string, Record<string, number>>;
  facetStats?: Record<string, { min: number; max: number }>;
  processingTimeMs?: number;
}

const sortedFacet = (d: Record<string, number> | undefined): FacetValue[] =>
  Object.entries(d ?? {})
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** Turns the three multi-search answers into one result. */
export function readSearchResults(results: RawSearch[], p: SearchParams, matching: 'all' | 'last'): SearchResult {
  const [main, brands, categories] = results;
  if (!main) throw new Error('empty multi-search response');
  const dist = main.facetDistribution ?? {};
  const stats = main.facetStats?.min_total_bani;
  return {
    hits: main.hits,
    total: main.totalHits ?? main.estimatedTotalHits ?? main.hits.length,
    page: main.page ?? p.page,
    totalPages: main.totalPages ?? 1,
    facets: {
      brands: sortedFacet(brands?.facetDistribution?.brand_slug),
      categories: sortedFacet(categories?.facetDistribution?.category_slug),
      inStock: dist.in_stock?.true ?? 0,
      hasHistory: dist.has_history?.true ?? 0,
      price: stats ? { min: Math.floor(stats.min / 100), max: Math.ceil(stats.max / 100) } : null,
    },
    matching,
    gtin: gtinQuery(p.q),
    processingMs: results.reduce((s, r) => s + (r.processingTimeMs ?? 0), 0),
  };
}

export function hasActiveFilters(p: SearchParams): boolean {
  return !!(p.category || p.brands.length || p.shop || p.priceMin !== null || p.priceMax !== null || p.inStock || p.hasHistory);
}
