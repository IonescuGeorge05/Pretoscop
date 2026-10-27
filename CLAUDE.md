# CLAUDE.md — Pretoscop

Pretoscop is a Romanian price-comparison and price-history platform: for any product, every Romanian online shop selling it, ranked by total price (price + delivery), with our own observed price history from launch day. Two founders supervise; AI coding agents implement.

## Read first (in this order)

1. `docs/README.md` — map of all documents and how to use them.
2. `docs/02-product-and-scope.md` — what we build, principles, what is out of scope.
3. `docs/03-architecture.md` — stack, repository layout, data model, pipelines, ADRs. It wins over any plan text.
4. `docs/05-plan-modular.md` — the module you are implementing, its contract and verification steps. `docs/04-plan-normal.md` is the narrative version of the same plan.
5. `docs/progress.md` — current status; update it when you start and finish a module.
6. `docs/12-blocked-shops-strategy.md` — how we handle shops that limit bots (read before touching `packages/fetch` or any adapter for a blocked shop).
7. `docs/13-open-items.md` — what is still unverified and who closes it; never present an open item as settled.
8. `docs/01-research-report.md` and `docs/research/notes/` — evidence behind decisions (consult when a decision seems odd).

## Non-negotiable rules

- **Identified crawler by default.** Identify as `PretoscopBot/1.0 (+https://pretoscop.ro/bot)`, obey robots.txt (RFC 9309), per-domain minimum interval (default 5 s), pause a source on 403/429/challenge. Never add self-built stealth/anti-detection libraries, CAPTCHA or challenge solvers, residential proxy integrations, browser-fingerprint spoofing, or calls to undocumented shop APIs. Blocked shops join via feeds, merchant onboarding or allowlisting.
- **Assisted-access channel** (`docs/12-blocked-shops-strategy.md` §0 and layer 2b; ADR-015; module M05B): only for shops whose `access_mode` the founders set to `assisted`, only through the vendor client in `packages/fetch/assisted`, with the same politeness and budgets, public product/category/sitemap pages only, a cost ledger with a hard cap, per-shop kill switch and auto-pause. Never extend it to another shop (eMAG included) without a founder decision recorded in `docs/progress.md`.
- **Every source has a kill switch** (`shop_sources.kill_switch`, feature flags). eMAG is isolated per ADR-013 and only enabled by the founders.
- **Never fabricate history.** Price points come only from observations; steps extend to `last_checked_at`; no interpolation.
- **Images only from licensed sources** (affiliate/merchant feeds, Open Icecat with attribution). Never hotlink or copy images from crawled pages.
- **Icecat data stays in `product_specs`/`product_images`** and is never exported into B2B products or used for AI training.
- **Personal data minimization.** Hash IPs/UAs with a rotating salt, store consent evidence for alerts, provide export/delete.
- **No secrets in git.** `.env` files are ignored; use `.env.example` with placeholders.
- **Romanian correctness.** Comma-below diacritics (ș, ț) canonical; prices formatted `1.234,56 lei`; UI strings in Romanian, code and docs in English.

## Working agreement (supervision)

- One module per branch `mod/MXX-short-name`, one PR per module, small commits. Do not start the next module until the current one is in `review` in `docs/progress.md` (phase gates need explicit founder approval).
- Each module ends with: `make verify M=XX` passing, the module report (template in `docs/progress.md`) in the PR description and in `docs/progress.md`, and nothing outside the module's declared scope touched without saying so.
- Deviations from the plan are allowed when justified; record them in the module report and, if architectural, as a new ADR row in `docs/03-architecture.md` §14.
- Tasks that only humans can do (accounts, payments, legal decisions) are listed in `docs/09-external-setup-checklist.md`. Ask for them in the module report; do not block silently and do not work around them.
- Commit messages: imperative, English, prefixed with the module id (`M07: add brand alias matching`).

## Conventions

- pnpm workspaces + Turborepo; Node 24 LTS; TypeScript strict; ESLint + Prettier; Vitest for unit/integration; Playwright for a few e2e flows.
- `packages/core` and `packages/extractors` are pure (no I/O); test them exhaustively with fixtures under `packages/extractors/fixtures/<shop>/`.
- Database changes only through Drizzle migrations in `packages/db/migrations`; partitions and rollups may use raw SQL files executed by migrations.
- Money: `numeric(12,2)` RON incl. VAT; never floats. Time: `timestamptz`, UTC in the database, Europe/Bucharest in the UI.
- Jobs: pg-boss, idempotent handlers, each run writes `ingest_runs`.
- Logging: pino JSON; every log line from a source job includes `source_id`, `run_id`, `shop`.
- Feature flags for anything that touches a shop, money, or email.

## Commands (expected after M00)

```bash
make dev            # docker compose up (postgres, meilisearch, mailpit) + web + worker in watch mode
make test           # lint, typecheck, unit + integration tests
make verify M=07    # the acceptance checks for module 07 (prints a human checklist at the end)
make seed           # fixture catalogue for local development
make migrate        # run pending migrations
```
