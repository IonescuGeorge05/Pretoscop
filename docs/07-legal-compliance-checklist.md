# Legal and compliance checklist

Practical guidance distilled from `docs/01-research-report.md` §4 and the legal notes; not legal advice. Each item names the module that implements it. Items marked **(lawyer)** need a Romanian lawyer's confirmation before launch.

## 1. Data collection

| # | Rule | Implementation | Module |
|---|---|---|---|
| 1.1 | Obey robots.txt (RFC 9309), identify the crawler, publish IPs and contact, honour opt-outs within one business day | `packages/fetch`, `/bot` page, `shop_sources.kill_switch` | M02, M17 |
| 1.2 | PretoscopBot never bypasses technical access restrictions (CAPTCHA, WAF challenges, rate limits); Romanian Criminal Code art. 360 punishes unauthorised access, with higher penalties where access restrictions exist. The assisted-access channel for the designated shops rests on the founders' legal advice of 2026-10-27 (ADR-015) | Block detection pauses the source; no self-built stealth tooling (ADR-005); assisted channel only via `packages/fetch/assisted` under the conditions of `12-blocked-shops-strategy.md` §0 | M02, M05B |
| 1.2a | Assisted access: file the written opinion with its scope (shops, methods, conditions); public pages only; no login, internal APIs, images, descriptions or personal data; politeness identical to the identified crawler; kill switch; stop on written objection within one business day; monthly review; methodology page states that some shops are read through a third-party data-collection service | `shops.access_mode`, `legal_basis_ref`, `access_costs`, runbook | M05B, M17 |
| 1.3 | Prefer licensed channels: affiliate feeds (2Performant allows comparators; eMAG/Profitshare and Fashion Days forbid), merchant feeds with written terms, Icecat under its licence | Source registry records `comparator_policy` and the written basis | M04, M24 |
| 1.4 | Database right (Directive 96/9, CV-Online C-762/19): a comparator that sends traffic and copies only what it needs is lower risk; mirroring a shop's own search (Innoweb) is high risk | Store only offer facts (price, stock, URL, title, identifiers); no descriptions, reviews or images from crawled pages | M03, M05 |
| 1.5 | Contract terms can bind even unprotected data (Ryanair C-30/14). eMAG terms §4.2(j) forbid automated extraction; §6.2 forbids republishing content (including prices) **(lawyer)** | Founder decision recorded (ADR-013); eMAG isolated and removable | M05 |
| 1.6 | 2Performant ToS §9: feed data must not be used to create "a database or information service" without clearance **(lawyer / network)** | Written clearance (setup A7) or history from own crawl of merchant pages | M05, M24 |
| 1.7 | Personal data in scraped content (marketplace seller names, private sellers) | Store marketplace seller *business* names only; no classifieds in MVP | M03 |
| 1.8 | Icecat: attribution "Specs Icecat", no AI training, share-alike for derived data, block AI crawlers in robots.txt | Attribution component; Icecat data segregated; robots.txt rules | M11, M16 |
| 1.9 | Document a legitimate-interest assessment (GDPR art. 6(1)(f)) for any personal data that slips into crawled offers (sole-trader seller names) and consider art. 14 information duties; simplest is not to ingest it | `docs/legal/lia-crawl.md` | M17 |

## 2. How offers must be displayed (consumer law)

