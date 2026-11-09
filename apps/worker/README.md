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
- `notify(userId, message, channel)` (`src/alerts/notifier.ts`) is the channel interface: email
  through `@pretoscop/mailer` (M19), Web Push and Telegram (M27, below).
- CLIs: `pnpm --filter @pretoscop/worker alerts:run [--products 1,2]` (evaluate + deliver now) and
  `pnpm alerts:simulate <productId> [percent] [--email <address>]... [--allow-prod]` (a
  "[SIMULARE]" message for the active alerts on the product of the given addresses only, by default
  ADMIN_EMAILS, never other subscribers; refused with APP_ENV=prod unless `--allow-prod`; no price
  event, no change to the alert's state).

## Telegram bot and Web Push (M27)

- Channels: `createAlertServices` adds a push sender when VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set
  and a Telegram client when TELEGRAM_BOT_TOKEN is set; each still needs its flag
  (`alerts.push.enabled`, `alerts.telegram.enabled`) to be evaluated and delivered. Same rules as
  email (known price floor, dedupe, one message per user and channel), never 22:00–08:00.
- Push (`src/alerts/channels.ts`): every browser of the user; 404/410 or an endpoint outside the
  known push services → the subscription is deleted (none left → push alerts pause); a receipt per
  browser and the Topic header make a retry idempotent. Never logs endpoints or message text.
- Telegram: one message to the linked chat; a blocked bot marks the link blocked and pauses its
  alerts (`/start` in the same chat reactivates it); a receipt makes a retry idempotent; the
  client spaces messages (25/s overall, 1/s per chat) and holds everything after a 429.
- The bot (`src/telegram/bot.ts`, ADR-025): long polling in the worker process under an advisory
  lock, only while `alerts.telegram.enabled` is on. `/start <token>` links the chat to the
  account that asked on /alerte (one-time token, consent box ticked there); `/urmareste <link or
  words> [price]` (search offers buttons), `/alertele` (with stop buttons), `/oprire` (unlinks,
  pauses Telegram alerts, withdraws the consent), `/ajutor`. Private chats only; updates older
  than 15 minutes dropped; 20 updates a minute per chat; at most 100 alerts per account; buttons
  only for the chat owner; nothing the person writes is stored or logged.
- `telegram.deals` (09:15, flag `telegram.deals.enabled`, TELEGRAM_DEALS_CHAT_ID): at most one post
  a day of the verified drops whose new price level started that day (M15 `getDeals`, the rules of
  /reduceri: ≥ 3% under the lowest price of the 30 days before, ≥ 14 of them observed, never a
  provisional product), at most 10, biggest first; none on a day without drops. Links go to
  Pretoscop's product pages and "Toate reducerile" to /reduceri.
- Retention also prunes expired link tokens and receipts older than 7 days.
- CLIs: `pnpm --filter @pretoscop/worker telegram:poll [--once]` (the bot without the worker;
  refuses while the worker polls), `alerts:run --now <ISO>` (dev/test only: deliver as if at that
  time), `pnpm --filter @pretoscop/notify vapid:keys` (a new VAPID pair for the server `.env`).

## Merchant feeds (M20)

- `merchant.feed_check` fetches a merchant's feed (as `PretoscopBot-Feed`, purpose `feed`) or reads the uploaded file
  (gunzipped under `FETCH_MAX_BODY_BYTES`), inspects it (`inspectFeed`), normalizes a preview of 20 offers (offers off the
  shop domain count as rejected: `off_domain`) and stores the report in `merchants.validation`, stamped with the feed and
  domain it checked, unless the merchant changed them or asked for a newer check meanwhile. A listed merchant who chose
  "detect automatically" gets the detected parser on the live source.
- `merchant.domain_check` looks for the DNS TXT record on the apex, then for the token file on the domain and on `www.`
  (not for shops we already crawl), and verifies only the domain it checked.
- Both queues are pg-boss `stately` (singleton key = merchant id). They were renamed from `merchant.validate` /
  `merchant.verify_domain` because a queue's policy cannot change after creation; the old queues can be deleted.
- Merchant requests (these checks and the pulls of merchant feeds) use `services.merchantFetcher`
  (`createMerchantFetcher`): same guard, identity, robots.txt and per-host slots as the crawler, but pauses, failure
  streaks, daily counts and robots.txt results under `merchant:<host>` keys, so they never pause or spend the crawler's
  access. They never go to the host of a registered shop other than the merchant's own (`foreignShopForHost`).
- Approved merchants get a source `<slug>:feed:merchant` (`config.origin = 'merchant'`, `requireDomain`, `priceFormat`,
  `uploadedAt` for uploads). `runSource` applies the chosen price format, drops offers off the merchant's domain and the
  merchant's own affiliate links; `shops:sync` never disables these sources (they are owned by the portal, not by the
  YAML registry).
