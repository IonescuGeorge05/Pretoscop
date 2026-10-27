# Pretoscop — Implementation plan (normal)

Status: v1, 2026-10-27. Audience: the founders and the Claude instance implementing the project. This is the narrative plan: strategy, phases, work items, acceptance criteria, launch checklist, budget. `05-plan-modular.md` re-cuts exactly the same work into supervisable modules with contracts; the two must stay consistent. Technical details live in `03-architecture.md`.

---

## 1. Approach in ten points

1. **Record prices before building the site.** A thin "Phase 0 recorder" captures daily prices for thousands of products before eMAG's Black Friday on 6 November 2026, because history is the asset and every day of delay is lost forever.
2. **Coverage through legitimate channels only**: affiliate feeds (2Performant allows comparators and pays natural persons; feeds carry GTIN and old price), merchant-supplied feeds (merchants already maintain compari.ro/Google feeds; listing is free), polite identified crawling of shops that serve honest bots, and a bot-legitimacy program (published IPs, Cloudflare Verified Bots, Akamai directory) to unlock the majors that block unknown crawlers. For the blocked electronics majors the prototype adds an assisted-access channel through a commercial data-collection service, under the founders' legal advice (§3.4), with an exit per shop to feeds or allowlists.
3. **eMAG is a founder decision, isolated behind a kill switch** (§3). The product is not viable without eMAG offers, and eMAG's terms forbid automated extraction; the plan supports every option.
4. **Total price ranking and verified discounts** are the differentiators: price + delivery, per-offer timestamps, "-X%" only against our own 30-day minimum, the shop's crossed price labelled as the shop's reference.
5. **One TypeScript monorepo, one server, PostgreSQL for everything** (catalogue, change-only price events with monthly partitions, job queue), Meilisearch for search, Cloudflare in front, R2 for snapshots and backups (`03-architecture.md`).
6. **Matching is deterministic first** (validated GTIN → brand+MPN → title/attribute rules with hard constraints), with a human review queue from day one and LLM verification of the gray zone added once volumes justify it.
7. **SEO on product-plus-price queries**, not on "istoric pret" (tiny volume): product pages that add value (history, total price, verdict, specs), structured data, fast pages, sitemaps keyed to price changes.
8. **Trust pages are features**: how we rank, how we make money, how we collect prices (bot page), per-offer freshness, consent-first alerts.
9. **Monetize in order**: affiliate links where allowed → merchant free listing → promoted placements and B2B price intelligence → premium → ads last.
10. **Launch in late January 2027**, after the holiday season, with Black Friday 2026 data already in the charts; Black Friday 2027 is the first full-scale event.

## 2. Timeline

| Phase | Window | Outcome | Gate |
|---|---|---|---|
| 0 — Record now | 28 Oct – 5 Nov 2026 | Recorder runs daily for ≥5,000 products (eMAG under founder decision + first feeds + permissive shops); snapshots and backups in R2 | G0 |
| 1 — Data core | 6 Nov – 12 Dec 2026 | Canonical catalogue, matching with review queue, rollups and stats, admin v1, 10–15 sources, Icecat enrichment; ≥20k products with ≥2 offers | G1 |
| 2 — Web MVP and launch | 8 Dec 2026 – 25 Jan 2027 | Public site (product, search, category, deals), SEO, legal pages, production deployment; staging review; launch | G2 |
| 3 — Retention, merchants, legitimacy | 26 Jan – 15 Mar 2027 | Alerts, merchant portal, bot legitimacy applications and outreach, LLM matching, Black Friday report tooling | G3 |
| 4 — Growth and monetization | 16 Mar – 30 Jun 2027 | Affiliate ops, promoted placements, extension, Telegram/push, B2B pilot, category expansion, CSS readiness | G4 |
| 5 — Scale (outlook) | H2 2027 | More categories and shops, CSS enrolment, B2B product, Black Friday 2027 study | — |

