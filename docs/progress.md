# Pretoscop — Progress tracker

Single page the founders read to supervise the build. The implementing agent updates it at the start and end of every module. Statuses: `todo` → `in_progress` → `review` (founder verifies with the module's checklist) → `done`, or `blocked` (say on what). Phase gates (G0–G4) require explicit founder approval before the next phase starts.

Last updated: 2026-10-27 (plan written, nothing implemented yet).

## Phase 0 — Record prices now (target: running before 6 Nov 2026)

| Module | Name | Status | Branch / PR | Verified by founder | Notes |
|---|---|---|---|---|---|
| M00 | Repo scaffold and dev environment | todo | | | |
| M01 | Database schema v1 and migrations | todo | | | |
| M02 | Polite fetch layer and robots.txt | todo | | | |
| M03 | Extractors: structured data and feed mappers | todo | | | |
| M04 | Shop registry and configuration | todo | | | |
| M05 | Phase-0 price recorder (eMAG listings + first feeds) | todo | | | founder decision on eMAG required (ADR-013) |
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
| | eMAG crawling (ADR-013) | crawl politely / seek consent / extension-only / exclude | pending |
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

(none yet)
