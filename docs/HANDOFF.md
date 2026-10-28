# Handoff: moving Pretoscop to a new machine (28 Oct 2026)

For the founders setting up the new machine and for the next Claude Code session that continues
the build. Read this first, then `CLAUDE.md` and `docs/progress.md`.

## 1. Where things stand

- **Integration branch: `daniel`.** It holds M00–M13, M17, M23, M10 and M11, all marked `review` in
  `docs/progress.md` with their module reports. Every module there passes its `make verify M=XX`.
- **Ten more modules are implemented or partly implemented on their own branches** (section 4).
  Parallel agents built them and were stopped mid-work for the move. Their unfinished changes are
  committed as `WIP` commits; nothing was lost.
- **Everything is on GitHub** (`origin` = github.com/IonescuGeorge05/Pretoscop), pushed on
  28 Oct 2026 at Daniel's request: `daniel` and all `mod/*` branches.
  - GitHub push protection rejected the first push, because three recorded eMAG pages
    (`packages/extractors/fixtures/emag/*.html`) contained the Mapbox and Google browser keys eMAG
    embeds in its HTML.
  - Those keys were redacted with same-length placeholders in every commit from M03 on (`git
    filter-branch`), so commit hashes from M03 onwards differ from the ones in older notes and
    agent messages.
  - The redaction doesn't affect parsing: the parsers never read those keys.
- **The recorder ran from 27 Oct.** The dev database holds 4,493 offers (eMAG 960, forIT 2,246,
  IT Galaxy 1,109, Bonami 104, Dedeman 34, Carrefour 24, Flip 12, Auchan 4) and 2,679 products.
  131 products already have offers from two or more shops. That price history is the most valuable
  thing to carry over: it starts the 30-day windows that verdicts and the Black Friday report need.
- **Everything on the old machine is stopped:** agents, Docker containers (volumes kept), Docker
  Desktop, `caffeinate`, dev servers.

## 2. What comes with the repo (nothing to copy by hand)

Everything the new machine needs is in git, on `daniel`, in the folder `handoff/` (see
`handoff/README.md`). The GitHub repo is **public**, so that folder holds only what is safe to
publish:

| In the repo | What it is |
|---|---|
| `handoff/dev.env` | The old machine's `.env`. Dev defaults only (no real credentials), plus `CRAWL_ENABLED=true` and `ADMIN_EMAILS` |
| `handoff/db/pretoscop-dev-2026-10-28.public.sql.gz` | The dev database from 28 Oct 2026 08:19 UTC (plain SQL, gzip): shops, offers, products, matches and all price history. **No login data**: the rows of `users`, `sessions`, `accounts`, `verifications`, `audit_log`, `clicks`, `contact_requests`, `events`, `consent_records`, `email_suppressions`, `alerts` and `alert_sends` are left out, as is the pg-boss queue (the worker recreates it). Test-restored: 4,493 offers, 2,679 products, 4,493 price events, 15 migrations |
| `handoff/data/` | The old `data/` folder: run snapshots (`blobs/snapshots`), generated reports, probe and discovery notes. The nightly full backups (`blobs/backups`) are left out because they contain the login data |

Kept only on the old Mac (`data/handoff/`): the full custom-format dump with the login data, its
`.sha256`, and a git bundle of all branches (a fallback if GitHub is unreachable).

## 3. Setting up the new machine

Prerequisites:
- Docker Desktop: give its VM **at least 6 GB** of memory; 3.8 GB was too tight when several test runs shared PostgreSQL.
- Node 24 (`.nvmrc`). The old shell ran 22.17; everything works on ≥ 22.12, but use 24.
- `corepack enable` for pnpm 10.34.9, and git.
- **The machine must stay awake and on power while the recorder runs** (section 6).

