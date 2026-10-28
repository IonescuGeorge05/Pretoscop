import { buildSynonyms } from './synonyms';

/**
 * Index names and settings (docs/03 §6.6). One optional prefix (`MEILI_INDEX_PREFIX`) separates
 * environments that share a Meilisearch server (the e2e suite appends `e2e_` to it).
 */
export interface IndexNames {
  products: string;
  categories: string;
  brands: string;
  /** One document per synced index: watermark of the incremental sync, last full rebuild. */
  meta: string;
}

const PREFIX_RE = /^[a-z0-9_-]{0,32}$/;

export function indexNames(prefix = ''): IndexNames {
  if (!PREFIX_RE.test(prefix)) throw new Error(`invalid Meilisearch index prefix "${prefix}" (use [a-z0-9_-], at most 32 characters)`);
  return { products: `${prefix}products`, categories: `${prefix}categories`, brands: `${prefix}brands`, meta: `${prefix}pretoscop_sync` };
}

/** Romanian function words ignored in queries and documents (both spellings: Meilisearch folds them). */
export const STOP_WORDS = ['de', 'si', 'și', 'cu', 'pentru', 'la', 'in', 'în', 'din', 'pe', 'al', 'ale', 'sau', 'pana', 'până'] as const;

export const PRODUCT_SETTINGS = {
  // Order = importance for the `attribute` ranking rule.
  searchableAttributes: ['title', 'brand', 'model_compact', 'family', 'category_names', 'specs', 'aliases'],
  filterableAttributes: [
    'brand_slug',
    'category_slug',
    'category_slugs',
    'shop_slugs',
    'in_stock',
    'has_history',
    'min_total_bani',
    'gtins',
    'provisional',
    'indexable',
    'family_id',
    'offer_count',
    'shop_count',
    'verdict',
    'drop_pct',
    'all_time_low',
  ],
  sortableAttributes: ['min_total_bani', 'popularity', 'offer_count', 'shop_count', 'drop_pct', 'updated_at'],
  // docs/03 §6.6: words, typo, proximity, attribute, sort, exactness, then popularity and offer count.
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'popularity:desc', 'offer_count:desc'],
  stopWords: [...STOP_WORDS],
  synonyms: buildSynonyms(),
  // Model numbers and capacities must match exactly: "rtx 5070" is not "rtx 5060", "a57" is not "a56".
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 }, disableOnAttributes: ['model_compact'], disableOnNumbers: true },
  // Romanian has no dedicated pipeline; pinning the locale keeps titles out of the Turkish dotted-i folding.
  localizedAttributes: [{ attributePatterns: ['*'], locales: ['ron'] }],
  faceting: { maxValuesPerFacet: 200, sortFacetValuesBy: { '*': 'count' } },
  // Category and brand pages paginate through every product (24 per page).
  pagination: { maxTotalHits: 10_000 },
} as const;

export const CATEGORY_SETTINGS = {
  searchableAttributes: ['name', 'parent_name', 'terms'],
  filterableAttributes: ['product_count', 'depth'],
  sortableAttributes: ['product_count'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness', 'product_count:desc'],
  synonyms: buildSynonyms(),
  localizedAttributes: [{ attributePatterns: ['*'], locales: ['ron'] }],
} as const;

export const BRAND_SETTINGS = {
  searchableAttributes: ['name', 'aliases'],
  filterableAttributes: ['product_count'],
  sortableAttributes: ['product_count'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness', 'product_count:desc'],
  localizedAttributes: [{ attributePatterns: ['*'], locales: ['ron'] }],
} as const;

export type IndexSettings = typeof PRODUCT_SETTINGS | typeof CATEGORY_SETTINGS | typeof BRAND_SETTINGS;
