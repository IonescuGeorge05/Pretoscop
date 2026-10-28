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
shops ─< merchants (portal account, M20) · shops ─< outreach (retailer contacts, M21)
shops ─< extractor_canaries (weekly canary results per URL, M21)
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
- Icecat (M11, `queries/icecat.ts`): `icecatCandidates`, `saveIcecatSpecs` / `saveIcecatMiss`
  (`product_specs` with `source = 'icecat'` / `'icecat-miss'`), `icecatImagesOf`,
  `insertIcecatImage`, `deleteIcecatImages`, `setPrimaryImageIfMissing`,
  `confirmProvisionalByIcecat`, `reserveIcecatUsage` / `icecatUsage` (monthly datasheet counter,
  interim rows of `fetch_domain_daily` keyed `icecat:<LANG>`), `icecatCoverage`. Icecat content never
  enters `products` or `product_gtins` (ADR-016); readers of `product_specs` filter on `source`.
- Bot legitimacy (M21): `extractor_canaries` (written by the worker's weekly canary, migration 0017),
  `outreach` (admin tracker, migration 0018; business channels only, deleted with the shop) and
  `assistedMigrationStatus(db)` (`queries/outreach.ts`): every `access_mode = 'assisted'` shop with its
  30-day request count and success rate from `request_log` (assisted channel), whether a replacement
  feed source succeeded in the last 3 days, and its latest outreach entry.

## Price alerts (M19)

Tables (migration `0014_alerts`): `alerts` (user, product, `kind` below/any_drop, `target_price`,
`any_variant`, `channel`, `status` pending/active/paused, consent evidence `consent_at`,
`consent_ip_hash`, `consent_text_version`, double opt-in `confirmed_at`, `confirm_ip_hash`,
`confirm_method`, and the notification state `baseline_total`, `armed`, `last_notified_*`);
`alert_sends` (outbox: one row per notification, `status` queued/sending/sent/failed/skipped,
`prev_state` to undo a failed claim, `simulated`); `consent_records` (evidence ledger kept 3 years
after withdrawal, keyed by an HMAC of the address, survives the account); `email_suppressions`
(hashes only, indefinitely). `users` gain `last_active_at` and `retention_notice_at`.

Contract (`src/queries/alerts.ts`):
- `ELIGIBLE_ALERT_OFFER`: an offer an alert may speak about (active, in stock, new, matched,
  shop-sold, active shop with trust tier ≤ 2, checked within the shop's freshness SLO, no pending
  quarantine). `bestAlertOffer(db, productId, anyVariant)` uses it.
- `createAlert` (pending, or active with `confirm: { method: 'session' | 'telegram' }`),
  `confirmAlert` (the double opt-in; a newer live alert for the same user, product and channel
  replaces the older one), `updateAlert`, `deleteAlert`, `deleteAllAlerts`, `unsubscribeAllEmail`
  (deletes the email alerts, suppresses the hash, deletes an account with nothing left),
  `deleteUserData`, `exportUserData`, `userAlerts`, `getAlert`, `suppressEmail` (never weakens a
  reason), `suppressionReason`.
- Evaluation: `alertCandidates(db, { productIds?, channels })` → state + best offer;
  `claimAlertNotification` (compare-and-set on the exact state text + outbox insert, one
  transaction: a second claim of the same state returns null), `rearmAlert`, `setAlertBaseline`,
  `queueSimulatedSend`.
- Delivery: `claimQueuedSends` (`FOR UPDATE SKIP LOCKED`), `sendsByIds` (re-checks the offer:
  `stillValid`), `finishSends(ids, 'sent'|'retry'|'failed'|'skipped')` (failed/skipped restore the
  alert's previous state), `recoverStuckSends`, `pauseChannelAlerts`.
- Retention: `deleteExpiredPendingAlerts`, `deleteEmptyAccounts`, `usersDueRetentionNotice`,
  `markRetentionNotice`, `usersDueRetentionDeletion`, `pruneConsentRecords`, `pruneAlertSends`,
  `repointMergedAlerts`, `minimizeClicksAndEvents` (clicks/events: identifiers dropped after 90
  days, rows deleted after 13 months).
- `recordObservation` also returns `productId` (the matched product), so a source run can queue
  `rollup.touch` for products whose offers changed price.
- E2E fixture for alerts: `createAlertsFixture`, `alertsFixturePrice`, `alertsFixtureState`,
  `alertsFixtureEvidence`, `dropAlertsFixture` (`pnpm --filter @pretoscop/db e2e:fixture alerts-…`).