Effort is estimated in agent-days (one Claude instance working a focused day) plus founder review time; see §15. Phase 0 is tight (seven to ten agent-days in nine calendar days with M05B): run M02, M03, M04 and M06 in parallel instances after M00/M01, then M05 and M05B in parallel, as `05-plan-modular.md` Part A.2 describes.

## 3. Decisions the founders must make (and the recommended defaults)

### 3.1 eMAG (ADR-013) — decide before Phase 0 starts

Facts: eMAG is roughly a quarter of Romanian online goods sales and the price anchor users expect. Its Profitshare program excludes comparators and browser plugins (so no affiliate revenue). Its robots.txt allows unknown bots on product and category pages with no crawl-delay, and its product pages expose JSON-LD with price, availability, seller and a machine-readable `lowest_price_30_days`. Its terms of use §4.2(j) forbid "any robot, algorithm or other automated means to extract data from the Site", define prices as protected "Content", and §6.2 forbids republishing without written consent. Competitors (Pricy with 100K extension users, istoric-preturi.info, Pret Alert) crawl eMAG; one Pricy review reports eMAG price history disappearing in November 2025, which suggests eMAG does enforce. EU case law (CV-Online C-762/19) weighs the harm to the database owner's investment against the aggregator's benefit; a traffic-sending comparator that copies only prices and identifiers is on the lower-risk side, while contractual terms can still bind (Ryanair C-30/14). Criminal exposure (art. 360) arises only from bypassing technical restrictions, which we never do.

| Option | What it means | Recommendation |
|---|---|---|
| A. Crawl politely from day one | Identified bot, ≤1 request/5 s, robots.txt obeyed, category listings for refresh, product pages for Tier A verification, no images, no internal APIs, kill switch, lawyer review before public launch, stop on first written request | **Default.** Accepts civil risk in exchange for a viable product; exposure can be removed in minutes |
| B. Ask eMAG first | Email eMAG partnerships for a data partnership or written consent; crawl only if they agree | Do this in parallel with A; low odds, costs nothing |
| C. Extension-only | eMAG prices come only from users' browsers (opt-in crowd reporting) | Weak coverage for a year; keep as fallback if A must stop |
| D. Exclude eMAG | List everything but eMAG | Not viable for users |

Record the decision in `docs/progress.md`. The recorder (Phase 0) is designed to run with or without eMAG.

### 3.2 2Performant ToS §9 — decide before relying on feeds for history

Feeds may be used in comparators, but §9 forbids using the data "to create a database of their own and/or an information service". Ask 2Performant in writing (setup A7). Default until answered: use feed data for catalogue and links; derive history for those shops from our own crawl of the merchant's public pages where robots allow, or from merchant direct feeds with explicit terms. If cleared, feed observations become history directly.

### 3.3 Company — form the SRL before launch

Needed for invoices to networks, e-Factura, merchant contracts and the DSA notification. RON 500 minimum capital paid in full before registration (operating before full payment is a criminal offence for the administrator, Law 31/1990 art. 275(1)(c)); consider more than RON 500, because first-year losses push net assets below half of capital and block repayment of founder loans under Law 239/2025; ONRC registration is free and decided within one working day (certificate RON 30); main CAEN Rev. 3 code 6391. Tax regime: start on profit tax (16% of a near-zero profit costs nothing); opt into the micro-enterprise regime (1%) from the next 1 January once a founder can be on a minimum-wage contract, because the micro regime requires an employee within 90 days (OUG 8/2026) and two 50/50 founders cannot each hold another micro company. Choose CAEN codes for web portals, advertising and data services; reserve the company name at ONRC.

### 3.4 Blocked shops — decided 2026-10-27: assisted access for the prototype

