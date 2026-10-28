# @pretoscop/search

Meilisearch index definitions, the product document builder, query parsing, and the database → index
sync (M14, docs/03 §6.6, ADR-004, ADR-014).

## Contract

| Export | Use |
|---|---|
| `createMeili({ url, apiKey })` | Minimal REST client on `node:http` (never the global `fetch`: inside Next.js it would turn ISR pages dynamic). `request`, `waitForTask`, `healthy`. |
| `indexNames(prefix)` | `{ products, categories, brands, meta }`; the prefix (`MEILI_INDEX_PREFIX`; the e2e suite appends `e2e_` to it) separates environments sharing one server. |
| `PRODUCT_SETTINGS`, `CATEGORY_SETTINGS`, `BRAND_SETTINGS` | Index settings (below). |
| `ProductDocument`, `buildProductDocument(row)` | The document shape; pure. |
| `parseSearchParams(urlParams)`, `toQueryString(p, change)` | `/cauta` URL parameters (`q`, `categorie`, `marca` (repeatable), `magazin`, `pret_min`, `pret_max` (whole lei; `3.000` = 3000), `stoc=1`, `istoric=1`, `ordine`, `pagina`). |
| `searchProducts(meili, names, params)` | Results page: hits + disjunctive facet counts in one multi-search; every word must match (`matching: 'all'`), else the closest products with `matching: 'last'`. A barcode (GTIN-8/12/13/14 with a valid check digit) becomes a `gtins` filter. |
| `listProducts(meili, names, { filter, sort, page })` | Browse pages (category, brand, shop). |
| `facetCounts`, `suggest` | Category tree counts; autocomplete over products, categories and brands. |
| `@pretoscop/search/sync`: `rebuildAll`, `syncChanged`, `indexProductIds`, `recomputePopularity`, `loadProductRows` | Worker side (needs `@pretoscop/db`). Documents carry the M15 verified-drop facts (`drop_pct`, `drop_ref_bani`, `drop_since`, `all_time_low`) computed per batch with `priceFactsFor`. |

## Document (`products` index)

`id, slug, title, title_ascii, brand, brand_slug, aliases, category_slug, category_slugs (leaf + parent), category_names,
category_path, family, family_id, model_compact, specs, gtins, mpn, attributes, image, min_price_bani, min_total_bani,
min_shop, offer_count, shop_count, shop_slugs, in_stock, has_history, observations_days, history_started_at, verdict,
popularity, provisional, indexable, last_change_at, updated_at` (+ `drop_pct, drop_ref_bani, drop_since, all_time_low` from M15).

- Money is integer **bani**. The minimum is over new, in-stock **live** offers (active, matched, active shop, not
  blacklisted, checked within the shop's freshness SLO), marketplace sellers included: the same number as "cel mai mic
  preț total acum" on the product page. `offer_count`/`shop_count` count live offers in any stock state.
- `indexable` comes from `isProductIndexable` in `@pretoscop/core` (the one index-policy function).
- `has_history` = at least 14 observed days (the verdict threshold).
- `specs` are the phrases people type ("256GB", "16GB RAM", "55 inch", "negru"/"black") built from the extracted
  attributes; `model_compact` holds model numbers without separators (exact match only).

## Settings

- Searchable, by importance: `title, brand, model_compact, family, category_names, specs, aliases`. Diacritics need no
  extra field: Meilisearch folds ș/ş, ț/ţ, ă, â, î in documents and queries (`title_ascii` is stored, not searched).
- Ranking: `words, typo, proximity, attribute, sort, exactness, popularity:desc, offer_count:desc`.
- Typo tolerance: default word sizes (1 typo from 5 letters, 2 from 9); **off on numbers and on `model_compact`**, so
  "rtx 5070" never matches "rtx 5060" and "a57" never "a56".
- `localizedAttributes: ron` (keeps titles out of the Turkish dotted-i folding), Romanian stop words
  (`de, si, cu, pentru, la, in, din, pe, al, ale, sau, pana`), ≈290 synonym entries (94 groups) in `src/synonyms.ts` (plurals,
  product-type names, `ps5` = `playstation 5`, `tv` = `televizor`, colours Romanian ↔ English). Edit rules are at the top
  of that file; the unit test refuses non-ASCII terms and terms listed in two groups.
- `maxTotalHits: 10000` so browse pages can paginate through big categories.

## Sync

- **Full rebuild** (`search.rebuild`, nightly 05:00 Europe/Bucharest after the rollup; also whenever the schema or the
  settings change): fills `<index>_next`, swaps it in atomically, drops the old data; the `categories` and `brands`
  indexes are rebuilt the same way with product counts.
- **Incremental** (`search.sync`, every minute): products whose row, offers, stats, merges, images or GTINs changed since
  the watermark (with a 2-minute overlap) are re-indexed, as are products with an offer that went past its shop's
  freshness SLO since then and every product of a shop whose status or SLO changed (the meta document keeps each shop's
  `status|SLO`); products no longer active are removed. The watermark document lives in the `<prefix>pretoscop_sync`
  index, so a wiped Meilisearch triggers a rebuild by itself. Writers must bump `updated_at` (Drizzle's `$onUpdate` does
  it). Deleted rows (only the e2e fixture deletes products) disappear at the next rebuild.
- **One writer at a time**: rebuilds and syncs of one index set hold a PostgreSQL advisory lock (transaction-scoped,
  keyed on the products index name, so it works across worker processes). A rebuild waits for it; a sync that finds it
  taken is skipped (`mode: 'skipped'`) and the next one catches up from the unchanged watermark.
- `SCHEMA_VERSION` = hash of `DOC_VERSION` + settings: bump `DOC_VERSION` when the document shape changes.
- **Popularity** (nightly, before the rebuild): `3 × click-outs + 1 × product views` (90 days, half-life 14 days)
  `+ 2 × shops with a live offer`; written to `products.popularity` without touching `updated_at`.
- CLI: `pnpm --filter @pretoscop/worker search:rebuild` (full rebuild, prints counts), `search:sync`.

## Tests

`pnpm --filter @pretoscop/search test`: unit tests (query parsing, filters, document builder, synonyms) and integration
tests against the dev Meilisearch with throwaway `<MEILI_INDEX_PREFIX>test_<random>_` indexes and a throwaway database: the M14 acceptance
queries ("televizor samsung 55", "frigider", "ps5", "laptop asus 16gb", diacritics, the "televzor" typo, barcodes,
facets, sorting) and the sync (first rebuild, rename, price change, hide/unhide, an offer going stale, a paused shop, the writer lock). They are skipped when Meilisearch is
down, unless `SEARCH_INTEGRATION=1` (set by `make verify M=14`).
