# @pretoscop/worker

pg-boss workers: ingest, crawl, match, rollup, alerts, index, maintenance.

- `pnpm --filter @pretoscop/worker dev` runs in watch mode; `start` runs once.
- Jobs are declared with `defineJob()` in `src/jobs/*` and listed in `src/jobs/index.ts`;
  `registerJobs()` creates the queue, attaches the handler and applies the cron schedule
  (Europe/Bucharest). Handlers must be idempotent.
- `system.heartbeat` logs `heartbeat` every minute (and once at start).

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

## Assisted-access channel (M05B)

- `src/fetch/assisted.ts` builds the channel from `ASSISTED_VENDOR` (`none` by default: no channel, so
  the fetch layer refuses every assisted host); `src/fetch/assisted-ledger.ts` is the `access_costs`
  ledger (one upsert per vendor call, cost recomputed from the counters).
- The policy resolver and `checkGates` keep an assisted shop closed unless it is designated
  (`@pretoscop/config` `ASSISTED_DESIGNATED_SHOPS`), the flag `assisted.enabled` is on, a vendor is
  configured and the month is under `ASSISTED_MONTHLY_CAP_EUR`.
- `assisted.health` (09:15 daily) auto-pauses a shop below 80% success on each of the last 7 days
  (kill switches + audit row + alert); the hourly SLO check alerts at 80%/100% of the cap and when
  yesterday's success was under 90%; `/metrics` exports `pretoscop_assisted_*`.
- `pnpm assisted:record <shop> <name> <url>` records an extractor fixture through the channel.
- Procedure for the founders: `infra/runbooks/assisted-access.md`.
