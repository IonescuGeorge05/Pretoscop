// @pretoscop/search — read side (no database imports): client, index names and settings,
// document shape, query parsing/building, search operations. The database → index sync lives in
// the `@pretoscop/search/sync` sub-path (worker, CLI, tests).
export { createMeili, MeiliError, type Meili, type MeiliConfig, type EnqueuedTask, type Task, type HttpMethod } from './client';
export {
  indexNames,
  PRODUCT_SETTINGS,
  CATEGORY_SETTINGS,
  BRAND_SETTINGS,
  STOP_WORDS,
  type IndexNames,
  type IndexSettings,
} from './settings';
export { buildSynonyms, synonymIssues, SYNONYM_GROUPS, ONE_WAY } from './synonyms';
export { buildProductDocument, specPhrases, compactModels, brandAliases, type ProductDocument, type ProductRow } from './document';
export {
  SORTS,
  SORT_LABELS,
  PER_PAGE,
  MAX_PAGE,
  MAX_QUERY_LENGTH,
  FACETS,
  CARD_FIELDS,
  cleanQuery,
  parseLei,
  parseSearchParams,
  toQueryString,
  gtinQuery,
  buildFilter,
  buildSort,
  buildSearchQueries,
  readSearchResults,
  hasActiveFilters,
  type SortKey,
  type SearchParams,
  type SearchResult,
  type ProductCard,
  type FacetValue,
  type MeiliSearchQuery,
} from './query';
export { searchProducts, listProducts, facetCounts, suggest, type ListOptions, type ListResult, type Suggestion } from './operations';
