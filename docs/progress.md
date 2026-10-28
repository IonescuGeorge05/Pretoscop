# Pretoscop — Progress tracker

Single page the founders read to supervise the build. The implementing agent updates it at the start and end of every module. Statuses: `todo` → `in_progress` → `review` (founder verifies with the module's checklist) → `done`, or `blocked` (say on what). Phase gates (G0–G4) require explicit founder approval before the next phase starts.

Last updated: 2026-10-28 (build resumed on the Windows laptop; see below).

## Build session resumed on the Windows laptop (28 Oct 2026)

The build moved from the old Mac to Daniel's Windows 11 laptop on 28 Oct 2026 (`docs/HANDOFF.md`).
- **Setup:** Docker Desktop (WSL2 backend) with PostgreSQL 18, Meilisearch and Mailpit; the dev database restored from `handoff/` (4,493 offers, 2,679 products; the eMAG and Flip pauses and the eMAG Tier A kill switch carried over). `make test` and `make verify M=13` pass on the laptop.
- **Windows fixes on `daniel`:** LF line endings (`.gitattributes`; Git for Windows had turned every file into CRLF); e2e CLIs started with `node --import tsx` (`runTsx`), because pnpm is a `.cmd` shim that Node cannot spawn; `stop_port`/`port_in_use` in `scripts/verify/lib.sh`, because pkill cannot see native Windows processes; a per-checkout database and E2E port, so parallel worktrees never share one.
- **Recorder:** runs on the laptop from 28 Oct 09:05 UTC (`make recorder`). Keep the laptop on power and awake, with Docker Desktop running; it sleeps after 10 idle minutes unless that setting is changed.
- **Daniel's instructions for the rest of the session:** finish the plan; push `daniel` and each module branch once its verify passes (this replaces "nothing is pushed"); subagents only on Opus 5.5 at xhigh effort.
- **How it runs:** modules with personal data or money get an independent review before they are marked done; merges regenerate each branch's migrations on top of `daniel` (HANDOFF §5).

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
| M05 | Phase-0 price recorder (eMAG listings + first feeds) | review | chain `mod/M13-product-page` (from `mod/M05-recorder`) | | Live since 27 Oct: 960 eMAG offers; eMAG product pages answered with a CAPTCHA → Tier A off (decision needed) |
| M05B | Assisted-access channel for blocked shops (prototype) | in progress | `mod/M05B-assisted` (unmerged) | | Implemented by an agent, verify script present, not yet reviewed; decided 2026-10-27 after legal advice; file the written opinion and open the vendor account (A10) |

**Gate G0** — recorder runs daily on ≥5,000 products from ≥2 shops; raw snapshots in R2; backups on. Target: assisted channel live for ≥3 of the 5 designated shops at ≥90% success within the cap. Approved: ☐ date: ____

## Phase 1 — Data core

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M06 | Core normalization (GTIN, Romanian text, brands, attributes, pricing) | review | `mod/M06-core` (merged locally into `daniel`) | | 491 tests; 696 brands; corpus ≥ 99% per field |
| M07 | Matching v1 (deterministic + review queue) | review | chain `mod/M13-product-page` (from `mod/M07-matching`) | | Eval 375 pairs: 0 false accepts; 100 founder labels still needed |
| M08 | Rollups, stats, anomaly filters, verdicts | review | chain `mod/M13-product-page` (from `mod/M08-rollups`) | | Known-answer series, quarantine, breaker; full rollup < 5 min |
| M09 | Admin v1 (sources, review queue, merge/split) | review | chain `mod/M13-product-page` (from `mod/M09-admin`) | | Magic link via Mailpit; every mutation audited |
| M10 | Source adapters batch 1 | review | `mod/M10-adapters` (merged locally into `daniel`) | | 105 listing sources: IT Galaxy, forIT, Carrefour, Dedeman, Auchan, Bonami; Flip product pages |
| M11 | Icecat enrichment | review | `mod/M11-icecat` (merged locally into `daniel`) | | Built against synthetic fixtures; flag `icecat.enabled` off until B1 |

**Gate G1** — ≥20,000 products with ≥2 live offers; audited match precision ≥98%; freshness ≥90% < 24h. Approved: ☐ date: ____

## Phase 2 — Public web MVP and launch

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M12 | Web foundation (Next.js app, design system, layout) | review | `mod/M12-web-foundation` (merged locally into `daniel`) | | Lighthouse mobile 98/95, desktop 100/100 |
| M13 | Product page, history API, click-out | review | chain `mod/M13-product-page` | | Cached TTFB p95 13 ms; worker → web revalidation |
| M14 | Search, category, brand and shop pages | in progress | `mod/M14-search` (unmerged) | | Implemented by an agent, verify script present, not yet reviewed |
| M15 | Deals page and discount verdict UI | in progress | `mod/M15-deals` (unmerged) | | Implemented by an agent, not yet reviewed |
| M16 | SEO: structured data, sitemaps, performance | in progress | `mod/M16-seo` (WIP) | | Stopped mid-work for the machine move |
| M17 | Legal and trust pages, consent, analytics, bot page | review | `mod/M17-legal` (merged into the chain) | | Lawyer review pending (B5) |
| M18 | Production deployment, backups, monitoring, staging | in progress | `mod/M18-deploy` (unmerged) | | Implemented by an agent; PITR rehearsal was running when stopped |

**Gate G2** — staging reviewed by founders; launch checklist complete (`04-plan-normal.md` §9); SRL exists; lawyer review done. Launch date: ____ ANCOM DSA notification due: launch + 45 days.

## Phase 3 — Retention, merchants, legitimacy

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M19 | Accounts and price alerts | review | `mod/M19-alerts` (merged into `daniel`) | | Independently reviewed; all high/medium findings fixed; flag `alerts.email.enabled` off until B2/B4/B5 |
| M20 | Merchant self-serve feed portal (free listing) | in progress | `mod/M20-merchants` (merged into `daniel`) | | Verify passes; migration regenerated as 0015_merchants. An independent review found 3 high issues (a domain-verification race; feed checks able to pause our crawler on any shop; suspension not hiding offers), being fixed; keep `merchants.portal.enabled` off until then |
| M21 | Bot legitimacy program and source adapters batch 2 | in progress | `mod/M21-bot-legitimacy` (WIP) | | Stopped mid-work for the machine move |
| M22 | LLM-assisted matching and attribute extraction | todo | `mod/M22-llm-matching` (empty) | | Brief in docs/HANDOFF.md §7 |
| M23 | Black Friday / fake-discount report tooling | review | `mod/M23-reports` (merged locally into `daniel`) | | Generator deterministic, reconciled with SQL; BF 2026 page waits for approved data |

**Gate G3** — alerts live with double opt-in; ≥10 merchants onboarded; Verified Bots application submitted. Approved: ☐ date: ____

## Phase 4 — Growth and monetization

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M24 | Affiliate operations (program sync, links, commissions, revenue dashboard) | review | `mod/M24-affiliate` (merged into `daniel`) | | Mocked 2Performant until A6/A7; migration regenerated as 0016_commissions |
| M25 | Promoted placements and merchant billing; optional ad slots | todo | | | |
| M26 | Browser extension (MV3) | todo | | | |
| M27 | Telegram bot and web push | in progress | `mod/M27-telegram-push` (WIP) | | Stopped mid-work for the machine move |
| M28 | B2B price intelligence MVP | todo | | | |
| M29 | Category expansion playbook and CSS enrolment readiness | todo | | | |

**Gate G4** — first revenue month recorded; extension published; B2B pilot customer. Approved: ☐ date: ____

## Founder decisions log

| Date | Decision | Options considered | Outcome |
|---|---|---|---|
| 2026-10-27 | eMAG crawling (ADR-013) | crawl politely / seek consent / extension-only / exclude | **Decided by Daniel: option A**, polite identified crawl behind a kill switch (category listings + Tier A product pages, ≤1 request/5 s, robots.txt obeyed, no images, no internal APIs, stop on first written request); lawyer review before public launch (B5); asking eMAG for consent in parallel (option B) remains open |
| | 2Performant ToS §9 clearance for price history on feed data | written clearance / own crawl of merchant pages / merchant direct feeds | pending |
| | Company: SRL formation date | | pending |
| 2026-10-27 | eMAG product pages (Tier A) after a CAPTCHA | keep Tier A off and rely on listings / retry Tier A at a slower pace after asking eMAG / stop eMAG entirely | **Pending founder decision.** Listing pages were fine (≈ 200 pages, 5 s apart); at 21:45 UTC eMAG answered the 6th product-page request (5 s apart) with a CAPTCHA (HTTP 511). The fetch layer paused www.emag.ro for 24 h (until 28 Oct 21:45 UTC), so the 28 Oct night has no eMAG observations (a gap, shown as a gap). The lead switched the Tier A source off (kill switch, audited) so the next pause does not also stop listings; nothing was retried or worked around |
| 2026-10-28 | Development and recording machine; pushing | keep the Mac / move to Daniel's Windows laptop; push only when asked / push as modules pass | **Decided by Daniel:** the build and the recorder move to his Windows laptop (Docker Desktop installed; the recorder runs there from 28 Oct, eMAG product pages stay off); `daniel` and every module branch are pushed to GitHub as soon as their verify passes; the old machine's `.env`, `data/` and a dump without login data were published under `handoff/` (checked: no keys, no emails, no rows from the user, session, audit, click or consent tables) |
| 2026-10-28 | Recording Mac sleeping on battery (operations note) | keep the Mac plugged in and awake / move the recorder to the VPS (M18) | **Needs Daniel.** From about 00:29 UTC the Mac was on battery (66 % → 61 %) and in idle sleep with short maintenance wakes. Requests in flight broke as "connection reset" and the fetch layer paused six shops for 24 h. The lead matched each reset to a sleep or wake in `pmset -g log` and lifted five pauses (audited: `fetch.unpause`); Flip stays paused (its reset matches no sleep event). Two fixes: `caffeinate -i` for 4 h from ~07:15 UTC, and since `4d46a06` a transport error that surfaces > 30 s after its own timeout counts as a local suspension (no pause). Please keep the Mac on power with the lid open, or run the recorder on a server |
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
Real-data follow-up (merged 27 Oct, `c9fa591`): on 168 labelled titles from the first live run, brand 77.4 % → 99.4 %, MPN 90.5 % → 98.8 %, accessory 91.7 % → 100 %, bundle 95.2 % → 100 % (corpus `real-live-2026-10-27.ts`, gated at ≥ 95 % per field). Over all 960 eMAG offers: accessories 51 → 7 (all real controllers), bundles 64 → 32 (new `bundleKind`: gift, game, accessory, subscription, other), offers without a brand 216 → 79; chip/size/spec words are no longer taken for MPNs (`isSpecToken`); unknown seller brands come back as `brandGuess` (confidence 0.8 with ®/™, 0.6 by position; the worker keeps ≥ 0.7). Left open: eMAG URL-slug codes are sometimes seller SKUs and win over the title's real part number (to fix in M03 + normalization); codes written with spaces; lower-case seller brands; game publishers.

Slug-MPN follow-up (`mod/M06-slug-mpn`, written before the machine move, finished and merged 28 Oct): eMAG URL-slug codes are now low-trust MPN hints (`mpn_source = 'title'`), never product fields, so a seller SKU in the slug no longer beats the title's part number; matching still accepts equal MPNs (0.98 when one side is a stated field; two guesses must also agree on the title). New CLI `pnpm --filter @pretoscop/worker renormalize [--shop] [--dry-run]` rewrites stored offers' normalized columns with the current rules (prices and price events untouched; human decisions kept; matcher-made products follow their offer). `make verify M=06` passes (live-run corpus 99.85 %); the renormalize tests cover dry run, rewrite, idempotency and identity parity with the recorder. **Dry run on the dev database (28 Oct):** 4,493 offers scanned, 708 changed, 634 slug MPNs become hints, 130 MPN values change, 193 identities change (93 back to the matcher, 100 keep their link, 0 human decisions touched), 481 matcher-made products follow; offers without a brand 455 → 387, accessories 55 → 11, bundles 177 → 145. **Not run for real yet, on purpose:** the recorder rewrites normalized columns at every observation, so it must run the new rules first (rebuild the recorder image from `daniel`), otherwise the old rules would flip the 634 MPNs back each night. Order: rebuild the recorder → back up the database → `renormalize` → `match:run`.

### M05 — Phase-0 price recorder (eMAG listings + first feeds) — 2026-10-27
(Implemented by the lead; wiring finished on the chain after M02 and M06 merged.)
Scope delivered:
- Job `source.run(sourceId)`: polite fetch (M02 with the PostgreSQL domain-state store and request-log sink) → parse (M03 registry) → full normalization (M06 `normalizeOffer`; ECB EUR rate) → `recordObservation` (PG18 upsert with old/new) → change-only `price_events` + `offer_gaps` (> 48 h without a check) → raw JSONL.gz snapshot `snapshots/{shop}/{sourceId}/{runId}.jsonl.gz` in the blob store → `ingest_runs` stats `{fetched, parsed, upserted, changed, blocked, errors, durationMs, …}` → `match.pending` and `rollup.touch`.
- Gates on every run: `CRAWL_ENABLED`, flags `crawl.enabled` and `source.emag.enabled` (ADR-013), shop status, source enabled/kill switch, fetch-layer pauses; run breaker and quarantine guard (M08).
- Schedules (Europe/Bucharest): 42 eMAG category listings from 01:00, one every 3 min; IT Galaxy, forIT and Flip sitemaps at 02:15 (budgets 1,500/1,500/1,000 pages); eMAG Tier A product pages at 03:30 (now kill-switched, see below); backups 00:30; rollup 04:30; matching every 10 min; ECB rates weekdays 17:30. URL frontier (`crawl_urls`) with Tier A selection by popularity signals; delisting by 404/410 and `markMissingOffers`; feed deactivation and the 30 % row-drop hold are in the run path (tested with fixtures).
- Operations: nightly `pg_dump` to the blob store with pruning, monthly partitions, heartbeat, health endpoint `:9464`, alert after two consecutive failures (log, plus Telegram when configured). CLIs `run:source`, `replay` (stored snapshots with their original `observed_at`, alerts suppressed), `backup`, `compare:live`. Docker profile `recorder` (`make recorder`, `recorder-logs`, `recorder-stop`), runbook `infra/runbooks/source-pause.md`.
- Live since 27 Oct 2026 from Daniel's Mac: 960 eMAG offers (phones, laptops, TVs, consoles, …), 682 products.
Out of scope / deferred: 2Performant feed runs (no account: A6/A7; the feed path is tested with fixtures); the eMAG sitemap sweep (disabled: constant `lastmod`, listings cover the launch categories); WAL archiving and the restore drill (M18, in progress).
Deviations from plan: ECB reference rates instead of BNR (curs.bnr.ro's robots.txt disallows every robot; the fetch layer refused it); one `match.pending` batch job (every 10 min and after each run) instead of a per-offer `match.offer`; eMAG Tier A switched off after the CAPTCHA (decisions log).
Verification: `make verify M=05` → lint/typecheck/tests (recorder suite: gates, 60-offer listing fixture with first events and snapshot, a second identical run writes no events, Tier A sellers, sitemap discovery, blocks and two-failure alerts), backup written (634 KB dump), live data and pauses printed, live comparison. The first live comparison used product pages: 4 match, 1 mismatch (product page without a mapped availability), then eMAG's CAPTCHA; it now reads two listing pages and was skipped while the host is paused.
Founder checklist: `scripts/verify/M05.checklist.md`.
Human tasks needed: decide eMAG product pages (decisions log); keep the Mac awake with Docker running (the recorder only records while it runs); A6/A7 for feeds; optional Telegram bot for alerts.
Risks / open questions: eMAG may extend the challenge to listing pages; the recorder depends on one home connection; the history will show a gap for 28 Oct (eMAG paused).
Next module: M07 / M08.

### M07 — Matching v1 (deterministic + review queue) — 2026-10-27
(Implemented by the lead.)
Scope delivered:
- Taxonomy and categorizer (Romanian title prefixes and shop categories → launch categories, synced to `categories`); candidates from GTIN, brand + MPN (incl. regional suffix variants) and trigram title search within the brand; scorer and router in `packages/core/src/matching.ts` with hard conflicts (brand, category, storage, RAM, capacity, screen size, volume, colour, network generation, edition words incl. "S26+", model numbers, different MPNs) and MPN provenance (field vs title: Lenovo series codes such as "14IPH11" no longer merge laptops).
- Products created from a trusted offer (provisional until ≥ 2 offers or a human check), families for phones/tablets/laptops/smartwatches/consoles, sticky aliases, merges with undo, re-matching only when the identity hash changes, `match_candidates`/`match_decisions` writes, job `match.pending`, CLIs `match:run`, `match:eval`, `match:eval:build`, `match:label`, decision table in `packages/core/MATCHING.md`.
Out of scope / deferred: LLM verification of gray-zone pairs (M22).
Deviations from plan: batch job instead of `match.offer`; per-source metrics as a query (`matchMetrics`, shown in /admin/potriviri) instead of a `match_metrics_daily` view; product slug `{title}-{id}` (the brand is in the title); title-only evidence is capped at 0.96, so it never auto-accepts in v1 and waits in the review queue (as the plan intends until M22).
Verification: `make verify M=07` → tests (core scorer/router/eval; db integration: brand + MPN product creation, regional variant, storage variant in the same family, accessories/bundles/untrusted titles unmatched, idempotent re-run, sticky alias precedence, merge and undo); eval on 375 pairs from real eMAG data (225 hard negatives from 60 families, 150 synthetic positives): 53 accepts, precision 100 %, zero false accepts. The eval found two missing rules (S26 vs S26+, Galaxy A17 5G vs 4G), now fixed with regression tests.
Founder checklist: `scripts/verify/M07.checklist.md`.
Human tasks needed: 100 founder labels (`match:label`), as the plan requires.
Risks / open questions: until M22, every cross-shop match without a GTIN/MPN agreement goes to the review queue (the queue will grow once IT Galaxy, forIT and Flip are recorded); real cross-shop positives exist only after tonight's runs: re-run `match:eval:build` in a few days; family negatives assume different field MPNs mean different products.
Next module: M09 (review queue UI), M22.

### M08 — Rollups, stats, anomaly filters, verdicts — 2026-10-27
(Implemented by the lead.)
Scope delivered:
- Jobs `rollup.daily` (04:30, last three days for every product, then stats and the outlier check) and `rollup.touch` (today and yesterday for products touched by ingestion or matching; now also expires their cached pages, see M13). `product_daily` from `price_events` + `last_checked_at` (steps extend to the last check, gaps from `offer_gaps`, Europe/Bucharest days), excluding bundles, non-new condition and trust tier 3, marketplace sellers in a separate series.
- `product_stats` (`min_30d`, `min_all_time`, `median_90d`, `drop_pct_7d`, `observations_days`, `verdict`); verdict rules in `packages/core/src/verdict.ts` (documented in `VERDICTS.md`, integer arithmetic); per-offer discount facts (§6.4: reference not supported, raise-then-cut, phantom old price, market-irrelevant discount) only when our history covers the window.
- Anomalies: outright rejects, quarantine at a ratio > 3 or < 0.33 against the offer's 14-day median with publication after two agreeing observations, admin release/reject (/admin/carantina), cross-shop 0.3× check that sends the offer back to the matcher, run breaker at > 20 % of a shop's offers moving > 50 %; EUR conversion rate stored on the event.
- `getHistory(productId, range)` (30d/90d/1y/all → daily min, marketplace and per-shop series + stats), `stats:show` CLI with a 90-day text sparkline, `perf:rollup`.
Out of scope / deferred: none.
Deviations from plan: history query lives in `packages/db/src/queries/rollup.ts`; the API returns per-day minimum, marketplace and per-shop series (median and counts stay in `product_daily`); ECB instead of BNR rates.
Verification: `make verify M=08` → known-answer series (100 → 90 → 95 with gaps), 30-day minimum, verdicts, history API shape, quarantine, breaker; full rollup of 1M events under 5 minutes.
Founder checklist: `scripts/verify/M08.checklist.md`.
Human tasks needed: none.
Risks / open questions: verdicts need ≥ 14 days of history, so every product shows "Istoric insuficient" until mid-November.
Next module: M13, M15.

### M09 — Admin v1 (sources, review queue, merge/split) — 2026-10-27
(Implemented by the lead.)
Scope delivered:
- Better Auth magic link (Mailpit in dev, Resend in production), admin role only for `ADMIN_EMAILS`, IP and User-Agent stripped from sessions; `/admin` dashboard (source health, last run, items, changes, errors, freshness against the SLO, queue depth, events today, LLM spend placeholder), sources (kill switch per source and per shop, run now), runs log, flags, quarantine, audit log.
- Review queue `/admin/potriviri`: gray-zone offers ranked by expected traffic × uncertainty, candidates with scores and conflicts, keyboard shortcuts (j/k, 1–5 accept, n new product, r reject, b bundle, a accessory, / search), search to accept another product; a random sample of 10 automatic matches for the precision audit (Corect / Greșit); decisions per source for 7 days.
- Products `/admin/produse`: search by id, GTIN, MPN or title; edit title, brand, category, provisional; add/remove GTIN (check digit validated); merge with undo and history (old URL redirects); split checked offers into a new product with sticky aliases; hide/unhide. Offers `/admin/oferte`: unlink (sticky "no product" alias), blacklist and un-blacklist.
- Every mutation writes `audit_log`, recomputes rollups (`rollup.touch`) and expires the product's cached page.
Out of scope / deferred: image management (images come from licensed sources in M11); family editing (display only); an admin view of contact requests (M17 follow-up).
Deviations from plan: `users.role` via Better Auth additional fields (migration 0007).
Verification: `make verify M=09` → lint (jsx-a11y), typecheck, tests (6 admin query tests on a throwaway database), build, Playwright: Mailpit magic-link login, kill switch and flags audited, review accept, merge (old URL redirects) and undo, no-session redirect; audit rows present for each action.
Founder checklist: `scripts/verify/M09.checklist.md`.
Human tasks needed: B2 (Resend) for production login emails.
Risks / open questions: server-action errors show the generic error page (no inline messages yet).
Next module: M13.

### M13 — Product page, history API, click-out — 2026-10-27
(Implemented by the lead.)
Scope delivered:
- `/p/[slug]` (id from the slug; a wrong or merged slug redirects permanently), data cached per product with tags `product:{id}` and `products`, invalidated by the worker (`rollup.touch` → `product:{id}`, nightly rollup → `products`; `POST /api/revalidate` with `REVALIDATE_TOKEN`, tags expire at once).
- Content order of docs/03 §7.2: title, brand, MPN/EAN, key specs (readable resolution and connectivity labels); best total now (cheapest new, in-stock, recently checked offer, marketplace sellers included and named), seller, "verificat acum …", verdict and the 30-day drop badge (shop-sold offers only) — right under the title on phones, in a sticky aside on desktop; offers ranked by availability and freshness, then total price, then the latest check, with delivery breakdown, stale offers greyed and never badged, seller badges, filters (in stock, no marketplace, used/refurbished hidden by default when new offers exist), sorting (total, price, recently checked); uPlot chart (30 d / 90 d / 1 y / all, Romanian dates, x axis on the observed part of the window, gaps never bridged, marketplace dotted, per-shop dashed); stats row; variant selector; "Magazine neincluse încă" with unverified search links; disclosures and "Raportează o eroare de preț" (→ the M17 contact queue); alert placeholder (replaced by M19).
- `/api/products/{id}/history?range=` (M08 contract); `/out/{offerId}?p=` click-out (validates, logs a click with daily-salted hashes, 302 to the shop or to an allowed affiliate link, `noindex`); basic JSON-LD.
Out of scope / deferred: search (M14), full SEO (M16), alerts (M19).
Deviations from plan: ranking puts available, recently checked offers first (published on /cum-functioneaza); k6 is not installed, so `scripts/perf/ttfb.mjs` measures TTFB (a k6 script is included); the click-out route had been hidden by a root `out/` ignore rule and is now committed.
Verification: `make verify M=13` → tests, build, Playwright (mobile + desktop: ranking by total, filters, summary before the offers on phones, 301, click-out logs a hashed click and redirects, history API), cache refresh right after `POST /api/revalidate`, cached TTFB p95 12.9 ms (200 requests, 8 concurrent).
Founder checklist: `scripts/verify/M13.checklist.md` (until cross-shop matches exist, use the throwaway fixture product it describes).
Human tasks needed: none.
Risks / open questions: most products have one offer until the sitemap shops are matched; images appear only with M11 (licensed sources).
Next module: M14.

### M17 — Legal and trust pages, consent, analytics, bot page — 2026-10-27
(Implemented by a delegated Opus agent; integrated and re-verified by the lead.)
Scope delivered:
- Shared legal page shell (table of contents, "Ultima actualizare … versiunea …", provisional-document banner on legal pages) and pages `/despre`, `/cum-functioneaza` (ranking parameters by importance per Law 363/2007 art. 7 alin. (4¹), delivery, freshness, marketplace, what never affects ranking, live coverage list), `/cum-castigam-bani`, `/metodologie` (placeholder for M23), `/pentru-magazine`, `/bot` (PretoscopBot only: UA strings, IP sentence, politeness rules matching M02, robots.txt snippets, how to stop us, feed alternative, changelog) + `/bot/ips.json` from `BOT_EGRESS_IPS`, `/termeni` (database right, TDM reservation, DSA contact point), `/confidentialitate` (one card per processing activity, processors, transfers, rights, ANSPDCP), `/cookies` (with "Schimbă preferințele"), `/accesibilitate`.
- `/contact` (seven request kinds, `?subiect=` preselection, honeypot, works without JavaScript) and `POST /api/contact` (same-site only, 16 KB cap, 5 per hour per salted session hash, `contact_requests` row, team email, DSA receipts for notices and shop objections).
- Versioned texts in `packages/config/src/legal-texts.ts` (`alertConsent.v1`, `analyticsConsent.v1`); consent banner reads them; `resetConsent()`. Legal working docs `docs/legal/ropa.md`, `dpa-list.md`, `lia-crawl.md`. Plausible CE behind the compose profile `analytics` (not started: the Docker VM has 3.8 GB).
Out of scope / deferred: CSP and the machine-readable TDM reservation in robots.txt (M16); admin view of contact requests; lawyer review (B5).
Deviations from plan: `/contact` lives in a `(forms)` route group; the lead later removed `(site)/loading.tsx` altogether (it hid streamed pages from visitors without JavaScript) and rewrote the ranking text to the order M13 implements; page text lives in TSX (no MDX); the stored analytics consent key changed to `analyticsConsent.v1`.
Verification: `make verify M=17` → config 40 tests, web 32 tests, legal docs present, build, Playwright `legal.spec.ts` 46/46; after the merge the lead re-ran the whole e2e suite on the chain: 62 passed.
Founder checklist: `scripts/verify/M17.checklist.md`.
Human tasks needed: B5 (lawyer review of the pages, `alertConsent.v1` and the legal docs), A4 (crawler IPs → `BOT_EGRESS_IPS`), B2 (Resend; contact@, privacy@, bot@ mailboxes), B4 (SRL: operator identity), sign the DPAs in `docs/legal/dpa-list.md`.
Risks / open questions: retention jobs promised on the privacy page do not exist yet; no admin action yet to suppress a seller name on objection; in-memory rate limiter (per process); OLX listed as "not yet included" because it is `blocked` in the registry (set `removed` if unwanted).
Next module: M20 / M21 (assigned to the same agent).

### M23 — Black Friday / fake-discount report tooling — 2026-10-27
(Implemented by the lead.)
Scope delivered:
- `@pretoscop/report` (pure): versioned report data `pretoscop.report/v1` (headline, by shop, seller type and category, biggest real drops, raise-then-cut cases, offer-level rows, notes, approval), the analysis (M08's rules on an event window: an offer's lowest event price against its own lowest price in the 30 days before, with ≥ 70 % coverage; displayed reductions without a real drop; raise-then-cut with 60 days of history; product drops on shop-sold offers), SVG charts following the data-viz rules (validated diverging blue/gray/red, legend + selective direct labels + table twins), Markdown and CSV renderers.
- `packages/db` `reportOffers()`: per offer and day, the in-stock price and displayed reference in effect at the end of the day (gaps absent). End-of-day states, because with change-only events a daily minimum credited the old price to the morning of a change day (a Black Friday increase read as "no change").
- CLIs `report` (JSON, Markdown, four CSVs, SVG + PNG charts via sharp, into `data/reports/<id>/`) and `report:approve` (records the founder's approval, publishes the JSON to `apps/web/src/content/reports`).
- Public pages `/rapoarte` (approved and planned reports), `/rapoarte/[id]` (hero figure, KPIs, charts readable on phones, tables, notes, downloads; a placeholder for planned reports), `/rapoarte/[id]/date/[file]` (CSV with BOM, JSON); the report rules on `/metodologie#rapoarte`.
- Press kit `docs/press-kit/` (Romanian kit and press-release template, English review checklist with the SQL spot checks).
Out of scope / deferred: the Black Friday 2026 report itself (needs the data and a founder's approval); adding approved reports to the sitemap (M16).
Deviations from plan: the generator is `pnpm --filter @pretoscop/worker report --from --to` (not `report:bf`), so it serves every event; reports live as approved JSON in the web app's content rather than in R2.
Verification: `make verify M=23` → lint/typecheck/tests (9 known-answer tests; db query test; generator test: byte-identical JSON/Markdown/CSV/SVG/PNG across runs and headline/min30 reconciled with direct SQL; web), build, Playwright report pages, a run on the Phase-0 data (821 offers, none with 30 days of history yet — stated as such).
Founder checklist: `scripts/verify/M23.checklist.md`.
Human tasks needed: approve each report (`report:approve`); confirm the data licence for reuse (e.g. CC BY 4.0) and the press contact; give shops the right of reply before a release that names them.
Risks / open questions: Black Friday 2026 comes ~4 weeks after recording started, so the 30-day comparison is barely covered and raise-then-cut (60 days) cannot be evaluated this year; eMAG's history has a gap on 28 Oct (paused after the CAPTCHA).
Next module: M16 (sitemap entries for approved reports).

### M10 — Source adapters batch 1 — 2026-10-27
(Implemented by a delegated Opus agent; integrated and re-verified by the lead.)
Scope delivered:
- Fixture recording through the polite fetcher (`pnpm --filter @pretoscop/fetch record`, `scripts/record-fixture.sh`), refusing any shop that is not `active` with `access_mode: direct`.
- Generic JSON-LD listing pages (forIT, 60 per page, next-page link, relative URLs, stray HTML entities) and new parsers `itgalaxy-listing` (EAN on some cards), `dedeman-listing`, `carrefour-listing` (ignores the wishlist link carrying another product), `vtex-listing` (Auchan: page state, not the VTEX API; EAN everywhere), `bonami-listing`, `flip-product` (refurbished; grade in `raw.grade`; Flip's stated 30-day minimum as reference; its "0 lei delivery" ignored because it contradicts Flip's courier fee).
- Registry: 105 listing sources (IT Galaxy 25, forIT 25, Carrefour 23, Dedeman 19, Auchan 11, Bonami 2) staggered from 02:15 Bucharest, page caps kept under each daily budget by a test, freshness 26 h; IT Galaxy and forIT sitemap sweeps disabled (one request per product; forIT's sitemaps exceed the 15 MiB cap); Flip keeps its sitemap (SLO 192 h).
- Delivery rules only as the shops state them: Dedeman locker 11 lei; Flip courier 19,99 / locker 11,99 lei; forIT per offer; IT Galaxy, Carrefour, Auchan and Bonami state no fee (left unknown).
- A listing page whose products are all unavailable ends the run normally. Tests: 16 parser tests, 8 recorder end-to-end cases with the real normalizer, 3 registry checks.
Out of scope / deferred: Libris, Elefant, JYSK (no electronics; Phase 4); blocked shops (M05B / feeds).
Deviations from plan: listing pages instead of sitemap sweeps for IT Galaxy and forIT; Auchan read from page HTML.
Verification: `make verify M=10` → OK (extractors 47, config 24, fetch 194, worker 27 tests; fixtures parse; registry table; a blocked shop is refused). After the merge the lead ran the whole monorepo suite (35/36 tasks; the mailer package has no tests and passes on its own) and restarted the recorder with the new sources on 28 Oct 01:4x Bucharest. Live probes, 27 Oct 21:34–21:47 UTC: 33 requests, ≥ 5 s apart per host, none blocked.
Founder checklist: `scripts/verify/M10.checklist.md`.
Human tasks needed: read the six shops' terms; confirm the delivery amounts and add courier fees where shops state none; decide whether Dedeman's "Verifică disponibilitatea online" counts as in stock (recorded as unknown); decide on Auchan's VTEX API (allowed by robots.txt, terms not read).
Risks / open questions: markup changes show as failing sources; Auchan pages are 4.4 MB and mostly unavailable products (the hold rule may alert); Flip records only the default grade.
Next module: M11.

### M11 — Icecat enrichment — 2026-10-27
(Implemented by a delegated Opus agent; integrated by the lead.)
Scope delivered:
- `@pretoscop/icecat`: Open Icecat client through the polite fetcher (Icecat's robots.txt obeyed, as its licence requires) with lookup classes found / not found / restricted (Apple) / Full-Icecat-only (Sony) / cap reached / stop (a plain per-product 403 lifts the fetch layer's pause; a CDN 403, 429 or robots refusal stops the run), monthly cap counted before each datasheet request, pure mapper to `product_specs.data`, licensed image copies (120/400/800 px), licence texts, a local mock server.
- Job `icecat.sync` (05:30, flag `icecat.enabled` off and `ICECAT_USERNAME` required): GTIN, then brand + MPN, Romanian then English; up to 6 images; primary image only when none; confirms provisional products found by GTIN; misses remembered 30 days; monthly refresh; alerts on stop or cap. CLIs `icecat:lookup`, `icecat:coverage`, `icecat:sync`, `icecat:demo`.
- Product page: "Specs Icecat" credit linked to icecat.biz whenever specs or images come from Icecat. ADR-016: Icecat data is isolated (GTINs never copied into `product_gtins`/`products`).
Out of scope / deferred: real responses (no account).
Deviations from plan: fixtures hand-written to the documented shape and labelled `_synthetic`; per-product API lookups instead of index files; counters and misses in existing tables (`fetch_domain_daily` host `icecat:<LANG>`, `product_specs` rows with `source = 'icecat-miss'` — readers must filter on `source`); `is_icecat` as `source = 'icecat'`; images in the local blob store.
Verification: `make verify M=11` → OK (icecat 16 tests, 6 end-to-end sync tests, web 7), licence checks, offline demo (3 found, 1 not found, 1 restricted, 1 Full-only, 5 images).
Founder checklist: `scripts/verify/M11.checklist.md`.
Human tasks needed: B1 (Open Icecat account); read and file the Open Content Licence (open item 40); keep `icecat.enabled` off until then and until M16 blocks AI crawlers in robots.txt (`ICECAT_ROBOTS_DISALLOW_AGENTS`).
Risks / open questions: `live.icecat.biz/robots.txt` never read (bot wall): check once with `icecat:lookup` after creating the account; real responses may differ from the synthetic fixtures; schema wishes: `icecat_usage` and `icecat_lookups` tables, a unique index on `product_images(product_id, sha256)`.
Next module: M16 (robots.txt AI-crawler rule), M22 (keep Icecat rows out of prompts).

### M24 — Affiliate operations — 2026-10-28
(Implemented by a delegated Opus agent before the machine move; merged and re-verified by the lead on the Windows laptop. The agent's own report was lost in the move; this one is rebuilt from the branch.)
Scope delivered:
- `@pretoscop/core` `affiliate.ts`: `affiliateAllowed` (approved program, comparator policy `allowed` or `written_ok`, offer URL on the shop's own domain, never eMAG per ADR-013) and `buildAffiliateUrl` for 2Performant quicklinks, Awin, CJ and Tradedoubler with our click id as sub-id; `comparatorPolicyFrom2P` reads 2Performant's "Price Comparison Services" permission, including its end date (180 days' notice).
- 2Performant client (tested against a local mock), job `affiliate.sync` (05:15) that updates `affiliate_programs.comparator_policy`, job `commissions.import` (06:15) and the CLI `commissions:import` (RFC 4180 CSV, `,` or `;`, Romanian or English headers, per-status reconciliation, unreadable lines reported).
- Migration `commissions` (now `0016_commissions`); click-out decides at click time and logs `is_affiliate`/`placement`; the product page labels exactly the offers that would get an affiliate link.
- `/admin/venituri`: clicks, affiliate clicks, commissions, EPC and conversion by shop and day; monthly totals per network for the accountant (CSV); the program list with permissions. `/cum-castigam-bani` lists partner shops live and says "no revenue" only while there are none.
Out of scope / deferred: live network calls (no accounts yet: A6/A7, C4); Profitshare is typed but has no builder yet.
Deviations from plan: networks other than 2Performant have link builders but no API sync (their programs are entered by hand until accounts exist); the flag `affiliate.links.enabled` stays off.
Verification: `make verify M=24` on the Windows laptop → lint/typecheck/tests (core, db, worker, web) green; the commission CSV reconciles with the fixture report (`paid 1 commissions 1234.56 lei`); production build; Playwright 5/5 (allowed program → labelled affiliate link carrying our click id; the real program sync marks it forbidden → plain link; eMAG always plain; product page click-out). The lead had to run that e2e on one worker: with Playwright's default of 12 parallel workers on this machine, the product spec raced the affiliate spec's temporary program. Full suite on `daniel` after the merge: 39/39 tasks.
Founder checklist: `scripts/verify/M24.checklist.md`.
Human tasks needed: A6/A7 (2Performant account, program approvals, ToS §9 clearance), C4 (Awin/CJ/Tradedoubler accounts), B4 (SRL for payouts), B7 (bank account); then set `TWOPERFORMANT_*` in `.env` and turn on `affiliate.links.enabled`.
Risks / open questions: comparator permissions can be withdrawn with notice (the nightly sync catches it, but only for 2Performant); commission reports are imported by CSV until the API import is tested with a real account.
Next module: M25 (promoted placements; needs M20 and M24).

### M19 — Accounts and price alerts — 2026-10-28
(Implemented by a delegated Opus agent before the machine move; merged by the lead on the Windows laptop, then independently reviewed by a second Opus agent, which also implemented the fixes; the lead reviewed the fix diff and re-verified. The original agent's report was lost in the move; this one is rebuilt from the branch.)
Scope delivered:
- `@pretoscop/core` alert rules (decisions in integer bani, target-price parsing, quiet hours 22:00–08:00 Romania time, email checks); `@pretoscop/notify` (signed confirmation/unsubscribe links with HMAC-SHA256, address hash, Romanian alert emails with sender identity); `@pretoscop/mailer` (Mailpit in dev, Resend in production).
- Migration `0014_alerts`: `alerts` (consent evidence: time, daily-salted IP hash, text version; double opt-in), `alert_sends` (outbox claimed by compare-and-set), `consent_records` (evidence ledger kept 3 years after withdrawal), `email_suppressions` (hashes only).
- Worker: `alerts.evaluate` (after rollups and price changes, nightly 07:30), `alerts.deliver` (one message per user and channel, offer re-checked before sending, suppression honoured, retries), `alerts.retention` (03:20: pending requests, unverified accounts, 24-month inactivity notice then deletion, consent pruning, sends after 13 months, clicks/events minimized after 90 days, expired login tokens), CLIs `alerts:run` and `alerts:simulate`.
- Web: the alert form on product pages (unticked consent with the versioned text, works without JavaScript), double opt-in and one-click unsubscribe pages (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058), `/alerte` (magic-link login, list, edit, delete, stop all, export JSON, delete account), the Resend bounce/complaint webhook (Svix signature), `/admin/alerte` (volumes, failures, data-subject requests).
Independent review (28 Oct) and fixes: 2 high, 3 medium and 13 low findings; all high and medium ones and most low ones fixed with regression tests:
- **High:** magic-link emails could be sent without limit (Better Auth's limiter was disabled by `disableIpTracking`). Now every login path is capped at 5 emails per address per hour (in the database) and 20 per client per 15 minutes, with the same answer either way.
- **High:** two products merged into one target broke the nightly retention job for good. Merges are now deduplicated along the whole merge chain, and each retention step runs on its own with an ops alert when one fails.
- **Medium:** a briefly stale or out-of-stock cheapest offer could trigger a repeat "below target" email at an unchanged price. Its last known price is now kept for 7 days, and implausible prices are ignored.
- **Medium:** `alerts:simulate` emailed every real subscriber. It now sends only to named addresses and refuses `APP_ENV=prod`.
- **Medium:** production now refuses to start with the placeholder sender identity or, on Resend, without the webhook secret; staging warns.
- **Low, also fixed:** limiters keyed on the IP hash only; capped request bodies; Resend idempotency keys; advisory locks against double-submit races; export includes the suppression status; paused-alert wording.
Out of scope / deferred: push and Telegram (M27); React Email templates (plain string templates instead: recorded deviation); recorded but not changed: batching per time window, consent text for the logged-in path (lawyer, B5), consent records of deleted products, "any variant" alerts on an inactive variant, separate keys for link signing and address pseudonyms (rotation).
Deviations from plan: ADR-017 (renumbered at merge: M11 took ADR-016); login and alert-form limits documented in `apps/web/README.md`.
Verification: `make verify M=19` on `daniel` after the fixes → lint/typecheck/tests green (core 779, db 71, worker 71, web 51, config 46, notify 12, mailer 2), production build, Playwright 9/9 (consent, double opt-in, drop email with List-Unsubscribe, dedupe, unsubscribe incl. one-click POST, export/delete, no-JS form, login cap on every path, cross-site refusal, per-IP limit regardless of User-Agent, suppressed address, daily confirmation cap, hash formats), no test data left; admin login e2e 4/4. Full suite on `daniel`: 39/39 tasks.
Founder checklist: `scripts/verify/M19.checklist.md` (simulation now `pnpm alerts:simulate <productId> 10 --email <your address>`).
Human tasks needed: B2 (Resend domain, `RESEND_WEBHOOK_SECRET`), B4 (SRL: the legal name and postal address in every email; production will not start without them), B5 (lawyer: `alertConsent.v1`, including the logged-in path wording).
Risks / open questions: per-IP limits trust `cf-connecting-ip`/`x-forwarded-for`, so the production proxy must overwrite them (M18); in-memory limiters are per process (the per-address caps are in the database); retried delivery groups that gain rows get a new idempotency key.
Next module: M27 (Telegram and web push, on top of these fixes).