About half of the probed shops, including Altex, Media Galaxy, Flanco, PC Garage and cel.ro, block unknown bots and offer no feed. After legal advice, the founders decided to read those designated shops through a commercial data-collection service (an assisted-access channel) during the prototype, alongside the identified crawler, feeds and partnerships (`12-blocked-shops-strategy.md` §0 and layer 2b; ADR-015; module M05B). Conditions: written opinion filed with its scope; public pages only; the same politeness as PretoscopBot; per-shop kill switch and stop on written objection; monthly cost cap and review; an exit per shop to a feed or an allowlist; truthful methodology wording. Self-operated stealth browsers, proxy pools, solvers and internal APIs remain excluded. eMAG is not covered by this decision (§3.1).

### 3.5 Launch category — electronics, IT and appliances

Best structured data, best GTIN/MPN availability, strongest Black Friday demand, highest price dispersion. Beauty and books next (higher commissions).

## 4. Phase 0 — Record prices now (28 Oct – 5 Nov 2026)

Goal: a daily, auditable record of offers and prices for the products users will search first, running unattended, with backups, before 6 November.

### 4.1 Work items

| # | Work item | Details | Acceptance |
|---|---|---|---|
| 0.1 | Monorepo scaffold | pnpm + Turborepo; `apps/web` (empty shell), `apps/worker`; packages `db`, `core`, `extractors`, `fetch`, `config`; ESLint/Prettier/Vitest; Docker Compose for Postgres 18 + Meilisearch + Mailpit; `Makefile`; GitHub Actions CI | `make test` green in CI; `make dev` brings up the stack |
| 0.2 | Schema v1 | Drizzle schema for shops, affiliate_programs, shop_sources, ingest_runs, products (minimal), offers, price_events (monthly partitions created 12 months ahead + maintenance job), feature_flags, audit_log; seed script | Migration applies on a clean DB; partition for next month exists; `pnpm db:check` passes |
| 0.3 | Polite fetch layer | `packages/fetch`: identified UA, per-domain min interval + concurrency 1, robots.txt RFC 9309 parser with cache, 429/503 backoff, 403/challenge detection → source pause, request log table or JSONL, timeouts, size caps | Unit tests with a local HTTP server simulating 200/403/429/5xx and a robots file with wildcards |
| 0.4 | Extractors v1 | JSON-LD Product/Offer extractor (handles `@graph`, arrays, `AggregateOffer`, `gtin13/gtin/sku/mpn`, `seller`), microdata fallback, OpenGraph; eMAG listing-page extractor and product-page extractor (incl. `lowest_price_30_days`, seller/vendor id); 2Performant feed mapper (CSV/XML; fields incl. GTIN, Old price, Brand, Product ID, Merchant Program); Google Shopping XML and compari XML mappers | Fixture-based tests: ≥3 recorded pages per extractor; mapper tests with sample feeds |
| 0.5 | Shop registry | `packages/config/shops.yaml` → validated types: slug, domain, kind, trust_tier, shipping_rules, crawl_policy, sources (kind, url, parser_key, schedule), comparator_policy; loader upserts into DB | Registry validation test; `make shops:sync` idempotent |
| 0.6 | Recorder pipeline | Worker jobs: `source.run` (fetch → parse → normalize → upsert offers → price_events on change → R2 snapshot → ingest_runs); cron per source; eMAG category seeds for phones, tablets, laptops, PC components, TVs, audio, consoles/games, smartwatches, large and small appliances via listing pages (daily budget per shop, 1 request/5 s); Tier A product-page verification list (top ~2,000 URLs) daily; first approved 2Performant feeds; permissive shops with electronics (IT Galaxy, forit, Flip as refurbished, Dedeman appliances, Auchan/Carrefour electronics) | After two consecutive days: ≥5,000 distinct offers with ≥2 observations; `ingest_runs` shows stats; a sample of 20 offers manually compared with the live pages matches price and stock |
| 0.7 | Backups and ops | Nightly `pg_dump` to R2; WAL archiving (wal-g); restore script; health check endpoint for the worker; Telegram/email alert on two consecutive failed runs | Restore test performed once on a scratch database |
| 0.8 | Bot page (static) | `pretoscop.ro/bot` served (even from Cloudflare Pages/static) with UA, IPs, contact, opt-out, policy | Page reachable; UA in requests points to it |
| 0.9 | Assisted-access channel (prototype) | `packages/fetch/assisted` with a vendor client (Zyte API default, second vendor stub), channel routing by `shops.access_mode`, identical politeness and budgets, robots.txt through the channel, `access_costs` ledger with a monthly cap and auto-pause below 80% success, extractors with fixtures for Altex, Media Galaxy, Flanco, PC Garage, cel.ro, runbook (M05B) | Two-day live run: ≥90% success per shop, cost within the cap, 10 sampled offers match the live sites |

