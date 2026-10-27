# Open items register (research gaps and who closes them)

Status: 2026-10-27, after two research rounds (ten agents in round 1, five in round 2). Every gap the research could not settle from public sources is listed here with the exact action that closes it. Statuses: **CLOSED** (settled from a primary or reliable source), **PARTIAL** (settled in part; the remaining part is stated), **NOT PUBLIC** (behind a login, a bot wall or a paywall; a founder, lawyer or accountant must close it), **NOT RESEARCHED** (deferred as low priority). The full evidence for each row is in the corresponding file under `research/notes/` (`gaps2_*.md`).

## Founder actions that close the most items (about one hour in total)

1. Open free 2Performant and Profitshare affiliate accounts: export one feed and watch how often it regenerates; read the "Price Comparison Services" setting per program; open the eMAG commission grid and a Profitshare feed header; find Flanco's end date under past merchants; ask evoMAG, GSMnet, F64 and bitmi in writing about comparator and price-history use.
2. Register on compari.ro as a merchant (1 RON) and download the current click-price spreadsheet.
3. Run the keyword list through Google Keyword Planner with a free Google Ads account; check google.ro logged in and logged out for 20 product queries.
4. Save browser PDFs of OLX's and Flanco's terms and PC Garage's live robots.txt; after 28 Oct 2026 check bill Pl-x 455/2026 (cookie "reject all") at cdep.ro.
5. Email GS1 Romania (helpdesk@gs1.ro) about Verified by GS1 API access; email Hostico, GTS and Digi about PTR records; email captcha@distinct.ro with PretoscopBot's IPs and user agent.
6. With the lawyer: confirm in writing the scope of the assisted-access clearance (vendor, shops, conditions) and whether it covers eMAG's terms; with the accountant: form 091 timing, D390/D301 set-up, SAF-T grace period, CASS on dividends.
7. Download the free filings for Árukereső (e-beszamolo, tax number 24868291) and idealo (Unternehmensregister) if benchmark revenue matters to you.
8. Check Instagram and Facebook for the @pretoscop handle from a logged-in account; reserve the company name at ONRC.

## Affiliate networks, comparator platforms, catalogue sources

Source: `research/notes/gaps2_affiliate_platforms.md`

### Takeaway
- **Closed:** 16 of 47 gaps (two of them by cross-reference to other gap files: G42, G43).
- **Partial:** 21.
- **Not public:** 9 (each with a founder action).
- **Cross-referenced / out of scope:** 1 (G35).

Most remaining unknowns need a logged-in network account (2P, Profitshare, CJ, Compari merchant portal), not more web research.

### Cited Findings

| ID | Gap (origin file) | Status | Key finding / founder action |
|---|---|---|---|
| G1 | 2P "My feeds" regeneration frequency (gaps_aff §1) | NOT PUBLIC | Advertiser feeds are pulled "de 3-4 ori pe zi". Action: poll an exported feed hourly for 48 h; ask 2P support |
| G2 | 2P "price comparison" traffic-source type (gaps_aff §1) | CLOSED | "Price Comparison Services" type exists; YES/MAYBE/NO; 180-day notice to close; API `usage` field. Residual: confirm picker label and IDs once logged in |
| G3 | PFA withholding vs self-assessment (gaps_aff §1) | PARTIAL | PFA is a payee option; 2017 guidance: PFA self-declares CAS/CASS; no withholding stated. Action: draft PFA profile and ask support |
| G4 | 2P ToS last-updated date (gaps_aff §1) | CLOSED | dateModified 17 Jun 2026 (link change only); substantive change 4 Feb 2026 (notices 6→3 months) |
| G5 | Exact wording of comparator help article (brief) | CLOSED | Full verbatim text in §1 |
| G6 | 2P eligibility, approval times, feed mechanism (aff_feeds §2) | CLOSED | See gaps_aff §1; re-verified |
| G7 | F64, GSMnet, spy-shop, bitmi, conectica (+ Vonmag, PCMadd, evoMAG) on 2P (brief) | CLOSED | Commission, cookie, payout days and rules in §2; no comparator clauses |
| G8 | ITGalaxy, ForIT, Techstar, Dualstore, Vonmag, PCMadd, Vexio on Profitshare (brief) | CLOSED | All offer feeds; ITGalaxy and ForIT ban Google CSS; Dualstore bans CSS and all paid ads; Vexio bans Google Ads |
| G9 | Unlabelled Profitshare figures (aff_feeds §3) | CLOSED | Approval rate / average approval days / no phone / feed. Vexio "No Feed" corrected |
| G10 | eMAG grid from 27.10.2025; evoMAG commission PDF (aff_feeds §3) | NOT PUBLIC | eMAG grid at a Profitshare login URL; evoMAG PDF blocked by Distinct, not archived. Action: log in or use a browser |
| G11 | Profitshare API docs and feed format (aff_feeds §2) | PARTIAL | API reconstructed from the WP plugin (HMAC, 5 endpoints, no feed endpoint); feed workflow documented. Action: generate a feed, read the header |
| G12 | Flanco 2P closure date (aff_feeds §1) | PARTIAL | Active on 22 Apr 2026, 404 now. Action: check "Past merchants" or ask 2P |
| G13 | cel.ro, EuroGSM programs (aff_feeds §1, §3) | PARTIAL | No program on 2P or Profitshare. Action: contact the retailers |
| G14 | QuickMobile maintenance page (aff_feeds §1) | PARTIAL | HTTP 503 today; operator in simplified bankruptcy since 2018 (Profit.ro) |
| G15 | Samsung RO, Xiaomi RO, Douglas RO on Awin (brief) | CLOSED | Up to 2% / up to 5% / 5%; 30-day cookies; no comparator clause |
| G16 | CJ, Tradedoubler, CityAds terms for About You, Answear, Notino, Modivo, ePantofi (gaps_aff §2) | NOT PUBLIC | Action: CJ, Tradedoubler and CityAds publisher logins → program terms |
| G17 | Impact, Partnerize, Webgains, Rakuten, Sovrn/Skimlinks in RO (aff_feeds §2; gaps_aff §2) | PARTIAL | Impact on 31 small RO stores, CJ on 15 (StoreLeads); nothing for the others |
| G18 | Kelkoo markets incl. RO (aff_feeds §2) | PARTIAL | Romania launched 2019; "29 markets" now, not listed. Action: Kelkoo API `country=ro` |
| G19 | "20% Google Shopping margin" and CSS fee models (aff_feeds §2, §5) | PARTIAL | Google publishes no figure; vendors: 20% bid deduction on Google's own CSS (16–20% measured); Árukereső CSS 10% of spend |
| G20 | CSS partner directory for RO (aff_feeds §5) | PARTIAL | RO is a CSS country, but no "CSS product pages" in RO; directory is JavaScript-only. Action: filter Find-your-match by Romania |
| G21 | eMAG via third-party CSSs (aff_feeds §4) | NOT PUBLIC | Action: read the "By …" labels on google.ro Shopping |
| G22 | Compari features: chart, depth, alerts, extension, ratings, app (mkt §3; growth Q4; gaps_aff §5) | CLOSED | Chart since launch, average and lowest price; 14-day "Reducere"; email alerts for 30 days; trusted-shop program; app unavailable; no extension; 4.31M RO users (DSA) |
| G23 | Compari click tariffs; Árukereső/Pazaruvaj lists; forum CPCs (aff_feeds §6; gaps_aff §3) | PARTIAL | 2011 Compari list (0.10–0.19 RON); full HU list of 2 May 2024 recovered. Action: Compari merchant account → pricing XLSX |
| G24 | Compari feed download time (aff_feeds §6) | CLOSED | Daily at 16:00, shown the next day |
| G25 | Altex, eMAG, Flanco feeds to Compari; how comparators get eMAG data (aff_feeds §4, §8; gaps_aff §6) | PARTIAL | Altex Compari store page archived to Apr 2024 (1.5★/55 reviews, no offers visible); "eMAG Consumabile" in 2012; none for Flanco or main eMAG. Pricy crawls (earlier file) |
| G26 | price.ro owner, launch, features, terms (mkt §3; growth Q4; gaps_aff §3) | PARTIAL | Since 2001; "Evolutie de pret" chart; shipping and stock shown; merchant login. Action: check price.ro/admin and terms |
| G27 | xprice.ro features (growth Q4) | PARTIAL | Chart, alternatives, coupons; 2,084 Firefox users; depth not stated |
| G28 | Pricy and istoric-preturi history depth (mkt §3; growth Q4) | PARTIAL | Pricy 12 months; istoric-preturi not stated. Action: paste an old product URL |
| G29 | Pricy SellerCenter pricing, feed vs crawl share (gaps_aff §5) | NOT PUBLIC | Action: seller.pricy.ro sign-up or email |
| G30 | Pricy Play installs and iOS ratings; istoric-preturi app (gaps_aff §5; mkt §3; growth Q4) | CLOSED | Android 500+; iOS 2.0 from 1 rating; browser app 0 ratings; no istoric-preturi Play app |
| G31 | Pret Alert team and user count (growth Q4) | PARTIAL | Anonymous non-trader, Gmail; no user count shown; 130+ shops, EAN matching |
| G32 | pretheure.com, preturireduse.ro (mkt §3) | CLOSED | A Canadian loan site and an online shop; not competitors |
| G33 | PriceRunner/PriceSpy depth, Árukereső features (mkt §4) | PARTIAL | PriceSpy help gives no depth (third party says 12 months); Árukereső shares Compari's platform |
| G34 | Keepa official pricing and users (mkt §4) | PARTIAL | Third-party sources only, conflicting €19 vs €29 per month; API from €49. Action: check keepa.com in a browser |
| G35 | Telegram/FB channels, Reddit, feature survey (mkt §3–§4) | Cross-ref / out of scope | See gaps_growth_and_demand.md Q2 |
| G36 | Open Icecat sponsors: Samsung, Apple, Xiaomi, LG, Sony (gaps_aff §4) | CLOSED | Free: Samsung, LG, Lenovo, Dell, Philips, Kingston. Full only: Sony, Xiaomi, Logitech, AMD. Restricted: Apple |
| G37 | Share of Romanian marketing text (gaps_aff §4) | PARTIAL | 1 of 8 free datasheets (Philips); Samsung and LG empty even in English |
| G38 | Icecat index files and JSON docs (brief; aff_feeds §7) | CLOSED | Earlier file plus a working free GTIN lookup |
| G39 | Verified by GS1 API pricing and eligibility via GS1 RO (gaps_aff §4; aff_feeds §7) | NOT PUBLIC | Action: email helpdesk@gs1.ro |
| G40 | Free GTIN source with RO electronics coverage; UPCitemdb etc. (gaps_aff §4; aff_feeds §7) | PARTIAL | Open Icecat for sponsored brands; UPCitemdb 0/2 EU GTINs |
| G41 | Skroutz and Ceneo field lists (aff_feeds §6) | PARTIAL | Skroutz spec retrieved (EAN and MPN required); Ceneo not retrieved |
| G42 | eMAG website terms on automated access (aff_feeds §4) | CLOSED (cross-ref) | gaps_bot_legitimacy_and_precedents.md: eMAG T&C clause 4.2(j) bans robots for data extraction |
| G43 | Program evidence for iStyle, About You, Modivo, Douglas, Sephora, Vivre, Jysk, Dedeman, Leroy Merlin, Hornbach, Media Galaxy (aff_feeds §3) | CLOSED (cross-ref) | gaps_aff §2: Douglas on Awin; About You on CJ and Tradedoubler; Modivo on Tradedoubler and CityAds; no program for the rest |
| G44 | Apple resellers other than iStyle; Dyson RO (gaps_aff §2) | NOT PUBLIC | None found. Action: contact iStyle and Dyson RO directly |
| G45 | Direct feed deals between RO comparators and eMAG, Altex, Flanco (aff_feeds §8) | PARTIAL | Only the archived Altex Compari profile (G25); no agreement texts |
| G46 | Retailers' public statements on comparator feeds (aff_feeds §8; gaps_aff §6) | NOT PUBLIC | None found. Action: ask PC Garage, Vexio, evoMAG and cel.ro directly (they already feed Compari) |
| G47 | Merchant counts per category on Compari; marketplace vs PPC use by big shops (gaps_aff §6) | NOT PUBLIC | Action: Compari merchant portal statistics, or ask the Compari country manager |

