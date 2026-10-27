# Pretoscop — Product definition and scope

Status: v1, 2026-10-27. Owner: founders. Read this before the architecture and the plans.

## 1. One-sentence definition

Pretoscop is a Romanian price comparison service that, for any product, shows every Romanian online shop selling it, ranked by the real total price (price + delivery), together with the product's price history, so that people can tell whether a discount is real and buy at the lowest price.

## 2. Who it is for and what job it does

| User | Job to be done | What they see today | What Pretoscop gives them |
|---|---|---|---|
| Romanian consumer comparing a specific product (phone, laptop, TV, console, appliance) | "Where is this exact product cheapest, all-in, right now?" | They open 4–6 shop tabs; compari.ro covers only shops that pay; price-history extensions show stale data | One page per product: all shops, total price, stock, last-checked time, one click to the shop |
| Consumer who distrusts a discount (Black Friday, "-40%") | "Is this a real discount? What did it cost last month?" | eMAG shows its own 30-day reference; other shops show nothing; extensions are patchy | Our own observed history from launch day, the 30-day low, all-time low, and a plain verdict |
| Consumer waiting for a price | "Tell me when it drops under X lei" | Nothing reliable in Romanian | Email (later push/Telegram) alerts with explicit opt-in |
| Online shop (merchant) | "Get my offers in front of people comparing prices" | compari.ro pay-per-click, Google Shopping | Free feed listing at first; later paid placement and price intelligence |
| Brand / retailer analyst | "What are competitors charging for my SKUs?" | Expensive SaaS (Price2Spy, Prisync) | Dashboards and exports built on our own price database (later phase) |

## 3. Why now (evidence summary)

- Demand is seasonal and sharp: Romanian searches for price history are modest but real (recalibrated in round 2 to about 4.5K/month for "istoric pret" and 3.4K for "istoric preturi", against ≈17K for "cel mai mic pret" and 13–14K per "iPhone 17 pret" variant), 51–64% of the year's price-history searches fall in the five Black Friday weeks (≈38K in 2025), and Black Friday peaks are 3–4× their 2021 level. eMAG Black Friday 2026 is on 6 November 2026.
- Trust gap: 63% of Romanians say brands cheat on Black Friday; 83% track prices before it. The Competition Council's 2018 inquiry found about 80% of reference prices above the legal level. No comparator-run fake-discount study has been published for 2023–2025, so the slot is open.
- The incumbents are either shop-paid (compari.ro, about 3.6M visits/month, lists only shops that supply a feed) or small and stale (Pricy 100K extension users but "stale prices" complaints; istoric-preturi.info entries last checked months ago; a new entrant, Pret Alert, launched its extension in October 2026).
- Data channels exist: 2Performant has 378 public Romanian programs, allows feeds "în comparatoare de prețuri", pays natural persons, and its feeds carry GTIN and old price. Several large shops serve honest crawlers.

Full evidence and sources: `docs/01-research-report.md` and `docs/research/notes/`.

## 4. Scope

### 4.0 Prototype (November–December 2026) versus MVP (public launch, late January 2027)

The **prototype** is Phases 0–1 of the plan: the price recorder (eMAG under its own decision, feed shops, permissive shops, and the designated blocked shops through the assisted-access channel), the canonical catalogue, matching with a review queue, rollups and the admin. It is internal (no public site, `noindex` staging only) and exists to validate coverage per shop, matching precision, data freshness, the cost of the assisted channel and the Black Friday 2026 dataset. The lawyer's clearance of 2026-10-27 for the assisted-access channel was given for this prototype; before the public launch (Gate G2) the founders re-confirm it in writing for production use, or switch the affected shops to feeds, allowlists or link-only.

The **MVP** is the public launch (Phase 2) with the content below.

### 4.1 MVP (public launch) — what is in

1. Catalogue of canonical products in electronics, IT and appliances (phones, tablets, laptops, PC components, TVs, audio, consoles and games, large and small appliances), with brand, category, images (licensed sources only) and basic specs.
2. Offers from every shop we can legitimately read: affiliate feeds (2Performant and others that allow comparators), merchant-supplied feeds (free listing), polite crawling of shops that serve our identified bot and do not forbid it, and eMAG under the explicit founder decision described in `docs/04-plan-normal.md` §3.
3. Product page: offers ranked by total price (price + estimated delivery), stock, seller type (shop vs marketplace seller), per-offer "verificat acum N ore", click-out to the shop (affiliate link when one exists, labelled), price history chart (daily minimum across shops + per-shop series), 30-day low, all-time low, discount verdict.
4. Search with Romanian diacritic folding and typo tolerance; category and brand pages; deals page (largest verified drops).
5. Price alerts by email with double opt-in.
6. Trust and legal pages: how we rank, how we make money, how we collect prices (bot page), terms, privacy, cookies, contact, merchant onboarding page.
7. Admin: source health, match review queue, product merge/split, manual corrections.
8. Phase 0 price recorder running before 6 November 2026 so that history starts before Black Friday.

