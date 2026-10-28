# @pretoscop/fetch

The only HTTP client the crawler ever uses. It identifies itself as **PretoscopBot**, obeys
robots.txt (RFC 9309), keeps a minimum interval between requests to each shop, recognizes when a
shop's edge refuses us, pauses that shop, and writes every request to a log. Built in module M02;
the assisted-access channel (M05B) plugs into the same call.

## In one minute (for founders)

- Every request says who we are: `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`
  (feeds: `PretoscopBot-Feed/1.0`). No code path can send another User-Agent, cookies, a Referer or
  browser-imitation headers.
- Before any page, we read the shop's robots.txt and obey it. If robots.txt cannot be read (server
  error, timeout, blocked), we fetch nothing from that shop.
- At most one request at a time per shop, and at least 5 seconds between the starts of two requests
  (longer when the shop asks for it with `Crawl-delay`, plus 0–10 % random extra).
- If a shop refuses us (403, 429, a challenge page, a CAPTCHA redirect, a dropped connection), we stop
  asking that shop: 24 hours for refusals, at least 1 hour (or what the shop asks) for "too many
  requests". Requests already queued for that shop are cancelled too. We never try to get around a
  refusal.
- `CRAWL_ENABLED=false` stops every request at this layer, whatever the caller does.
- Every request, and every request we decided not to make, is logged with the reason.

## Politeness and block policy

### Identity

| What | Value |
|---|---|
| Pages, sitemaps, robots.txt, probes | `Mozilla/5.0 (compatible; PretoscopBot/1.0; +<BOT_INFO_URL>)` |
| Feeds (`purpose: 'feed'`) | `Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +<BOT_INFO_URL>)` |
| Other headers | `Accept` (per purpose, overridable), `Accept-Encoding: gzip, deflate, br`, `Accept-Language: ro-RO,ro;q=0.9,en;q=0.6`, and `If-None-Match` / `If-Modified-Since` when the caller has them |
| Never sent | cookies, `Referer`, `Sec-*` client hints, `Upgrade-Insecure-Requests` |

`BOT_INFO_URL` defaults to `https://pretoscop.ro/bot`. The product token is fixed in code. The test-only
`userAgent` override must have exactly this shape (only the version and the URL may differ).
Caller-supplied header values (`accept`, `etag`, `lastModified`) that are not plain printable ASCII
are dropped, never sent (no header injection, no failed request blamed on the shop).

### robots.txt (RFC 9309)

Groups are matched by product token, case-insensitively: a group applies to us when its `User-agent`
value is `PretoscopBot` (also `PretoscopBot/1.0`); otherwise the `*` group applies; with neither,
nothing is disallowed. Feeds look for `PretoscopBot-Feed` first, then `PretoscopBot`, then `*`, so a
shop that blocks PretoscopBot blocks the feed fetcher too. Rules: `*` matches anything, `$` at the
end anchors, the longest matching rule wins, `Allow` wins a tie, percent-encoding is normalized,
`/robots.txt` itself is always allowed. `Sitemap:` lines are collected. Groups are formed as in
Google's reference parser (only an `Allow`/`Disallow` line closes a run of `User-agent` lines).
`Crawl-delay` is honoured when it is longer than the shop's interval (capped at one hour), but only
for the `User-agent` lines written above it, so `User-agent: AhrefsBot / Crawl-delay: 10 /
User-agent: *` gives `*` no delay; the delay applies from the first page after robots.txt.

Generic fragments are **not** our token. cel.ro's robots.txt lists `bot/`, `bot-`, `crawl`, `robot`,
`spider` with `Disallow: /`; under RFC 9309 none of them names PretoscopBot, so the `*` group applies.
These groups are reported as "ignored" in `robotsFor()`, in the request log (`robotsIgnoredGroups`)
and in the demo, so the decision is visible per shop.