### Inferences
- **Highest-value founder actions:**
  1. A 2P affiliate account (G1, G2, G3, G12).
  2. A Profitshare affiliate account (G10, G11).
  3. A Compari merchant registration for 1 RON (G23, G47).

  These three logins close or narrow 8 items: 7 PARTIAL or NOT PUBLIC gaps (G1, G3, G10, G11, G12, G23, G47) plus the confirmation step in G2.
- **Corrections for the report writer:**
  - Vexio offers Profitshare feeds.
  - eMAG's Profitshare "No" means "no phone number shown".
  - Compari *does* have 2025–2026 Wayback copies.
  - Compari's discount label uses a 14-day window.
  - The 2P ToS notice periods were halved on 4 Feb 2026.

### Gaps
- None beyond those listed in the table. Each NOT PUBLIC item carries its founder action.

## Legal and tax texts

Source: `research/notes/gaps2_legal_tax.md`

### Takeaway
- **Most priority items are now CLOSED from primary texts:** Law 506/2004, Law 363/2007, HG 947/2000, Law 8/1996, Law 84/1998, Law 239/2025, Law 31/1990, Law 265/2022, Law 129/2019, the Fiscal Code and norms, and the ANAF orders for 091, D390, D100 and D406.
- **What remains NOT PUBLIC** is bot-walled or login-only material:
  - EUR-Lex guidance;
  - ANPC press releases;
  - court databases;
  - OLX, PC Garage, Flanco and Fashion Days terms;
  - trademark and ONRC registers;
  - Icecat.
- **The one fast-moving item** is Pl-x 455/2026 (cookie "reject all"), scheduled for a Chamber vote on 28 Oct 2026.

### Cited Findings
Status of every gap in the two source files. "Section" points to the evidence above.