### 4.2 Notes

- The eMAG category listing is the efficient refresh path (≈60 offers per request); product pages are used for a small Tier A set so that `lowest_price_30_days` and seller details are captured for Black Friday analysis.
- Products are not matched in Phase 0; offers carry raw identifiers (`gtin_raw`, `mpn_raw`, `brand_raw`, `title_raw`) so that Phase 1 matching can be applied retroactively. Price events are keyed by offer, so history is preserved across later matching changes.
- Keep daily page budgets conservative during Black Friday week (shops are under load): e.g., eMAG ≤ 1,500 listing pages/day.
- eMAG's sitemaps (841 files × 5,000 URLs, constant `lastmod`, `no-store`) are swept once a day only to diff URL sets for discovery and delisting; price refresh comes from category listings, and a full product-page pass is never attempted (it would take about 146 days at one request per 3 s).
- The five designated blocked shops are recorded through the assisted channel from the first days so that the Black Friday 2026 report covers the electronics majors; the browser-rendered tier is used only where a listing is client-rendered.

## 5. Phase 1 — Data core (6 Nov – 12 Dec 2026)

Goal: a canonical catalogue with trustworthy matches, computed history statistics, an admin to supervise data quality, and 10–15 sources.

| # | Work item | Details | Acceptance |
|---|---|---|---|
| 1.1 | Core normalization library | `packages/core`: GTIN validate/normalize (8/12/13/14, check digit, restricted and coupon prefixes, placeholders), Romanian text normalization (diacritics, cedilla→comma, ASCII fold, slugs), brand dictionary + aliases (seed 300 electronics brands), MPN normalization, attribute extraction (storage, RAM, screen size, colour RO/EN, year, connectivity), condition and bundle and accessory detection, price parsing, total price | ≥200 unit tests including Romanian titles from fixtures; property tests for GTIN |
| 1.2 | Taxonomy | Import Google Product Taxonomy (electronics subtree), Romanian names, slugs; shop category → our category mapping table with LLM-suggested mappings reviewed by a human | Every Phase-0 offer has a category or a review item |
| 1.3 | Catalogue bootstrap | Create products from feed items with valid GTIN+brand; from eMAG offers by brand+MPN (eMAG part number) with title attributes; dedupe by GTIN/MPN; family grouping rules for phones/laptops | ≥20k products; duplicate rate on a 200-sample audit < 2% |
| 1.4 | Matching v1 | Candidate generators (GTIN, brand+MPN, title search via pg_trgm within category), scorer with hard constraints, routing on a calibrated score (accept ≥0.97, reject ≤0.30, review between; provisional products noindex), `match_decisions`, `offer_aliases`, CLI `pnpm match:run --source`, metrics per source | Audited precision ≥98% on 300 random auto-matches; recall reported |
| 1.5 | Rollups, stats, anomalies, verdicts | `product_daily` nightly + incremental; `product_stats`; anomaly quarantine; verdict rules; history API shape fixed | Rollup of 1M events < 5 minutes; stats correct on synthetic fixtures |
| 1.6 | Admin v1 | Next.js `/admin` with Better Auth (magic link, admin role): sources dashboard (freshness vs SLO, last runs, errors), review queue (offer vs candidates, accept/reject/new/merge), product editor (merge/split, GTINs, family), offer tools (unlink, blacklist, bundle), kill switches, audit log | Founders can clear 50 review items in under 15 minutes |
| 1.7 | Source adapters batch 1 | Feeds: every approved 2Performant program with electronics (evoMAG and others), Awin if approved; crawl: Dedeman, Libris, Elefant, Bonami, JYSK, IT Galaxy, forit, Carrefour, Auchan (public VTEX catalogue JSON if robots allows), Flip (refurbished); assisted channel (M05B): Altex, Media Galaxy, Flanco, PC Garage, cel.ro | Each adapter has fixtures, a freshness SLO, and shows healthy in admin for 3 days |
| 1.8 | Icecat enrichment | Open Icecat index download, GTIN/MPN lookup, specs (RO titles/labels), images with attribution, caching, monthly refresh, segregation flags | ≥60% of products with specs; attribution rendered |
| 1.9 | Data-quality program | Weekly 100-offer audit script (random offers → human compares with live pages), match precision sampling, freshness report, duplicate report | Reports in admin; first audit done |