| # | Rule | Implementation | Module |
|---|---|---|---|
| 2.1 | Ranking transparency: publish the main parameters determining ranking and their relative importance (UCPD art. 7(4a) = Law 363/2007 art. 7(4^1)–(4^2), inserted by OUG 58/2022) | Page `/cum-functioneaza` with the ranking formula (total price, stock, freshness) and a link next to the sort control | M13, M17 |
| 2.2 | Paid ranking must be labelled next to the result; "increased commission per transaction" counts as payment (UCPD Annex I point 11a = Law 363/2007 Annex 1 point 24) | Label `Promovat` on promoted rows; affiliate links never influence rank; disclosure note on product page | M13, M25 |
| 2.3 | A pure comparator is not itself bound by the 30-day prior-price rule, but our own "−X%" / "best price" claims must be truthful (UCPD; the shops' own rule is HG 947/2000 art. 4^1, fines art. 12(2) RON 5,000–30,000) | Discount badges only vs. our observed 30-day minimum with ≥14 days of data; shop's crossed price labelled as the shop's reference | M08, M15 |
| 2.4 | Seller status: show whether the seller is a trader; flag marketplace sellers (Law 363/2007 art. 7(4)(f)) | `seller_type` badge "Vândut de X prin eMAG Marketplace" | M13 |
| 2.5 | Price accuracy and currency: stale or wrong prices can be misleading practices (Law 363/2007 art. 15(1)(b): RON 20,000–100,000, doubled above 100 consumers; widespread infringements up to 4% of turnover, art. 15^4) | Per-offer "verificat acum N ore"; stale offers demoted and marked; "report wrong price" link; disclaimer that the shop's page is authoritative | M13, M08 |
| 2.6 | Commission's "Key principles for comparison tools": impartiality, transparency of business model, coverage statement, last-update time, complaint channel | `/cum-castigam-bani`, coverage statement ("acoperim N magazine; lista"), contact form | M17 |
| 2.7 | P2B Regulation 2019/1150 (if we contract with merchants): ranking parameters in merchant terms, complaint handling | Merchant terms page and complaint email | M20 |
| 2.8 | Affiliate and advertising disclosure (Law 148/2000, ANPC influencer guidance): label commercial links | "Link afiliat" tooltip + `rel="sponsored nofollow"` on `/out` links; ad slots labelled `Publicitate` | M13, M25 |
| 2.9 | Discount-verification flags can raise defamation or commercial-disparagement claims | Factual, reproducible wording with the numbers and dates ("Prețul de referință afișat de magazin (X lei) este mai mare decât cel mai mic preț observat de Pretoscop în ultimele 30 de zile (Y lei, la data Z)"); methodology page; evidence retained; merchant correction channel and right of reply; lawyer review before any press release | M15, M23 |

## 3. Privacy and communications

| # | Rule | Implementation | Module |
|---|---|---|---|
| 3.1 | Price alerts are direct marketing (Law 506/2004 art. 12(1)–(2); sanctions art. 13(1) q): RON 5,000–100,000 or 2% of turnover above RON 5m; ANSPDCP fined Amato Bestseller RON 50,000 under art. 12(1); Law 365/2002 art. 6 on unsolicited commercial communications now carries RON 1,000–100,000; CJEU Inteligo Media C-654/23): prior express consent | Double opt-in; consent text versioned and stored with timestamp and hashed IP; unsubscribe link and `List-Unsubscribe` in every email | M19 |
| 3.2 | Cookie banner with equal first-layer Accept/Reject; no non-essential cookies before consent; analytics after consent (Law 506/2004 art. 4(5) information + consent, 4(5^1) browser-settings consent, 4(6) exemptions; sanctions art. 13(1) i); recent fines Aviziero RON 5,000, Homelux RON 30,000). The "reject all" bill is Pl-x 455/2026 at the Chamber of Deputies with a favourable committee report (20 Oct 2026), plenary agenda 26–28 Oct 2026: check the outcome after 28 Oct; if adopted there are 120 days to comply and this design already complies | Consent component; Plausible loaded after consent; server-side event log without cookies | M17 |
| 3.3 | Privacy policy: controller identity, purposes, legal bases, processors (Hetzner, Cloudflare, Resend, Sentry, Anthropic), retention, rights, ANSPDCP contact | `/confidentialitate` | M17 |
| 3.4 | Data minimization and retention: hashed IPs/UAs in click logs; aggregate after 90 days; delete inactive alert accounts after 24 months | Rotating salt, retention job | M13, M19 |
| 3.5 | Data subject requests: export and delete | Admin tool | M09, M19 |
| 3.6 | Processor agreements (DPA) with Resend, Cloudflare, Hetzner, Anthropic, Sentry; international transfers covered by DPF/SCCs | Keep signed DPAs in `infra/legal/` (not in git if confidential) | B-phase setup |
| 3.7 | Records of processing (GDPR art. 30) — small but keep it | `docs/legal/ropa.md` template | M17 |
| 3.8 | Do not collect CNPs except where B2C e-Factura requires one (a consumer who gives none is invoiced with 13 zeros); Law 190/2018 restricts CNP processing | Invoicing flow | M25, M28 |

## 4. Platform regulation