| # | Gap (source file) | Status | Key answer | Section | Action if not closed |
|---|---|---|---|---|---|
| 1 | Law 506 art. 4(5)–(6) current text (both files) | CLOSED | Cumulative prior information + consent; consent via browser settings (5^1); two exemptions (6) | 1 | — |
| 2 | Law 506 art. 12–13 letters and fines (company/tax/TM file) | CLOSED | art. 13(1) i) = art. 4(5), q) = art. 12; RON 5,000–100,000 or ≤2% of turnover above RON 5m; amounts unchanged since 2012 | 1 | — |
| 3 | ANSPDCP releases read directly (company/tax/TM) | CLOSED | Aviziero RON 5,000; Homelux RON 30,000; Amato RON 50,000 (art. 12(1)) | 1 | — |
| 4 | L256/2026 Chamber number and stage (company/tax/TM) | CLOSED (outcome pending) | Pl-x 455/2026; favourable report with 6 amendments 20.10.2026; plenary 26/28.10.2026; Government view negative | 1 | Check the vote and adopted text after 28 Oct |
| 5 | Inteligo Media judgment text (company/tax/TM) | NOT PUBLIC | curia.europa.eu returned a script page | 1 | Lawyer reads C-654/23 |
| 6 | Romanian decision on solicited price alerts (company/tax/TM) | NOT FOUND | — | 9 | — |
| 7 | Law 363/2007 numbering for 7(4)(f), 7(4a), 7(6), Annex 11a/23b/23c (legal) | CLOSED | art. 7(4)(f), 7(4^1)/(4^2), 7(6); Annex 1 pcts. 24, 25, 26, 27 | 2 | — |
| 8 | Law 363/2007 fines (legal) | CLOSED | RON 20,000–100,000 for misleading practices; doubled above 100 consumers; up to 4% for widespread infringements | 2 | — |
| 9 | HG 947/2000 30-day rule fines (legal) | CLOSED | art. 4^1; fine RON 5,000–30,000 (art. 12(2)) | 2 | — |
| 10 | UCPD Guidance 2021/C 526/01 and PID Guidance 2021/C 526/02 (legal) | NOT PUBLIC | EUR-Lex bot wall | 2 | Download both PDFs in a browser |
| 11 | CPC sweeps against comparison sites (legal) | NOT RESEARCHED | — | 10 | Check the Commission's sweeps page |
| 12 | Romanian enforcement against a comparison site (legal) | NOT FOUND | — | 7 | Ask ANPC (Law 544/2001) |
| 13 | Law 8/1996 sui generis and TDM article numbers (legal) | CLOSED | Title II Ch. VII arts. 140–143; TDM arts. 36^1, 36^2, def. art. 2^1 f) (Law 69/2022) | 3 | — |
| 14 | Law 8/1996 photographs (legal) | CLOSED | art. 7 f), art. 9 f)–g), arts. 83–88 | 3 | — |
| 15 | Law 84/1998 referential-use article (legal) | CLOSED | art. 45(1)(c) + (2), republished 2020 | 3 | — |
| 16 | Romanian case law or doctrine on scraping and "acces fără drept" (legal) | PARTIAL / NOT PUBLIC | CC art. 360; Law 161/2003 art. 35(2); ÎCCJ 68/2021 inadmissible; ReJust behind Turnstile | 8 | Lawyer searches ReJust, Sintact, Legalis |
| 17 | Browsewrap and Civil Code arts 1202–1203 (legal) | CLOSED | Closed list of clauses needing express written acceptance | 8 | — |
| 18 | EU Data Act art. 43 (legal) | CLOSED | Database right excluded for connected-product data; applies from 12.09.2025 | 7 | — |
| 19 | UODO/Bisnode and Dutch AP guidance (legal) | PARTIAL | NSA 19.09.2023; AP: legitimate interest only | 8 | — |
| 20 | P2B ranking guidelines (legal) | CLOSED | Paras 2, 46, 47, 76, 85–88, 110–116 | 7 | — |
| 21 | ANCOM notification decision and 45-day duty (legal) | PARTIAL | No decision under Law 50/2024 art. 5(2) listed; fine RON 5,000–30,000 once operational | 7 | E-mail ANCOM |
| 22 | German case law (legal) | PARTIAL | Espressomaschine confirmed from secondary sources; Froogle not verified | 8 | Optional |
| 23 | Romanian decisions on stale-price liability (legal) | NOT FOUND | — | 8 | — |
| 24 | Law 190/2018 CNP (legal) | CLOSED | art. 4: legitimate interest needs safeguards including a DPO | 9 | — |
| 25 | ANSPDCP guidance on cookies, GA, push, price alerts (legal) | NOT FOUND | Only sanction releases exist | 9 | — |
| 26 | Digital Omnibus and ePrivacy Regulation status (legal) | PARTIAL | Council position 21.10.2026; EP pending; ePrivacy Regulation status not checked | 7 | Re-check Q1 2027 |
| 27 | Telegram controller and data location (legal) | CLOSED | Telegram Messenger Inc.; EDPO as Art. 27 representative; EEA/UK data in the Netherlands | 7 | — |
| 28 | Law 148/2000 and Law 158/2008 recognisability (legal) | CLOSED (158) / PARTIAL (148) | No recognisability rule; use Law 365/2002 art. 6(2) and Law 363 Annex pct. 11 | 9 | Lawyer reads the 2024 consolidated Law 148/2000 |
| 29 | ANPC "conținut comercial" guide (legal) | NOT FOUND | — | 10 | — |
| 30 | 2Performant and Profitshare disclosure and consent clauses (legal) | CLOSED (Profitshare) / PARTIAL (2P) | Affiliate must obtain cookie consent; clause 4.13 bans misleading tools and cookie stuffing | 8 | — |
| 31 | Other Google policies (legal) | PARTIAL | CMP requirement confirmed; affiliate-page policy not researched | 7 | — |
| 32 | Digital Fairness Act status (both files) | CLOSED | "Announced", Q4 2026 (as of 20.09.2026) | 7 | — |
| 33 | ODR platform and SAL pictogram (legal) | CLOSED (ODR) / PARTIAL (SAL) | ODR closed 20.07.2025; ANPC Order 270/2026: reclamatiisal.anpc.ro, 250×50 px | 7 | Get the official text of Order 270/2026 |
| 34 | EN 301 549 version (legal) | CLOSED | V4.1.1 published 02.09.2026; OJ citation expected 16.12.2026; V3.2.1 in force | 7 | — |
| 35 | Law 232/2022 Annex 5 / EAA scope for comparison sites (legal) | NOT RESEARCHED | — | 10 | Lawyer reads Annex 5 |
| 36 | OLX and Publi24 terms (legal) | CLOSED (Publi24) / NOT PUBLIC (OLX) | Publi24: personal, non-commercial use only | 8 | Save OLX terms from a browser |
| 37 | Altex and PC Garage 2026 terms (priority 7) | PARTIAL (Altex) / NOT PUBLIC (PC Garage) | Altex: general IP clause 2.1.3, no robot clause found | 8 | Save PC Garage terms from a browser |
| 38 | Fashion Days and Flanco 2026 terms (company/tax/TM) | NOT PUBLIC | 403 and EdgeOne challenge | 8 | Browser |
| 39 | OLX declaration fields, OLX actions against aggregators (legal) | NOT RESEARCHED | The 7(4)(f) duty sits with the marketplace | 2, 8 | — |
| 40 | Open Icecat licence (legal) | NOT PUBLIC | Anubis bot wall | 10 | Browser |
| 41 | Romanian case law on logos and images (legal) | NOT FOUND | — | 8 | — |
| 42 | Law 239/2025 entry into force (company/tax/TM) | CLOSED | MO 1160/15.12.2025; in force 18.12.2025; several blocks from 01.01.2026 | 4 | — |
| 43 | Minimum share capital (legal) | CLOSED | RON 500 for new SRLs (Art. VI(2)); RON 5,000 above RON 400k turnover | 4 | — |
| 44 | Capital paid-in timing (company/tax/TM) | CLOSED | 30% within 3 months and before operations; rest within 12 months; art. 275(1)(c) | 4 | — |
| 45 | Founder eligibility, shareholder limit, BO declaration, founder documents (company/tax/TM) | CLOSED | Max 50 shareholders; arts. 6(2), 6^1, 73^1; Law 129/2019 arts. 56–57; documents: constitutive act + proof of registered office (art. 36(2)) + self-declaration (Law 265/2022 art. 122) | 4 | — |
| 46 | Specimen signature (company/tax/TM) | PARTIAL | Not mentioned in Law 265/2022 or OMJ 5307/C/2022 | 4 | Confirm with ONRC |
| 47 | ONRC fee schedule and processing time (company/tax/TM) | CLOSED / NOT PUBLIC (MO fee) | Registration free (art. 44); 1 working day (art. 105); certificate RON 30; assistance RON 136.13 | 4 | MO Part IV tariff from the ONRC portal |
| 48 | CAEN Rev. 3 code (company/tax/TM) | PARTIAL | 6391 main; 7311, 7312, 6392, 6310, 7320 secondary | 4 | Read INS explanatory notes |
| 49 | Incorporation cost and bookkeeping cost (legal) | PARTIAL | ONRC part closed; bookkeeping price not researched | 4 | Get accountant quotes |
| 50 | Salaried founder and CASS on dividends (company/tax/TM) | CLOSED | Yes: art. 170(2)–(4); only IP income exempt (art. 154(1) h^1) | 5 | — |
| 51 | CASS on dividends, 2026 amounts (legal) | CLOSED | RON 2,430 / 4,860 / 9,720 at 6/12/24 minimum wages (RON 4,050) | 5 | — |
| 52 | PFA taxation 2026, CASS cap attribution (both files) | CLOSED | Cap of 72 minimum wages from Law 239/2025 Art. XII pt. 19, for 2026 income | 5 | — |
| 53 | Micro D100 in zero-revenue quarters (company/tax/TM) | CLOSED | File quarterly with "0" (art. 56(2); D100 instructions) | 5 | — |
| 54 | Micro rules after OUG 8/2026, 30 vs 90 days (legal) | CLOSED (text) / PARTIAL (amending act) | art. 48(3): 90 days | 5 | Accountant confirms OUG 8/2026 |
| 55 | Profit tax and minimum turnover tax (legal) | CLOSED | Minimum tax only above €50m turnover (art. 18^1) | 5 | — |
| 56 | H1 2026 minimum-wage payroll (company/tax/TM) | PARTIAL | Net ≈ RON 2,574; cost ≈ RON 4,134 (computed) | 5 | Accountant confirms the RON 300 rule |
| 57 | Art. 317 form and processing (both files) | CLOSED | Form 091 (OPANAF 631/2016); valid from the request date; file before the first intra-EU B2B service | 6 | Accountant files at formation |
| 58 | D390 deadline and symbols (company/tax/TM) | CLOSED | Monthly by the 25th; P and S; UK excluded | 6 | — |
| 59 | D301 for reverse-charged purchases (new) | CLOSED | By the 25th of the following month, only when chargeable | 6 | — |
| 60 | SAF-T grace for new companies (company/tax/TM) | CLOSED | Quarterly if not VAT-registered; 3-month grace for the first report | 6 | — |
| 61 | Foreign self-billing under the HG 1/2016 norms (company/tax/TM) | CLOSED | Customer's member-state rules apply (art. 319(5)(b)(1)); pt. 96 only for non-EU self-billers | 6 | — |
| 62 | Awin and Admitad entities (company/tax/TM) | CLOSED (Awin) / PARTIAL (Admitad) | AWIN AG Berlin, self-billing (7.4); admitad GmbH or Admitad International FZ-LLC | 6 | Check the Admitad offer |
| 63 | Google payment statement for AdSense (company/tax/TM) | CLOSED | Payment Receipt only; SRL issues its own invoice | 6 | — |
| 64 | e-Factura for foreign customers (legal) | PARTIAL | Outside when the place of supply is abroad (secondary sources) | 6 | Accountant checks OUG 120/2021 (2026) |
| 65 | Unregistered activity sanction for individuals (company/tax/TM) | PARTIAL | Law 12/1990 repealed by Law 222/2020; OG 21/1992 art. 4(3) + 50(1)(c) RON 2,000–20,000 | 6 | Accountant |
| 66 | Payouts to individuals (legal) | PARTIAL | Profitshare allows individuals but requires registration for frequent earners; affiliate income is a service | 6 | Accountant |
| 67 | 2026–2027 fiscal changes after OUG 8/2026 (legal) | PARTIAL | Code read as updated to Law 170/2026; OUG 8/2026 not read | 5 | Accountant |
| 68 | Trademark registers: OSIM e-register, EUIPO eSearch, WIPO (both files) | NOT PUBLIC | JavaScript apps | 10 | Founders search manually |
| 69 | ONRC name availability (company/tax/TM) | NOT PUBLIC | MyONRC login | 10 | Check at filing |
| 70 | Social handles (company/tax/TM) | NOT PUBLIC | Login | 10 | Manual |
| 71 | Nice class 35 "price comparison services" (company/tax/TM) | NOT PUBLIC | TMclass is a JavaScript app | 10 | Check TMclass |
| 72 | OSIM and EUIPO filing fees (legal) | CLOSED (OSIM) / PARTIAL (EUIPO) | OSIM ≈ RON 1,016 for 1 class, black and white; EUIPO page returned 403 | 10 | Read the EUIPO fees page |
| 73 | ANPC application of Annex pt. 11a to comparators (company/tax/TM) | NOT FOUND | — | 2 | — |
| 74 | Robots.txt re-check (company/tax/TM) | OUT OF SCOPE | See `scraping_feasibility_recon.md` | — | — |
| 75 | ANPC Black Friday 2025 results (priority 6) | NOT PUBLIC | ANPC bot wall; archive holds only the challenge page | 7 | Browser or Law 544/2001 request |

