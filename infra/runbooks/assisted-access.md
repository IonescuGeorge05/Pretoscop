# Runbook: assisted-access channel (M05B)

The channel reads the public pages of the shops the founders designated on 2026-10-27 (Altex,
Media Galaxy, Flanco, PC Garage, cel.ro; evoMAG and Vexio until their feeds are live) through a
commercial data-collection service (Zyte API), under the conditions of
`docs/12-blocked-shops-strategy.md` §0 and ADR-015. It ships **off**: no shop has
`access_mode: assisted`, `ASSISTED_VENDOR=none`, flag `assisted.enabled` off.

## What it guarantees (and how)

| Condition (docs/12 §0) | Where it is enforced |
|---|---|
| Designated shops only, never eMAG | registry schema (`packages/config/src/assisted.ts`) refuses `access_mode: assisted` for any other slug; the worker's policy resolver and run gates refuse it again |
| Same politeness as PretoscopBot | the same `fetchPolite` call: robots.txt (read through the channel, obeyed), per-domain interval ≥ 5 s, one request at a time, daily budget, crawl window, pauses after failures |
| Public product, category and sitemap pages only | sources are listing/product/sitemap kinds in the YAML; robots.txt applies; no login, cart, checkout, images or descriptions are requested or stored |
| No impersonation, no tooling of ours | we send the vendor only `{url, httpResponseBody, httpResponseHeaders, followRedirect:false}` (or `browserHtml` for pages of a shop configured `assisted_render: true`): no User-Agent, no headers, no IP type, no sessions; robots.txt, sitemaps and feeds always on the HTTP tier |
| Monthly cap with a hard stop | `access_costs` ledger written on every vendor call; `packages/fetch` refuses any assisted request once the month's spend reaches `ASSISTED_MONTHLY_CAP_EUR` (before any slot or budget is used); runs are gated too; alerts at 80% and 100% |
| Kill switch per shop, auto-pause | `/admin/acces-asistat` → Oprește (all sources of the shop); `assisted.health` (09:15 daily) pauses a shop whose success rate was below 80% on each of the last 7 days, with an audit row and an alert; nothing ever escalates to other tooling |
| Provenance | `ingest_runs.channel = 'assisted'`, `request_log.channel = 'assisted'`; offers stay `source_tier` 1 (our own reading of the public page) |

The cost is estimated, not billed back: Zyte's PAYG price of the shop's tier (`assisted_tier`,
default 5, the dearest) × billable responses, EUR cents rounded up. The cap can be overshot by at
most the requests already in flight (one per shop host, about 1.5 cents each on the browser tier).
Keep a spend limit in the Zyte dashboard as the second line of defence.

## Switching one shop on (all steps; founders only)

Prerequisites (setup A10): the written legal opinion filed under `infra/legal/` naming the vendor
and the shop; the decision row in `docs/progress.md`; the Zyte account with a spend limit.

1. Verify the vendor once without touching any shop: in the Zyte dashboard's playground (or with
   `curl -u "$ZYTE_API_KEY:" https://api.zyte.com/v1/extract -H 'content-type: application/json'
   -d '{"url":"https://toscrape.com","httpResponseBody":true,"httpResponseHeaders":true,"followRedirect":false}'`),
   compare the answer with `packages/fetch/test/fixtures/zyte/answers_synthetic.json` and tell the
   implementer about any difference (field names, status codes) before going further.
