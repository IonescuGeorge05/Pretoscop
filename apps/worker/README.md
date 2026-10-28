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
