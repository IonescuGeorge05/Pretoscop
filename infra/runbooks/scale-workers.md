# Runbook: scale workers and web

## Today's shape (and why)

One `worker` container runs every job (pg-boss queues: `source.run`, `scheduler.tick`, matching,
rollups, backups, ops). The fetch layer keeps **concurrency 1 per shop inside one process**; across
processes only the minimum interval is shared (`packages/fetch/README.md` → Known limits). So crawl
jobs (`source.run`) must run in exactly one process. pg-boss already runs up to six shops in
parallel there (`localConcurrency: 6`, one per shop group).

Two web replicas (`web-1`, `web-2`) give zero-downtime deploys and survive one crash; each keeps its
own page cache, which the worker revalidates on both (`WEB_INTERNAL_URL`).

## Signs that more is needed

- `QueueBacklog` alert or `/admin` → Cozi: `match.pending` / `rollup.*` waiting for hours.
- `WorkerEventLoopLag`: CPU-heavy matching delays the crawler's timers (politeness only gets slower,
  never faster, but freshness suffers).
- Web: origin p95 above 400 ms (`WebLatencyHigh`) with Cloudflare already caching `/p/*`.

## Options, cheapest first

1. **Bigger limits**: `WORKER_MEMORY_LIMIT`, `WEB_MEMORY_LIMIT` in `.env`, deploy.
2. **More pg-boss concurrency for non-crawl queues**: `work.localConcurrency` of the job definition
   in `apps/worker/src/jobs/*.ts` (code change, normal release).
3. **A second worker process for batch work only** (matching, rollups): add a service to a
   server-local override (`COMPOSE_EXTRA_FILES`) that runs the worker image with the crawl jobs
   excluded. This needs a small code change first (a `WORKER_JOBS` include/exclude filter in
   `apps/worker/src/index.ts`), so that `source.run` and `scheduler.tick` stay in one process.
   Ask the implementer; it is a planned follow-up, not available yet.
4. **A third web replica**: copy the `web-2` block as `web-3` (alias `<env>-web-3`), add it to
   `WEB_INTERNAL_URL` and to `PROD_UPSTREAMS` in the edge `.env`, recreate Caddy.
5. **Crawler egress from Romania** (a shop requires a Romanian IP): the `crawler-ro` VPS of
   `docs/03-architecture.md` §11 (M21), with the crawl jobs moving there, not duplicated.

Never run two crawl workers against the same shops "to go faster": it breaks the per-shop
concurrency guarantee and the promise made on the bot page.