- The fetcher's dispatcher refuses non-public addresses at connect time (`createGuardedDispatcher`), so a feed URL
  cannot reach the internal network; `FETCH_ALLOW_PRIVATE_HOSTS=true` (everything) or `FETCH_PRIVATE_ALLOWLIST` (exact
  `ip:port` fixtures, what `make verify M=20` uses) lift that in development only.

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

## Assisted-access channel (M05B)

- `src/fetch/assisted.ts` builds the channel from `ASSISTED_VENDOR` (`none` by default: no channel, so
  the fetch layer refuses every assisted host) for the crawler fetcher only (never the merchant fetcher),
  with each shop's hosts and tier from the registry and the guarded dispatcher; `src/fetch/assisted-ledger.ts`
  is the `access_costs` ledger: every call booked before it is sent under an advisory lock, only if the
  month stays within the cap, and given back when the vendor does not bill it.
- The policy resolver and `checkGates` keep an assisted shop closed unless it is designated
  (`@pretoscop/config` `ASSISTED_DESIGNATED_SHOPS`), the flag `assisted.enabled` is on, a vendor is
  configured and the month is under `ASSISTED_MONTHLY_CAP_EUR`.
- `assisted.health` (09:15 daily) auto-pauses a shop below 80% success on each of the last 7 days
  (kill switches + audit row + alert); the hourly SLO check alerts at 80%/100% of the cap and when
  yesterday's success was under 90%; `/metrics` exports `pretoscop_assisted_*`.
- `pnpm assisted:record <shop> <name> <url>` records an extractor fixture through the channel.
- Procedure for the founders: `infra/runbooks/assisted-access.md`.

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
- **`pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "…" [--url <page>] [--write] [--from-published-ip]`**:
  re-probe of one shop (docs/12 §2 layer 1).
  - Off by default: needs `CRAWL_ENABLED=true`, the flags `crawl.enabled` and `shops.probe.enabled` (switch it on for a
    probe session, then off) and, for eMAG, `source.emag.enabled`.
  - Refused (exit 2, nothing sent): shops that asked us to stop or said no (status `paused` or `removed`, every source
    kill-switched, latest outreach `declined`), feed-only shops, and, once `BOT_EGRESS_IPS` is published, any run
    without `--from-published-ip` (the bot page says other addresses are not ours).
  - At most three requests (robots.txt, home page, one registry page from a source that is not kill-switched, or `--url`
    on the shop's domain), at least 5 s apart (spaced before each shared slot reservation; the cap is enforced at the
    transport by `CappedDispatcher`), no retries, through the polite fetcher with the database's state (pauses shared with
    the recorder) and request log; stops at the first refusal.
  - Prints (or with `--write` adds) the registry `probes:` entry and leaves an `audit_log` row (`shops.probe`). Needs the
    database: from a second vantage point run it with `DATABASE_URL` pointing at production (e.g. over WireGuard).

## LLM matching (M22)

Job `llm.match` (every 15 minutes, singleton) verifies the matching gray zone with Claude: it
collects ended Message Batches, applies the gray-zone policy (`packages/core/MATCHING.md`) and sends
the missing questions as one batch within `LLM_MONTHLY_CAP_EUR`. It does nothing without
`ANTHROPIC_API_KEY` (A9) and the flag `llm.matching.enabled`; switching the flag off cancels batches in
flight. The hourly SLO check alerts at 80 % and 100 % of the cap and on batches in flight > 26 h.

```bash
pnpm --filter @pretoscop/worker llm:spend                    # month to date: cap, billed, in flight, by model, cache share
pnpm --filter @pretoscop/worker llm:match --dry-run          # what would be asked, worst case and estimated cost (no call)
pnpm --filter @pretoscop/worker llm:match --mock             # whole flow against a local stand-in; prints decisions, writes nothing
pnpm --filter @pretoscop/worker llm:match [--sync]           # a real pass (key + flag): one batch, or calls now
pnpm --filter @pretoscop/worker match:eval:llm [--mask]      # eval against the labelled pairs (see MATCHING.md)
pnpm --filter @pretoscop/worker llm:attributes --mock        # attribute extraction for titles missing a hard attribute
pnpm --filter @pretoscop/worker llm:categories --mock        # category suggestions for unmapped shop categories
```

Real (non-mock) CLI calls need the key and the flag, like the job. Every call is in `llm_usage`.
