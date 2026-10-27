# @pretoscop/db

Drizzle schema, migrations, partition SQL, seed and typed queries. PostgreSQL 18.

## Commands

| Command | What it does |
|---|---|
| `pnpm --filter @pretoscop/db migrate` (`make migrate`) | Applies pending migrations, then ensures 12 months of `price_events` partitions |
| `pnpm --filter @pretoscop/db seed` (`make seed`) | Two shops + every known feature flag (off) |
| `pnpm --filter @pretoscop/db generate` | `drizzle-kit generate` after a schema change (review the SQL) |
| `pnpm --filter @pretoscop/db test` | Integration tests on a throwaway database (`createTestDatabase()`) |

Database changes only through migrations in `migrations/`. Generated SQL may be edited by hand
when Drizzle cannot express something (partitioning); say so in a comment at the top of the file.

## Conventions

- Money: `numeric(12,2)`, RON incl. VAT; the driver returns strings. Code works in integer **bani**;
  convert with `baniToNumeric` / `numericToBani` (string arithmetic, no floats).
- Time: `timestamptz`, UTC. IDs: `bigint` identity (`mode: 'number'`).
- Enumerations are `text` with CHECK constraints (cheap to extend in a migration).
- Raw `db.execute(sql…)` returns timestamps as text: select `extract(epoch …)` when you need numbers.

## Tables (ER summary)

```
shops ─┬─< shop_sources ─< ingest_runs
       ├─< affiliate_programs
       ├─< access_costs (day, shop, vendor)            assisted-channel ledger (M05B)
       └─< offers ─┬─< price_events (partitioned by month, change-only)
                   ├─< offer_gaps (coverage gaps > 48 h)
                   ├─< match_candidates
                   └─< match_decisions (append-only audit)
brands ─< products >─ categories (tree)               products.family_id → product_families
products ─┬─< product_gtins (gtin14 PK)
          ├─< product_images (licensed sources only)
          ├─< product_specs (Icecat stays here)
          ├─< product_daily (rollup, M08)
          └── product_stats (1:1, M08)
offer_aliases (shop_id, external_id) → product         sticky human decisions
product_merges                                         merge log, undo, 301s
feature_flags · audit_log · request_log (30 days) · crawl_domain_state (per-host politeness state)
```

Column-level details follow `docs/03-architecture.md` §5; the Drizzle files in `src/schema/` are
authoritative. Additions beyond §5: `shops.shipping_verified`, `shops.vat_included_default`,
`shop_sources.key` (stable registry key), `shop_sources.freshness_slo_hours`, `source_tier`,
`next_run_at`, `consecutive_failures`; `offers.title_clean/title_ascii/brand_name/gtin14/mpn_norm/attributes`
(normalized fields used by matching), `total_price`, `shipping_estimated`, `missing_runs`,
`blacklisted`; `price_events.kind/currency/fx_rate`; `offer_gaps`; `product_daily.mp_*`
(marketplace series); `product_stats.current_min_*` and `history_started_at`; `crawl_domain_state`.

## Query contract

- `recordObservation(db, observation)` → `{ offerId, inserted, changed, eventKind, stale, gap, needsMatch }`.
  One transaction: `INSERT … ON CONFLICT (shop_id, external_id) DO UPDATE … RETURNING old.*, new.*`
  (PostgreSQL 18) tells whether the content hash changed; a `price_events` row is written only on
  first sight (`first`), on change (`change`) or on reactivation (`reactivated`), with
  `ON CONFLICT (offer_id, observed_at) DO NOTHING` so a retried run never doubles an event.
  `last_checked_at` advances on every confirmation; an observation older than the stored one is
  ignored (`stale`); two checks more than 48 h apart record an `offer_gaps` row so charts never
  draw a step across an outage. Identifiers (GTIN, MPN, brand, seller) are never erased by a source
  that does not show them. A changed `identity_hash` resets `match_status` to `pending`.
- `insertPriceEventIfChanged(db, offerId, observation)` → `{ changed, stale }` for re-checks of a
  known offer (`UPDATE … RETURNING old.*, new.*`).
- `offers.content_hash` = sha256 of the normalized `(price, old_price, shipping_cost, availability)`
  computed by `@pretoscop/core/hash` (M06).
- `markMissingOffers(db, sourceId, runStartedAt)`: after a successful full-size run, offers not seen
  gain a missing run; two consecutive missing runs deactivate them.
- `startRun` / `finishRun` / `emptyStats` → `ingest_runs` with `stats = {fetched, parsed, upserted, changed, blocked, errors, durationMs}`.
- `isFlagEnabled`, `setFlag`, `ensureKnownFlags` (`KNOWN_FLAGS`, all default off).
- `ensurePriceEventPartitions(db, monthsBack, monthsAhead)` (SQL function
  `ensure_price_event_partitions`), `listPriceEventPartitions`, `pruneRequestLog`.
- Worker jobs: `maintenance.partitions` (daily 03:15 Europe/Bucharest, and at start),
  `maintenance.request_log` (daily 03:40).
- Tests: `import { createTestDatabase } from '@pretoscop/db/testing'` creates and migrates a
  throwaway database; call `drop()` in `afterAll`.