### 4.2 Post-MVP (in the plans, later phases)

Merchant self-serve portal with paid placement, browser extension, Telegram bot and web push, LLM-assisted matching at scale, B2B price-intelligence dashboards and API, Black Friday fake-discount report tooling, category expansion (beauty, books, toys, home), Google CSS enrolment once 50+ merchant domains are listed.

### 4.3 Explicitly out of scope (for now)

- Second-hand and classifieds (OLX, Publi24): different legal regime (private sellers' personal data, trader/consumer labelling) and low monetization. Revisit after month 6.
- Checkout or marketplace on Pretoscop (would make us a trader and pull us into the European Accessibility Act and Omnibus seller rules).
- User reviews and comments (would make us a DSA "online platform" with hosting obligations).
- Mobile native apps (PWA first).
- Self-built evasion tooling (stealth browsers, CAPTCHA solvers, residential proxy pools, internal shop APIs). For a designated set of blocked shops the prototype uses a commercial assisted-access service under the founders' legal advice (`12-blocked-shops-strategy.md` §0), with an exit per shop to feeds or allowlists; coverage otherwise comes from feeds, allowlisting and merchant relationships.
- Cross-border shops (Amazon.de, Temu, Trendyol) in the MVP; they can be added as "livrare din străinătate" sources later.

## 5. Product principles

1. **Total price, not sticker price.** Default ranking is price + delivery estimate; the breakdown is always visible.
2. **Our own observations are the source of truth for history.** We never fabricate history, never interpolate between observations, and label every data point with when we saw it.
3. **Honest bot, honest site.** Identified crawler, published IPs and bot page, robots.txt respected, rate limits that a shop would consider polite, opt-out honoured within one business day; where a shop is read through the assisted channel, the methodology page says so in general terms. Ranking parameters and money-making are disclosed.
4. **Discount claims are verified or not shown.** We show "-X%" only relative to our own 30-day minimum, and we label the shop's crossed price as the shop's reference.
5. **Freshness is a feature.** Every offer shows its last check; stale offers (older than the per-shop SLO) are demoted and marked.
6. **Romanian first.** UI in Romanian with correct diacritics (ș, ț with comma below), prices in lei with Romanian formatting (1.234,56 lei), VAT included.

## 6. Success metrics

| Horizon | Metric | Target |
|---|---|---|
| Phase 0 (by 6 Nov 2026) | Products with daily observations from ≥2 shops | ≥5,000 |
| Prototype (Gate G1, mid-Dec 2026) | Designated blocked shops live through the assisted channel; success rate; monthly cost | ≥3 of 5; ≥90%; ≤ cap (€150) |
| Prototype (Gate G1) | Black Friday 2026 dataset: products with ≥20 daily observations spanning 1–30 Nov across ≥3 shops | ≥3,000 |
| Launch (MVP) | Canonical products with ≥2 live offers | ≥20,000 |
| Launch | Offer freshness: share of displayed offers checked within 24h | ≥90% |
| Launch | Match precision on an audited sample of 300 offers | ≥98% |
| Month 3 after launch | Organic sessions/month | 30,000 |
| Month 6 | Organic sessions/month; click-out rate; alert subscribers | 120,000; ≥25%; 5,000 |
| Month 6 | Merchants with a direct feed | 25 |
| Month 12 | Sessions/month; monthly revenue | 300,000; €4–6k |

Revenue modelling assumptions (base case €26 per 1,000 sessions) are in `docs/08-monetization-playbook.md`.

## 7. Assumptions made on the founders' behalf

These are stated so they can be overturned early:

1. Initial category: electronics/IT/appliances (highest GTIN coverage, highest price dispersion, strongest Black Friday demand, best structured data on shop pages).
2. Language: Romanian UI; English code, comments, commit messages and documentation.
3. Company: a Romanian SRL will be formed before public launch (needed for invoices to networks, e-Factura, DSA notification and merchant contracts). Until then, development runs under a founder's name with no revenue.
4. Budget: self-funded; infrastructure under €150/month for the first six months; LLM spend capped at €50/month initially.
5. Team: two founders supervising one or more AI coding agents; no hires in year one.
6. Hosting in the EU (Hetzner Germany) with Cloudflare in front; a small Romanian VPS only if a shop requires a Romanian IP.
7. Name "Pretoscop": no conflicting marks found in TMview on 2026-10-27; the .ro/.com/.eu/.net/.io/.app domains and the GitHub/YouTube/TikTok/X handles were free. Register the domains now; file an OSIM or EUIPO trademark after launch. One caution: search engines currently read "pretoscop" as a misspelling of "proctoscop" (a medical instrument), so test the name with a few users before committing to it.
