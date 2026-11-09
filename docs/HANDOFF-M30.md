# Handoff — M30 review fixes, stopped mid-work on 9 Nov 2026

For Daniel and George, and for the next Claude Code session on another device. Read this together
with `docs/HANDOFF.md` (the state of the whole build on 9 Nov) and `CLAUDE.md`.

## 1. What this is

On 9 Nov 2026 the finished build (`daniel` at `36896c0`) had an independent review: five reviewers
read the code area by area and checked the module reports against it. The code is strong where it
matters most: the fetch layer, the schema, money handling, flags and webhooks. The review still found
about 25 confirmed bugs and gaps that the module reports do not mention. Most sit where modules meet,
or in derived data.

Branch **`mod/M30-review-fixes`** (from `daniel`, pushed to GitHub) fixes them, one commit per fix,
each commit prefixed with the module whose code it changes. Work stopped on Daniel's request after the
first block. **Nothing is merged into `daniel` and nothing is deployed to the recorder.**

## 2. Done on the branch (each verified by tests)

| Commit | Finding | What changed |
|---|---|---|
| `a476901` M00 | #9 dev services published on every interface | `infra/docker-compose.dev.yml` binds PostgreSQL, Meilisearch, Mailpit, worker metrics and Plausible to 127.0.0.1 |
| `83217cf` M01 | test infra | `createTestDatabase().drop()` no longer fails the whole Vitest run with an unhandled 57P01 (pg-pool resolves `end()` before its sockets close) |
| `c8c6e90` M04 | #8 eMAG Tier A stop lived only in the laptop's database | `emag:product:tier-a` has `kill_switch: true` in `packages/config/shops/emag.yaml`; `shops:sync` applies a YAML kill switch and never clears one |
| `7fb2b7b` M05 | #10 (first part) a kill switch did not stop a run in progress; fetch logs lacked `source_id` | `run-source.ts` re-reads the source's gates before each request (at most every 15 s) and ends the run as `partial`; every request carries `sourceId` |
| `ee2ce5e` M08 | #1–#6 history integrity | See section 3 |

Tests on macOS with PostgreSQL 18 in Docker: typecheck and lint green; `@pretoscop/db` 174/174
(12 new in `packages/db/test/history.test.ts`), `@pretoscop/worker` 180/180, pure packages 1,568/1,568.
**Not run yet:** the web unit tests, any Playwright e2e, any `make verify`.

## 3. The history-integrity commit (`ee2ce5e`) in detail

Migrations `0023_history_integrity` (generated) and `0024_history_functions` (custom SQL):

- **Mapping changes rebuild the whole history.** Triggers on `offers` mark a product in
  `product_history_dirty` from the offer's first day whenever an offer joins or leaves its series:
  merge, split, unlink, re-match, a review or LLM decision, or a change of condition, bundle,
  accessory, blacklist, seller type or source tier. A trigger on `price_events` does the same for an
  event written for an earlier day (replays, released quarantine). The new job **`rollup.history`**
  (every 2 minutes, a singleton, at most 50 s per run, 100 products per batch) rebuilds them and
  revalidates their pages. Before, these paths re-rolled only two days. Split also deleted both
  products' whole history; it no longer does.
- **The migration marks every product that has offers once**, so history built under the old rules is
  rebuilt in the background after deploying.
- **`offer_day_states()`** is now the only implementation of an offer's daily state, used by
  `rollup_product_daily()`, the per-shop chart lines (`getHistory`) and the discount facts
  (`offerHistoryDays`). On the day a gap ends, the pre-gap price counts only if the check that ended
  the gap found the same content. A changed price no longer inherits it.
- **Gap threshold:** `gapThresholdHoursFor(slo)` = 1.5 × the source's freshness SLO, at least 36 h
  (the default is now 36 h, not 48 h). A nightly source gets 39 h, so any missed night is a gap; Flip
  (SLO 192 h) gets 288 h.
- **`price_events.total_price`:** the total shown at the time. An event is also written when only the
  total changes (a delivery rule was filled in), so history and today's stats share one basis. Old
  events fall back to price + stated shipping.
- **Discount facts** measure from the start of the current price level (the latest event whose price
  differs from the one before), not from `price_changed_at`, which also moves on a stock flip.
- Exact numeric medians in the rollup and in `median_90d` (no float `percentile_cont`).
- **Cross-shop price outliers** get `offers.review_hold`. The rules and the LLM no longer accept them
  again (before, the matcher re-accepted them within 10 minutes); a human decision clears the hold.
- **Undoing a merge** moves its GTINs and sticky aliases back (new `product_merges` columns).
- **CLI:** `pnpm --filter @pretoscop/worker rollup:rebuild --all|<ids…> [--now]`.

## 4. Before merging this branch or deploying it to the recorder

1. Run the module checks the history change touches, one at a time: `make verify M=08`, then `M=13`,
   `M=15`, `M=16` (charts, deals, sitemaps), `M=09` (admin merge and split e2e), `M=07`, `M=22`.