| # | Rule | Implementation | Module |
|---|---|---|---|
| 4.1 | DSA: as an intermediary with no user-generated content we are not an "online platform"; micro/small enterprises are exempt from most platform duties. Romanian Law 50/2024 still requires **notifying ANCOM within 45 days of launch** (fine 5,000–30,000 lei); as of 2026-10-27 ANCOM has not issued the decision and form for the art. 5 notification, so check ancom.ro before launch, notify as soon as the form exists and keep evidence of the attempt | Calendar item at launch; point of contact page | Launch |
| 4.2 | Do not add user reviews/comments without re-assessing DSA obligations | Product principle | — |
| 4.3 | European Accessibility Act: comparison without checkout is probably out of scope; microenterprise exemption applies; still target WCAG 2.2 AA and publish an accessibility statement (EN 301 549 v4.1.1 was published 2 Sep 2026 with Official Journal citation expected 16 Dec 2026; v3.2.1 applies until then) | Accessibility checks in web modules; `/accesibilitate` | M12–M15, M17 |
| 4.6 | The EU ODR platform closed on 20 Jul 2025 and ANPC Order 270/2026 changed the SAL (alternative dispute resolution) pictogram rules: check the current notice requirement before selling premium plans | Checkout copy | M25 |
| 4.7 | Watchlist: Digital Fairness Act (announced for Q4 2026) and the Digital Omnibus (Council position 21 Oct 2026, nothing before 2027) | Quarterly legal review | — |
| 4.4 | Merchant-uploaded feeds make Pretoscop a hosting service under the DSA even while micro/small: points of contact (arts 11–12), terms (art. 14), notice-and-action with statements of reasons (arts 16–17) | Notice form on `/contact`; merchant suspension emails with reasons | M17, M20 |
| 4.5 | A consumer premium subscription triggers the Consumer Rights Directive (OUG 34/2014): pre-contractual information, 14-day withdrawal, digital-content rules | Checkout copy and invoicing | M25 |

## 5. Intellectual property and brand

| # | Rule | Implementation | Module |
|---|---|---|---|
| 5.1 | Shop names and logos: referential use is allowed to identify the shop (Law 84/1998, republished 2020, art. 45(1)(c)); do not imply endorsement; use logos from feeds/press kits or text names | Logo policy in `shops.logo_key`; text fallback | M12 |
| 5.2 | Product images and descriptions: only from feeds (provided for promotion) and Icecat; never from crawled pages (ADR-008) | Image pipeline with `source` and `license_note` | M11 |
| 5.3 | Our own price database benefits from the sui generis database right (Law 8/1996 Title II Chapter VII, arts. 140–143; TDM exceptions arts. 36^1–36^2 via Law 69/2022); document the investment (logs, costs) | Keep ingestion stats and infrastructure invoices | ongoing |
| 5.4 | Trademark "Pretoscop": no conflicts found in TMview (2026-10-27); file OSIM/EUIPO classes 35, 42 after launch | Setup C5 | — |
| 5.5 | Protect our own database: database-rights and anti-scraping clause in the ToS, machine-readable reservations (robots.txt, TDMRep) for our pages, evidence of investment kept | ToS text; robots rules | M16, M17 |

## 6. Company and tax (2026 rules, verify with an accountant)

| # | Item | Detail |
|---|---|---|
| 6.1 | SRL: RON 500 minimum capital (Law 239/2025, in force 18.12.2025), paid in full before registration (operating before full payment is a criminal offence for the administrator, Law 31/1990 art. 275(1)(c)); ONRC registration is free (Law 265/2022 art. 44) and decided within one working day (art. 105), certificate RON 30, optional ONRC drafting RON 136 + VAT; beneficial-owner declaration (Law 129/2019 art. 56, fines RON 5,000–10,000); main CAEN Rev. 3 code 6391 | Setup B4 |
| 6.2 | Micro-enterprise: 1% tax up to €100,000 (≈ RON 509,850), requires ≥1 employee within 90 days (OUG 8/2026, Fiscal Code art. 48(3)); otherwise 16% profit tax; D100 is filed quarterly even with zero revenue; a salaried founder still owes CASS on dividends at the 6/12/24 minimum-wage thresholds | |
| 6.3 | VAT: standard 21%, reduced 11%; exemption threshold RON 395,000 (supplies located in Romania); special VAT code (art. 317) requested on form 091 (OPANAF 631/2016) before the first intra-EU B2B service; D390 monthly by the 25th (symbols P/S, UK operations excluded) and D301 by the 25th for reverse-charged purchases | |
| 6.4 | e-Factura: B2B invoices within 5 working days (fine 15% of value if unsent); B2C mandatory since 2025; SAF-T D406 quarterly with a 3-month grace for the first report; Awin AG (Berlin) self-bills (clause 7.4); AdSense provides only a "Payment Receipt", so the SRL issues its own reverse-charge invoice | |
| 6.5 | Individuals: regular affiliate income is independent activity (PFA required); networks withhold 10% but that is not final | Form the SRL before revenue |
| 6.6 | Dividend tax 16% | |

