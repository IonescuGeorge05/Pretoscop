# @pretoscop/worker

pg-boss workers: ingest, crawl, match, rollup, alerts, index, maintenance.

- `pnpm --filter @pretoscop/worker dev` runs in watch mode; `start` runs once.
- Jobs are declared with `defineJob()` in `src/jobs/*` and listed in `src/jobs/index.ts`;
  `registerJobs()` creates the queue, attaches the handler and applies the cron schedule
  (Europe/Bucharest). Handlers must be idempotent.
- `system.heartbeat` logs `heartbeat` every minute (and once at start).
- `icecat.sync` (M11) runs daily at 05:30 when the flag `icecat.enabled` is on and
  `ICECAT_USERNAME` is set (Open Icecat enrichment, `packages/icecat/README.md`). CLIs:
  `icecat:lookup`, `icecat:coverage`, `icecat:sync`, `icecat:demo` (offline, throwaway database).
- Source runs (M05, M10): `listing` sources follow `nextPageUrl` up to `config.max_pages`; a page
  whose products are all unavailable (`meta.items` > 0, no offer) ends the listing as complete.

## Price alerts (M19)

- `alerts.evaluate` `{ productIds? }`: queued by `rollup.touch` (which runs after matching and,
  since M19, after every source run whose matched offers changed price or stock) and nightly at
  07:30. Decides every active alert on an enabled channel (`alerts.email.enabled`, …) with
  `@pretoscop/core` `decideAlert` and claims notifications (compare-and-set: pg-boss may deliver a
  job twice, a second evaluation of the same state queues nothing).
- `alerts.deliver` (stately queue, every 5 minutes and after each evaluation): one message per
  user and channel (several alerts → one email), the offer re-checked first (a changed price is
  skipped and re-evaluated), suppressed addresses never emailed (their email alerts paused),
  transient failures retried 3 times, a failed or skipped send gives the alert its state back.
  Push and Telegram (M27) wait outside 22:00–08:00 Romania time.
- `alerts.retention` (03:20): pending requests after 7 days, unverified empty accounts after 7
  days, 24-month inactivity notice then deletion after 30 days, consent evidence 3 years after
  withdrawal, sends after 13 months, clicks/events minimized after 90 days.
- `notify(userId, message, channel)` (`src/alerts/notifier.ts`) is the channel interface; M19
  implements email through `@pretoscop/mailer`.
- CLIs: `pnpm --filter @pretoscop/worker alerts:run [--products 1,2]` (evaluate + deliver now) and
  `pnpm alerts:simulate <productId> <percent>` (a "[SIMULARE]" message to every active alert of the
  product; no price event, no change to the alert's state).

## Merchant feeds (M20)

- `merchant.validate` fetches a merchant's feed (as `PretoscopBot-Feed`, purpose `feed`) or reads the uploaded file,
  inspects it (`inspectFeed`), normalizes a preview of 20 offers and stores the report in `merchants.validation`.
- `merchant.verify_domain` looks for the DNS TXT record on the apex, then for the token file on the domain and on `www.`.
- Approved merchants get a source `<slug>:feed:merchant` (`config.origin = 'merchant'`, `requireDomain`, `priceFormat`,
  `uploadedAt` for uploads). `runSource` applies the chosen price format and drops offers off the merchant's domain;
  `shops:sync` never disables these sources (they are owned by the portal, not by the YAML registry).
- The fetcher's dispatcher refuses non-public addresses at connect time (`createGuardedDispatcher`), so a feed URL
  cannot reach the internal network; `FETCH_ALLOW_PRIVATE_HOSTS=true` lifts that in development only.
## Re-normalization after a rule change

`pnpm --filter @pretoscop/worker renormalize [--shop emag] [--dry-run] [--limit N] [--samples 20]`
rebuilds each stored offer's RawOffer from its raw columns, normalizes it with the current
`@pretoscop/core` rules and rewrites the normalized columns (title forms, brand, MPN value, raw field
and source, GTIN-14, attributes — replaced, not merged —, bundle and accessory flags, identity
hash). MPN fields that were really eMAG slug tails become URL hints (guesses). Products the
matcher created from an offer follow it (never human-made or human-edited products): a
single-offer product takes the offer's new MPN, brand and attributes (family cleared when the brand
changes); a multi-offer product whose field MPN was the slug tail takes the new MPN. Offers whose
identity changed go back to `pending` for the matcher unless a human decided them (alias,
`manual`, `rejected`, blacklisted) or their link still holds (the product followed them, or they
still clear the accept bar against it), so re-matching never duplicates a product. Prices and
price events are never touched; an offer updated by the recorder meanwhile is skipped (`raced`).
It prints a before/after summary; run `--dry-run` first, then `match:run` (or wait for
`match.pending`) to re-match the re-queued offers.

## Operations (M18)

- HTTP on `METRICS_PORT` (9464, never published): `GET /health` → 200 when the database answers
  (503 otherwise; Docker health check), `GET /metrics` → Prometheus text (`src/ops/metrics.ts`:
  source freshness vs SLO, failures, runs, offer freshness, events/24 h, queues, review queue, last
  success of scheduled jobs, WAL archiving, database size, disk, process).
- `ops.heartbeat` (every 5 min) pings `OPS_HEARTBEAT_URL`; `backup.nightly` pings `DUMP_HEARTBEAT_URL`
  (`/fail` on failure). A missing ping is what alerts (Better Stack).
- `ops.slo_check` (hourly) evaluates the SLOs of `docs/03-architecture.md` §9 (`src/ops/slo.ts`) and
  sends deduplicated `ops.alert` jobs (pg-boss throttling per key: once a day for most problems).
- `ops.alert` delivers through Telegram (`OPS_ALERT_TELEGRAM_*`) and email (`OPS_ALERT_EMAIL`), and
  always logs; `pnpm ops:alert-test` sends a test alert.
- Page caches: `WEB_INTERNAL_URL` may list several web replicas; every replica gets each revalidation.
- The image (`infra/docker/worker.Dockerfile`) runs `node --import tsx src/index.ts` as the `node`
  user under tini (`init: true`); the same image runs the one-shot `migrate` service.
