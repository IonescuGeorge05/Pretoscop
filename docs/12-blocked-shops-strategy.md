# Getting prices from shops that limit bots

Status: v2, 2026-10-27 (decision added). Answers the question "how do we get prices from Altex, Flanco, PC Garage, cel.ro, Media Galaxy and the other shops that block crawlers?" Evidence: `01-research-report.md` §2 and §4 and the notes `research/notes/scraping_feasibility_recon.md`, `gaps_bot_legitimacy_and_precedents.md`, `legal_and_regulatory.md`.

## 0. Decision of 2026-10-27: assisted access for the prototype

The founders consulted a lawyer on 2026-10-27, who advised that collecting publicly displayed prices from shops that block unknown crawlers is lawful for Pretoscop, and decided to use an **assisted-access channel** (a commercial data-collection service that handles anti-bot challenges on the vendor's side) for the prototype, for the shops that provide neither an identified-bot allowlist nor a feed. This supersedes the earlier "never" stance for that specific tool (§3). The plan attaches these conditions to the decision:

1. Obtain the opinion in writing and file it (`infra/legal/`, outside git) together with its scope: which shops, which methods, which conditions (setup A10).
2. Public product, category and sitemap pages only: no login, cart or checkout pages, no internal or undocumented APIs, no images or descriptions, no personal data.
3. The same politeness as the identified crawler (per-domain interval, concurrency 1, daily budgets, off-peak bulk), so the shop's operation is never measurably affected.
4. A per-shop kill switch and a documented stop-on-written-objection procedure (one business day).
5. A monthly spend cap with a hard stop and a monthly review of success rates and cost.
6. An exit path per shop: a merchant feed or an allowlist replaces assisted access as soon as either exists (tracked in M21).
7. Truthful public wording: the bot page describes PretoscopBot; the methodology page says that for some shops prices are collected through a third-party data-collection service.
8. eMAG is not covered by this decision; it stays under ADR-013 and its own founder decision.
9. The clearance is for the prototype (`02-product-and-scope.md` §4.0). Before the public launch (Gate G2) the founders re-confirm it in writing for production use, or move the affected shops to feeds, allowlists or link-only.

Residual risks are in §3 and in `10-risk-register.md` (R3, R18). The channel is implemented in module M05B (`05-plan-modular.md`).

## 1. What the probes actually showed

On 2026-10-27, from a London IP with an honest identified User-Agent, 22 of 40 shop domains blocked, challenged or did not answer. But the block is mostly about **who the bot is**, not about robots.txt or the request rate:

| Signal | What it means |
|---|---|
| Altex, Media Galaxy, Douglas, Sephora, Fashion Days (Akamai / EdgeOne) served Common Crawl's known bot with mostly HTTP 200 while resetting our unknown bot | Access is gated on bot reputation and verification. A known, verifiable bot gets in; an anonymous one does not |
| evoMAG's CAPTCHA (its hosting provider's "Distinct Traffic Filter") fired on the very first request and spoke of "abnormal traffic from your network" | Network reputation of the egress IP, not our behaviour. A clean dedicated IP may simply not be filtered; the filter publishes an unblock contact (`captcha@distinct.ro`) |
| cel.ro timed out at TCP level from the UK | Possibly geo-filtering; untested from a Romanian IP |
| Flanco, PC Garage, Vexio, iStyle, Notino, Dr. Max, Noriel, Cărturești, Decathlon (Cloudflare managed challenges) block unknown bots and even Common Crawl | Cloudflare zones with "block AI/unknown bots" settings. Verified-bot status moves us from "unknown" to "known Data Collection bot", which the shop then decides on |
| Leroy Merlin (DataDome), Hornbach (Fastly challenge), OLX (CloudFront 403) | Vendor-specific allowlists controlled by the shop |
| PC Garage, Vexio, evoMAG and cel.ro are listed on compari.ro | They already maintain a comparator feed and pay per click for it. They can give us the same feed URL |
| No crawler documentation pages exist for Heureka, Skroutz, PriceRunner; idealo now publishes one (partner.idealo.com/de/bot) | Those engines run mostly on merchant feeds, not on crawling blocked shops |
| Cloudflare's verified-bot directory already lists small comparators: idealo, SkroutzBot, dozens of niche engines and the Romanian one-person **PretAlertBot** (signed with Web Bot Auth, 8–12 s per shop, daily) | Verification of a small, well-documented comparator bot is realistic within weeks, not a theory |
| Altex and Media Galaxy listing pages embed 48 products with price, stock, seller and EAN server-side (archived 2026 HTML); PC Garage, evoMAG, cel.ro and Flanco also put listing prices in the HTML | Once access exists, the cheap HTTP tier suffices; no browser rendering needed |
| cel.ro serves fake products with random hex names and prices to crawlers behind its own captcha | A challenge page must never be treated as data; the anomaly guard rejects random-hex titles |
| Hornbach serves Common Crawl 97% and OLX 82% while blocking unknown bots | Allowlisting of a known bot is the normal path for Fastly and CloudFront sites |