## 6. Phase 2 — Public web MVP and launch (8 Dec 2026 – 25 Jan 2027)

| # | Work item | Details | Acceptance |
|---|---|---|---|
| 2.1 | Web foundation | App Router layout, design system (Tailwind + shadcn), Romanian strings file, error pages, image component (R2 derivatives), analytics event API (server-side), consent component | Lighthouse ≥90 on an empty page; a11y lint clean |
| 2.2 | Product page | Content order per `03-architecture.md` §7.2; offers table with total price, filters, seller badges, freshness; `/out/{offerId}` redirect with click log and `rel="sponsored nofollow"` when affiliate; history chart (uPlot) with ranges; stats; verdict; disclosures | Rendered server-side < 400 ms p95 cached; chart works without JS errors on mobile |
| 2.3 | Search and browse | Meilisearch index + sync job; `/cauta` with facets (brand, category, price, in stock); autocomplete; category pages with `ItemList`; brand and shop pages | Searching "televizor samsung 55" and "frigider" returns relevant results; diacritics-insensitive |
| 2.4 | Deals | `/reduceri`: biggest verified drops (vs our 30-day min), new all-time lows, by category | Verified by spot checks |
| 2.5 | SEO | Structured data (Product/AggregateOffer/Offer, BreadcrumbList, WebSite, ItemList), canonical, titles/descriptions, sitemaps with price-change lastmod, robots.txt (allow search bots; AI-crawler rules per Icecat terms), noindex for zero-offer pages, performance budget | Rich Results test passes on 10 product pages; sitemaps valid |
| 2.6 | Legal and trust | `/despre`, `/cum-functioneaza` (ranking parameters), `/cum-castigam-bani`, `/bot`, `/termeni`, `/confidentialitate`, `/cookies`, `/contact`, `/pentru-magazine`; consent banner (equal accept/reject); Plausible after consent; ROPA doc | Lawyer review completed; all pages linked in footer |
| 2.7 | Production and staging | Compose for prod on the Hetzner box (web ×2, worker queues split, Postgres tuned, Meilisearch, Caddy/cloudflared), Cloudflare cache rules, Access on `/admin`, Sentry, metrics, uptime, deploy workflow, runbooks (deploy, rollback, restore, source pause) | Blue/green-ish deploy done twice; restore test on staging |
| 2.8 | Launch | Checklist §9; remove `noindex`; submit sitemaps; announce; schedule ANCOM notification | Launch day with no P1 incidents |

## 7. Phase 3 — Retention, merchants, legitimacy (26 Jan – 15 Mar 2027)

