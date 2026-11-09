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
merchants ─< placements (CPC campaigns, M25) >─ categories · placement_floors (category × band)
merchant_wallets · wallet_ledger · wallet_topups · promoted_clicks   accounting rows, no FK to merchants (M25)
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
  30-day request count and success rate from `request_log` (assisted channel), this month's vendor cost
  (`access_costs`), whether a replacement
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
- M27 channels (`src/queries/channels.ts`, migration `0017_channels`): `savePushSubscription`
  (consent in the row and the ledger; ≤ 10 per account; an endpoint moves between accounts),
  `userPushSubscriptions` (worker), `userPushDevices` (web: no endpoint or keys, its SHA-256),
  `deletePushSubscription`, `markPushResult`; `createTelegramLinkToken` (hash only, 15 minutes,
  one per account), `consumeTelegramLinkToken` (one-time under a row lock; a chat moves between
  accounts), `telegramLinkTokenPending`, `telegramLinkByChat/ByUser`, `unlinkTelegram`,
  `markTelegramBlocked`, `reactivateTelegramLink`, `pruneTelegramLinkTokens`,
  `searchProductsForBot`; receipts `hasDeliveryReceipt`/`recordDeliveryReceipt`/
  `pruneDeliveryReceipts`; `claimChannelPost`/
  `completeChannelPost`/`releaseChannelPost` for the daily deals post (its drops: M15 `getDeals`). Losing a channel pauses its
  alerts (`channel_unavailable`) and withdraws its channel consent; setting it up again resumes them.
  `updateAlert` on a channel change withdraws the old per-alert consent and records the new one;
  `exportUserData` includes browsers (no keys) and the Telegram link; deleting a user removes both
  (cascade). Inactive accounts that only keep a channel get the 24-month notice too.
- `recordObservation` also returns `productId` (the matched product), so a source run can queue
  `rollup.touch` for products whose offers changed price.
- E2E fixture for alerts: `createAlertsFixture`, `alertsFixturePrice`, `alertsFixtureState`,
  `alertsFixtureEvidence`, `dropAlertsFixture` (`pnpm --filter @pretoscop/db e2e:fixture alerts-…`).

## Promoted placements (M25, `src/queries/promoted.ts`, migration `0021_promoted`)

- Slot: `promotedCandidates(db, ctx)` (one eligible offer per active campaign of an approved
  merchant: `ELIGIBLE_PROMOTED_OFFER`), `promotedAuction` (core `runAuction`: second price with
  per-offer floors and caps, `listFloorRows` + `floorFor`), `promotedSlot` (what the page shows,
  with the cheapest live total so the slot can say how much more the promoted offer costs),
  `productCategoryChain`, `merchantPlacementCategories` (cache tags).
- Billing: `billPromotedClick(db, input)` records every click from a slot and bills it when core
  `decideClickBilling` allows, in one transaction under the merchant's wallet row lock (duplicate
  check, rate holds, auction re-run, ledger row, audit row); the unique index on
  `(offer_id, session_hash, day)` is the last guard. Returns `exhausted` when a campaign can no
  longer pay its bid (the caller refreshes the slots).
- Money: `acceptPromotedTerms` (opens the wallet), `createTopUp` (snapshots the buyer's company
  and CUI), `setTopUpCheckout`, `bindTopUpCheckout`, `creditTopUp` (once; amount and currency must
  match; ledger `ref = <provider>:<checkout id>`), `closeTopUp`, `failTopUp`,
  `refundPromotedClick`, `adjustWallet` (form token = idempotency), `topUpsLastDay`,
  `promotedActionsLastDay`.
- Campaigns and floors: `createPlacement`, `updatePlacement`, `setPlacementStatus` (own merchant
  only), `setPlacementHold` (admin), `listFloors`, `upsertFloor`, `deleteFloor`.
- Numbers: `merchantPromotedSummary`, `adminPromotedOverview`, `monthlyPromotedStatement`
  (opening + movements = closing, Europe/Bucharest month), `promotedMaintenance` (hashes cleared
  after 30 days, abandoned checkouts expired after 24 h; job `promoted.daily`).
