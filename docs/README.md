# Pretoscop documentation

Everything needed to understand, decide and build Pretoscop. Written 2026-10-27 from a research round (10 agents, ~900 KB of sourced notes) and the founders' brief; the prototype on branch `main` was used only as background.

## Reading order

| # | Document | Who reads it | What it answers |
|---|---|---|---|
| 1 | [01-research-report.md](01-research-report.md) | founders | What the market, competitors, data channels, law and money look like, with sources |
| 2 | [02-product-and-scope.md](02-product-and-scope.md) | everyone | What we build, for whom, principles, MVP scope, success metrics, assumptions |
| 3 | [03-architecture.md](03-architecture.md) | implementer, founders | Stack, repository layout, data model, pipelines, SEO, ops, costs, ADRs |
| 4 | [04-plan-normal.md](04-plan-normal.md) | founders | The narrative plan: strategy, decisions, phases, timeline, launch checklist, budget |
| 5 | [05-plan-modular.md](05-plan-modular.md) | implementer, founders | The same plan as 30 modules with contracts, tests and 5-minute founder checks |
| 6 | [06-retailer-targets.md](06-retailer-targets.md) | everyone | Per-shop status: affiliate program, bot access, structured data, channel, phase |
| 7 | [07-legal-compliance-checklist.md](07-legal-compliance-checklist.md) | founders, implementer | Each obligation mapped to the module that implements it |
| 8 | [08-monetization-playbook.md](08-monetization-playbook.md) | founders | Revenue streams in order, numbers, growth channels, outreach templates |
| 9 | [09-external-setup-checklist.md](09-external-setup-checklist.md) | founders | Accounts, company, legal and payment tasks only humans can do, by phase |
| 10 | [10-risk-register.md](10-risk-register.md) | founders | Risks with triggers and responses |
| 11 | [11-glossary.md](11-glossary.md) | everyone | Terms |
| 12 | [12-blocked-shops-strategy.md](12-blocked-shops-strategy.md) | founders, implementer | How we get prices from shops that limit bots: identity, feeds, partnerships, the assisted-access channel for the prototype, and what stays excluded |
| 13 | [13-open-items.md](13-open-items.md) | founders | Gap register: every research gap with its status (closed, partial, login-gated) and the exact action that closes it |
| — | [progress.md](progress.md) | everyone | Live status of modules and gates; founder decisions log; module reports |
| — | [research/](research/) | reference | The full research notes (sourced) behind the report |

Repository guidance for the implementing agent is in [`../CLAUDE.md`](../CLAUDE.md).

## The three decisions to make before building

1. **eMAG** (ADR-013; `04-plan-normal.md` §3.1): crawl politely under a kill switch (recommended default), ask eMAG in parallel, extension-only fallback, or exclude.
2. **2Performant ToS §9**: get written clearance for using feed data in price history; until then, history for feed shops comes from our own observation of their public pages or from merchant direct feeds.
3. **Company**: form the SRL before launch (start on profit tax; opt into the micro regime from the next 1 January once a founder can be on a minimum-wage contract).
4. **Blocked shops policy** (`12-blocked-shops-strategy.md` §0): decided on 2026-10-27 after legal advice: an assisted-access channel through a commercial data-collection service for the prototype, with an exit per shop to feeds or allowlists. Remaining actions: file the written opinion and open the vendor account (setup A10).

## What to do this week (before eMAG's Black Friday on 6 November 2026)

1. Register `pretoscop.ro` and the other domains; create Cloudflare, Hetzner and GitHub accounts (`09-external-setup-checklist.md` §A).
2. Open the 2Performant account and apply to the programs listed there; ask about ToS §9 in writing.
2b. Open the assisted-access vendor account with a spend limit and file the written legal opinion (A10).
2c. After 28 October, check the outcome of the cookie "reject all" bill (Pl-x 455/2026) and work through the login-gated items in `13-open-items.md` (about an hour in total).
3. Decide on eMAG and record it in `progress.md`.
4. Start the implementing agent on M00–M05 (`05-plan-modular.md` Part B) so the recorder runs before 6 November.