### Inferences
- **Before incorporation (founders and accountant):**
  - choose CAEN 6391 (+7311, 7312, 6392, 6310, 7320);
  - capital of at least RON 500, fully paid before operating;
  - BO data in the constitutive act;
  - file form 091 right after registration.
- **Before launch (product):**
  - consent-first CMP with equal Accept/Reject;
  - opt-in for price-alert e-mails;
  - a "Cum ordonăm rezultatele" page (*how we rank results*) linked from results;
  - labels for affiliate and paid placements;
  - a business-model disclosure page;
  - "−X%" badges computed against the 30-day lowest price;
  - WCAG 2.2 AA.
- **Ongoing:** quarterly D100 (even at 0), quarterly D406, monthly D390 and D301 only in months with EU B2B flows, and dividend CASS planning.

### Gaps
- See the NOT PUBLIC and NOT RESEARCHED rows above; each has an action. The time-critical one is row 4: check Pl-x 455/2026 after 28 Oct 2026.

## Demand, growth channels, monetization numbers, benchmarks, costs

Source: `research/notes/gaps2_growth_numbers.md`

### Takeaway
Of the 72 gaps below, 21 are CLOSED, 18 PARTIAL, 28 NOT PUBLIC and 5 NOT RESEARCHED.

The most decision-relevant changes from round 1:
1. Price-history search demand is about 2–3× higher than estimated (about 8K a month combined, about 38K in the Black Friday weeks).
2. Profitshare publishes value-approval rates (eMAG 73%).
3. Ceneo's and Trovaprezzi's 2025 numbers show what a pure comparator earns and spends, and both point to Google as the headwind.
4. ANAF and ANCOM data put COD at about a third of all parcels.
5. Romania is a confirmed CSS country, and free listings are gone EEA-wide.
6. Almost all cost inputs are now sourced.

### Cited Findings
Sources are given in the section cited for each row. Abbreviations: M = `monetization_and_growth.md`; G = `gaps_growth_and_demand.md`; MC = `market_and_competitors.md`; C = cost gaps in the digest (architecture, bot-legitimacy and extension notes).