```bash
# Code: every branch from GitHub (offline alternative: git clone data/handoff/pretoscop-all-branches.bundle pretoscop)
git clone https://github.com/IonescuGeorge05/Pretoscop.git pretoscop && cd pretoscop
git checkout daniel
for b in $(git branch -r | grep -E 'origin/mod/' | sed 's#origin/##'); do git branch --track "$b" "origin/$b" 2>/dev/null; done

# Settings, local data and dependencies (from the repo's handoff/ folder)
cp handoff/dev.env .env
mkdir -p data && cp -R handoff/data/. data/
corepack enable && pnpm install
pnpm --filter @pretoscop/web exec playwright install chromium

# Services and the recorded data
make services                               # PostgreSQL 18 + pgvector (runs under an init process), Meilisearch, Mailpit
gunzip -c handoff/db/pretoscop-dev-2026-10-28.public.sql.gz | \
  docker compose -f infra/docker-compose.dev.yml -p pretoscop exec -T postgres psql -q -v ON_ERROR_STOP=1 -U pretoscop -d pretoscop
make migrate                                # no-op on `daniel` (the dump is already at or past its schema)
# Restore into the fresh, empty database that `make services` creates (no --clean in a plain dump).
# Admin users are not in the dump: log in again at /admin with an address from ADMIN_EMAILS.

# Checks
make test
make verify M=13                            # product page end to end (throwaway fixture product, removed afterwards)
make dev                                    # http://localhost:3000; admin at /admin (magic link arrives in Mailpit, http://localhost:8025)

# The nightly recorder (only once the machine stays awake)
make recorder && make recorder-logs
```

The dump also contains the M19 `alerts` tables (an agent applied migration `0014_alerts` to the
dev DB). `daniel`'s code ignores them; they line up when M19 is merged (section 5).

## 4. Work on branches (not yet merged into `daniel`)

| Branch | Module | State when stopped | First thing to do |
|---|---|---|---|
| `mod/M14-search` | M14 search, category, brand, shop pages (Meilisearch) | Implemented, verify script present | `git merge daniel`, `make verify M=14` |
| `mod/M15-deals` (on M14) | M15 deals page `/reduceri`, price badges | Implemented, verify script present | `make verify M=15` |
| `mod/M16-seo` (on M15) | M16 robots.txt, sitemaps, structured data, OG image | **WIP** (last commit). The agent was chasing a 404 rendered as Next's error document (`<html id="__next_error__">`), i.e. a failing shell render | Finish M16, then `make verify M=16`. Include approved reports (`/rapoarte/*`) in the sitemap and the AI-crawler block M11 needs (`ICECAT_ROBOTS_DISALLOW_AGENTS`) |
| `mod/M18-deploy` | M18 production compose (Caddy edge, pgBackRest + MinIO, two web replicas), backups, monitoring, runbooks | Implemented; the point-in-time-restore rehearsal was running when stopped | Re-run its rehearsal, `make verify M=18` |
| `mod/M05B-assisted` | M05B assisted-access channel (mocked Zyte API, ledger, cap, kill switch) | Implemented, verify script present | `make verify M=05B`. Stays off: no shop has `access_mode: assisted` |
| `mod/M19-alerts` | M19 accounts and price alerts (double opt-in, unsubscribe, export/delete) | Implemented. Migration `0014_alerts` | **Merge first** (section 5), `make verify M=19` |
| `mod/M27-telegram-push` (on M19) | M27 Telegram bot and web push | **WIP**: push controls, channels section, privacy page text | Finish, `make verify M=27` |
| `mod/M20-merchants` | M20 merchant self-serve feed portal | Implemented. Migration `0014_merchants` | Merge after M19/M27 with the migration regenerated |
| `mod/M21-bot-legitimacy` (on M20) | M21 bot page, Web Bot Auth (off), canary job, dossiers, outreach | **WIP**: verify script and e2e not run. Migrations `0015_extractor_canaries`, `0016_outreach` | Finish, regenerate migrations |
| `mod/M06-slug-mpn` | eMAG URL-slug codes made low-trust; `renormalize` CLI | Partly done (check `git log`): the renormalize DB test was being written | Finish, then run `renormalize --dry-run` on the dev DB |
| `mod/M22-llm-matching` | M22 LLM verification of gray-zone matches | **Not started** (same commit as M06-slug-mpn) | Start from the brief in section 7 |
| `mod/M24-affiliate` | M24 affiliate operations | **Complete** (lead): link builders, 2Performant sync and commission import (mocked), click-time links with click-id sub-ids, `/admin/venituri`, live partner list. Migration `0014_commissions` | Merge after M19, M27, M20, M21 with the migration regenerated |

Not started: **M25** (promoted placements; needs M20 + M24), **M26** (browser extension; scoped in
section 7), **M28** (B2B; needs M20), **M29** (beauty and books playbook; needs M10 + M24).

Agent branches whose names start with `worktree-agent-*` are the agents' scratch branches; the
`mod/*` branches carry everything.

## 5. Merge plan (the order matters for migrations)

Drizzle applies a migration only if its journal timestamp (`when`) is later than the last one the
database applied. Several branches each added a `0014_*`. Keep the timestamps increasing in journal
order:

1. Merge `mod/M19-alerts` into `daniel` first, unchanged. Its `0014_alerts` keeps its timestamp,
   which is already applied in the dev DB.
2. Finish `mod/M27-telegram-push` and merge it (`0015_channels`).
3. For each of M20, M21 and M24, in that order: merge into `daniel`, then **regenerate** its
   migrations instead of renumbering by hand:
   - delete that branch's migration `.sql`, its `meta/00xx_snapshot.json` and its `meta/_journal.json`
     entry;
   - run `pnpm --filter @pretoscop/db generate --name <name>`, which writes `0016_…`, `0017_…` with a
     correct snapshot chain and a fresh timestamp;
   - re-apply any hand edits (check the old SQL first);
   - run `make migrate` and the module's verify.
4. Merge M14 → M15 → M16, M18 → M05B and M06-slug-mpn when each verify passes. These have no
   migrations; expect conflicts in `apps/worker/src/jobs/index.ts`, `packages/db/src/index.ts`,
   `.env.example`, `packages/config/src/env.ts`, `KNOWN_FLAGS` and `docs/03` ADR numbers
   (union-merge them).
5. After every merge: `pnpm install`, `pnpm turbo run lint typecheck test`, then the module's
   `make verify`. Write the module report into `docs/progress.md`; reports for M24 and the agents'
   modules are not written yet. The agents' own summaries were in their hand-backs; reconstruct
   them from `git log` and each branch's `scripts/verify/MXX.checklist.md`.

## 6. The recorder, live crawling and what happened on 27–28 Oct

- **Schedules (Europe/Bucharest):**
  - eMAG: 42 category listings from 01:00.
  - IT Galaxy, forIT, Carrefour, Dedeman, Auchan, Bonami: 105 listing sources from 02:15.
  - Flip: sitemap at 02:15.
  - Other jobs: backups 00:30, rollup 04:30, matching every 10 minutes, ECB rates on weekdays at 17:30.
- **eMAG** answered product pages with a CAPTCHA (HTTP 511) on 27 Oct 21:45 UTC. The fetch layer
  paused `www.emag.ro` until **28 Oct 21:45 UTC** (stored in the DB, so the pause carries over), and
  the Tier A product-page source is kill-switched. Listings resume by themselves after the pause.
  Decision pending (decisions log).
- **The old Mac slept on battery overnight.** In-flight requests broke as "connection reset" and the
  fetch layer paused six shops for 24 h. Five pauses were lifted after matching each reset to a
  sleep or wake in `pmset -g log` (audit action `fetch.unpause`). **Flip** stays paused until
  29 Oct 00:23 UTC. Since commit `4d46a06`, a transport error that surfaces more than 30 s after its
  own timeout is logged as `local_suspend` and never pauses a shop. The old recorder image predates
  that commit; `make recorder` on the new machine builds it fresh.
- **Keep the recording machine plugged in and awake** (System Settings → Battery/Energy: prevent
  automatic sleep; or `caffeinate -is` while the recorder runs). The real fix is a small server:
  M18's production compose is ready for one.
- **Two dev-environment fixes are on `daniel`.**
  - PostgreSQL runs with `init: true` and an exec-form healthcheck. Before that, an orphaned
    healthcheck process made PostgreSQL restart itself twice.
  - `ensure_services` in the verify scripts uses `--no-recreate`, so a branch with an older
    compose file never recreates the shared database.
- Politeness is unchanged: identified PretoscopBot, robots.txt, ≥ 5 s per domain, a pause on any
  block. Never work around a block (CLAUDE.md).

## 7. Notes for the next Claude Code session

- **Working agreement** (CLAUDE.md, `docs/progress.md` "Build session mode"):
  - One `mod/MXX-*` branch per module, merged into `daniel` with `--no-ff` after `make verify` passes.
  - Module reports go in `docs/progress.md`; phase gates are marked "awaiting founder approval".
  - Push only when the founders ask. Every branch was pushed on 28 Oct 2026; keep recorded
    shop pages free of third-party keys (GitHub push protection blocks them).
  - Commits are module-prefixed and end with the Co-Authored-By line.