Conclusion: for the blocked majors the problem is a business-development and identity problem first, and an engineering problem second.

## 2. The layered approach (in the order we try them)

### Layer 1 — Be a bot that can be let in (weeks 0–2)

1. **Dedicated, clean egress IPs** used only by the crawler, with forward-confirmed reverse DNS (`crawl-N.bot.pretoscop.ro`), published in `/bot/ips.json`. Never shared cloud NAT, never GitHub Actions runners, never residential proxies: those are reputation-poisoned or indistinguishable from consumers, which defeats allowlisting.
2. **Re-probe from the right place.** Before a shop is classified as blocked, probe it (≤3 requests, 5 s apart) from (a) the production dedicated IP, (b) a Romanian IP (a Bucharest VPS at €6–9/month from ishosting or Hostico, or a Digi Business line with a fixed IPv4 at €9–13/month; ask the provider in advance whether PTR records can be set; Bucharest–Falkenstein latency is about 34 ms), (c) off-peak. Several "blocks" seen from London are likely reputation or geography filters that a clean Romanian IP never triggers (evoMAG, cel.ro are the first candidates). Record outcomes in the shop registry.
3. **Web Bot Auth from day one.** Sign requests (HTTP Message Signatures, `Signature-Agent: https://pretoscop.ro`) and publish the key directory. Cloudflare, Akamai and DataDome accept this as proof of identity.
4. **Public bot page** (`/bot`): purpose, UA strings, IPs, rDNS, rate and back-off rules, what we store, how to block or slow us, feed alternative, contact with a one-business-day reply SLA. This is what Cloudflare compares against observed behaviour.
5. **Apply where it works**: Cloudflare Verified Bots (category "Data Collection"; Web Bot Auth or IP validation; "all customers" can submit, no review SLA, small comparators including a Romanian one are already listed), Akamai Bot Directory form, DataDome's good-bot form (its "Comparators" category is not allowed automatically, so each DataDome shop must opt us in), Fastly's community form (no Web Bot Auth support documented). Skip the IAB/ABC Spiders & Bots list: it costs $5k–15k a year, and being on it mainly makes retailers' Google Analytics drop our traffic. Verification proves identity; it does not force a shop to admit us, but it makes a shop's "allow PretoscopBot" a one-line rule.

### Layer 2 — Get the data without crawling at all (weeks 0–8)

6. **Affiliate feeds** where the shop is on a network: evoMAG (2Performant, 15+ feeds), Notino and Answear (CJ), Douglas, Samsung and Xiaomi (Awin), Cărturești, Noriel, Dr. Max, Petmart, Bonami (2Performant), ITGalaxy, ForIT, Vexio (Profitshare). The site can block bots all it wants; the feed carries the prices. Prerequisite: written clearance for price-history use (2Performant ToS §9).
7. **Merchant direct feeds through the free-listing portal** (M20). The pitch is one sentence: "paste the compari.ro or Google Shopping feed URL you already have". First targets: PC Garage, Vexio, evoMAG, cel.ro (already on compari). Then the shops without any comparator relationship: Altex, Media Galaxy, Flanco, iStyle, EuroGSM, once we can show them traffic numbers ("N users compared products you sell last month; your competitors were shown, you were not").
8. **Allowlisting requests to the shop itself** as the alternative in the same email: "or add a WAF rule for our IPs/UA/header". Akamai and Fastly shops can match a merchant-agreed header (the Honey precedent); Cloudflare shops can skip the challenge for our IPs; evoMAG's hoster has an unblock mailbox.
9. **Google CSS later**: once ≥50 merchant domains are listed, merchants can route Shopping ads through Pretoscop and share feeds structurally. Not a near-term channel.

### Layer 2b — Assisted-access channel (prototype, from Phase 0; decided 2026-10-27)

For the designated shops that neither admit the identified crawler nor supply a feed yet (Altex, Media Galaxy, Flanco, PC Garage, cel.ro; evoMAG and Vexio only until their feeds are live), public prices are read through a **commercial data-collection service** that handles anti-bot challenges on the vendor's side. We do not operate stealth browsers, proxy pools or solvers ourselves.

