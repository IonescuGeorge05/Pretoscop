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

## Bot legitimacy (M21)

- **Web Bot Auth**: `services.ts` gives the fetcher a signer when `WEB_BOT_AUTH=true` (key in `WEB_BOT_AUTH_PRIVATE_KEY`);
  the worker logs `crawler requests are signed (Web Bot Auth)` at start.
- **`extractors.canary`** (Monday 04:30 Bucharest; flag `extractors.canary.enabled`, off by default): up to five live URLs
  per active, directly crawled shop (listing pages, then product pages that answered 200) are fetched politely and parsed;
  per-URL results go to `extractor_canaries`; a page without offers, missing or unusable core fields (id, URL, title,
  price) or an optional field that disappears compared with the previous week raise one ops alert per shop and parser.
  Same gates as source runs (kill switches, `crawl.enabled`, eMAG flag). Idempotent per ISO week.
- **`pnpm --filter @pretoscop/worker bot:check [--site URL] [--skip-dns]`**: forward-confirmed reverse DNS of every
  `BOT_EGRESS_IPS` address, `/bot/ips.json`, the signed key directory; prints the headers a signed request would carry.
- **`pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "…" [--url <page>] [--write]`**: at most three polite
  requests (robots.txt, home page, one public registry page), stops at the first refusal, prints (or writes) the registry
  `probes:` entry. No database needed; eMAG needs `--allow-emag` (ADR-013).