| # | Work item | Details | Acceptance |
|---|---|---|---|
| 3.1 | Accounts and alerts | Magic-link login; alerts (below price / any drop / any variant); double opt-in with versioned consent text; daily evaluation job; email templates (RO) with unsubscribe; `/alerte` management; retention job | Consent evidence stored; alert fires on a synthetic drop; unsubscribe works in one click |
| 3.2 | Merchant portal (free listing) | `/pentru-magazine` → register (Better Auth role merchant), add feed URL (Google/compari/CSV), validator with preview, approval by admin, daily pull, dashboard (offers listed, clicks, freshness), merchant terms (P2B-ready) | First 5 merchants onboarded end-to-end |
| 3.3 | Bot legitimacy program | Stable egress IPs with rDNS; bot page final; Web Bot Auth implementation (signed requests) or IP validation; applications to Cloudflare Verified Bots, Akamai Bot Directory, DataDome, IAB/ABC list; outreach emails to blocked majors with tracking in admin (`shops.legal_notes`, status) | Applications submitted; outreach sent to ≥8 shops; outcomes logged |
| 3.4 | Source adapters batch 2 | Shops unlocked by feeds, merchants or allowlisting; Awin/CJ/Tradedoubler feeds (Douglas, Samsung, Xiaomi, About You, Answear, Notino, Modivo) subject to program rules | Each with fixtures and SLO |
| 3.5 | LLM-assisted matching | `packages/llm`: Haiku 5.5 Batch pairwise verification for the gray zone, attribute extraction for titles missing attributes, category mapping suggestions; prompt cache; monthly cap; eval set of 500 labelled pairs; escalation to Sonnet 5.5 for low-confidence | Gray-zone human queue reduced ≥60% at equal precision; cost within cap |
| 3.6 | Black Friday report tooling | Queries and a report generator: share of "discounts" below our 30-day min, reference-price inflation cases, biggest real drops; export to Markdown/CSV and charts; press list | Report for BF 2026 published from Phase-0 data (even if partial) |

## 8. Phase 4 — Growth and monetization (16 Mar – 30 Jun 2027)

| # | Work item | Details | Acceptance |
|---|---|---|---|
| 4.1 | Affiliate operations | 2Performant API sync (programs, per-program comparator permission, commissions), link templates per program, click attribution, commission import, revenue dashboard by shop/category; policy engine replaces affiliate links with plain links when a program bans comparators | First month of revenue reconciled against network reports |
| 4.2 | Promoted placements and billing | Labelled `Promovat` slots (top of offers table and category pages), bids per category/price band, Stripe top-ups, invoices via e-Factura; never alters default ranking | 3 paying merchants |
| 4.3 | Browser extension | MV3: content scripts for eMAG/Altex/Flanco/PC Garage/evoMAG product pages → overlay with history and cheapest elsewhere; no affiliate injection; opt-in price reporting that only triggers a verification crawl; Chrome then Firefox | Published; 1,000 users |
| 4.4 | Telegram bot and web push | Alerts and daily deals via bot; web push for alerts | Live |
| 4.5 | B2B price intelligence MVP | Merchant/brand dashboard: positions for their SKUs vs competitors, history, exports, API keys with rate limits; plans and Stripe; Icecat excluded | 1 pilot customer paying |
| 4.6 | Category expansion | Playbook executed for beauty (Notino, Douglas, Sephora if accessible) and books (Libris, Cărturești, Elefant); taxonomy and brand dictionaries extended; feeds first | ≥5k products per new category with ≥2 offers |
| 4.7 | CSS readiness | Count merchant domains; price sort/filter already exist; Merchant Center setup; apply when ≥50 | Application submitted when eligible |

## 9. Launch checklist (Gate G2)

**Data**: ≥20k products with ≥2 live offers; freshness ≥90% < 24h for Tier A/B; precision ≥98% on the last audit; zero-offer pages noindex; anomalies quarantined; Icecat attribution visible.

**Legal**: SRL registered; terms, privacy, cookie policy, ranking page, money page, bot page live; consent banner; alert consent flow (if alerts ship at launch) tested; lawyer sign-off on eMAG decision and page texts; ANCOM notification calendar entry (launch + 45 days; the ANCOM form did not exist on 2026-10-27, so check and keep evidence of the attempt); processor DPAs collected; accessibility statement; price-accuracy note and "Raportează o eroare de preț" channel live; discount-verification wording reviewed for defamation risk; merchant terms (P2B) ready before any merchant is listed under contract; written legal opinion on the assisted-access channel filed with its scope (shops, methods, conditions) and the methodology wording approved.

