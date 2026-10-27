# Pretoscop — Progress tracker

Single page the founders read to supervise the build. The implementing agent updates it at the start and end of every module. Statuses: `todo` → `in_progress` → `review` (founder verifies with the module's checklist) → `done`, or `blocked` (say on what). Phase gates (G0–G4) require explicit founder approval before the next phase starts.

Last updated: 2026-10-27 (autonomous build session started; see "Build session mode" below).

## Build session mode (2026-10-27)

Daniel asked the implementing agent to build the whole plan while the founders are away. His instructions for this session: one local branch `mod/MXX-*` per module, merged into `daniel` with `--no-ff` once `make verify M=XX` passes; nothing is pushed to GitHub; phase gates are marked **awaiting founder approval** and the build continues; no external credentials yet, so every integration runs against a local stand-in (filesystem blob store for R2, Mailpit for email, recorded responses for vendors); live, polite crawling from Daniel's Mac is allowed and the recorder is left running. Every module below in status `review` still needs the founders' 5-minute check.

## Phase 0 — Record prices now (target: running before 6 Nov 2026)

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M00 | Repo scaffold and dev environment | review | `mod/M00-scaffold` (merged locally into `daniel`) | | CI workflow written but not run (nothing pushed) |
| M01 | Database schema v1 and migrations | review | `mod/M01-schema` (merged locally into `daniel`) | | 25 tables, monthly partitions, PG18 old/new upserts |
| M02 | Polite fetch layer and robots.txt | review | `mod/M02-fetch` (merged locally into `daniel`) | | 193 tests; two independent reviews, all findings fixed |
| M03 | Extractors: structured data and feed mappers | review | `mod/M03-extractors` (merged locally into `daniel`) | | eMAG listing/product, JSON-LD/microdata/OG, 5 feed mappers, sitemaps |
| M04 | Shop registry and configuration | review | `mod/M04-registry` (merged locally into `daniel`) | | 28 shops, 49 sources (eMAG 43 listings + Tier A), idempotent sync |
| M05 | Phase-0 price recorder (eMAG listings + first feeds) | todo | | | eMAG decided 2026-10-27: option A (see decisions log) |
| M05B | Assisted-access channel for blocked shops (prototype) | todo | | | decided 2026-10-27 after legal advice; file the written opinion and open the vendor account (A10) |

**Gate G0** — recorder runs daily on ≥5,000 products from ≥2 shops; raw snapshots in R2; backups on. Target: assisted channel live for ≥3 of the 5 designated shops at ≥90% success within the cap. Approved: ☐ date: ____

## Phase 1 — Data core

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M06 | Core normalization (GTIN, Romanian text, brands, attributes, pricing) | review | `mod/M06-core` (merged locally into `daniel`) | | 491 tests; 696 brands; corpus ≥ 99% per field |
| M07 | Matching v1 (deterministic + review queue) | todo | | | |
| M08 | Rollups, stats, anomaly filters, verdicts | todo | | | |
| M09 | Admin v1 (sources, review queue, merge/split) | todo | | | |
| M10 | Source adapters batch 1 | todo | | | |
| M11 | Icecat enrichment | todo | | | |

**Gate G1** — ≥20,000 products with ≥2 live offers; audited match precision ≥98%; freshness ≥90% < 24h. Approved: ☐ date: ____

## Phase 2 — Public web MVP and launch

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M12 | Web foundation (Next.js app, design system, layout) | review | `mod/M12-web-foundation` (merged locally into `daniel`) | | Lighthouse mobile 98/95, desktop 100/100 |
| M13 | Product page, history API, click-out | todo | | | |
| M14 | Search, category, brand and shop pages | todo | | | |
| M15 | Deals page and discount verdict UI | todo | | | |
| M16 | SEO: structured data, sitemaps, performance | todo | | | |
| M17 | Legal and trust pages, consent, analytics, bot page | todo | | | |
| M18 | Production deployment, backups, monitoring, staging | todo | | | |

**Gate G2** — staging reviewed by founders; launch checklist complete (`04-plan-normal.md` §9); SRL exists; lawyer review done. Launch date: ____ ANCOM DSA notification due: launch + 45 days.

## Phase 3 — Retention, merchants, legitimacy

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M19 | Accounts and price alerts | todo | | | |
| M20 | Merchant self-serve feed portal (free listing) | todo | | | |
| M21 | Bot legitimacy program and source adapters batch 2 | todo | | | |
| M22 | LLM-assisted matching and attribute extraction | todo | | | |
| M23 | Black Friday / fake-discount report tooling | todo | | | |

**Gate G3** — alerts live with double opt-in; ≥10 merchants onboarded; Verified Bots application submitted. Approved: ☐ date: ____

## Phase 4 — Growth and monetization

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M24 | Affiliate operations (program sync, links, commissions, revenue dashboard) | todo | | | |
| M25 | Promoted placements and merchant billing; optional ad slots | todo | | | |
| M26 | Browser extension (MV3) | todo | | | |
| M27 | Telegram bot and web push | todo | | | |
| M28 | B2B price intelligence MVP | todo | | | |
| M29 | Category expansion playbook and CSS enrolment readiness | todo | | | |

**Gate G4** — first revenue month recorded; extension published; B2B pilot customer. Approved: ☐ date: ____

## Founder decisions log

| Date | Decision | Options considered | Outcome |
|---|---|---|---|
| 2026-10-27 | eMAG crawling (ADR-013) | crawl politely / seek consent / extension-only / exclude | **Decided by Daniel: option A**, polite identified crawl behind a kill switch (category listings + Tier A product pages, ≤1 request/5 s, robots.txt obeyed, no images, no internal APIs, stop on first written request); lawyer review before public launch (B5); asking eMAG for consent in parallel (option B) remains open |
| | 2Performant ToS §9 clearance for price history on feed data | written clearance / own crawl of merchant pages / merchant direct feeds | pending |
| | Company: SRL formation date | | pending |
| 2026-10-27 | Blocked shops policy (`12-blocked-shops-strategy.md` §0) | identity + feeds + partnerships only / assisted-access channel for the prototype / exclude | **Decided: assisted-access channel for the prototype**, after legal advice (verbal); written opinion to be filed (A10); exit per shop to feed or allowlist; eMAG excluded from this decision |

## Module report template

Copy into the PR description and append under "Module reports" below.

```
### MXX — <name> — <date>
Scope delivered: <bullets, mapped to the module's deliverables>
Out of scope / deferred: <bullets, with reason>
Deviations from plan: <none | bullets + ADR reference>
Verification: `make verify M=XX` output summary; manual checks performed
Founder checklist: <the module's "how to verify in 5 minutes" steps, with results>
Human tasks needed: <accounts, decisions, credentials> (from docs/09-external-setup-checklist.md)
Risks / open questions: <bullets>
Next module: MYY
```

## Module reports

### M00 — Repo scaffold and dev environment — 2026-10-27
Scope delivered:
- pnpm 10 workspaces + Turborepo 2; TypeScript 5.9 strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`); ESLint 9 flat config (an import rule keeps `packages/core` and `packages/extractors` free of I/O); Prettier; Vitest 5.
- `apps/web` (Next.js 16.4.3 App Router, Tailwind 4, Romanian placeholder page, `noindex`), `apps/worker` (pg-boss 12.38 bootstrap, job registry with `defineJob()`, `system.heartbeat` every minute and at start, graceful shutdown).
- Packages `@pretoscop/db`, `core`, `extractors`, `fetch`, `config`, `llm` with README contracts; `@pretoscop/config/env` (zod-validated, every variable documented in `.env.example`, dev secrets refused outside dev) and `@pretoscop/config/logger` (pino JSON).
- `infra/docker-compose.dev.yml`: PostgreSQL 18 (pgvector image 0.8.7-pg18), Meilisearch 1.56.0, Mailpit 1.32.0, all with health checks.
- `Makefile` (`dev`, `services`, `down`, `test`, `lint`, `typecheck`, `migrate`, `seed`, `verify M=`, `shops:sync`, `psql`), `scripts/verify/run.sh` + `lib.sh`, GitHub Actions CI, PR template, root README.
Out of scope / deferred: production compose (M18).
Deviations from plan:
- Local Node is 22.17 (the shell pins it); Node 24 is installed and `.nvmrc` says 24; production images will use Node 24. Everything requires Node ≥ 22.12 (pg-boss 12).
- TypeScript stays on 5.9 (typescript-eslint supports < 6.1; TypeScript 7 is the native port), ESLint on 9 (Next's plugin set), per ADR-001's "TS 5.x".
- The dev compose file lives in `infra/` (architecture §4) rather than the repo root.
Verification: `make verify M=00` → toolchain, install, 24/24 lint/typecheck/test tasks, worker heartbeat, `next build` + placeholder page on :3999, Mailpit reachable → `OK`.
Founder checklist: see `scripts/verify/M00.checklist.md` (not yet run by a founder).
Human tasks needed: A5 (GitHub settings) when the repository is pushed; CI has not run because nothing is pushed in this session.
Risks / open questions: none.
Next module: M01

### M01 — Database schema v1 and migrations — 2026-10-27
Scope delivered:
- Drizzle schema (`packages/db/src/schema/*`) for every table listed in the contract: `shops`, `affiliate_programs`, `shop_sources`, `ingest_runs`, `access_costs`, `brands`, `categories`, `product_families`, `products`, `product_gtins`, `product_images`, `product_specs`, `offers`, `price_events`, `product_daily`, `product_stats`, `match_candidates`, `match_decisions`, `offer_aliases`, `product_merges`, `feature_flags`, `audit_log`, `request_log`, plus `offer_gaps` and `crawl_domain_state`; relations for the query API.
- Migrations: `0000_extensions` (pg_trgm, unaccent, pg_stat_statements), `0001_schema_v1` (generated; edited once to make `price_events` `PARTITION BY RANGE (observed_at)`), `0002_partitions` (SQL function `ensure_price_event_partitions(months_back, months_ahead)`; partitions from January 2026 to twelve months ahead). BRIN on `price_events.observed_at` and `request_log.ts`; trigram GIN on `products.title_ascii`.
- Query helpers: `recordObservation` (PG18 `INSERT … ON CONFLICT DO UPDATE … RETURNING old.*, new.*`), `insertPriceEventIfChanged` (`UPDATE … RETURNING old.*, new.*`), `markMissingOffers` (two-missing-runs deactivation), `startRun`/`finishRun`, flags, partition maintenance, request-log pruning; `baniToNumeric`/`numericToBani` (string arithmetic).
- Seed: two shops (eMAG, Dedeman) and all known flags (off). Worker jobs `maintenance.partitions` (daily and at start) and `maintenance.request_log` (daily, 30-day retention). `createTestDatabase()` for integration tests.
Out of scope / deferred: users/alerts/clicks/merchants tables (M09/M13/M19/M20), quarantine table (M08), rollup SQL (M08).
Deviations from plan:
- Added `offer_gaps`: when two checks of an offer are more than 48 h apart, the gap is recorded so charts and rollups never extend a price step across a crawler outage ("never fabricate history"). Not in architecture §5; recorded here and in the package README.
- Added `crawl_domain_state` (per-host politeness state shared across worker processes: slot reservation, pauses, failures, daily budget, robots cache) for M02's state store.
- `products.provisional` flag (M07's provisional products) instead of a fourth status value; `shop_sources.key` as the stable registry key for idempotent `shops:sync`.
- Identity columns stay `bigint` but are mapped to JS numbers (safe to 2^53).
Verification: `make verify M=01` → lint/typecheck/tests green (21 integration tests on a throwaway database: clean migration, partitions incl. next month, idempotent maintenance, same observation twice → one event, unchanged re-check advances `last_checked_at` only, change → event, stale replay ignored, 48 h gap recorded, identity change → re-match, deactivation + reactivation event, runs) → migrate + seed on the dev DB → 22 partitions → `OK`.
Founder checklist: `scripts/verify/M01.checklist.md` (not yet run by a founder).
Human tasks needed: none.
Risks / open questions: partition creation depends on the daily maintenance job; a missed year of maintenance would make inserts fail loudly (by design, no default partition).
Next module: M02/M06 (running in parallel), M03, M04.

### M03 — Extractors: structured data and feed mappers — 2026-10-27
Scope delivered:
- `parsePage` / `parsePageDetailed` / `parseFeed` / `parseSitemap` and a registry keyed by `parser_key` (`jsonld-product`, `emag-listing`, `emag-product`, `feed-2performant-csv`, `feed-2performant-xml`, `feed-google-shopping`, `feed-compari-xml`, `feed-csv-generic`, `sitemap`); `isKnownParserKey()` for M04's validation.
- Generic structured data: JSON-LD (`@graph`, arrays, `ItemList`, `ProductGroup.hasVariant`, `Offer`, `AggregateOffer` only when it collapses to one price, `priceSpecification` with `StrikethroughPrice` → old price, gtin8–14, brand objects, seller, shipping details, lenient parsing of broken JSON), microdata fallback, OpenGraph `product:*` fallback, BreadcrumbList.
- eMAG listing parser (60 cards per page, offer id, price, crossed price, PRP, availability code, rating and reviews, next page) and product parser (one offer per seller from `EM.offer`, `EM.multiple_offers`, `EM.used_offers` and the analytics `secondary_offers`).
- Streaming feed mappers (sax / csv-parse, gzip auto-detected): 2Performant CSV and XML with the exact labels, Google Merchant RSS/Atom, compari.ro XML (incl. older field names), generic CSV with a Romanian/English alias table that fails loudly on ambiguous aliases.
- Fixtures recorded with the PretoscopBot UA on 2026-10-27 (robots.txt checked; ≥5 s per host; ≤3 pages per shop): eMAG robots, listing, vendor-filtered listing, product; IT Galaxy robots, sitemap index, latest-products sitemap, product; Dedeman robots, listing, product. `scripts/record-fixture.sh` records future fixtures the same way.
- Demo CLI, README with the parser table and the adapter checklist for M10.
Out of scope / deferred: normalization (M06); shop parsers beyond eMAG (M10; IT Galaxy and Dedeman already parse with `jsonld-product`).
Deviations from plan:
- Fixture dates are 2026-10-27 (recorded today) rather than the 2026-10-29 used as an example in the plan.
- Feed fixtures are synthetic but follow the published specifications (no affiliate account yet, A6); `fixtures/feeds/README.md` says so and asks for real dated downloads later.
- eMAG modelling decisions (recorded in the README): offer key = eMAG offer id (seller-level); listing cards do not name the seller (`raw.sellerUnknown`), Tier A product pages do; eMAG's crossed price is eMAG's own "lowest price in the last 30 days", so it is both `oldPrice` and `shopLowest30d`; "PRP" (manufacturer's recommended price) is kept in `raw.rrp` and never used as a reference; MPN recovered from the URL slug (59 of 60 cards).
- `parsePageDetailed` added next to the contract's `parsePage` to return discovered product URLs and the next listing page.
Verification: `make verify M=03` → lint/typecheck/31 tests (fixture expectations + snapshots, JSON-LD edge cases, all feed formats, gzip, 100k-row CSV streaming under 200 MB) → demo prints 60 eMAG listing offers and 9 seller offers → `OK`.
Founder checklist: `scripts/verify/M03.checklist.md` (not yet run by a founder).
Human tasks needed: A6 (an approved 2Performant program, to replace the synthetic feed sample with a real download).
Risks / open questions: eMAG listing markup can change without notice; the weekly canary (M21) and the parse-reject alarms (M05) will catch it.
Next module: M04.

### M04 — Shop registry and configuration — 2026-10-27
Scope delivered:
- `packages/config/shops/*.yaml` for 28 shops: eMAG (decision recorded; 42 launch-category listing sources staggered from 01:00, Tier A product pages, a disabled sitemap sweep), IT Galaxy, forit and Flip (sitemap → product pages, enabled), Dedeman, Libris, Elefant, Bonami, JYSK, Carrefour, Auchan (active, sources to come in M10), evoMAG and Vexio (blocked; feed placeholders), and blocked placeholders for Altex, Media Galaxy, Flanco, PC Garage, CEL.ro, iStyle, Notino, Douglas, Sephora, Answear, Fashion Days, Leroy Merlin, Hornbach, Decathlon, OLX. Each records legal basis, robots notes, affiliate program and comparator policy, crawl policy and probe results.
- zod schema with the politeness floor, cron validation, key rules and legal-basis checks; loader with all-at-once readable errors; `getDomainPolicy(host)`; `shops:sync` (idempotent, audit row, kill switches and flags never overwritten); `pnpm shops:table` embedding a generated table in docs/06.
Out of scope / deferred: the crawl itself (M05); listing parsers for Dedeman/Carrefour/Auchan/Libris/Elefant/Bonami/JYSK (M10).
Deviations from plan:
- eMAG sources are `enabled: true` in the YAML because the founders decided option A; the ADR-013 isolation is the DB flag `source.emag.enabled` (off by default, turned on in the local DB for this session's recorder) plus per-source kill switches. The plan's founder check "confirm enabled: false" therefore reads "confirm the flag gate" now.
- `shops.access_mode` and `legal_basis_ref` are owned by the YAML (changes reviewed in git) rather than edited in the admin; the admin will show them read-only (affects M05B/M09 wording).
- docs/06 keeps its research tables; the generated table is appended as "Registry snapshot" instead of replacing them.
- Shipping rules are left unknown (`verified: false`, no amounts) for every shop: inventing thresholds would make "total price" ranking dishonest. Totals equal prices plus known shipping until the founders fill these in.
Verification: `make verify M=04` → 21 registry tests (valid registry, every parser key exists, blocked shops have no enabled source, politeness floor, eMAG legal basis, domain policies, readable errors for 8 kinds of invalid YAML, assisted needs a legal basis) and 4 sync tests (idempotent, kill switch preserved, removed source disabled, audit row, unknown parser refused) → dev DB sync then a no-op second sync → `OK`.
Founder checklist: `scripts/verify/M04.checklist.md` (not yet run by a founder).
Human tasks needed: A8 recorded; **shipping rules per shop** (free-delivery threshold, courier fee, locker fee) — new task, needed before totals are meaningful; A6 (2Performant feed URLs for evoMAG and others).
Risks / open questions: eMAG category slugs come from eMAG's categories sitemap of 2026-10-27; a renamed category shows up as a failing source in the dashboard.
Next module: M05.

### M12 — Web foundation — 2026-10-27
Scope delivered:
- App Router layout (skip link, sticky header with a no-JS search form, footer with every trust and legal link, Romanian disclaimer), design tokens in Tailwind 4 `@theme` (teal brand scale, verdict colours reserved for verdicts), UI primitives (Button, Badge, Card, Skeleton, Container), error/404/loading pages.
- `messages/ro.json` + `t()`; `lib/format.ts` (`formatLei` → `1.234,56 lei`, dates in Europe/Bucharest, `acum 3 ore`, Romanian plurals) with tests.
- `ProductImage` (licensed copies only, placeholder otherwise) and `/media/[...key]` serving only `images/…` from the blob store (never snapshots/backups).
- `POST /api/events` → new `events` table (migration 0004): 4 KB cap, name/prop validation, 120/min per session, session = sha256(daily rotating salt, IP, UA), no cookies, no raw IP; client `track()` via sendBeacon.
- Consent banner with equal Accept/Reject, versioned choice in localStorage, `useConsent()`; Plausible loaded only after Accept.
- Playwright (mobile + desktop): shell, no cedilla diacritics, no third-party request before consent, reject persists, accept loads Plausible, 404, event API limits. Lighthouse CI config; jsx-a11y recommended rules as errors; security headers.
Out of scope / deferred: product/search pages (M13/M14), CSP (M16/M17), Plausible container (M17).
Deviations from plan:
- **No web font**: Inter via next/font pushed mobile LCP to 2.8 s (preloaded 130 kB); the system font stack gives LCP 2.18 s and native diacritics.
- Plausible settings are build-time `NEXT_PUBLIC_*` variables because static pages are prerendered (renamed in `.env.example` and the env schema).
- `@pretoscop/db/migrator` is now a subpath export (bundlers resolve `new URL(…, import.meta.url)` as an asset); M12 branched from the M05 branch so the `events` migration follows `crawl_urls`.
Verification: `make verify M=12` → lint (incl. a11y) / typecheck / 5 unit tests → production build → 8 Playwright tests (4 per device) → `OK`. Lighthouse (local, simulated throttling): mobile performance 98, accessibility 95, LCP 2.18 s; desktop 100/100; SEO 60 only because the prototype is `noindex` on purpose.
Founder checklist: `scripts/verify/M12.checklist.md` (not yet run by a founder).
Human tasks needed: none (Plausible hosting comes with M17/M18).
Risks / open questions: the shell ships ≈150 kB of framework JS; product pages must keep client components small to stay within the JS budget (M16).
Next module: M13 (after M07/M08).
### M02 — Polite fetch layer and robots.txt — 2026-10-27
(Implemented by a delegated Opus agent; integrated and re-verified by the lead.)
Scope delivered:
- `@pretoscop/fetch` on undici `request`: fixed identity (`PretoscopBot/1.0`, `PretoscopBot-Feed/1.0` for feeds; no cookies, Referer or browser-only headers); RFC 9309 robots.txt (product-token groups, `*`/`$`, longest match, Allow wins ties, 3xx followed, 4xx allow-all, 403/429/5xx/HTML challenge → disallow, 24 h cache, Crawl-delay honoured, generic `bot/`/`crawl`/`spider` groups reported per shop); per-host FIFO lock + atomic slot reservation (interval + 0–10% jitter + 100 ms margin), allowed hours (Europe/Bucharest), daily budgets, access modes `off`/`feed_only`/`assisted`; every request re-checks pause, policy, window and budget under the host lock.
- Transport: timeouts, 15 MiB wire/decoded cap (gzip-bomb safe), gzip/deflate/br, charset detection (windows-1250, iso-8859-2), conditional GET, manual redirects (cross-site returned, CAPTCHA never followed), ≤ 2 retries each on a fresh slot.
- `detectBlock()`: transport blocks, 403 with vendor hints, 429/511, Cloudflare challenges, HTTP-200 interstitials (Fastly, EdgeOne, Distinct, DataDome, PerimeterX, Imperva), CAPTCHA redirects, with false-positive guards (Cloudflare jsd script on normal pages, vendor names in robots.txt).
- Pauses: 24 h on 403/challenge/CAPTCHA/transport block; Retry-After with a 1 h floor (7 d max) on 429/503; 3 failures → 1 h doubling to 24 h. Request log for every request, hop, attempt and skip. `DomainStateStore` interface with memory and file stores; assisted hook for M05B.
- Demo CLI, README (contract, plain-English policy, PostgreSQL SQL for the stores), verify script with a local test server.
Out of scope / deferred: PostgreSQL state store and request-log sink (M05 wiring), Web Bot Auth (M21), vendor client and cost ledger (M05B), real recorded block pages (synthetic fixtures for now).
Deviations from plan: undici 7.30.1 instead of 8.x (8.x needs Node ≥ 22.19; the local shell has 22.17; same API); `reserveSlot` returns `{startAt, waitMs}` on the store's clock; robots.txt 403/429 are treated as blocks (every probed 403 on robots.txt was an edge refusal); `purpose: 'robots'` only for `/robots.txt`; 511 treated as a rate limit with ≥ 24 h pause; additive API fields (`waitedMs`, `errorCode`, `runId`, `sourceId`, `close()`).
Verification: `make verify M=02` (re-run on `daniel` after the merge) → lint/typecheck/182 tests, never-list guard, UA strings, two CLI processes 5,251 ms apart on a local server → `OK`. Live: two requests to dedeman.ro/robots.txt 6.6 s apart (200; group `*`; sample verdicts with the deciding rule). An independent Opus review found 2 critical issues (queued requests still sent after a 403 pause; `purpose:'robots'` skipping the robots check) and 13 others, all fixed with regression tests. A second review found 8 more (critical: a robots.txt cache that the assisted channel could poison; high: a request racing a block recorded by another caller), all fixed at `12c0bb2` with regression tests (193 tests). Behaviour changes from that round: `FetchResult.attempts` is 0 when nothing was sent; the host lock is held while pauses and failure counters are written (keep those statements fast); an unset `CRAWL_ENABLED` now means off (fail closed). A timing-dependent abort test was made deterministic at `3f5c4fe`.
Founder checklist: `scripts/verify/M02.checklist.md` (not yet run by a founder).
Human tasks needed: A1 (pretoscop.ro for the bot info URL; the page itself arrives with M17).
Risks / open questions: per-host concurrency holds per process (one crawl worker per host); a flaky home network can pause hosts for 24 h (unpause after an outage); feeds obey robots.txt (IT Galaxy and Vexio disallow `/data/feeds*`: a founder-approved exemption would be needed).
Next module: M05 wiring.

### M06 — Core normalization (GTIN, Romanian text, brands, attributes, pricing) — 2026-10-27
(Implemented by a delegated Opus agent; integrated and re-verified by the lead.)
Scope delivered:
- Money in integer bani everywhere (`baniToDecimalString`, `decimalStringToBani`, `formatLei`); `parsePrice`/`parsePriceRon` (Romanian, decimal and English separators, NBSP, "de la", "1.299,- lei", eMAG split cents, entities; rejects ranges, instalments, unit prices, zero/negative/placeholder, other currencies; flags ≤ 1 leu and "fără TVA"); VAT by date (21% from 2025-08-01); BNR conversion with a caller-supplied rate.
- GTIN-8/12/13/14 (ISBN-10 → 13) with check digit, restricted/coupon/demo ranges, EAN-8 internal ranges, placeholders and a per-shop fakes list (property test over 100,000 corruptions).
- Romanian text (cedilla → comma-below, ASCII fold, slugify, shop-boilerplate cleanup, match form, cel.ro hex-junk detection); 696 brands with aliases and 183 product lines; MPN normalization and title candidates; attributes (storage, RAM, VRAM, screen, resolution, colour, year, generation, connectivity, energy class, litres, kg, power, edition, watch case, pack count); condition, bundle, accessory, availability; `totalPrice` from shop rules; content hash `v1|price|old|shipping|availability` at `@pretoscop/core/hash` only.
- `normalizeOffer(raw, ctx)` → accepted/rejected union with reasons and audit fields; corpus of 255 + 72 holdout synthetic titles and 66 real eMAG titles, every field ≥ 95% (now ≥ 99.5%); demo and GTIN CLIs; README with every rule.
Out of scope / deferred: matching (M07), verdicts and quarantine (M08), reduced VAT rates.
Deviations from plan: money fields are `*Bani` (not `*Ron`); `gtinQuality` adds `restricted`; `normalizeOffer` takes the hasher in `ctx` and returns a discriminated union; the real-title corpus has 66 titles (the plan wants ≥ 150 from Phase-0 data: append recorder titles); a seeded PRNG replaces fast-check (not in the offline store).
Verification: `make verify M=06` (re-run on `daniel` after the merge) → lint/typecheck/491 tests, browser-safe root export, corpus ≥ 95% per field, PS5 demo (Sony, 1TB, Slim Digital, bundle), GTIN check → `OK`. Throughput ≈ 80 µs per offer.
Founder checklist: `scripts/verify/M06.checklist.md` (not yet run by a founder).
Human tasks needed: none.
Risks / open questions: synthetic sets were written by the same agent as the rules (expect lower accuracy on messy real titles outside phones); model codes written with spaces are not extracted; phones with a free gift ("+ cadou") count as bundles and leave the price series (founder decision: exempt cheap gifts?); feeds must declare `priceFormat` ("12.500" without it reads as 12,500 lei).
Next module: M07 (uses brand, MPN and attributes).