| # | Gap (origin) | Status | Key finding (date) | Founder action | See |
|---|---|---|---|---|---|
| 1 | Keyword-level volumes for price-history, comparison and price queries (G Q1; MC §5; M §9) | PARTIAL | Semrush: istoric pret / istoric preturi 6.6K, compara preturi 3.6K (Sep 2026). Recalibrated Trends: istoric pret ≈4.5K, istoric preturi ≈3.4K, cel mai mic pret ≈17K, iphone 17 pret ≈13–14K, black friday emag ≈49K a month | Keyword Planner check with a free Google Ads account | 1.1 |
| 2 | English "price history" noise (G Q1) | CLOSED | Gold, Amazon, oil, Steam, bitcoin; "price history extension" rising +120% | — | 1.2 |
| 3 | Search demand by category (MC §6) | PARTIAL | Index (laptop = 100): parfum 154, carti 97, iphone 17 80, telefoane 45, frigider 43, televizor 34; plurals 3–9 | Keyword Planner | 1.3 |
| 4 | Black Friday search volumes (M §8) | CLOSED | black friday emag ≈580K a year; "black friday" broad ≈3.8M a year; ≈38K price-history searches in the 2025 BF weeks | — | 1.4, Inferences |
| 5 | Keyword or traffic data for compari, Pricy, ShopMania, price.ro (M §9) | PARTIAL | compari broad brand ≈94K a month; Semrush has no free page for compari or pricy | Similarweb free pages in a browser | 1.5 |
| 6 | Romanian AdSense/Prebid RPM (G Q3; M §3, §11) | NOT PUBLIC | None published; only YouTube RPM ≈$1.15 | Read AdSense's country report after 30 days; ask Romanian publishers | 2.1 |
| 7 | IAB Romania / ROADS 2025 (G Q3) | NOT PUBLIC | ROADS last seen as "2021 Full Year"; 2019 ≈€80M | Email IAB Romania | 2.2 |
| 8 | ThinkDigital/Arbomedia publisher terms (G Q3; M §3) | NOT PUBLIC | Merged in 2026; 140+ websites; no terms published | Contact form at arbomedia.ro | 2.3 |
| 9 | Mediavine geography rules; Journey language wording (G Q3; M §3) | PARTIAL | Journey: >1,000 sessions, non-English accepted, 70% share, Net 65, ≥4 months domain history; geography weighting not quantified | Email Journey support | 2.4 |
| 10 | AdSense EEA CMP requirement (legal and M §3 cross-check) | CLOSED | Certified TCF CMP required since 16 Jan 2024; Google's "Privacy & messaging" CMP is certified | — | 2.5 |
| 11 | Adoperator, Publicitas, "Promo Consult" (G Q3) | NOT RESEARCHED | — | — | 2.6 |
| 12 | Newsletter and sponsored-deal rates (M §3, §8) | NOT PUBLIC | None found | Ask deal pages for media kits | 2.7 |
| 13 | Click-outs per session (M §11) | NOT PUBLIC | No benchmark; engagement proxies: Ceneo 3.01 pages/visit, Trovaprezzi 2.76 | Instrument outbound clicks; ask networks or Heureka | 3.1 |
| 14 | Mobile attribution loss (M §11) | PARTIAL | 2P: apps >50% of many merchants' sales, tracking redesigned; 2P lists iOS cookie blocking among the causes; vendor claim of 30–50% unverified | A/B test deep-link and S2S tracking | 3.2 |
| 15 | Approval periods and reversal rates (M §1) | CLOSED (Profitshare) / NOT PUBLIC (2P) | Value approval: eMAG 73.35%, Flanco 84.01%, IT shops 71.76–100%; about 31 days to approve | Export from 2P after login | 3.3 |
| 16 | idealo revenue 2024–25 (G Q5; M §10) | NOT PUBLIC | Axel Springer discloses only group figures (FY2025 adjusted EBIT €241.4M) | Unternehmensregister: idealo internet GmbH accounts | 3.4 |
| 17 | Heureka revenue split; compari revenue (G Q5; M §2, §10) | NOT PUBLIC | Annual-report PDF 403; CPC is core, marketplace commission, ads secondary | Read the výroční zpráva in a browser or on or.justice.cz | 3.5 |
| 18 | Árukereső financials (G Q5; M §10) | NOT PUBLIC | Operator Online Comparison Shopping Kft., tax no. 24868291 | e-beszamolo.im.gov.hu | 3.6 |
| 19 | Skroutz 2024/2025 revenue and EBITDA (G Q5) | NOT PUBLIC | About €150M revenue (2026); 2020 profit €12.5M | GEMI publicity portal | 3.7 |
| 20 | Geizhals revenue year (G Q5) | NOT PUBLIC | No dated figure; about 2.8M unique clients (Mar 2018) | Austrian Firmenbuch extract | 3.8 |
| 21 | Ceneo traffic and revenue (M §10) | CLOSED | H1 2025: revenue PLN 165.0M (+9.3%), EBITDA PLN 44.7M, marketing PLN 83.9M; 28.2M visits (Sep 2026) | — | 3.9 |
| 22 | Trovaprezzi traffic and revenue (M §10) | CLOSED | Shopping line €43.6M in 2025 (−1.7%), blamed on Google; 15.4M visits | — | 3.10 |
| 23 | Keepa pricing and users; Honey users (MC §4; M §9) | PARTIAL | Keepa 5M Chrome users; Honey 13M; Keepa €29 a month per a third party | Confirm on keepa.com | 3.11 |
| 24 | PriceSpy/PriceRunner premium (M §4) | CLOSED | No paid tier; PriceRunner's free account has alerts and Buyer Protection, with Klarna sign-in from 25 Jan 2027 | — | 3.12 |
| 25 | Free vs paid listing sequence at Heureka, Árukereső, Skroutz (M §2, §10) | NOT PUBLIC | Not documented | Ask compari management; Wayback snapshots | 3.13 |
| 26 | Years to profitability; comparator-referral conversion (G Q5; M §1) | NOT PUBLIC | Not found | — | 3.14 |
| 27 | Telegram deal channels (G Q2; M §9) | NOT PUBLIC | Directories return 403; 32 handles probed and none found | Search in the Telegram app | 4.1 |
| 28 | Facebook deal-group sizes (G Q2; M §9) | NOT PUBLIC | Needs login; Softpedia deals thread has thousands of posts | Logged-in group search | 4.2 |
| 29 | r/Romania size and self-promotion rules (M §9) | CLOSED | 1,025,473 subscribers (Feb 2025); link to own site at most "once every few weeks"; "Ads, PR, promos … not tolerated" | — | 4.3 |
| 30 | TikTok/Instagram deal accounts (G Q2) | PARTIAL | eVOUCHER 33.9K (round 1); Instagram needs login | Logged-in search | 4.4 |
| 31 | Reddit mention counts for pricy and istoric-preturi (G Q2) | NOT PUBLIC | Archive full-text search times out | Reddit search in a browser | 4.5 |
| 32 | Netflix/Spotify/Revolut penetration (M §4) | PARTIAL | Revolut >5M retail clients (30 Sep 2026); Netflix ≈1M (Feb 2023 estimate); no Spotify figure | — | 4.6 |
| 33 | Romanian Patreon examples (M §4) | NOT RESEARCHED | — | — | 4.7 |
| 34 | Subscription conversion benchmarks for price tools (M §4, §11) | NOT PUBLIC | None found in round 1 | — | 4.7 |
| 35 | GPeC full-year 2025 (MC §1) | NOT PUBLIC | Not found; use Gomag or MerchantPro (€8–8.1bn of goods) | Check gpec.ro or email GPeC | 5.1 |
| 36 | Official count of online shops (MC §1) | NOT PUBLIC | No official count; about 17.3K firms with main CAEN 4791 (termene.ro, undated) | ONRC open data on data.gov.ro | 5.2 |
| 37 | 11.11, Christmas, Easter, back-to-school data (MC §1) | PARTIAL | BTS 2025 +10%, 2026 +41%, 42% to lockers; December +28% above an average month; no 11.11 or Easter data | Ask MerchantPro or Gomag; own crawl | 5.3 |
| 38 | COD share of orders (MC §1) | PARTIAL | ANAF: 31bn lei COD and 111M shipments (2024); ANCOM 335M parcels, so COD ≈ 1/3 of parcels | Ask ANAF or couriers for a B2C split | 5.4 |
| 39 | eMAG 2025 market share (MC §1; M §1) | PARTIAL | ≈25–26% of physical-goods e-commerce (my estimate) | — | 5.5 |
| 40 | GTIN coverage by category (MC §6) | NOT PUBLIC | No source | Measure in week 1 | 5.6 |
| 41 | 2025–26 cross-shop price-dispersion study (MC §6) | NOT PUBLIC | None exists beyond Millward Brown (≈2014) | Publish Pretoscop's own | 5.7 |
| 42 | Statista/iSense market sizes (MC §1) | NOT PUBLIC | Paywalled | — | 5.8 |
| 43 | Retailer domains not verified (MC §2) | CLOSED | 16 checked; hervis.ro → sportsdirect.ro; QuickMobile under maintenance; Domo linked to cel.ro (MX) | — | 5.9 |
| 44 | Marketplace status of Flanco, PC Garage, Dedeman, Elefant, Decathlon, Notino, Modivo (MC §2) | NOT PUBLIC | Automated checks inconclusive (403s) | Manual check of "Vândut de" labels | 5.10 |
| 45 | Altex Marketplace size (MC §2) | PARTIAL | >100 sellers, >30K products (undated); 8% commission; ≥€500K seller turnover (2023) | — | 5.11 |
| 46 | Flanco 2025 revenue (MC §2) | CLOSED | 1.36bn lei (−2.47%), net loss 66.3M lei | — | 5.12 |
| 47 | PC Garage 2025 revenue (MC §2) | NOT PUBLIC | Not found by search | mfinante.gov.ro lookup | 5.12 |
| 48 | Trafic.ro data (MC §2) | CLOSED | Major retailers not registered; no data | — | 5.13 |
| 49 | ANPC Black Friday 2025 tally (G Q7; MC §5) | NOT PUBLIC | anpc.ro 503 to automated access | Read anpc.ro press releases in a browser | 5.14 |
| 50 | 2023–25 fake-discount studies; 2018 inquiry sample (G Q7) | NOT RESEARCHED | — | Download the 2018 report from consiliulconcurentei.ro | 5.15 |
| 51 | Reddit "Romanian Keepa" threads (MC §5) | CLOSED | Round-1 Q2 thread table, 2019–2026 | — | 5.16 |
| 52 | Affiliate commission rates by category (MC §6) | NOT PUBLIC | Behind network logins | Free publisher accounts, then export | 5.17 |
| 53 | Free listings in Romanian SERPs (G Q6) | PARTIAL | EEA-wide removal (Sep 2026) after €890M DMA fines (Jul 2026); not measured on google.ro | 20-query SERP check from a Romanian IP | 6.1 |
| 54 | AI Overviews and AI Mode shopping in Romania (G Q6; M §9) | PARTIAL (AI Mode CLOSED) | AI Mode live since 8 Oct 2025; AI Overviews logged-in only (blog, May 2025); no shopping features documented | Logged-in and logged-out tests | 6.2 |
| 55 | PriceRunner/Kelkoo/Skroutz on AI traffic (G Q6) | PARTIAL | No statements; Moltiply and Heureka blame Google units; AI referrals tiny (Semrush) | — | 6.3 |
| 56 | Google 2026 product structured-data changes (G Q6) | CLOSED | Product.category and sale-date properties (7 Jul), hasAdultConsideration (20 May), FAQ rich results removed, EEA site-reputation carve-out (30 Aug) | — | 6.4 |
| 57 | Merchant Center free listings for comparators; CSS country list (M §6, §9) | CLOSED | Romania is a CSS country; CSS listings land on merchants; own pages only through CSS Product Listing ads | — | 6.5 |
| 58 | Number of CSSs targeting Romania (M §6) | NOT PUBLIC | Directory is JavaScript-only | Filter the directory in a browser; log "By CSS" labels | 6.6 |
| 59 | Measured AI-search traffic losses for CEE comparators (M §9) | NOT PUBLIC | Qualitative only | — | 6.7 |
| 60 | Chrome Web Store fee (C) | CLOSED | One-time fee, US$5 (secondary sources); Romania supported | — | 7.1 |
| 61 | Apple Developer Program and Safari distribution (C) | CLOSED | $99 a year; required; Developer ID route on macOS | — | 7.2 |
| 62 | Google sitemap limits (C) | CLOSED | 50,000 URLs or 50MB uncompressed per file | — | 7.3 |
| 63 | Cloudflare Free Cache Rules for HTML; paid prices (C) | CLOSED | Free: 10 rules, HTML cacheable by rule, Edge TTL override ≥2 h; Pro $20 a month (annual) | Test s-maxage below 2 h | 7.4 |
| 64 | Hetzner IPv4 price; AX41/EX44 stock (C) | CLOSED | IPv4 €1.70 a month (dedicated), €0.50 (cloud); AX41 and EX44 €59, in stock at FSN1 and HEL1 | — | 7.5 |
| 65 | Romanian hosting with PTR, and prices (C) | PARTIAL | Hostico VPS from €8.99 with a free IP; PTR not stated anywhere | Email Hostico, GTS, M247 | 7.6 |
| 66 | Digi fixed-IP business offer 2026 (C) | CLOSED | €9 a month (500 Mbps) or €13 (1 Gbps) excl. VAT with one fixed IPv4, 24-month bundle | Ask about PTR | 7.7 |
| 67 | Falkenstein → Bucharest latency (C) | CLOSED | Median ≈33.6 ms (13–27 Oct 2026) | — | 7.8 |
| 68 | eMAG programme rules inside Profitshare (M §1) | PARTIAL | Public page: 73.35% approval, 31 days, 2–15-day window; nothing on comparator use | Email Profitshare support for a written yes or no | 3.3 |
| 69 | Awin and other networks' Romanian advertiser rates (M §1) | NOT RESEARCHED | — | Join Awin as a publisher and filter by Romania | — |
| 70 | Compari CPC table; ShopMania, price.ro and Pricy models (M §2) | NOT PUBLIC | Behind Cloudflare and merchant accounts (round 1) | Request compari's merchant price list | — |
| 71 | Price-intelligence vendors' Romanian customers; idealo Business and Skroutz analytics pricing (M §5) | NOT RESEARCHED | — | Check vendor case-study pages; ask for quotes | — |
| 72 | Cashback and coupon economics: Picodi and Cashback World metrics, cashback revenue shares, coupon-site traffic, 2P cashback rules (M §7) | PARTIAL | 2P cashback rules CLOSED (API integration required; "asigura-te ca advertiserul permite cashback-ul"); the rest NOT RESEARCHED | Similarweb for Picodi; ask Cashback World | below |