2. In the shop's YAML (`packages/config/shops/<slug>.yaml`), in one reviewed commit:
   `status: active`, `access_mode: assisted`, `legal.basis_ref: "infra/legal/<file>"`,
   `crawl_policy.assisted_tier` (from Zyte's calculator, else leave 5), `assisted_render: true` only
   if listings prove client-rendered, optional `assisted_country: RO` (dearer: extended
   geolocation), `max_pages_per_day` (start ≤ 300), `allowed_hours` (e.g. 02:00–07:00), and the
   listing sources (`enabled: true`, parser keys that exist: recorded fixtures first, see below).
3. Server `.env`: `ASSISTED_VENDOR=zyte`, `ZYTE_API_KEY=…`, `ASSISTED_MONTHLY_CAP_EUR=150`; deploy.
4. `/admin/acces-asistat` → **Pornește canalul asistat** (flag `assisted.enabled`). The shop's
   first run starts at its next schedule; watch the page (success rate, cost) the first day.

Recording fixtures for a new shop's extractor goes through the same channel and costs money: at
most three pages per shop, dated, with every rule applied (access mode, flag, cap, robots.txt,
ledger): `pnpm --filter @pretoscop/worker assisted:record <shop> <name> <url> [listing|product]`
writes `packages/extractors/fixtures/<shop>/<name>_<date>.html`. The per-shop extractors (Altex and
Media Galaxy `__NEXT_DATA__`, PC Garage JSON-LD `ItemList`, Flanco and cel.ro listings) are built on
those fixtures; until then the shop's sources stay disabled (M05B deferred them for this reason).

## Stopping

| Scope | How | Effect |
|---|---|---|
| One shop, now | `/admin/acces-asistat` → **Oprește** (or `/admin/surse` → Oprește tot magazinul) | every source of the shop killed; the ledger stops growing for it within the minute |
| All assisted shops, now | `/admin/acces-asistat` → **Oprește canalul asistat** (flag off) | every assisted request refused at the fetch layer and every run gated |
| Vendor off | `ASSISTED_VENDOR=none` in `.env`, deploy | no channel at all; assisted hosts are refused (`assisted_unavailable`) |
| A shop for good | YAML `access_mode: off` (or `feed_only` when its feed exists), commit, deploy | channel never used for it again |

## A shop objects (written request): within one business day

1. Within the hour: **Oprește** the shop in `/admin/acces-asistat`.
2. Reply from `contact@pretoscop.ro`: we stopped; offer the feed route (`docs/08-monetization-playbook.md` §7).
3. YAML: `access_mode: off`, note the request with its date in `legal.terms_note`, commit, deploy.
   Offers and history stay (our observations); hide the shop's offers if the request covers display
   (`status: paused`, `infra/runbooks/takedown.md`).
4. Decision row in `docs/progress.md`.

## Alerts

- **spend at 80% / cap reached**: look at `/admin/acces-asistat` (which shop costs what); lower a
  shop's `max_pages_per_day` or stop the most expensive shop; raising the cap is a founder decision.
- **success below 90% yesterday**: `request_log` for the shop (`channel = 'assisted'`): vendor bans
  (`vendor_blocked`), challenge pages, timeouts. Do nothing aggressive: no retries, no other vendor
  for the same shop without a decision. Persistent problems end in the auto-pause.
- **auto-paused**: the shop's sources are killed. Resume only after understanding why (shop changed
  its defences, vendor tier changed, layout change); **Repornește** in the admin.
- **vendor refuses our account (401/403)**: no assisted request for an hour; check the key and the
  account in the Zyte dashboard.

## Switching vendor

The `AssistedClient` interface makes vendors swappable (`packages/fetch/src/assisted/`). Oxylabs is
a stub today; implementing it (proxy endpoint, per-GB pricing, recorded answers) is an implementer
task after a founder decision and a legal opinion that names the new vendor.

## Exit per shop (M21)

The channel is a bridge. Each month: per shop, success rate and cost from the admin page; outreach
status (feed or allowlist). When a feed or an allowlist exists, switch the shop to `feed_only` or
`direct` in the YAML and the channel stops for it. Target: fewer than half of the designated
shops still assisted by month 6 (`docs/12` layer 2b).

## Public wording

The methodology page says, in general terms, that for some shops prices are collected through a
third-party data-collection service (`ASSISTED_METHODOLOGY_RO` in `packages/config/src/assisted.ts`,
for M17); the bot page describes PretoscopBot only and never claims that all collection is done by it.
