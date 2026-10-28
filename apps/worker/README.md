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
  Every message carries an idempotency key made of its `alert_sends` ids (Resend drops a retry of
  a message it already accepted); a delivery interrupted in 'sending' is re-queued as it was (same
  key) after 15 minutes. Push and Telegram (M27) wait outside 22:00–08:00 Romania time.
- `alerts.retention` (03:20): pending requests after 7 days, unverified empty accounts after 7
  days, 24-month inactivity notice then deletion after 30 days (the notice is sent only while
  `alerts.email.enabled` is on, and never to a suppressed address: its notice is recorded without
  an email), consent evidence 3 years after withdrawal, sends after 13 months, clicks/events
  minimized after 90 days, expired `verifications` rows (magic-link tokens, send counters). Each
  step runs on its own: a failing step is logged and reported as an ops alert, the others still run.
- `notify(userId, message, channel)` (`src/alerts/notifier.ts`) is the channel interface; M19
  implements email through `@pretoscop/mailer`.
- CLIs: `pnpm --filter @pretoscop/worker alerts:run [--products 1,2]` (evaluate + deliver now) and
  `pnpm alerts:simulate <productId> [percent] [--email <address>]... [--allow-prod]` (a
  "[SIMULARE]" message for the active alerts on the product of the given addresses only, by default
  ADMIN_EMAILS, never other subscribers; refused with APP_ENV=prod unless `--allow-prod`; no price
  event, no change to the alert's state).

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

## Bot legitimacy (M21)

- **Web Bot Auth**: `services.ts` gives the fetcher a signer when `WEB_BOT_AUTH=true` (key in `WEB_BOT_AUTH_PRIVATE_KEY`,
  `BOT_INFO_URL` https); the worker logs `crawler requests are signed (Web Bot Auth)` at start. Off by default.
- **`extractors.canary`** (Monday 04:30 Bucharest; flag `extractors.canary.enabled`, off by default): up to five live URLs
  per active, directly crawled shop (listing pages, then product pages that answered 200, only from sources that are
  enabled and not kill-switched) are fetched through the polite fetcher and parsed; per-URL results go to
  `extractor_canaries`; a page without offers, missing or unusable core fields (id, URL, title, price) or an optional field
  that disappears compared with the previous week raise one ops alert per shop and parser, and a block the canary runs
  into raises its own alert (the host is paused for every job). Same gates as source runs (CRAWL_ENABLED, kill switches,
  `crawl.enabled`, eMAG flag). Nothing is ingested. Idempotent per ISO week.
- **`pnpm --filter @pretoscop/worker bot:check [--site URL] [--skip-dns]`**: forward-confirmed reverse DNS of every
  `BOT_EGRESS_IPS` address, `/bot/ips.json`, the key directory (served without a redirect, Content-Digest, one
  possession proof per key, our key in it); prints the headers a signed request would carry. Contacts DNS and our own
  site only.
- **`pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "…" [--url <page>] [--write]`**: re-probe of one shop
  (docs/12 §2 layer 1). Off by default: needs `CRAWL_ENABLED=true`, the flags `crawl.enabled` and `shops.probe.enabled`
  (switch it on for a probe session, then off) and, for eMAG, `source.emag.enabled`; shops with status `removed` or
  access mode `feed_only` are refused. At most three requests (robots.txt, home page, one registry page from a source that
  is not kill-switched, or `--url` on the shop's domain), at least 5 s apart (`CappedDispatcher`), no retries, through the
  polite fetcher with the database's state (pauses shared with the recorder) and request log; stops at the first refusal.
  Prints (or with `--write` adds) the registry `probes:` entry and leaves an `audit_log` row (`shops.probe`). Exit 2 when
  refused (nothing sent). Needs the database: from a second vantage point run it with `DATABASE_URL` pointing at
  production (e.g. over WireGuard).
