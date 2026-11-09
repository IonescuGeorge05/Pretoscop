# Handoff — 9 Nov 2026: the plan is built; what only the founders can unblock

For Daniel and George, and for the next Claude Code session. Read this first, then
`docs/progress.md` (status and one report per module) and `CLAUDE.md`. The previous handoff (the
move from the Mac to the Windows laptop, 28 Oct) is in `docs/archive/`.

## 1. Where things stand

- **All 31 modules of the plan (M00–M29 and M05B) are built.** Each is merged into `daniel`,
  verified on this laptop with its `make verify M=XX`, reported in `docs/progress.md` and pushed
  to GitHub (`daniel` and every `mod/*` branch).
- Every module is in status **`review`**: each still needs your 5-minute check from
  `scripts/verify/MXX.checklist.md`. The phase gates G0–G4 need your approval.
- **Final regression (9 Nov):** `<<SWEEP>>`
- Modules that handle personal data, money or third-party input had an independent review on top
  of their own tests. For M19 alerts, M20 merchants, M14–M16 search/deals/SEO and M21 bot program,
  every high and medium finding was fixed.
- **Everything that sends messages, moves money, calls a paid vendor or adds a new kind of
  request ships switched off** (section 4). Only `crawl.enabled` and `source.emag.enabled` are on:
  your decisions of 27 Oct.

### What works today on this laptop (the MVP)

- **Price recorder** (Docker container `pretoscop-worker-1`):
  - Crawls nightly, politely and identified as PretoscopBot: eMAG category listings, IT Galaxy,
    forIT, Carrefour, Dedeman, Auchan, Bonami, and Flip's sitemap.
  - Then normalizes, matches across shops, writes change-only price history, rolls up stats and
    verdicts, quarantines anomalies, keeps search and sitemaps in sync, and backs up the database
    nightly.