| robots.txt response | Decision | Cached |
|---|---|---|
| 2xx text | parse and obey (first 512 KiB) | 24 h, then revalidated with a conditional GET |
| 2xx that carries an error or no body (an assisted vendor's partial answer, a redirect the vendor followed to another site) | **nothing allowed** (never "nothing disallowed") | 1 h |
| 2xx HTML page without rules (soft 404) | nothing disallowed, flagged `htmlBody` | 24 h |
| 2xx HTML challenge page | **nothing allowed**, shop paused 24 h | 1 h |
| 3xx | followed up to 5 hops (also to another host, as RFC 9309 says); never to a CAPTCHA host | as the final response |
| more than 5 redirects, or a redirect to a paused host | nothing allowed | 1 h |
| 404, 410, 401 and other 4xx | nothing disallowed | 24 h |
| 403, 429 | treated as a block: **nothing allowed**, shop paused (403: 24 h; 429: Retry-After, at least 1 h) | 1 h |
| 5xx, timeout, network error | **nothing allowed** (retried twice first) | 1 h |

403 deviates from RFC 9309's "4xx means allow": on every shop we probed, a 403 on robots.txt was the
edge refusing us (OLX, PC Garage, Douglas, Sephora, Answear), never an absent file. Vendor names
inside a plain-text robots.txt are never a block (Decathlon's file lists `/_Incapsula_Resource`).
A manual `unpauseDomain` also drops a robots.txt result cached while the shop was blocked.

### How fast

- One request at a time per host inside a process (a FIFO lock), across processes the slot
  reservation below.
- Each request first reserves a start slot in the shared state store: `start = max(now, next free)`,
  `next free = start + interval`. The interval is the shop's `minIntervalMs` (default 5 000 ms) or its
  robots.txt `Crawl-delay` when longer, plus 0–10 % random extra, plus 100 ms of safety margin (so a
  slow state-store answer for one caller cannot shrink the gap). Never less than the interval.
- Every attempt and every redirect hop is a request of its own: it takes its own slot and counts
  against the daily budget.
- Right before sending, under the host lock and again after the slot wait, the request re-reads the
  pause, the shop policy (kill switch, crawl window) and the budget: a pause set by a concurrent
  request or another process, a kill switch flipped during the wait, or a window that closed during
  it cancels the request.
- The host lock is held until the response has been classified and any pause or failure is in the
  store, so a request queued behind a slow refusal (a 403 that takes seconds, a connect timeout)
  sees the pause and is never sent.
- After robots.txt is fetched, a `Crawl-delay` longer than what its own request reserved pushes the
  next slot by the difference only (never counted twice on a refresh).
- Different hosts never wait for each other. Host names are canonical (`SHOP.ro.` is `shop.ro`).

### When and how much (from the shop registry, `DomainPolicy`)

| Policy | Effect (no request is made when it says no) |
|---|---|
| `accessMode: 'off'` (kill switch, disabled shop) | everything skipped: `access_off` |
| `accessMode: 'feed_only'` | only `purpose: 'feed'` and robots.txt; the rest `feed_only` |
| `accessMode: 'assisted'` | routed through the assisted client (M05B); without it `assisted_unavailable` |
| `allowedHours` (Europe/Bucharest, e.g. 02:00–07:00 or 22:00–06:00) | outside the window `outside_allowed_hours`, also for redirect hops and when the window closes during a slot wait; only robots.txt itself is exempt |
| `maxPagesPerDay` | requests per Bucharest calendar day, robots.txt included; then `budget_exhausted` |
| `respectCrawlDelay: false` | ignore robots.txt `Crawl-delay` |

`purpose: 'robots'` is accepted for `/robots.txt` URLs only (anything else throws), so no caller can
use it to skip robots.txt or the crawl window. The global switch `CRAWL_ENABLED` (env, or the
`crawlEnabled` dep) fails closed: unless it is explicitly on (`1/true/yes/on`), every call becomes
`skipped: 'access_off'` with `errorCode: 'crawl_disabled'`. The worker should also map
`shop_sources.kill_switch` and feature flags to `accessMode: 'off'` in `policyFor`, so the fetch layer
itself refuses those requests.

### Blocks and pauses

| What we see | Result | Pause of the host |
|---|---|---|
| 403 (vendor in `blockDetail`: Akamai "Access Denied … Reference #", CloudFront "Request blocked", Cloudflare) | `blocked`, `http_403` | 24 h |
| Cloudflare challenge on any status (`cf-mitigated: challenge`, "Just a moment..." with `_cf_chl_opt`) | `blocked`, `challenge` | 24 h |
| HTTP-200 interstitials: Fastly "Client Challenge" (`/_fs-ch-`, Hornbach), Tencent EdgeOne (`EO_Bot_Ssid`, Fashion Days), Distinct Captcha (evoMAG's hoster), DataDome (`captcha-delivery.com`), PerimeterX (`px-captcha`), Imperva incident page | `blocked`, `challenge`, body never returned | 24 h |
| Redirect to a CAPTCHA/challenge host, of another site or of the shop's own (`captcha.distinct.ro`, `geo.captcha-delivery.com`, `challenges.cloudflare.com`, `captcha.shop.ro`: any host label exactly `captcha`/`challenge`), or to a challenge path on any host (`/…captcha…`, `/_fs-ch-`, `/cdn-cgi/challenge-platform/`; the query string is not looked at) | `blocked`, `captcha_redirect`, **never followed** | 24 h |
| Connection reset, HTTP/2 stream reset or GOAWAY (Akamai), TLS failure, connect timeout (cel.ro from abroad) | `blocked`, `transport` | 24 h |
| Any transport error that surfaces more than 30 s after the request's own timeout (this process was suspended: the machine slept and the shop closed the idle connection) | `local_suspend`, not blocked, retried on a fresh slot | none (no failure counted) |
| 429 | `blocked`, `http_429` | `Retry-After`, at least 1 h (at most 7 days) |
| 511 (eMAG-style bot throttling) | `blocked`, `http_429` | `Retry-After`, at least 24 h |
| 503 without challenge markers | not a block; retried unless `Retry-After` is present | `Retry-After`, at least 1 h, once the call gives up |
| 3 consecutive failures (5xx, timeouts, DNS/refused) | not a block | 1 h, then 2, 4, 8, 16, 24 h while failures continue |
| A paused host | `blocked: true, blockReason: 'paused', skipped: 'paused'`, no request | — |

A block anywhere in a redirect chain pauses every host of that chain, so `www.shop.ro` is paused
when its redirect target `m.shop.ro` serves a challenge.

A healthy final page response (2xx, 304, 4xx other than 403/429) resets the failure streak; redirect
hops do not (an edge that redirects in front of a dead origin must still trip the breaker), and
neither do robots.txt responses (a CDN-served file says nothing about the shop's pages). Automatic
pauses only ever extend an existing pause; `pauseDomain(host, hours, reason)` sets one by hand and
`unpauseDomain(host)` clears it.

False-positive guards: only HTML documents are scanned (never text/plain, XML, CSV, JSON); the
Cloudflare script `/cdn-cgi/challenge-platform/scripts/jsd/main.js`, which Cloudflare injects into
normal pages, is not a challenge; weak markers (`/_fs-ch-`, `EO_Bot_Ssid`, `_Incapsula_Resource`,
"captcha" in the title) count only on interstitial-sized pages (under 64 KiB).

### Retries

Transient failures (5xx without challenge markers, timeouts, refused connections) are retried at
most twice, after 10 s and 20 s (plus up to 10 % jitter), each attempt waiting for a fresh slot and
re-checking the pause first. Blocks are never retried. The assisted channel is never retried (the
vendor retries, and bills).

### Redirects

Followed manually, at most 5 hops, each hop through the same checks (pause, kill switch, crawl
window, robots.txt of the target, slot, budget). Redirects within the same site (`dedeman.ro` →
`www.dedeman.ro`, http → https) are followed; redirects to another site are returned unfollowed
(`errorCode: 'cross_site_redirect'`, with the `location` header) so the caller can decide; redirects
to CAPTCHA hosts are blocks. A chain never switches channel: an assisted chain stays on the vendor
for every hop and for the robots.txt those hops need; a direct chain returns a redirect to a host
that may only be read through the assisted channel unfollowed (`errorCode: 'channel_change'`).

### Aborts

A caller's `signal` stops waiting at once, also while waiting for a robots.txt fetch started by
another caller. A request that was already sent is still logged (with `errorCode: 'aborted'`); a call
aborted before sending anything is logged with `attempt: 0`. The aborted result keeps the attempts
already sent and the time already waited. An abort never caches anything about the shop, and other
callers sharing the same robots.txt fetch carry on.

### Downloads

undici `request` (never the global `fetch`), one fresh connection per request, overall time budget
30 s (`timeoutMs`), connect timeout 10 s, hard size cap 15 MiB on the wire and after decompression
(`maxBytes`, zip-bomb guard), gzip/deflate/br decoded with `node:zlib`, `.gz` sitemap and feed files
decoded too, text decoded from the BOM, the `Content-Type` charset, `<meta charset>` or
`<?xml encoding?>` (windows-1250 and iso-8859-2 work), UTF-8 otherwise. `etag` / `lastModified`
options send `If-None-Match` / `If-Modified-Since`; a 304 returns `notModified: true` and no body.

### Never (either channel)

Stealth or anti-detection libraries, CAPTCHA or challenge solvers, proxy rotation, residential
proxies, fingerprint or header spoofing, cookies, undocumented shop APIs. `make verify M=02` checks the
package's dependencies and source for the obvious ones.

## Contract (for other modules)

```ts
import { createFetcher, MemoryDomainStateStore } from '@pretoscop/fetch';

const fetcher = createFetcher({ stateStore: new MemoryDomainStateStore(), policyFor, requestLog, logger });
const res = await fetcher.fetchPolite('https://www.dedeman.ro/…', { purpose: 'listing', shopSlug: 'dedeman', runId, sourceId });
if (res.ok && !res.notModified) parse(res.body);
else if (res.blocked) markSourceBlocked(res.blockReason, res.blockDetail);
```

### `createFetcher(deps: FetcherDeps): Fetcher`

| Dep | Meaning |
|---|---|
| `stateStore` (required) | `DomainStateStore`: slots, pauses, failure streaks, daily counters, robots.txt cache |
| `policyFor(host)` | `DomainPolicy` from `@pretoscop/config/policy` per canonical `URL.host`; default `defaultDomainPolicy(host)`. Called again for every request (kill switches take effect mid-run) |
| `crawlEnabled` | global switch; default env `CRAWL_ENABLED`, off unless explicitly on (fail closed) |
| `requestLog` | `{ write(entry: RequestLogEntry) }`; errors in the sink are logged, never thrown |
| `assisted` | `{ fetch(url, { render, followRedirects: false, timeoutMs, purpose, shopSlug, signal }) → AssistedFetchResponse }` (M05B) |
| `logger` | pino-compatible; lines carry `shop`, `source_id`, `run_id` when given in the options |
| `now`, `sleep`, `random`, `dispatcher`, `userAgent` | test hooks (fake clock, undici `MockAgent`/`H2CClient`) |
| `botInfoUrl`, `defaultTimeoutMs`, `defaultMaxBytes`, `connectTimeoutMs`, `retry` | defaults: env `BOT_INFO_URL`, 30 000, 15 MiB, 10 000, `{ maxRetries: 2, baseDelayMs: 10 000 }` |

`createGuardedDispatcher({ allowPrivate, connectTimeoutMs, timeoutMs })` (M20) returns an undici `Agent` whose connector
refuses non-public addresses after DNS resolution (private, loopback, link-local, CGNAT, documentation, multicast, IPv4-mapped
variants): pass it as `dispatcher` wherever the URL comes from outside (merchant feeds). `isNonPublicAddress(ip)` is exported.

### `Fetcher`

- `fetchPolite(url, { purpose, shopSlug?, accept?, etag?, lastModified?, timeoutMs?, maxBytes?, signal?, runId?, sourceId? })` → `FetchResult`.
  `purpose` ∈ `robots | sitemap | listing | product | feed | probe`; `robots` only for `/robots.txt`
  (it also refreshes the robots.txt cache). An unknown purpose, or `robots` for another path, throws.
- `isAllowedByRobots(url)` → `boolean` (false when robots.txt cannot be read).
- `robotsFor(hostOrUrl)` → `RobotsDecisionInfo`: outcome, status, group used, its user-agent lines and
  rules, crawl-delay, sitemaps, ignored generic groups, cache times. A bare host means https.
- `pauseDomain(host, hours, reason)`, `unpauseDomain(host)`, `close()` (closes the internal agent).

`FetchResult`: `url, finalUrl, status (0 = no response), ok (2xx or 304, not blocked), blocked,
blockReason?, blockDetail?, skipped?, notModified, body (text for textual types), bodyBytes,
contentType, headers (lower-case), durationMs (network, last attempt), waitedMs (slot waits and
back-off), channel ('direct' | 'assisted'), attempts (attempts that sent a request; 0 when nothing
was sent), error?, errorCode?`.
Blocked responses never carry a body: a challenge page must never be parsed as data.

| `skipped` | Meaning |
|---|---|
| `robots_disallowed` | robots.txt disallows the URL, or robots.txt is unusable (then `errorCode: 'robots_unavailable'`, and `blocked` when its request was blocked) |
| `paused` | host paused (also `blocked: true`, `blockReason: 'paused'`) |
| `outside_allowed_hours`, `budget_exhausted`, `access_off` (also `CRAWL_ENABLED=false`, with `errorCode: 'crawl_disabled'`), `feed_only`, `assisted_unavailable` | policy |

A skip can also come after some requests of the same call (a redirect target that is paused, a
pause set while the request waited for its slot); `attempts` then counts the attempts started.

`errorCode` values: `invalid_url`, `unsupported_scheme`, `aborted`, `timeout`, `connect_timeout`,
`connection_reset`, `http2_reset`, `tls_error`, `tls_certificate`, `dns`, `connection_refused`,
`network_unreachable`, `protocol_error`, `network`, `body_too_large`, `decode_error`,
`too_many_redirects`, `cross_site_redirect`, `invalid_redirect`, `redirect_disallowed`,
`channel_change`, `robots_unavailable`, `invalid_policy`, `invalid_request`, `crawl_disabled`,
`assisted_error`.

Pure helpers are exported too: `detectBlock`, `classifyTransportError`, `detectChallengeRedirect`,
`parseRetryAfter`, `parseRobotsTxt`, `selectRobotsGroups`, `evaluateRobots`, `normalizeRobotsPath`,
`isWithinAllowedHours`, `bucharestDay`, `buildUserAgent`, and the constants (`BOT_USER_AGENT`,
`FEED_USER_AGENT`, `BOT_PRODUCT_TOKEN`, pause durations, TTLs).

### Request log (`RequestLogEntry`)

One entry per network request (each attempt, each redirect hop, robots.txt included, aborted ones
too) and one per skipped or aborted-before-sending call (`attempt: 0` always means no request was
sent; `hop` says where in a redirect chain): `ts, host, url, method, status, durationMs, bytes (wire),
waitMs, purpose, shopSlug?, channel, attempt, hop, blocked, blockReason?, blockDetail?, skipped?,
error?, errorCode?, robotsGroup?, robotsIgnoredGroups?, notModified?, contentType?, runId?, sourceId?`.
Unset optional fields are omitted. Suggested table (M01 `request_log`, 30-day retention): one column
per field, `robots_ignored_groups text[]`, index on `(host, ts)`.

### `DomainStateStore`

Keys: hosts are canonical `URL.host` values (`www.emag.ro`, no trailing dot), robots.txt entries are
origins (`https://www.emag.ro`). Every method must be atomic. `MemoryDomainStateStore` (tests, one
process) and `FileDomainStateStore` (JSON file with an exclusive lock file, stale locks of dead
processes broken by an atomic rename; the demo CLI) are included; the worker implements PostgreSQL:

```sql
-- fetch_domain_state(host pk, next_slot_at timestamptz not null default '-infinity', paused_until,
--   pause_reason, pause_set_at, pause_source, pause_block_reason, consecutive_failures int default 0)
-- fetch_domain_daily(host, day date, requests int, primary key (host, day))
-- fetch_robots_cache(origin pk, fetched_at, expires_at, status, outcome, body, etag, last_modified,
--   final_url, truncated, html_body, block_reason, detail, channel)

-- reserveSlot(host, intervalMs) -> { startAt, waitMs }   ($2 = intervalMs)
INSERT INTO fetch_domain_state AS s (host, next_slot_at)
VALUES ($1, now() + $2 * interval '1 millisecond')
ON CONFLICT (host) DO UPDATE
  SET next_slot_at = greatest(s.next_slot_at, now()) + $2 * interval '1 millisecond'
RETURNING next_slot_at - $2 * interval '1 millisecond' AS start_at,
          greatest(0, extract(epoch FROM (next_slot_at - $2 * interval '1 millisecond' - now())) * 1000) AS wait_ms;

-- setPause(host, pause, mode): 'replace' always writes; 'extend' only when no active pause ends later.
INSERT INTO fetch_domain_state AS s (host, paused_until, pause_reason, pause_set_at, pause_source, pause_block_reason)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (host) DO UPDATE SET paused_until = EXCLUDED.paused_until, pause_reason = EXCLUDED.pause_reason,
  pause_set_at = EXCLUDED.pause_set_at, pause_source = EXCLUDED.pause_source, pause_block_reason = EXCLUDED.pause_block_reason
WHERE $7 = 'replace' OR s.paused_until IS NULL OR s.paused_until <= now() OR s.paused_until < EXCLUDED.paused_until
RETURNING paused_until, pause_reason, pause_set_at, pause_source, pause_block_reason;
-- no row returned = an existing later pause won: return it with getPause.

-- getPause: ... WHERE host = $1 AND paused_until > now();   clearPause: SET paused_until = NULL, ...
-- recordFailure: upsert consecutive_failures = s.consecutive_failures + 1 RETURNING consecutive_failures
-- resetFailures: UPDATE ... SET consecutive_failures = 0 WHERE host = $1 AND consecutive_failures <> 0

-- consumeDailyRequest(host, day, limit): count only while under the limit ($3 null = no limit)
INSERT INTO fetch_domain_daily AS d (host, day, requests)
SELECT $1, $2::date, 1 WHERE $3::int IS NULL OR $3::int > 0
ON CONFLICT (host, day) DO UPDATE SET requests = d.requests + 1
WHERE $3::int IS NULL OR d.requests < $3::int
RETURNING requests;
-- row -> { allowed: true, count: requests }; no row -> { allowed: false, count: current requests (0 if none) }

-- getRobots / setRobots: SELECT / upsert on origin.
```

`waitMs` is computed on the database clock, so processes on machines with slightly different clocks
still keep the interval; the 100 ms slot margin absorbs differences in round-trip latency. Concurrency
1 per host is enforced inside a process; across processes only the interval is (run one crawl
worker per host, e.g. pg-boss singleton keys per host). The fetcher calls `getPause` and `policyFor`
again for every request (before and after the slot wait), so keep both cheap.

### Assisted channel (M05B)

For `accessMode: 'assisted'` the same `fetchPolite` call routes requests (robots.txt included) through
`deps.assisted.fetch(url, { render: policy.assistedRender ?? false, followRedirects: false, timeoutMs,
purpose, shopSlug, signal })`. Pause, crawl window, budget, robots.txt, slot interval and the request
log apply unchanged (`channel: 'assisted'`). The whole chain stays on the vendor, including
same-site redirect targets without their own registry entry and the robots.txt they need. A
robots.txt answer that carries an error or no body is "nothing allowed", never "nothing
disallowed". The client must not follow redirects: it returns the 3xx
with its `location`, and the fetch layer applies its redirect rules (robots.txt of the target,
same-site only, never a CAPTCHA host) and asks again. If the vendor followed one anyway (`finalUrl`
differs), the body is dropped unless the target passes those rules (`cross_site_redirect`,
`redirect_disallowed`). A call that does not answer within `timeoutMs` plus up to 2 s is abandoned
(`errorCode: 'timeout'`). The returned body is still scanned: a challenge page or any
vendor-reported block becomes `blockReason: 'vendor_blocked'` (the vendor's own reason goes into
`blockDetail`). That does not pause the shop at once, but it counts as a failure, so three in a row
pause it for 1 h (doubling), on top of M05B's success-rate auto-pause. The vendor's cost ledger and
cap belong to M05B.

### Web Bot Auth (M21)

`src/signing.ts` (also `@pretoscop/fetch/signing`, no undici) implements the RFC 9421 pieces the
web-bot-auth drafts use: Ed25519 keys (`loadEd25519Key` from a base64url seed or PKCS#8 PEM,
`generateEd25519Key`), the JWK thumbprint `keyid`, the signature base and parameters,
`createWebBotAuthSigner({ key, agentOrigin })` (signs `("@authority" "signature-agent")` with
`tag="web-bot-auth"`, a fresh 64-byte nonce and a 60 s validity), `directoryBody` +
`signDirectoryResponse` for the key directory (tag `http-message-signatures-directory`, covering
`"@authority";req`), and `verifyWebBotAuthRequest` (what a CDN checks: tag, known key, validity
window, `@authority`, signature) for tests and self-checks.

The fetcher signs each direct hop for its own authority (a redirect to another host gets a new
signature) when `FetcherDeps.signer` is set; by default it uses `signerFromEnv(process.env)`: no signer
unless `WEB_BOT_AUTH=1`, and `WEB_BOT_AUTH=1` without a usable `WEB_BOT_AUTH_PRIVATE_KEY` throws at
construction (a crawler told to sign never runs unsigned). `signer: null` turns it off. The assisted
channel is never signed with our key. Tests reproduce RFC 9421 Appendix B.2.6 and the
draft-meunier-web-bot-auth-architecture example byte for byte. A key: `pnpm --filter @pretoscop/fetch
bot-auth:keygen`; rollout and rotation: `infra/bot-program/web-bot-auth.md`.

## Demo CLI

```
pnpm --filter @pretoscop/fetch demo <url> [--purpose <p>] [--paths "/a,/b"] [--cached] [--state <file>]
```

Fetches one URL (robots.txt first when needed) with the state file `data/fetch-demo-state.json`
(git-ignored), so two invocations within 5 s are throttled across processes, and prints the
User-Agent, status, timing, slot wait, block verdict, and the host's robots.txt decisions with the
rule that decided each sample path. `--cached` makes no request at all. Because a founder starts it
by hand for one request, the demo ignores `CRAWL_ENABLED` (it says so when the switch is off); every
other rule applies.

## Fixture recorder CLI (M10)

```
pnpm --filter @pretoscop/fetch record <shop> <name> <url> [--ext html] [--purpose listing] [--out-dir dir] [--max-bytes n]
scripts/record-fixture.sh <shop> <name> <url> [ext] [--purpose listing]      # same thing
```

Records one page as `packages/extractors/fixtures/<shop>/<name>_<YYYY-MM-DD>.<ext>` plus
`.meta.json` (URL, final URL, status, time, User-Agent, content type, size, robots.txt group), through
`fetchPolite` with every rule above: robots.txt first, the shop's registry policy (`getDomainPolicy`,
≥ 5 s), the demo's shared state file (so the demo, the recorder and parallel invocations keep the
interval), block detection. A blocked or challenged response writes nothing and exits 2. The URL's
host must belong to the named shop, and shops whose registry status is not `active` or whose access
mode is not `direct` are refused before any request (exit 3). Like the demo, it ignores
`CRAWL_ENABLED` (started by hand for one page). `--out-dir` writes elsewhere (probes kept out of git).

## Tests and fixtures

`pnpm --filter @pretoscop/fetch test` (Vitest, no network except local servers on 127.0.0.1):
robots parser and matcher, robots status handling through the fetcher, block detection on fixtures,
transport errors (socket reset, HTTP/2 stream reset and GOAWAY via an h2c server), throttle with a
fake clock and with real timers, concurrency, crawl windows (overnight), budgets, pauses,
Retry-After, retries, gzip/br, charsets, size caps and gzip bombs, conditional GET, redirects, and
`fetcher-safety.test.ts`: request-time re-checks (concurrent callers after a block, a pause, kill
switch or window change during a slot wait or back-off), canonical hosts, `purpose: 'robots'`
misuse, aborts, unsendable headers, the assisted channel's timeout and redirect rules.

The files in `test/fixtures/blocks/` and `test/fixtures/robots/` are **synthetic**: hand-written to
reproduce the markers observed in the 2026-10-27 probes (`docs/research/notes/scraping_feasibility_recon.md`),
not recorded shop pages, hence the `_synthetic` suffix instead of a recording date. Recorded pages
(when we have them) follow the `<shop>_<kind>_<date>` convention of `docs/05-plan-modular.md` A.5.

## Known limits

- Concurrency 1 per host is per process (see above); the interval holds across processes.
- A dead local network gives "unreachable"/DNS errors (failures, not blocks), but a flaky one can
  produce connect timeouts or resets, which pause each host they touch for 24 h. Check connectivity
  before a run (the recorder may run on a founder's laptop) and use `unpauseDomain` after an outage.
- Web Bot Auth request signing (M21) is not implemented yet.