## 7. Platform policies (Google, Chrome, networks)

| # | Rule | Implementation | Module |
|---|---|---|---|
| 7.1 | Google spam policies: "scraped content" and "thin affiliation" — pages must add value (history, total price, verdict, specs); Google's site-reputation manual actions do not apply to EEA users since 30 Aug 2026, but the content-quality rule stands | Content model of product page; noindex thin pages | M13, M16 |
| 7.2 | `rel="sponsored"` on paid/affiliate links; promoted placements labelled | `/out` links | M13 |
| 7.3 | AdSense (if used): ads must not look like content/navigation; no ads in the offers table | Ad slot component | M25 |
| 7.4 | Chrome Web Store: single purpose, no affiliate injection without user action, data-use disclosure | Extension design | M26 |
| 7.5 | Network rules: declare the site, no PPC brand bidding, follow per-program comparator policy (`comparator_policy`), max 5 CSS affiliates per advertiser | Program sync via 2Performant API | M24 |

## 8. Compliance artefacts register

| Artefact | Where | Owner | Module / when |
|---|---|---|---|
| Terms of use (consumers), privacy policy, cookie policy, accessibility statement | `/termeni`, `/confidentialitate`, `/cookies`, `/accesibilitate` | founders + lawyer | M17, before launch |
| Ranking-parameters page and business-model page | `/cum-functioneaza`, `/cum-castigam-bani` | founders | M17 |
| Methodology page (discount verification, data collection incl. assisted channel wording) | `/metodologie` | founders | M17 (placeholder), M23 |
| Bot page with IPs, rDNS, Web Bot Auth keys | `/bot`, `/bot/ips.json`, `/.well-known/http-message-signatures-directory` | implementer | M17, M21 |
| Merchant terms (P2B: ranking, suspension reasons, complaints) | `/pentru-magazine/termeni` | founders + lawyer | M20 |
| Alert consent texts (versioned) | `packages/config/legal-texts.ts` | founders + lawyer | M17, M19 |
| Records of processing (ROPA), legitimate-interest assessment for crawled data, processor/DPA list | `docs/legal/ropa.md`, `docs/legal/lia-crawl.md`, `docs/legal/dpa-list.md` | founders | M17 |
| Written legal opinion on the assisted-access channel, with scope | `infra/legal/` (outside git) | founders + lawyer | Setup A10, before M05B goes live |
| eMAG decision record and (if any) written opinion on eMAG's terms | `docs/progress.md`, `infra/legal/` | founders | Setup A8 |
| 2Performant written clearance on ToS §9 | `infra/legal/` | founders | Setup A7 |
| ANCOM DSA notification confirmation | `infra/legal/` | founders | launch + 45 days |
| SRL registration, VAT special code, e-Factura enrolment | accountant's file | founders | Setup B4 |
| Trademark filing receipt (OSIM/EUIPO) | `infra/legal/` | founders | Setup C5 |
| Takedown/objection log | `infra/legal/objections.md` | founders | ongoing |

## 9. Incident playbook

1. **Takedown or stop request from a shop**: acknowledge within one business day; disable the source (kill switch) immediately unless a lawyer advises otherwise, for assisted-access shops as well; keep a log; reply with the bot page and an offer to switch to a feed; inform the vendor if its terms require it.
2. **Wrong-price report**: verify against the shop page; correct or quarantine; if the shop's page itself is wrong, keep our observation with a note.
3. **Data breach**: ANSPDCP notification within 72 hours where required; template in `infra/runbooks/breach.md`.
4. **Network policy change** (e.g., a program bans comparators): program sync marks `comparator_policy=forbidden`; affiliate links are replaced by plain links the same day.