Row 72: [2Performant: Documentatie Cashback](https://support.2performant.com/ro/cashback-documentation) [DIRECT].

Also open from M §8 and §12. They are not counted in the table because they belong to, or overlap with, other workstreams.
- **Amazon Associates DE/IT rates: NOT PUBLIC.** The fee schedule (partnernet.amazon.de/help/operating/schedule) redirects to an Amazon sign-in. Founder action: read it after signing up to Amazon PartnerNet.
- **AliExpress Portals rates and Romanian lead-gen CPLs: NOT RESEARCHED.**
- **Romanian case law on fake-discount claims, VAT and micro-enterprise rules for affiliate income, and retailers blocking comparators:** covered by the legal, tax and bot-legitimacy gap notes.

### Inferences
- **Status count:** CLOSED 21, PARTIAL 18, NOT PUBLIC 28, NOT RESEARCHED 5, out of 72 rows, counting each row by its first status [my tally of the table]. Most NOT PUBLIC items need only a free account, a captcha-protected public register or an email, so they are founder actions rather than dead ends.
- **What should change in the plan:**
  - The traffic model should use about 8K price-history searches a month and about 17K for "cel mai mic pret", rather than the round-1 figures.
  - The revenue model should use eMAG's 73% approval rate and a 1–2-month payment lag.
  - The SEO plan should assume no free product listings in Romania and design for product-snippet markup, ItemList carousels and possibly CSS enrolment [inference].

### Gaps
The founder actions with the highest value per minute:
1. Keyword Planner check (row 1). Ten minutes, and it validates every demand figure.
2. Logged-out and logged-in google.ro SERP check for 20 product queries (rows 53–54).
3. Free publisher accounts on 2Performant and Profitshare, then export approval rates, cookie windows and commission grids (rows 15, 52, 68).
4. e-beszamolo download for Árukereső (row 18) and Unternehmensregister for idealo (row 16). They are free and give the best regional comparator P&Ls.
5. Emails to Hostico, GTS and Digi about PTR (rows 65–66), and to Journey about Romanian traffic (row 9).

## Technical verification (vendors, bot programs, versions, limits, data sources)

Source: `research/notes/gaps2_technical.md`

| ID | Gap | Status | One-line result / action |
|---|---|---|---|
| A1 | Zyte tiers and how they are assigned | PARTIAL | 5 tiers, HTTP $0.06–1.27 and browser $0.48–16.08 per 1k; automatic, reviewed quarterly. Per-domain tier: use the account calculator or a sales quote |
| A2 | Zyte browser rendering and add-ons | CLOSED | Browser T1–T5 $1.01–16.08 pay-as-you-go; screenshots $1.34/1k; failures free |
| A3 | Zyte EU entity and GDPR | CLOSED | Zyte Group Ltd (Ireland, no. 492771); Irish law; DPA with SCCs |
| A4 | Zyte AUP and warranties | CLOSED | Customer warrants legal and ethical use; public sites only; AUP 1.9 on terms the customer explicitly agreed to |
| A5 | Zyte sessions, RO geolocation, rate limits, UA | PARTIAL | 3,000 RPM; RO is an "extended" geolocation (not verified in the enum); UA can be replaced |
| A6 | Oxylabs Web Unblocker | CLOSED | $7.2→$3/GB; oxylabs UAB, Vilnius; must comply with target terms |
| A7 | ScrapingBee | CLOSED | $19–$5,799/month credit plans; VostokInc, Paris; must read target terms |
| A8 | Bright Data Web Unlocker and KYC | CLOSED | $1.5/1K pay-as-you-go, $499 Scale; robots.txt enforced without KYC; KYC answer within 48 h |
| A9 | ScraperAPI | CLOSED | $49–$1,975 plans; +10 credits on protected sites; LLC in Nevada |
| A10 | Target-terms obligations across vendors | CLOSED | All put responsibility on the customer; Oxylabs and ScraperAPI ban breaching site terms |
| A11 | robots.txt option across vendors | CLOSED | Only Bright Data documents one (default without KYC) |
| A12 | Success-rate guarantees | CLOSED | None in any vendor's terms |
| A13 | Statements on price-comparison use | PARTIAL | Marketing only; no policy statements |
| B1 | Cloudflare: free accounts | PARTIAL | "All customers"; individual-run PretAlertBot is verified. Confirm in the dashboard |
| B2 | Cloudflare review time | NOT PUBLIC | No SLA; batch reviews. Submit on day 1 |
| B3 | Price-comparison bots in the Radar directory | CLOSED | Yes: idealo, Skroutz, Coosti, PretAlert (RO), Dinteligent (RO) and others |
| B4 | Cloudflare category labels | CLOSED | Radar API enums listed; mapping to the docs' categories undocumented |
| B5 | Web Bot Auth implementation | CLOSED | npm `web-bot-auth` 0.2.0; PretAlert is a working Romanian example |
| B6 | Akamai criteria and categories | NOT PUBLIC | Behind login. Submit the form and ask an Akamai shop |
| B7 | DataDome default action and form | PARTIAL | Comparators "not automatically allowed"; form 403. Submit manually |
| B8 | Fastly Web Bot Auth and categories | NOT PUBLIC | Undocumented. Ask through the submission form |
| B9 | HUMAN and Imperva | NOT PUBLIC | Shop-side allow lists only |
| B10 | IAB/ABC list | CLOSED | $5k–15k/year licence, monthly updates; GA4 uses it |
| B11 | Comparison-engine crawler docs | PARTIAL | idealo found (UAs and IPs); Klarna page moved |
| B12 | Engines in verified directories | PARTIAL | Cloudflare: idealo and Skroutz yes; Akamai and DataDome unknown |
| C1 | Node LTS | CLOSED | 24 in maintenance LTS; 26 Active LTS on 2026-10-28 |
| C2 | Next.js after 16.3 | CLOSED | 16.4.3 (2026-10-23) |
| C3 | Drizzle 1.0 | CLOSED | Still RC (1.0.0-rc.5); stable 0.45.4 |
| C4 | Prisma 7 | CLOSED | 7.10.1 stable; CLI `latest` tag = 8.0 RC, so pin |
| C5 | Better Auth | CLOSED | 1.7.14 (2026-10-26) |
| C6 | pg-boss features | CLOSED | 12.38.0; cron/RRULE, singleton keys, DLQ with redrive, OpenTelemetry |
| C7 | Crawlee option names | CLOSED | `maxConcurrency`, `maxRequestsPerMinute` (crawler-wide), `sameDomainDelaySecs`, `respectRobotsTxtFile`, `retryOnBlocked` |
| C8 | Meilisearch version, `localizedAttributes`, diacritics | CLOSED | v1.56.0; ș/ş/ț/ţ fold; `ro`/`ron` valid; licence MIT and BUSL-1.1 |
| C9 | Typesense licence | CLOSED | GPL-3.0 (server v30.2) |
| C10 | pgvector | CLOSED | 0.8.7 (2026-10-01) |
| C11 | Playwright / Puppeteer / undetected-chromedriver | CLOSED | 1.64.1 / 25.16.0 / stale since 2024-02 |
| C12 | Temporal / Airflow / Prefect / Celery | CLOSED (versions); NOT RESEARCHED (hosted prices) | 1.32.1 / 3.3.2 / 3.9.0 / 5.6.3 |
| C13 | WXT / Plasmo | CLOSED | WXT 0.21.5 active; Plasmo stale since 2025-05 |
| C14 | Romanian analysers in Elasticsearch/OpenSearch | PARTIAL | Elasticsearch has no ASCII folding; OpenSearch not checked |
| C15 | ParadeDB | PARTIAL | v0.26.3, AGPL-3.0; not benchmarked |
| C16 | Meilisearch RAM/disk at 1M documents | PARTIAL | Rules of thumb (10–25× raw size on disk, RAM ≥ 1/3 of disk). Benchmark |
| D1 | Meilisearch Cloud prices | CLOSED (regions PARTIAL) | From $20/month; XS 1 GB RAM $18 + disk |
| D2 | Typesense Cloud prices | CLOSED | 0.5 GB $21.60/month … 8 GB $172.80; HA ×3 |
| D3 | Clerk | CLOSED | 50k MRU free; Pro $25 |
| D4 | OneSignal | CLOSED | Free web push (10k subscribers per send); Growth $19 + $0.004/subscriber |
| D5 | Postmark | CLOSED | $15–18 per 10k |
| D6 | imgproxy | CLOSED | Pro $49/month |
| D7 | Grafana Cloud free tier | CLOSED | 10k series, 50 GB logs/traces, 14 days |
| D8 | GitHub Actions | CLOSED | 2,000–3,000 minutes included; Linux $0.006/min |
| D9 | Sentry | CLOSED | Free 5k errors; Team $29 |
| D10 | Better Stack | CLOSED | Free 10 monitors, 3 GB logs/3 days |
| D11 | Resend | CLOSED | Free 3k; Pro $20/50k |
| D12 | SES | CLOSED | $0.10/1k; dedicated IP $24.95 |
| D13 | Cloudflare Pro/Business prices | CLOSED | $20/$200 per month (annual billing) |
| D14 | HTML caching on a paid plan? | CLOSED | Not needed: Free has 10 Cache Rules (minimum override TTL 2 h; no caching with Set-Cookie) |
| D15 | Google sitemap limits | CLOSED | 50,000 URLs / 50 MB uncompressed |
| D16 | Chrome Web Store fee | PARTIAL | "One-time" confirmed; amount not on official pages |
| D17 | Firefox MV2 end of life | PARTIAL | None announced; 12-month notice promised (2024) |
| D18 | Safari distribution | CLOSED | App Store or Developer ID on macOS; $99/year; web packager |
| D19 | Both background keys in one manifest | CLOSED | Yes: Chrome 121+ ignores `scripts` |
| D20 | Hetzner IPv4 | CLOSED | €0.50 Cloud Primary; €1.70 dedicated |
| D21 | Latency Germany→Romania | PARTIAL | About 30 ms typical Frankfurt–Bucharest (WonderNetwork) |
| D22 | Exchange rate | CLOSED | EUR/USD ≈ 1.1148 (BNR 2026-10-27) |
| D23 | Romanian hosting prices; AX41/EX44 stock | NOT RESEARCHED | Other cluster; check stock at order time |
| E1 | BNR feed | CLOSED | `curs.bnr.ro/nbrfxrates.xml`; format documented above |
| E2 | Google taxonomy ro-RO and ProductGroup | CLOSED | 2021-09-21 is the last version; ProductGroup rules quoted |
| E3 | Open Icecat | PARTIAL | Index URL, rate limit, "Specs Icecat" credit, no AI training; licence text not read |
| E4 | Prompt caching in Batches | CLOSED | Best-effort, 30–98% hit rate; use the 1-hour TTL |
| E5 | Embedding licences | CLOSED | MIT / MIT / Apache-2.0 |
| E6 | TimescaleDB on Neon/RDS/Azure and compression ratio | CLOSED | No compression on Neon or Azure; not on RDS; 90–98% (vendor figures) |
| E7 | PostgreSQL 18 `RETURNING OLD/NEW` | CLOSED | Syntax and `ON CONFLICT` behaviour confirmed |
| E8 | EAN-8 restricted ranges | CLOSED | 000–099 and 200–299 are RCN-8; also 02, 04, 20–29, 952 and 980–99 |
| E9 | WDC Products and Skroutz datasets | CLOSED | WDC download page; no official Skroutz set (academic set on Kaggle) |
| E10 | Romanian VAT | CLOSED | 21% from 2025-08-01 |
| F1 | GTIN coverage in Romanian affiliate feeds | NOT PUBLIC | Measure per shop in week 1 |
| F2 | schema.org completeness (WDC) | CLOSED | GTIN on about 8% of Product entities (RO and world); MPN on 26% in RO |
| F3 | GTIN coverage in feeds generally | PARTIAL | 66.9% (Pricesearcher 2018, UK) |
| F4 | Fake EANs and 594-prefix prevalence | NOT PUBLIC | Measure in month 1 |
| G1 | Tooling docs and versions | CLOSED | Section 3 |
| G2 | Independent unblocker benchmarks on RO targets | PARTIAL / NOT PUBLIC | Proxyway 2025 (secondary). Run a trial on consenting shops |
| G3 | Zyte tier for RO domains | NOT PUBLIC | See A1 |
| G4 | Tests from Hetzner/OVH/RO IPs | NOT PUBLIC | Not allowed in this task. Test from production IPs at implementation |
| G5 | Romanian IP counts per vendor | PARTIAL | IPRoyal city counts only |
| G6 | NetNut seizure | CLOSED | FBI/IRS-CI, 2026-07-02; Popa botnet; white-label resale |
| G7 | DOJ 911 S5 page | NOT RESEARCHED | Superseded by NetNut |
| G8 | Bright Data $999/$1,999 tiers | CLOSED | Not on the first-party page |
| H1–H6 | Other matching gaps | Mixed | See the Section 8 table |

## Retailer terms, robots, platforms, sitemaps, affiliate rule texts, prior art

Source: `research/notes/gaps2_retailers.md`

| # | Gap (source) | Status | Finding (short) | Founder action if not closed |
|---|---|---|---|---|
| 1 | No browser-like comparison on blocked domains (recon §1) | PARTIAL (not tested by policy) | Archive copies show identified crawlers get real HTML at Altex, Media Galaxy, PC Garage, evoMAG and Flanco; CEL challenges even the Internet Archive and serves decoy JSON-LD | None; do not test impersonation |
| 2 | UK-only vantage; CEL timeout (recon §1, bot §5) | PARTIAL | CEL still TCP-times out (17:47Z); no ASN-specific block reports found | Test from a Bucharest VPS, Hetzner and an RO residential line (1 robots request per shop each) |
| 3 | Content fields of Altex, Media Galaxy, Flanco and PC Garage unknown (recon §1) | CLOSED | Altex/Media Galaxy: 48 products with EAN in `__NEXT_DATA__`; PC Garage: JSON-LD ItemList; Flanco: GA4 items with MPN | — |
| 4 | Product URL not found for EuroGSM (recon §1) | PARTIAL | Both declared EuroGSM sitemaps are the same 24 content URLs; no product sitemap. Petmart and Vivre not re-checked | Ask EuroGSM for a feed |
| 5 | Child sitemaps: URLs per file and lastmod (recon §1/§3) | CLOSED | See the §4 table (9 shops); only Elefant has real per-URL lastmod | — |
| 6 | eMAG "Alte oferte" in HTML (recon §1) | CLOSED | dataLayer `secondary_offers` (vendor, offer id, price); widget is client-side | — |
| 7 | Platforms of Altex, Media Galaxy, PC Garage, evoMAG and CEL (recon §2) | CLOSED | Magento+Next.js ×2, custom PHP, Yii, Zen Cart-derived; Flanco Magento 2 | — |
| 8 | Product counts: Altex, Flanco, PC Garage (recon §3) | PARTIAL | Altex ≈0.48–0.73M (estimate; files of 3,724, 29,321 and 228,270 measured); PC Garage index of 1,419 children (2024); Flanco unknown | Flanco: ask for sitemap or feed |
| 9 | SSR prices on listings of blocked shops (recon §3) | CLOSED | Yes at all six | — |
| 10 | r/programare and blog write-ups (recon §7) | PARTIAL | General IP-ban and legality threads; nothing shop- or ASN-specific | — |
| 11 | CWS data-collection disclosures (recon §7) | CLOSED | Istoric Preturi: website content (uploads price data); Pricy: URLs; Pret Alert: web history | — |
| 12 | Altex full terms text (bot §3) | CLOSED | 2026-05-19 snapshot; general IP clause only | Re-check live text in a browser before launch |
| 13 | Flanco full terms text, 2026 (bot §3, company §5) | NOT PUBLIC | New URL `/termene-si-conditii` never archived; live page challenged | Save a browser PDF of the page |
| 14 | eMAG English T&C (bot §3) | NOT PUBLIC | No archived `/help/terms*` or `/info/terms*`; Romanian text only | None needed |
| 15 | eMAG partner crawler guidance / Marketplace docs (bot §3) | NOT PUBLIC | No archived `marketplace-api.emag.ro/api-doc`; eMAG request cap reached | Read the Marketplace docs in a browser; ask eMAG partner support whether a comparator feed or crawl agreement exists |
| 16 | Repo licences and working status (bot §4) | CLOSED / PARTIAL | 81 of 107 unlicensed; bf-price-monitor live run logged | — |
| 17 | eMAG rate thresholds in repos (bot §4) | CLOSED | None documented | — |
| 18 | GitHub code search (bot §4) | NOT PUBLIC | Needs login | Run a logged-in code search if needed |
| 19 | PyPI keyword search (bot §4) | NOT PUBLIC | Fastly JavaScript challenge | Search in a browser |
| 20 | Hetzner/OVH/DO/RO IP tests and forum reports (bot §5) | NOT PUBLIC | No public reports; Pret Alert's code says Flanco blocks its server | See #2 |
| 21 | Bucharest VPS GeoIP, PTR, M247 reputation; Digi/Hostico/Zitec prices (bot §5) | OPEN (not attempted; outside priorities 1–7) | — | Buy a test VPS; check ipinfo and MaxMind; request quotes |
| 22 | evoMAG feed field list (bot §6) | NOT PUBLIC | Needs a 2P affiliate login | Open a 2P affiliate account; download one feed |
| 23 | Written evoMAG position on comparators and price history (bot §6) | PARTIAL | 2P page silent; terms: "reproducerea … numai cu acordul sursei"; old Profitshare: Google Shopping with consent | Message evoMAG via 2P |
| 24 | Distinct filter policy and other shops behind it (bot §6) | NOT PUBLIC | Captcha FAQ only; dated client list | Email captcha@distinct.ro (see §6) |
| 25 | eMAG middle files / 5,000 cap (bot §7) | CLOSED | Archived files of 4,995 and 5,000 URLs | — |
| 26 | eMAG offers-latest and offers-unavailable index sizes (bot §7) | CLOSED | 9 and 27 children; unavailable was 3,991 in January 2026 | — |
| 27 | eMAG file shrink/split; variant mapping (bot §7) | PARTIAL | Unavailable index shrank 3,991 → 27; variants unresolved | — |
| 28 | PC Garage terms (company §5) | CLOSED | Buyer-only; Art. 6 non-disclosure and trademark clause | — |
| 29 | Fashion Days terms (company §5) | CLOSED | Robot ban 4.2(j); prices in Content; 6.2 republication ban | — |
| 30 | OLX terms (company §5) | NOT PUBLIC | Salesforce JavaScript shell in all archives | Save a browser PDF (see §1) |
| 31 | Robots of these sites not re-checked (company §5) | CLOSED | Altex, Media Galaxy, PC Garage (2025), iStyle, CEL, evoMAG, Fashion Days (Mar 2026), OLX | Live PC Garage robots: open in a browser |
| 32 | Terms: Media Galaxy, cel.ro, evoMAG, Vexio, iStyle, EuroGSM (task P1) | CLOSED | See §1 | — |
| 33 | Affiliate rule texts: F64, GSMnet, spy-shop, bitmi, conectica, a2t, Profitshare IT&C, evoMAG, Vexio (task P5) | CLOSED | See §5 | — |
| 34 | Decathlon closure notice (P5) | CLOSED | "…se va închide începând cu data de 31.10.2026" | — |
| 35 | Flanco 2P closure date (affiliate notes; P5) | CLOSED | "…SE VA ÎNCHIDE ÎNCEPÂND CU DATA DE 29.06.2026" (Wayback 2026-06-15) | — |
| 36 | Any program allowing or forbidding "istoric prețuri" (P5) | CLOSED | 0 of 378 2P programs mention it; only Fashion Days (Profitshare) forbids it | — |
| 37 | Common Crawl CC-39 for 12 shops (P7) | CLOSED | See §7 | — |
| 38 | Profitshare unlabelled figures (affiliate notes, bonus) | CLOSED | Approval rate, approval period, no-phone flag, feed flag; Vexio has feeds | — |

---