- **Gotchas found during the build:**
  - The Write tool and shell heredocs turn `\uXXXX` escapes into literal characters. Re-escape them
    (e.g. BOM `\uFEFF`, `\u0300-\u036f`) and scan for invisible characters.
  - In `apps/web`, import drizzle helpers (`sql`, `eq`, …) from `@pretoscop/db`, never `drizzle-orm`
    (a second instance comes with better-auth).
  - Next.js 16: `params` are Promises; the docs are in `node_modules/next/dist/docs`;
    `revalidateTag(tag, { expire: 0 })` from route handlers.
  - The e2e tests use the dev DB with a throwaway fixture (`packages/db/src/fixtures/e2e.ts`). Mark
    every fixture "(produs de test E2E)" so `dropE2eFixture` removes it.
  - `createTestDatabase()` clones a migrated template per migration set.
  - Generate migrations with drizzle-kit; never hand-number them.
  - `apps/web/next.config.ts` uses `output: 'standalone'`; `next start` warns but works for e2e.
  - Six agents in parallel overloaded the machine (load average ≈ 17) and made tests flaky. Run at
    most two or three agents at once, or give Docker more memory.
- **M26 (browser extension), as scoped before the stop:**
  - Build: `apps/extension`, MV3, built with esbuild (already installed) rather than WXT. One manifest
    carries both `service_worker` and `scripts` for Firefox.
  - Content scripts on emag.ro, altex.ro, flanco.ro, pcgarage.ro and evomag.ro detect the product
    (JSON-LD first, URL patterns as fallback); the background worker calls `/api/ext/lookup`.
  - Lookup: by offer URL, GTIN, or brand + MPN; rate-limited; CORS `*` on public data; returns
    `{product_id, slug, low_30d, low_all_time, median_30d, best_offers≤5, history≤180, updated_at}`.
  - Overlay: Shadow-DOM panel with a sparkline, the 30-day low, the cheapest shop, the verdict and a
    plain link to Pretoscop. It never rewrites links.
  - E2E: Playwright with the extension loaded and the shop page served through `page.route`.
  - Deferred: the opt-in "report this price" (needs a table, plausibility checks and abuse
    handling). Release gate: ≥ 70 % of top eMAG/Altex SKUs resolve.
- **M22 brief:**
  - `packages/llm`: an Anthropic client with Message Batches and the 1-hour prompt cache, an
    `llm_usage` ledger with a monthly hard cap shown in `/admin`, and a pairwise verification
    prompt (Romanian-aware, JSON).
  - Models: `claude-haiku-5-5` by default, `claude-sonnet-5-5` for low confidence or high value.
  - Gray-zone pairs → LLM → accept, reject or keep for review; `decided_by 'llm'`, reversible.
  - Extend the M07 eval harness to compare LLM decisions.
  - Mocked until an API key exists (A9); flag `llm.matching.enabled` off. Never send Icecat data or
    personal data.

## 8. Decisions and human tasks waiting for the founders

From the decisions log in `docs/progress.md` and `docs/09-external-setup-checklist.md`:
- **eMAG product pages (Tier A)** after the CAPTCHA: keep off (listings only), retry slower after
  asking eMAG, or stop eMAG.
- **The recording machine:** a plugged-in, always-awake computer or a small VPS (M18).
- **Matching:** label 100 pairs with `pnpm --filter @pretoscop/worker match:label`.
- **Shops:**
  - Confirm delivery fees where shops state none.
  - Dedeman's "Verifică disponibilitatea online" counts as unknown today.
  - Auchan's VTEX API: allowed by robots.txt, terms not read.
  - Read the new shops' terms.
- **Accounts and legal:**
  - A1 domain `pretoscop.ro`; A4 crawler IPs (`BOT_EGRESS_IPS`).
  - A6/A7 2Performant (and the ToS §9 clearance); A9 Anthropic API key; A10 Zyte + the written legal opinion.
  - B1 Open Icecat account; B2 Resend and mailboxes; B4 SRL; B5 lawyer review of the legal pages,
    `alertConsent.v1` and the merchant terms.
- **Reports:**
  - After Black Friday, approve the report (`report:approve`, checklist in `docs/press-kit/`).
  - Confirm the data licence (e.g. CC BY 4.0) and the press contact.

## 9. Old machine cleanup (once the new one works)

- **Docker volumes:**
  - `pretoscop_pgdata` and `pretoscop_meilidata` hold the dev data; keep them until the restore is
    verified.
  - `pretoscop-m18test*` are scratch from the M18 rehearsal; safe to remove with
    `docker volume rm $(docker volume ls -q | grep pretoscop-m18test)`.
- **Worktrees:** `.claude/worktrees/*` are fully committed; remove them with
  `git worktree remove --force <path>`, or delete the folder and run `git worktree prune`.