- **Vendor** (facts verified 2026-10-27): Zyte API as the default (Zyte Group Ltd, Ireland; five site tiers assigned automatically and reviewed quarterly with two weeks' notice; HTTP $0.06–1.27 and browser $0.48–16.08 per 1,000 requests depending on tier and commitment; failed responses are free; 3,000 requests/minute; Romania is an "extended" geolocation, which likely means residential IPs and business verification; a custom User-Agent may be replaced and browser requests cannot set one, so this traffic never carries PretoscopBot's identity). Bright Data Web Unlocker ($1.50 per 1,000 pay-as-you-go or $499/month for 383k) is the most formal alternative: without KYC it refuses robots-disallowed URLs, and KYC (company documents, 48-hour review) limits access to the approved use case. Oxylabs Web Unblocker (Vilnius; $3–7.2/GB) and ScrapingBee (Paris) are wired as second providers behind the same `AssistedClient` interface. All five vendors' terms put compliance with the target site's terms and the law on the customer, Oxylabs and ScraperAPI explicitly forbid scraping in breach of a site's terms, and none guarantees success rates. Because several designated shops' terms ban republishing prices (Flanco's 2025 text, cel.ro, evoMAG, Vexio, EuroGSM), the written legal opinion must name the vendor and these shops explicitly.
- **Tiers**: HTTP tier by default. Archived HTML shows that Altex and Media Galaxy listings embed 48 products with price, stock, seller and EAN server-side, and that PC Garage, evoMAG, cel.ro and Flanco listings carry prices too, so the browser tier (roughly ten times the cost) should rarely be needed; it is reserved for pages that prove client-rendered through the channel. Challenge pages are never ingested (cel.ro returns fake products behind its captcha).
- **Same rules as PretoscopBot**: per-domain minimum interval and concurrency 1, daily page budgets, off-peak bulk windows, robots.txt obeyed (fetched through the channel when the direct fetch is blocked), listing pages preferred over product pages, no images or descriptions, no login/cart/checkout, no internal or undocumented APIs, no personal data.
- **Controls**: `shops.access_mode` (`direct | assisted | feed_only | off`) editable only by admins with an audit row; `legal_basis_ref` pointing at the filed opinion; `access_costs` ledger with a monthly cap (start €150) and a hard stop; per-shop success-rate metric with auto-pause below 80% for 7 days (never an escalation to more aggressive tooling); kill switch and the stop-on-written-objection procedure in the runbook.
- **Provenance and display**: observations through this channel are our own verified readings of the public page (`source_tier` 1, `channel='assisted'`), timestamped like every other offer. The bot page describes PretoscopBot truthfully and does not claim that all collection is done by it; the methodology page states that for some shops prices are collected through a third-party data-collection service.
- **Cost at prototype scale**: five shops, roughly 1,500 listing pages a day on the HTTP tier plus a few hundred rendered pages: about €50–250 a month. The research estimate for listing-based refresh is ≈$51 a month at 50k offers, ≈$506 at 500k and ≈$2,025 at 2M with 30% of offers on protected shops; product-page refresh would cost about 13× more.
- **Exit per shop**: the channel is a bridge. M21 tracks each assisted shop's migration to a merchant feed or an allowlist, reviewed monthly; when the replacement is live, assisted mode is switched off for that shop. Target: fewer than half of the designated shops still on assisted access by month 6.
- **Sequencing with the verified-bot programs**: the applications describe PretoscopBot and its own IPs only; assisted traffic is not PretoscopBot. A shop or a bot-management vendor may still react negatively if the practice is noticed; that is the main residual commercial risk (R18).

### Layer 3 — Observe through users' own browsers (months 4–9)

10. **The browser extension's opt-in price reports** (M26). The user's browser renders the Altex or Flanco page legitimately; with explicit consent the extension sends `{domain, sku/gtin, price, availability, observed_at}` for supported product pages, nothing else. For shops we can crawl, a report only triggers a verification crawl. For shops we cannot crawl, reports become a **separate trust tier**: shown as "preț raportat de utilizatori Pretoscop la <date>", accepted only when it maps to a known offer, lies within a plausibility band and, for history, when two independent reports agree. Pricy's 100K-user extension shows the reach this can have; it also shows the trust problem when the data goes stale, which is why we label and date it.
11. **Trusted reporters** for the top products (Black Friday, hot SKUs): founders and vetted users with a "record this price" button in the extension, producing timestamped observations with evidence. Human browsing of a public page is not automated access.

### Layer 4 — Honest fallbacks in the product (from launch)

12. **Coverage honesty**: on every product page a line "Magazine neincluse încă: Altex, Flanco (nu permit accesul automat; le-am cerut un feed)" and plain "Verifică și la Altex" search links, labelled unverified. Linking is lawful, useful to the user, and a visible nudge to the shop.
13. **Manual bridge for a few hundred products**: an admin tool that accepts a saved product page (uploaded by a founder from their own browser) and records the observation with evidence, as the prototype did for OLX. Scale is small; it exists for Black Friday weeks and for the Tier A list, not as a steady state.

## 3. What stays excluded, and the trade-offs the decision accepts

| Technique | Status |
|---|---|
| Self-hosted stealth or anti-detect browsers (Camoufox, nodriver, undetected-chromedriver), self-managed TLS/fingerprint impersonation, self-operated CAPTCHA or proof-of-work solvers | **Excluded.** A maintenance sink that breaks monthly, and operating circumvention tooling ourselves is exactly the posture the assisted-channel decision avoids |
| Residential or mobile proxy pools managed by us | **Excluded.** Un-allowlistable by design, GDPR and sourcing problems (a vendor site showed an FBI seizure banner during the research), $2–8/GB with browser loads |
| Commercial data-collection ("unblocker") service for designated shops | **Allowed for the prototype under §0's conditions** (decision 2026-10-27, legal advice obtained; written opinion to be filed) |
| Undocumented internal APIs (`fenrir.altex.ro`, `sapi.emag.ro`, Magento GraphQL where robots disallows it) | **Excluded.** Non-public services; eMAG's terms 4.2(k) forbid them explicitly; unstable and unlicensed |
| Buying scraped data from price-intelligence vendors for public display | **Excluded.** Expensive and usually not licensed for republication |
| Extending assisted access to eMAG | **Not covered by this decision.** eMAG stays under ADR-013 and its own founder decision |

Residual risks the plan keeps in view (`10-risk-register.md` R3, R18): contract claims under shop terms (Flanco's archived terms forbid republishing prices; Altex has only a general IP clause; PC Garage's and cel.ro's terms were not retrievable), the database-right balancing test (CV-Online), vendor dependence and cost, and the reaction of shops or bot-management vendors if the practice is noticed. The founders report that their lawyer considered the approach lawful for Pretoscop; the written opinion and its exact scope (shops, methods, conditions) are the reference for any future change, and a shop's written objection is honoured within one business day regardless.

Competitors do more than this (Pricy crawls Altex and Flanco; hobby repos use stealth browsers). Our line: a verifiable identified crawler wherever a shop admits one, licensed feeds wherever they exist, a vendor-operated assisted channel for the designated gap during the prototype, and nothing operated by us that is designed to deceive.

## 4. Expected coverage by phase (electronics)

| Phase | Covered | How |
|---|---|---|
| 0–1 (now – Dec 2026) | eMAG (founder decision), evoMAG, IT Galaxy, forit, Flip, Dedeman, Carrefour, Auchan, Libris, Elefant, Bonami + approved feed programs; **Altex, Media Galaxy, Flanco, PC Garage, cel.ro through the assisted channel (M05B)** | Crawl, feeds, assisted channel |
| 3 (Feb–Mar 2027) | PC Garage, Vexio, cel.ro (merchant feeds); evoMAG and cel.ro re-probed from a Romanian IP; first verified-bot outcomes | Portal, re-probes, applications |
| 3–4 (Mar–Jun 2027) | Altex, Media Galaxy, Flanco migrate from the assisted channel to feeds or allowlists where they answer; iStyle and others via outreach; extension reports as an additional tier | Business development, migration, extension tier |
| 5 (H2 2027) | Structural feeds via CSS and merchant base | CSS enrolment |

If by month 6 none of Altex, Flanco or Media Galaxy has moved to a feed or an allowlist, the assisted channel continues for them within the cap, and the risk register (R3, R18) says to shift effort to merchant sales rather than to self-operated tooling.

## 5. Engineering hooks already in the plan

- `shops.status`, `access_mode` and `crawl_policy` record the probe outcomes per vantage point and the channel; `pnpm shops:probe <slug>` re-probes politely (M21).
- Assisted-access channel: `packages/fetch/assisted`, `shops.access_mode`, `legal_basis_ref`, `access_costs` ledger and cap, runbook (M05B). Built on 2026-10-28 and shipped off (no shop on it, no vendor key); switching a shop on follows `infra/runbooks/assisted-access.md` once A10 is done (ADR-022).
- `fetchPolite` signs requests when `WEB_BOT_AUTH=1` (M21) and treats challenges as "stop and back off ≥24h" (M02).
- Offer trust tiers: 1 crawled or merchant feed (verified, timestamped), 2 affiliate feed, 3 user-reported (extension, two independent reports), 4 link-only. Ranking uses tiers 1–2 by default; tier 3 is shown with its label; tier 4 is a link.
- Coverage-honesty block and "Verifică și la" links on product pages (M13).
- Manual-observation admin tool with evidence upload (M09 extension in Phase 3).
- Outreach tracker and templates (`08-monetization-playbook.md` §7; M21).
