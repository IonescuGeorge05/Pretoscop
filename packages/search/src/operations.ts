import type { Meili } from './client';
import { CARD_FIELDS, buildSearchQueries, readSearchResults, type MeiliSearchQuery, type ProductCard, type SearchParams, type SearchResult } from './query';
import type { IndexNames } from './settings';

/** Read-side operations shared by the web app (results page, browse pages, autocomplete). */

interface MultiSearchResponse {
  results: Array<{
    hits: ProductCard[];
    totalHits?: number;
    totalPages?: number;
    page?: number;
    estimatedTotalHits?: number;
    facetDistribution?: Record<string, Record<string, number>>;
    facetStats?: Record<string, { min: number; max: number }>;
    processingTimeMs?: number;
  }>;
}

async function multiSearch(meili: Meili, queries: MeiliSearchQuery[]): Promise<MultiSearchResponse['results']> {
  const res = await meili.request<MultiSearchResponse>('POST', '/multi-search', { queries });
  return res.results;
}

/**
 * The results page: every word must match first (honest counts); when nothing matches every word,
 * the closest products are returned with `matching: 'last'` so the page can say so.
 */
export async function searchProducts(meili: Meili, names: IndexNames, p: SearchParams): Promise<SearchResult> {
  const strict = readSearchResults(await multiSearch(meili, buildSearchQueries(names.products, p, { matchingStrategy: 'all' })), p, 'all');
  if (strict.total > 0 || !p.q || strict.gtin) return strict;
  return readSearchResults(await multiSearch(meili, buildSearchQueries(names.products, p, { matchingStrategy: 'last' })), p, 'last');
}

export interface ListOptions {
  filter: string[];
  sort?: string[];
  page?: number;
  perPage?: number;
  facets?: string[];
}

export interface ListResult {
  hits: ProductCard[];
  total: number;
  page: number;
  totalPages: number;
  facets: Record<string, Record<string, number>>;
}

/** Browse pages (category, brand, shop): a filtered, sorted page of product cards plus facet counts. */
export async function listProducts(meili: Meili, names: IndexNames, o: ListOptions): Promise<ListResult> {
  const [r] = await multiSearch(meili, [
    {
      indexUid: names.products,
      q: '',
      filter: o.filter,
      sort: o.sort ?? ['popularity:desc', 'min_total_bani:asc'],
      facets: o.facets,
      page: o.page ?? 1,
      hitsPerPage: o.perPage ?? 24,
      attributesToRetrieve: CARD_FIELDS,
    },
  ]);
  if (!r) throw new Error('empty multi-search response');
  return { hits: r.hits, total: r.totalHits ?? 0, page: r.page ?? 1, totalPages: r.totalPages ?? 0, facets: r.facetDistribution ?? {} };
}

/** Facet counts only (no hits), e.g. products per category for the category tree. */
export async function facetCounts(meili: Meili, names: IndexNames, filter: string[], facets: string[]): Promise<{ total: number; facets: Record<string, Record<string, number>> }> {
  const [r] = await multiSearch(meili, [{ indexUid: names.products, q: '', filter, facets, limit: 0 }]);
  return { total: r?.estimatedTotalHits ?? r?.totalHits ?? 0, facets: r?.facetDistribution ?? {} };
}

export interface Suggestion {
  products: Array<Pick<ProductCard, 'id' | 'slug' | 'title' | 'min_total_bani' | 'in_stock' | 'shop_count'>>;
  categories: Array<{ slug: string; path: string; name: string; parent_name: string | null; product_count: number }>;
  brands: Array<{ slug: string; name: string; product_count: number }>;
}

/** Autocomplete: products, categories and brands in one round trip (prefix search on the last word). */
export async function suggest(meili: Meili, names: IndexNames, q: string): Promise<Suggestion> {
  const [products, categories, brands] = await multiSearch(meili, [
    { indexUid: names.products, q, limit: 6, attributesToRetrieve: ['id', 'slug', 'title', 'min_total_bani', 'in_stock', 'shop_count'], matchingStrategy: 'all' },
    { indexUid: names.categories, q, limit: 3, filter: ['product_count > 0'], attributesToRetrieve: ['slug', 'path', 'name', 'parent_name', 'product_count'] },
    { indexUid: names.brands, q, limit: 3, filter: ['product_count > 0'], attributesToRetrieve: ['slug', 'name', 'product_count'] },
  ]);
  return {
    products: (products?.hits ?? []) as Suggestion['products'],
    categories: (categories?.hits ?? []) as unknown as Suggestion['categories'],
    brands: (brands?.hits ?? []) as unknown as Suggestion['brands'],
  };
}
