# Pretoscop — Progress tracker

Single page the founders read to supervise the build. The implementing agent updates it at the start and end of every module. Statuses: `todo` → `in_progress` → `review` (founder verifies with the module's checklist) → `done`, or `blocked` (say on what). Phase gates (G0–G4) require explicit founder approval before the next phase starts.

Last updated: 2026-10-27 (autonomous build session started; see "Build session mode" below).

## Build session mode (2026-10-27)

Daniel asked the implementing agent to build the whole plan while the founders are away. His instructions for this session: one local branch `mod/MXX-*` per module, merged into `daniel` with `--no-ff` once `make verify M=XX` passes; nothing is pushed to GitHub; phase gates are marked **awaiting founder approval** and the build continues; no external credentials yet, so every integration runs against a local stand-in (filesystem blob store for R2, Mailpit for email, recorded responses for vendors); live, polite crawling from Daniel's Mac is allowed and the recorder is left running. Every module below in status `review` still needs the founders' 5-minute check.

## Phase 0 — Record prices now (target: running before 6 Nov 2026)

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M00 | Repo scaffold and dev environment | review | `mod/M00-scaffold` (merged locally into `daniel`) | | CI workflow written but not run (nothing pushed) |
| M01 | Database schema v1 and migrations | todo | | | |
| M02 | Polite fetch layer and robots.txt | todo | | | |
| M03 | Extractors: structured data and feed mappers | todo | | | |
| M04 | Shop registry and configuration | todo | | | |
| M05 | Phase-0 price recorder (eMAG listings + first feeds) | todo | | | eMAG decided 2026-10-27: option A (see decisions log) |
| M05B | Assisted-access channel for blocked shops (prototype) | todo | | | decided 2026-10-27 after legal advice; file the written opinion and open the vendor account (A10) |

**Gate G0** — recorder runs daily on ≥5,000 products from ≥2 shops; raw snapshots in R2; backups on. Target: assisted channel live for ≥3 of the 5 designated shops at ≥90% success within the cap. Approved: ☐ date: ____

## Phase 1 — Data core

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M06 | Core normalization (GTIN, Romanian text, brands, attributes, pricing) | todo | | | |
| M07 | Matching v1 (deterministic + review queue) | todo | | | |
| M08 | Rollups, stats, anomaly filters, verdicts | todo | | | |
| M09 | Admin v1 (sources, review queue, merge/split) | todo | | | |
| M10 | Source adapters batch 1 | todo | | | |
| M11 | Icecat enrichment | todo | | | |

**Gate G1** — ≥20,000 products with ≥2 live offers; audited match precision ≥98%; freshness ≥90% < 24h. Approved: ☐ date: ____

## Phase 2 — Public web MVP and launch

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M12 | Web foundation (Next.js app, design system, layout) | todo | | | |
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