2. **Measure on real data.** On a copy of the recorder's database (never the live one):
   - time `rollup:rebuild --all --now`;
   - `EXPLAIN ANALYZE SELECT rollup_product_daily(NULL, current_date - 2, current_date);` (the
     nightly job: `offer_day_states` receives an array of about 57,000 offer ids);
   - if it is slow, an index on `offer_gaps (offer_id, to_ts)` is the first thing to try (the
     primary key is `(offer_id, from_ts)`).
   - Compare `product_daily` before and after. Changes should appear only on the days gaps end and on
     products with mapping changes in their past.
   - The interrupted first try is in section 7.
3. Deploying to the laptop recorder:
   - **`make recorder` / `make services` will recreate the postgres, meilisearch and mailpit
     containers once**, because their ports changed (#9). The data volumes stay, but the database
     restarts. Do it outside the crawl window (01:00–05:00 Bucharest) and check
     `make recorder-logs` afterwards (HANDOFF.md §7).
   - After migration 0024, `rollup.history` rebuilds about 31,000 products in the background. The
     duration is unmeasured (step 2).
   - New behaviour to expect:
     - more `offer_gaps` (missed nights now count);
     - a burst of events when the founders fill in delivery fees;
     - price outliers stay in the review queue until a human decides.
4. Write the M30 module report in `docs/progress.md`, add `scripts/verify/M30.sh` (it re-runs the
   touched modules' checks), and ask the founders before merging into `daniel` and pushing.

## 5. Still open, in the recommended order

### Before the production setup (Cloudflare/R2, server)

- **#7 nightly `pg_dump` is unencrypted, in the same bucket as images.**
  - Where: `apps/worker/src/ops/backup.ts:46-52`; `infra/runbooks/server-setup.md:45-46`;
    `.env.example` (media base URL "R2 public domain"); docs/09 B10.
  - Fix: write the dump to the backups bucket with its own token, or encrypt it. Never attach a public
    domain to the bucket that holds dumps; give the web a token that can only read images.
- **#10 (rest): tools that bypass the shared safety state.**
  - `packages/fetch` `demo.ts:94-123` forces crawling on, ignores the registry, keeps its own file
    state and suggests deleting it to "forget the pause".
  - `record.ts:95-111` checks only the YAML status: it ignores the database kill switches, the flags
    and the recorder's pauses.
  - `apps/worker/src/cli/replay.ts:26-57` replays `held` runs, writes without the quarantine guard and
    the breaker, and labels every run `channel: 'direct'`.
- **#11 runbook and unpause tool.**
  - `infra/runbooks/source-pause.md:21,48` queries `crawl_domain_state`, dropped in 0012; the table is
    now `fetch_domain_state`.
  - Add an audited CLI and an admin button for `unpauseDomain()` (`packages/fetch/src/fetcher.ts:452`).
    The Carrefour and IT Galaxy pauses show only as "blocked" counts today.
- **#12 e2e tests change the live recorder database.** `apps/web/e2e/admin.spec.ts:43-58` toggles a
  kill switch and `promoted.enabled` with no `finally`; merchant and promoted specs too. Restore the
  flags in `finally`, or use a throwaway database.
- **#13 macOS.** `scripts/verify/M18-stack.sh` uses `mapfile` (:268) and GNU `sed -i` (:411, :422);
  macOS ships bash 3.2 and BSD sed.

### Before switching on the portal, alerts, promoted or B2B flags

- **#14 a B2B member can be deleted by one complaint.** `deleteIfEmpty`
  (`packages/db/src/queries/alerts.ts:365-378`, retention :908-916) ignores `b2b_members`; a bounce,
  complaint or "unsubscribe all" can delete a workspace's last owner.
- **#15 a deleted merchant stays listed.**
  - `/alerte` "delete account" (`apps/web/src/app/alerte/actions.ts:164-174`) also works for
    merchants. The `merchants` row cascades away (`0015_merchants.sql:40`), but its feed source and
    offers stay live (`scheduler.ts:39`).
  - The account export (`alerts.ts:844-889`) leaves out the merchant profile.
- **#16 the daily salt can be recomputed.**
  - `HMAC(HASH_SALT_SECRET, date)` in `apps/web/src/lib/privacy.ts:9-15`: IP hashes are pseudonymous,
    not "unlinkable" as `/confidentialitate` says (:84).
  - The privacy page also says "after 90 days only totals", but click rows are kept for 13 months
    (`db/queries/alerts.ts:1027-1035`).
  - Fix: a random daily salt destroyed after 48 h for analytics, clicks and rate limits; keep the
    keyed form only where it is consent evidence; correct the texts.
- **#17 contact requests have no lifecycle.**
  - There is no admin queue, no retention job, and no export or delete.
  - The "Raportează o eroare de preț" link passes `url=` (`p/[slug]/page.tsx:299`), but
    `contact/page.tsx:32-37` and `contact-form.tsx:333-347` never read it.
  - There is no seller-name suppression action, although the privacy page offers one (:293).
- **#18 Stripe.** B2B subscription events are applied in arrival order
  (`packages/db/src/queries/b2b.ts:1081-1095`), so a late "active" can revive a cancelled workspace.
  Wallet top-ups have no `charge.refunded` or `charge.dispute.*` handling.
- **#19** `apps/web/src/app/admin/(panel)/contactari/page.tsx` has no `requireAdmin()` call (only a
  comment at :44). The other 20 admin pages call it.
- **#20 request hardening.**
  - `/api/events` (`route.ts:28-29`) and `/api/contact` (:131-144) read bodies before capping; use
    `lib/body.ts`.
  - `/api/events` has no same-origin check, and its limiter is keyed on IP + User-Agent.
  - `/api/suggest` has no limit.
  - `/api/alerts/unsubscribe:45` and `/confirm:17` read bodies without a cap.
- **#21 (legal, B5):** category, brand and shop listings sort by popularity, but `/cum-functioneaza`
  discloses only the order of offers.

### Smaller fixes and claims to correct

- **Matching.**
  - The 17,564 `unmatched` offers are never re-queued (`pendingOffers` reads only `pending`), and
    `/admin` counts them as queue (`(panel)/page.tsx:22`).
  - The M07 eval is self-labelled, with 0 human labels.
  - `match:eval:llm` requires the production flag `llm.matching.enabled` (`apps/worker/src/llm/cli.ts:40`),
    so running the eval also turns live LLM matching on. Decouple them.
- **Product page.**
  - "Magazine neincluse încă" is not filtered by category (`apps/web/src/lib/product.ts:127-128`).
  - The shop's crossed price is labelled for screen readers only (`offers-table.tsx:116-119`).
  - Icecat specs are stored but never rendered (`p/[slug]/page.tsx:121,172`), and cards lack the credit.
- **Search:** no books or beauty synonyms; the `/cauta` no-result text says "electronice…" (:193).
- **Alerts and digests.**
  - Retention notices go out only while `alerts.email.enabled` is on (`retention.ts:117`).
  - The B2B digest job does not check `b2b.enabled` (`jobs/b2b.ts:14`).
  - Its unsubscribe header points to a login page (`digest.ts:136`).
- **Money and audit.**
  - 2Performant amounts are parsed through a float (`twoperformant.ts:106-112`).
  - `recheckMerchantFeed` writes no audit row (`merchant-actions.ts:149-154`).
  - `M09.sh:23-28` accepts any old audit row as proof.
- **Production compose:** the web gets the S3 keys and the Grafana and Plausible secrets
  (`docker-compose.prod.yml:47-58`); `M18.sh:64` checks only three keys.
- **Untested or unused:** the 30% feed row-drop hold has no test; `FETCH_DEFAULT_MIN_INTERVAL_MS` is
  never read (`env.ts:104`).
- **CI:** no e2e, no format check; add `permissions: contents: read`.
- **Stale docs.**
  - `progress.md:30` ("CI not run").
  - `launch-checklist.md:4`, `:61`.
  - `rollback.md:14` (the workflow option is `prod`).
  - `server-setup.md:86` ("Daniel's Mac").
  - `secrets-rotate.md` has no rows for Stripe, VAPID, Telegram or Web Bot Auth.
  - `.env.example:138` (ADR-024 → ADR-025); `apps/extension/build.ts:7` (ADR-023 → ADR-026).
  - M26 has no module report.
  - `progress.md:101` says the handoff holds no emails, but `handoff/dev.env` has the admin emails.
- **Claims to restate.**
  - The extension's 69.8 % mostly resolves our own eMAG offers by their URL; only 3.1 % have offers
    at two or more shops (docs/13 X2).
  - Only M19 and M20 had independent reviews; M24, M25, M27 and M28 still need one.

## 6. Founder questions waiting

- Cleaning up the 28 Oct leftovers on Daniel's Mac:
  - delete the seven old agent worktrees (`.claude/worktrees/agent-*`); six of them still stage
    un-redacted eMAG fixture copies, which must never be committed;
  - delete the out-of-date local `mod/*` and `worktree-agent-*` branches;
  - expire `refs/original` and the reflog, which keep the pre-redaction eMAG keys in local history.
- Whether `handoff/` (old `.env` with admin emails, a dump and crawled snapshots) should stay in a
  public repository.
- Whether the four modules without an independent review (M24, M25, M27, M28) get one before their
  flags go on.

## 7. State of Daniel's Mac when work stopped

- `.env` has `CRAWL_ENABLED=false` (it was `true`). Keep it false unless the Mac becomes the recorder
  again: the Windows laptop records, and a second crawler would double the load on the shops.
- Docker Desktop is stopped and the dev containers are removed; the volumes are kept.
- The dev database (volume `pretoscop_pgdata`) is the 28 Oct copy:
  - migrations up to 0024 applied;
  - 2,150 products waiting in `product_history_dirty`; the real-data rebuild was interrupted before it
    finished;
  - a scratch table `review_pd_before` (2,291 rows: `product_daily` before the rebuild), kept for the
    before/after diff of section 4; drop it afterwards.
- In non-interactive shells pnpm is not on the PATH: `corepack enable --install-directory <dir>` and
  add that directory to the PATH.