**Tech**: backups nightly + restore tested in the last 7 days; Sentry, metrics, uptime alerts to a founder's phone; Cloudflare WAF and rate limits; Access on `/admin`; HTTPS/HSTS; 404/500 pages; sitemaps submitted; Search Console and Bing verified; Core Web Vitals within budget on 20 sampled pages; staging `noindex`, production indexable.

**Business**: 2Performant programs approved and links tested end-to-end (test click visible in the network dashboard); merchant onboarding email ready; press note for the Black Friday 2026 data; social handles live; support inbox.

## 10. Phase 5 outlook (H2 2027)

Scale sources to 100+ shops (mostly via merchant feeds), CSS enrolment, B2B as a product line (self-serve), premium tier, mobile PWA polish, second-hand sources (OLX via official channels only), Black Friday 2027 study with a full year of history, and a decision on raising money or staying bootstrapped based on month-12 metrics (`02-product-and-scope.md` §6).

## 11. Testing strategy

- **Unit**: `core` (normalization, GTIN, matching score, pricing, verdicts, anomalies) with Romanian fixtures; `extractors` with recorded HTML/feed fixtures per shop (a fixture that stops parsing fails CI).
- **Integration**: worker jobs against a Postgres service in CI (ingest → events → rollups), migrations on a clean DB, partition maintenance.
- **Contract**: API responses (history, product) snapshot-tested; Meilisearch index schema test.
- **E2E (few)**: Playwright: search → product → click-out logs a click; alert signup double opt-in via Mailpit; admin review accept.
- **Data-quality audits**: weekly scripted samples (offers vs live pages; matches), reported in admin.
- **Load**: k6 on product pages (cached and uncached) before launch.

## 12. Data-quality program (ongoing)

Freshness SLO per shop; weekly precision audit (100 matches); duplicate product report (same GTIN or near-identical titles); anomaly review; "wrong price" user reports triaged within 24h; monthly recomputation check (rollups vs raw events); provenance kept for every observation (run id, source, snapshot key).

## 13. Operations

Runbooks in `infra/runbooks/`: deploy and rollback, restore from backup, pause/unpause a source, respond to a takedown, rotate secrets, scale workers, Meilisearch rebuild. Light on-call: uptime alerts to both founders' phones; Sentry daily digest; weekly ops review (cost, freshness, errors, queue depth).

## 14. Security

Covered in `03-architecture.md` §10: secrets, admin SSO, rate limits, CSP, data minimization, dependency audit, image pinning.

## 15. Effort and budget

| Phase | Agent-days (est.) | Founder hours (review, accounts, decisions) | Infra/services cost |
|---|---|---|---|
| 0 | 7–10 | 7–10 | €110–230 first month (server, domains, assisted-access vendor €50–150) |
| 1 | 15–20 | 15–20 | €120–270/month |
| 2 | 15–20 | 15–20 | €130–280/month |
| 3 | 15–20 | 15–20 | €150–300/month |
| 4 | 25–35 | 20–30 | €200–400/month |

One-off: SRL registration is free at ONRC (certificate RON 30, optional drafting RON 136 + VAT, share capital RON 500 or more) + accountant; lawyer review 1–3 hours; trademark filing (OSIM ≈ RON 1,000–2,000 or EUIPO €850) after launch; Chrome developer account $5.

## 16. Working with the implementing agent

Use `05-plan-modular.md` for day-to-day execution: one module per branch and PR, `make verify M=XX`, module report, phase gates. Deviations are fine when explained; architectural ones become ADR rows. Human-only tasks are in `09-external-setup-checklist.md`; ask for them early (affiliate approvals take up to 15 days).
