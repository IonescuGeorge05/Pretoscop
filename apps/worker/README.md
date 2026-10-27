# @pretoscop/worker

pg-boss workers: ingest, crawl, match, rollup, alerts, index, maintenance.

- `pnpm --filter @pretoscop/worker dev` runs in watch mode; `start` runs once.
- Jobs are declared with `defineJob()` in `src/jobs/*` and listed in `src/jobs/index.ts`;
  `registerJobs()` creates the queue, attaches the handler and applies the cron schedule
  (Europe/Bucharest). Handlers must be idempotent.
- `system.heartbeat` logs `heartbeat` every minute (and once at start).

## Merchant feeds (M20)

- `merchant.validate` fetches a merchant's feed (as `PretoscopBot-Feed`, purpose `feed`) or reads the uploaded file,
  inspects it (`inspectFeed`), normalizes a preview of 20 offers and stores the report in `merchants.validation`.
- `merchant.verify_domain` looks for the DNS TXT record on the apex, then for the token file on the domain and on `www.`.
- Approved merchants get a source `<slug>:feed:merchant` (`config.origin = 'merchant'`, `requireDomain`, `priceFormat`,
  `uploadedAt` for uploads). `runSource` applies the chosen price format and drops offers off the merchant's domain;
  `shops:sync` never disables these sources (they are owned by the portal, not by the YAML registry).
- The fetcher's dispatcher refuses non-public addresses at connect time (`createGuardedDispatcher`), so a feed URL
  cannot reach the internal network; `FETCH_ALLOW_PRIVATE_HOSTS=true` lifts that in development only.
