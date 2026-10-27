# @pretoscop/worker

pg-boss workers: ingest, crawl, match, rollup, alerts, index, maintenance.

- `pnpm --filter @pretoscop/worker dev` runs in watch mode; `start` runs once.
- Jobs are declared with `defineJob()` in `src/jobs/*` and listed in `src/jobs/index.ts`;
  `registerJobs()` creates the queue, attaches the handler and applies the cron schedule
  (Europe/Bucharest). Handlers must be idempotent.
- `system.heartbeat` logs `heartbeat` every minute (and once at start).
- `search.sync` (every minute, also at start) keeps the Meilisearch index in step with the database: products whose
  row, offers, stats, merges, images or GTINs changed since the watermark are re-indexed; without a watermark or after
  a document/settings change it rebuilds. `search.rebuild` (05:00, after the 04:30 rollup) recomputes popularity and
  rebuilds blue/green. CLI: `search:rebuild` (read-only on the database; `--popularity` to recompute), `search:sync`,
  `search status`, `search query <words>`, `search drop` (only with a `MEILI_INDEX_PREFIX`). See packages/search.