- **Website** (`make dev`, then http://localhost:3000):
  - product pages with offers ranked by total price, price charts, verdicts and badges;
  - search with facets and autocomplete; category, brand and shop pages; the deals page;
  - the legal and trust pages, consent, the reports pages;
  - SEO: robots.txt, sitemaps, structured data and server-rendered 404s. The site is closed to
    search engines until `SITE_INDEXABLE=true`.
- **Admin** (`/admin`; the magic link arrives in Mailpit at http://localhost:8025):
  - sources and kill switches, runs, flags, the match review queue, products (merge/split), offers,
    quarantine;
  - alerts, merchants, revenue, promoted placements, B2B workspaces, outreach and the assisted
    channel, LLM spend and decisions, and the audit log.
- **Production stack** (M18): ready to deploy to a server once the accounts exist. The rehearsal
  passes on this laptop: point-in-time restore, disaster recovery, zero-downtime deploy, rollback,
  load test.

### Data (9 Nov, 08:00 UTC)

- **Catalogue:** 31,082 products and 57,428 offers from 8 shops. 4,861 products have offers from
  two or more shops; on 28 Oct there were 153.
- **Price history** starts 27 Oct but has a **gap from 29 Oct 01:38 UTC to 9 Nov 06:37 UTC**
  (section 2). Verdicts and deals need 14 observed days: 27–29 Oct plus one per night from 9 Nov puts the first
  ones around 20 Nov.

## 2. What happened between 28 Oct and 9 Nov

1. **The recorder stopped on 29 Oct at 01:38 UTC** after one complete night: 34,697 offers that
   night.
   - The cause: Docker Desktop stopped with the laptop's session. On 2 Nov Windows rebooted (an
     update) and Docker Desktop did not start again.
   - **Nothing was recorded for 11 nights, Black Friday (6 Nov) included.** The Black Friday 2026
     report cannot be made.
2. **On 9 Nov the lead:**
   - restarted Docker;
   - took a backup (`data/blobs/backups/pg/2026-11-09/`);
   - rebuilt the recorder from `daniel` (all merged code; every new flag off);
   - let each source run once to catch up (M05's design: one catch-up run, never a backfill);
   - ran the eMAG part-number renormalization planned since 28 Oct (3,887 offers rewritten; no human
     decision touched).
3. **Two shops now push back. The fetch layer paused each for 24 hours, as it must.**
   - **Carrefour:** answers HTTP 403 from Cloudflare (bot management) since 9 Nov.
   - **IT Galaxy:** connections time out (10 s connect timeout); either a network problem or IT
     Galaxy dropping our connections.
   - Both resume by themselves. If they keep failing, they can only come back through a feed, an
     allowlist or outreach. We never work around a block.

## 3. Blockers that need you, in priority order

### P0 — keep the price history alive (every missing night is lost for good)

1. **The recording machine.** A laptop is not a reliable recorder. Pick one:
   - **Recommended: a small server.** M18's production setup is ready; it needs A3, A4, B8–B12
     (`infra/runbooks/`, `docs/09-external-setup-checklist.md`). The recorder then runs 24/7.
   - **Or keep this laptop and configure it:**
     - Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**;
     - Windows → Power → sleep **Never** on power, and lid → **Do nothing** on power;
     - pause Windows Update;
     - never sign out (locking the screen is fine);
     - check `make recorder-logs` or http://localhost:9464/health now and then.
2. **eMAG product pages** (Tier A, off since eMAG's CAPTCHA on 27 Oct): keep them off and record
   listings only (the current state), or ask eMAG and retry slower, or stop eMAG. Pending in the
   decisions log since 27 Oct.
3. **Carrefour and IT Galaxy** (section 2.3): watch the next nights in `/admin` (Surse/Rulări). If
   they stay blocked, use outreach (C3) for a feed or an allowlist; the templates are in
   `infra/bot-program/`.

### P1 — public launch (Gate G2)

4. **Domain and infrastructure:**
   - A1: the `pretoscop.ro` domain;
   - A3/B10: Cloudflare and R2 buckets;
   - A4: Hetzner server and fixed crawler IPs with reverse DNS;
   - A5/B11: GitHub environments and secrets, a GHCR plan;
   - B8: the server bootstrap;
   - B9: production secrets. Keep the backup passphrase `PGBACKREST_REPO1_CIPHER_PASS` in both
     password managers: without it the backups cannot be restored.
   - B12: the ops Telegram bot.
   - B3: Better Stack uptime checks.
5. **The SRL and email (B4, B2):**
   - Every email must name the operator: **production refuses to start without the real
     `COMPANY_LEGAL_NAME` and `COMPANY_POSTAL_ADDRESS`.**
   - Resend needs the domain, the mailboxes (contact@, privacy@, bot@) and
     `RESEND_WEBHOOK_SECRET`.
6. **Lawyer review (B5):**
   - the legal pages (`/termeni`, `/confidentialitate`, `/cookies`, `/cum-functioneaza`,
     `/cum-castigam-bani`, `/bot`);
   - the consent texts (`alertConsent.v1`, `pushConsent.v1`, `telegramConsent.v1`, `b2bTerms.v1`);
   - the merchant terms (v0.2 plus the M25 promoted-placement section) and the B2B terms;
   - the extension privacy section and `docs/legal/*`.
7. **Search Console (B6)** at launch, and build the production web image with
   `SITE_INDEXABLE=true`.
8. **Two technical decisions** (decisions log in `docs/progress.md`):
   - the JavaScript budget: the framework shell alone is 151 kB, against a 150 kB target;
   - whether single-offer eMAG/Dedeman products start provisional (noindex), as the docs say, or
     not, as the code does.
9. **Your module checks and the gate approvals** (G0–G4 in `docs/progress.md`).

### P2 — more shops and better matching

10. **2Performant (A6/A7)** plus written clearance of its ToS §9. This is the biggest lever: full
    catalogues of many shops as feeds, including the books shops for M29.
11. **The merchant portal (M20):** decide when to open it (flag `merchants.portal.enabled`) and who
    answers the approval queue (one business day is promised).
12. **The assisted channel (M05B)** for the shops that block bots (Altex, Media Galaxy, Flanco,
    PC Garage, cel.ro):
    - A10: the Zyte account with a spend limit, and the written legal opinion;
    - then set one shop's `access_mode: assisted` in its YAML, record fixtures through the channel,
      and write the shop parsers.
13. **Matching quality:**
    - label 100 pairs: `pnpm --filter @pretoscop/worker match:label`;
    - A9: an Anthropic API key with a spend limit, for M22 (`match:eval:llm`; switch
      `llm.matching.enabled` on only if precision reaches 98 %);
    - B1: Open Icecat for specs and licensed images.
14. **Books (M29):** enable the Libris and Elefant sources (`enabled: true` in their YAML, then
    `make shops:sync`), watch one run, and ask Elefant for a feed (C3).
15. **The registry's human tasks:** confirm delivery fees where shops state none; decide whether
    Dedeman's "Verifică disponibilitatea online" counts as in stock; read the new shops' terms;
    decide on Auchan's VTEX API.

### P3 — revenue and growth

16. **D3 Stripe** (accountant: VAT on prepaid wallets, e-Factura): needed for promoted placements
    (M25) and B2B plans (M28). Email merchants the new terms 15 days before switching promotion on
    (P2B art. 3).
17. **D2 Telegram bot and VAPID keys** (M27); **D1 Chrome/Firefox store accounts** (M26).
    - The extension's release gate is **not met yet**: 69.8 % of eMAG offers resolve, against 70 %
      required. Re-measure with `pnpm ext:resolution`.
    - Save one real product page each from Altex, Flanco, PC Garage and evoMAG in your browser, to
      replace the synthetic fixtures.
18. **The bot programme (M21):**
    - C2: the Cloudflare Verified Bots, Akamai, DataDome and Fastly applications, submitted by a
      founder;
    - C3: outreach to at least 8 shops;
    - C4: Awin, CJ and Tradedoubler accounts (also for beauty in M29).
19. **D5 AdSense**, with a Google-certified consent platform before any ad in the EEA (M25).
    **D4 Merchant Center/CSS** once 50 merchant domains are live (`css:readiness` shows 7 today).
20. **A B2B pilot customer** (M28).

## 4. Feature flags (`/admin/flaguri`)

Everything except the first two is **off**. Turn a flag on only after its human task.

| Flag | What it switches on | Needs first |
|---|---|---|
| `crawl.enabled` | every request to a shop (also `CRAWL_ENABLED` in `.env`) | on |
| `source.emag.enabled` | eMAG sources (ADR-013) | on (decision of 27 Oct) |
| `alerts.email.enabled` | price-alert emails (M19) | B2, B4, B5 |
| `alerts.push.enabled`, `alerts.telegram.enabled`, `telegram.deals.enabled` | browser and Telegram alerts, daily deals post (M27) | D2, B5 |
| `merchants.portal.enabled` | merchant self-serve registrations (M20) | B5, an approver |
| `affiliate.links.enabled` | affiliate links in click-outs (M24) | A6/A7 |
| `assisted.enabled` | assisted channel (M05B) | A10, a shop set to `assisted` |
| `llm.matching.enabled` | LLM gray-zone matching (M22) | A9, labels, eval ≥ 98 % |
| `icecat.enabled` | Icecat specs and images (M11) | B1 |
| `promoted.enabled`, `ads.slots.enabled` | promoted placements and the ad slot (M25) | D3, B5, D5 |
| `b2b.enabled`, `b2b.digest.enabled`, `b2b.billing.enabled` | B2B workspaces, digest, subscriptions (M28) | D3, B5, pilot |
| `extractors.canary.enabled`, `shops.probe.enabled` | weekly canary, re-probes (M21) | a founder decision |
| `extension.lookup.enabled` | the browser extension's API (M26) | D1, release gate |

## 5. Running it on this laptop

All commands run in Git Bash in the repo folder. Docker Desktop must be running.

```bash
make services            # PostgreSQL 18, Meilisearch, Mailpit (already running if Docker is)
make recorder            # rebuild and restart the recorder after pulling new code
make recorder-logs       # follow it; health: http://localhost:9464/health
make dev                 # website on http://localhost:3000, admin at /admin, mail at http://localhost:8025
make test                # lint, typecheck, all unit and integration tests
make verify M=13         # one module's acceptance checks (any of 00–29, 05B)
pnpm --filter @pretoscop/worker backup   # manual database backup into data/blobs/backups
```

Windows notes:
- Shells started before Docker was installed need
  `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`. Restarting VS Code fixes it.
- `core.autocrlf` must stay `false`; the repo's `.gitattributes` keeps LF.
- **Known flake:** `make test` occasionally fails with `EPERM … node_modules/.vitest-cache` (two
  test processes cleaning the shared cache at once). Run it again.

## 6. Known gaps and technical debt

- **Rate limiters:** the in-memory ones (extension API, alert forms, Telegram per chat) work per
  process. The per-IP limits trust `cf-connecting-ip`/`x-forwarded-for`, so production must sit
  behind Cloudflare and Caddy (M18 configures both).
- **Libris offers** are re-matched after each listing run, which adds decision rows but never
  changes the result (M29 CE5).
- **Synthetic stand-ins:** the assisted-vendor shapes, the Icecat responses, the beauty eval and
  the blocked shops' extension fixtures are synthetic until the accounts exist.
- **Formatting:** Prettier is not enforced in lint or CI, and some files are unformatted.
- **Black Friday 2026** has no data (section 2). The report tooling (M23) is ready for the next
  event.

## 7. For the next Claude Code session

- Integration branch: `daniel`. Work one `mod/MXX-*` branch per module, merge it with `--no-ff`
  after `make verify` passes, add the module report to `docs/progress.md`, then push.
- `main` on GitHub (the old prototype, which someone updated after 28 Oct) was not touched. Open a
  pull request `daniel` → `main` when you want `main` to become the product.
- **Migrations:** regenerate a branch's migration on top of `daniel` before merging; never number
  them by hand. The latest is `0022_b2b`. The next free ADR is ADR-030.
- **Parallel agents:** each gets its own git worktree (`.claude/worktrees/<name>`), its own copy of
  the dev database, its own E2E and metrics ports and `MEILI_INDEX_PREFIX`, and
  `CRAWL_ENABLED=false`. `scripts/verify/lib.sh` reads `DATABASE_URL` and `E2E_PORT` from each
  checkout's `.env`.
  - Remove a worktree with `git -c core.longpaths=true worktree remove --force`.
- Never stop or recreate the compose project `pretoscop`: the live recorder runs in it.
- **The founders' Claude usage is limited.** Stop all agents if Daniel says the weekly usage is
  near 75 %; Claude cannot read the meter itself.