- Every money movement writes a `wallet_ledger` row and an `audit_log` row in the same transaction;
  the sum of a merchant's ledger equals its balance (integration test).
- E2E fixture: `createPromotedFixture`, `promotedFixtureState`, `setPromotedFlag`,
  `dropPromotedFixture` (`pnpm --filter @pretoscop/db e2e:fixture promoted-…`).

## B2B price intelligence (M28, `src/queries/b2b.ts`, migration `0022_b2b`)

- Tenancy: every function that reads or writes customer data takes the workspace id and filters on
  it; a SKU, key, invite or digest of another workspace is "not found" (`null`/`false`), never an
  error that tells it exists. `b2bMembership(db, ws, user)` is the gate the web runs first.
- Icecat exclusion: catalogue data only through the view `b2b_products` (no specs, images,
  attributes or image pointers); the module never names `products`, `product_specs`,
  `product_images` or a consumer table (integration test with an Icecat sentinel + a static check
  in `scripts/verify/M28.sh`).
- Workspaces and members: `createB2bWorkspace`, `updateB2bWorkspace`, `getB2bWorkspace`,
  `inviteB2bMember`, `acceptB2bInvites` (the signed-in address), `listB2bMembers`,
  `listB2bInvites`, `cancelB2bInvite`, `removeB2bMember` (the last owner stays), `setB2bDigest`,
  `acceptB2bTerms`, `b2bWorkspacesForUser`, `b2bWorkspaceSummaries` (admin).
- SKUs: `resolveB2bLines` (GTIN via `product_gtins`, else brand + MPN, else MPN alone; one
  candidate or `ambiguous`/`unmatched`), `importB2bSkus` (batches of 1,000 under a per-workspace
  advisory lock, never past the SKU limit, duplicates by `identity`), `addB2bCatalogueSku`,
  `updateB2bSku`, `removeB2bSku`, `reresolveB2bSkus` (nightly: merges followed, new matches),
  `searchB2bCatalogue`, `b2bSkuCounts`, `b2bSkuCount`.
- Positions: `b2bPositions(db, ws, { skuIds, status, limit, offset })` is the one source of the
  page, the CSV and the API: own offer (merchant) or reference price (brand), comparable
  competitor offers (product-page eligibility plus fresh within the shop's SLO, in stock, new, no
  bundle, no pending quarantine), core `computePosition` (min, median, rank, gap), every offer with
  its freshness; `b2bSkuPosition`, `b2bSkuProductId` (history chart).
- Digest: `b2bChanges(db, ws, from, to)` (observed price/stock changes with the state before, from
  `price_events` only), `b2bDigestRecipients`, `claimB2bDigest` / `finishB2bDigest` (one per
  workspace, day and member; failed ones re-claimable, stuck ones after 30 minutes).
- API: `createB2bApiKey` (returns the key once; stores SHA-256 of the secret), `verifyB2bApiKey`
  (lookup by public id, constant-time compare, a dummy compare for unknown ids), `revokeB2bApiKey`,
  `listB2bApiKeys`, `touchB2bApiKey` (at most once a minute), `consumeB2bApiQuota` (one atomic
  upsert: concurrent requests never pass the limit; refusals counted), `listB2bApiUsage`.
- Billing: `applyB2bBillingEvent(db, provider, eventId, type, input)` applies one verified
  provider event once (event id recorded in the same transaction; `unknown_workspace` rolls back so
  the retry can apply it); a cancelled subscription suspends the workspace with
  `B2B_BILLING_LAPSED_REASON`, a new one lifts only that suspension; `invoice_paid` writes a
  `b2b_invoices` row with the buyer data copied at payment; `listB2bInvoices`, `setB2bInvoiceFiscal`.
- Retention: `pruneB2bLogs` (usage 400 days, digest receipts 90 days, invitations once accepted
  or after 90 days); `exportUserData` lists B2B memberships and open invitations.
