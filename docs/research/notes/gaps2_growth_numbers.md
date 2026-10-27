# Gap closure, round 2: demand, growth channels, monetisation numbers and market benchmarks for Pretoscop (Romania, researched 2026-10-27)

Scope: the open gaps listed under `monetization_and_growth.md`, `gaps_growth_and_demand.md` (every question except Q4, competitor features) and `market_and_competitors.md` §1, §2, §5 and §6 in the gap digest.

Labels:
- **[DIRECT]**: I fetched the page, file or API myself on 2026-10-27.
- **[DIRECT, saved]**: a public page saved to this session's scratchpad on 2026-10-27, either by me or by a parallel research agent. I read the saved copy.
- **[SNIPPET]**: from a search-engine summary only. The page itself was not opened.
- **[EST]**: a third-party tool's estimate (Semrush, Ahrefs, Similarweb).
- **[MY ESTIMATE]**: my own calculation. The method is stated.

Status values:
- **CLOSED**: answered from a primary or otherwise reliable source.
- **PARTIAL**: answered in part, or only from secondary sources.
- **NOT PUBLIC**: not available without a login, payment, captcha or direct contact. A founder action is given.
- **NOT RESEARCHED**: used only in the summary table, for a few low-priority monetisation gaps the budget did not reach. This keeps them from being mistaken for "not public".

Budget and method: I used all 40 of my web searches. Most findings come from direct fetches:
- Google Trends JSON, as in round 1
- Semrush, Ahrefs and Similarweb free site pages
- Google, Cloudflare, Hetzner, Apple and Chrome documentation
- company PDFs (Allegro, Moltiply)
- Profitshare programme pages and the 2Performant help centre
- the Arctic Shift Reddit archive API and public t.me pages
- Chrome Web Store listings, WonderNetwork ping tables and vendor price pages

I did not log in anywhere. I did not use keyword-tool back-end APIs that normally need an account or browser extension. Sites that answered automated requests with 403 or 503 were not retried by other means.

---

## 1. Keyword volumes: do the Trends-based estimates hold, and how big is demand by category?

### Takeaway
The round-1 estimates were too low, by roughly 2–3×.
- A public Semrush page gives **6,600 searches a month** for both "istoric pret" and "istoric preturi". This is most likely one grouped Keyword Planner figure.
- I recalibrated Google Trends against two long-tail anchors from different tools: Semrush's "motocultor dedeman" (3,600) and Ahrefs' "versace eros" (16,000). They agree within 2%.
- On that calibration, 12-month averages are about 4.5K/month for "istoric pret", 3.4K for "istoric preturi", 17K for "cel mai mic pret", 13–14K for "iphone 17 pret" and 49K for "black friday emag".
- The round-1 method anchored broad-match Trends values to exact-match brand volumes. That undercounts long-tail queries.

Category demand (all queries containing the word) ranks parfum > laptop ≈ carti > iphone 17 > telefoane ≈ frigider > televizor. The plural category words ("televizoare", "frigidere", "laptopuri") get only 3–9% of the volume of the singular "laptop", and well under the singular for their own category.

### Cited Findings

**Gap 1.1: volumes for "istoric pret", "istoric preturi", "comparator preturi", "cel mai mic pret", "iphone 17 pret", "black friday emag" and "reduceri"** (gaps_growth_and_demand Q1; market §5; monetization §9). **Status: PARTIAL.** I now have third-party tool figures and a recalibrated Trends model, but Keyword Planner itself was not checked.

- Semrush's public overview of istoric-preturi.info (Sep 2026 data; page "Last updated: October 11, 2026") lists Romanian organic keywords with volumes [DIRECT][EST]:

| Keyword | Position | Volume / month | CPC (USD) | Share of site traffic |
|---|---|---|---|---|
| istoric pret | 1 | 6,600 | 0 | 4.55% |
| istoric preturi | 4 | 6,600 | 0 | 2.45% |
| compara preturi | 1 | 3,600 | 0.06 | 8.98% |
| motocultor dedeman | 1 | 3,600 | 0.15 | 8.98% |

  Same page, other figures:
  - Visits: 176.54K in Sep 2026 (Aug 160.9K, Jul 183.77K). Semrush's organic-traffic estimate is 19.29K.
  - Channels: Google organic 56.77% and direct 31.59% of traffic.
  - Romania is 79.12% of visits, and 75.4% of those are mobile.
  - 10.83K backlinks from 2.11K referring domains.
  - ChatGPT referrals: 51 visits (0.029%).
  - Source: [Semrush: istoric-preturi.info](https://www.semrush.com/website/istoric-preturi.info/overview/)
- Semrush has no public overview page for compari.ro or pricy.ro; both returned 404 on 2026-10-27. — [Semrush: compari.ro](https://www.semrush.com/website/compari.ro/overview/); [Semrush: pricy.ro](https://www.semrush.com/website/pricy.ro/overview/) [DIRECT]
- Similarweb for istoric-preturi.info, Sep 2026 [DIRECT][EST]:
  - 141.1K visits (−13.7% m/m), 42.52% bounce rate, 2.19 pages per visit, 40-second average visit.
  - Search traffic is 100% organic. Reddit is the top social referrer.
  - Keyword values appear only as "$0.32" ("istoric preturi") and "$0.33" ("istoric pret"), with no volumes.
  - Source: [Similarweb: istoric-preturi.info](https://www.similarweb.com/website/istoric-preturi.info/)
- Ahrefs' public site pages now redirect (HTTP 301) from ahrefs.com/websites/… to ahrefstop.com/websites/…. Romanian exact-match volumes, Oct 2026 [DIRECT][EST]:
  - pcgarage.ro: "pc garage" 149K, "laptop" 27K, "pcgarage" 22K, "pc gaming" 16K, "rtx 3060" 7.7K. — [Ahrefs: pcgarage.ro](https://ahrefstop.com/websites/pcgarage.ro)
  - notino.ro: "notino" 160K, "sol de janeiro" 26K, "versace eros" 16K, "notino ro" 14K, "notino romania" 8.4K. — [Ahrefs: notino.ro](https://ahrefstop.com/websites/notino.ro)
  - libris.ro: "libris" 58K, "harta romaniei" 47K, "fauritorul de lacrimi" 22K. — [Ahrefs: libris.ro](https://ahrefstop.com/websites/libris.ro)
  - istyle.ro: "iphone 14" 142K, "iphone 15 pro max" 128K, "iphone 15 pro" 71K, "airpods" 54K, "istyle" 45K. — [Ahrefs: istyle.ro](https://ahrefstop.com/websites/istyle.ro)
- **Google Trends** (geo=RO, weekly, 12 months from 26 Oct 2025 to 31 Oct 2026, JSON pulled 2026-10-27). Figures are sums of weekly index values within one comparison, so they can only be compared within the same comparison [DIRECT]:
  - **Anchor test (C7):**
    - Sums: "istoric pret" 205, "motocultor dedeman" 166, "rtx 3060" 992, "versace eros" 723, "pc gaming" 2,876.
    - Searches per Trends unit implied by each tool volume: motocultor dedeman (Semrush 3,600) **21.7**; versace eros (Ahrefs 16,000) **22.1**; rtx 3060 (Ahrefs 7,700) 7.8; pc gaming (Ahrefs 16,000) 5.6.
    - Source: [Trends C7](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=istoric%20pret,motocultor%20dedeman,rtx%203060,versace%20eros,pc%20gaming)
  - **Long-tail set (C4):** "istoric pret" 87, "istoric preturi" 66, "motocultor dedeman" 70, "compara preturi" 2, "compari" 1,825. — [Trends C4](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=istoric%20pret,istoric%20preturi,motocultor%20dedeman,compara%20preturi,compari)
  - **Product and price set (C8):** "rtx 3060" 80, "black friday emag" 179, "cel mai mic pret" 62, "iphone 17 pret" 52, "reduceri emag" 5. — [Trends C8](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=rtx%203060,black%20friday%20emag,cel%20mai%20mic%20pret,iphone%2017%20pret,reduceri%20emag)
  - **Bridge through compari (C5):** "laptop" 3,658, "compari" 478, "istoric pret" 28, "iphone 17 pret" 65, "cel mai mic pret" 84. — [Trends C5](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=laptop,compari,istoric%20pret,iphone%2017%20pret,cel%20mai%20mic%20pret)
  - **Diacritics and alternative wordings are negligible:**
    - Against "istoric pret" (87): "istoric preț" 2, "istoric prețuri" 0, "istoricul preturilor" 0. — [Trends C1](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=istoric%20pret,istoric%20pre%C8%9B,istoric%20pre%C8%9Buri,istoricul%20preturilor,compari)
    - Against "compara preturi" (2): "compară prețuri" 0, "comparare preturi" 0, while "comparator preturi" scores 60. — [Trends C2](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=compara%20preturi,compar%C4%83%20pre%C8%9Buri,comparare%20preturi,comparator%20preturi,compari)

**Gap 1.2: what drives the English "price history" query in Romania** (gaps_growth_and_demand Q1). **Status: CLOSED.**
- Top related queries over 12 months, RO:
  - "gold price history" 100, "amazon price history" 68, "oil price history" 60, "steam price history" 50, "bitcoin price history" 33, "ps5 price history" 18, "price history extension" 17.
  - Unrelated noise such as "wikipedia" (28) and "lidl near me" (13).
  - Rising: "price history extension" +120%, "amazon price history" +110%.
  - Source: [Trends: price history, RO](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=price%20history) [DIRECT]

**Gap 1.3: search demand by category** (market §6; telefoane, laptopuri, televizoare, frigidere, parfumuri, carti). **Status: PARTIAL.** These are relative Trends indices. Absolute values are calibrated estimates, not tool figures.
- 12-month Trends sums, each comparison normalised to "laptop" = 100 [DIRECT]:

| Term | Index | Peak week | Source |
|---|---|---|---|
| parfum | 154 | 14–27 Dec 2025 | [Trends K1](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=laptop,telefoane,televizor,frigider,parfum) |
| laptop | 100 | 2–8 Nov 2025 | same |
| carti | 97 | 2–8 Nov 2025 | [Trends K2](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=laptop,carti,iphone%2017,black%20friday,reduceri) |
| iphone 17 | 80 | 21–27 Dec 2025 | Trends K2 |
| telefoane | 45 | 15–21 Feb 2026 | Trends K1 |
| black friday | 44 | 2–8 Nov 2025 | Trends K2 |
| frigider | 43 | 28 Jun – 4 Jul 2026 | Trends K1 |
| televizor | 34 | 2–8 Nov 2025 | Trends K1 |
| reduceri | 26 | 2–8 Nov 2025 | Trends K2 |
| televizoare | 9.3 | 15–21 Feb 2026 | [Trends K3](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=laptop,laptopuri,televizoare,frigidere,telefon) |
| frigidere | 8.0 | 28 Jun – 4 Jul 2026 | Trends K3 |
| laptopuri | 3.3 | 15–21 Feb 2026 | Trends K3 |
| telefon | 293 | 12–18 Apr 2026 | Trends K3 (noisy: includes phone-number and similar queries) |

- Exact-match anchor: "laptop" gets 27K a month. — [Ahrefs: pcgarage.ro](https://ahrefstop.com/websites/pcgarage.ro) [DIRECT][EST]

**Gap 1.4: Black Friday search-volume data** (monetization §8). **Status: CLOSED** (calibrated estimate, see Inferences).
- "black friday emag" is in Trends C8 (above), and its five-week concentration (80% of yearly searches) was measured in round 1. — [gaps_growth_and_demand.md Q1](gaps_growth_and_demand.md)

**Gap 1.5: Romanian keyword volumes or Similarweb traffic for compari, Pricy, ShopMania and price.ro** (monetization §9). **Status: PARTIAL.**
- compari: Ahrefs gives 2.4M organic visits a month (round 1). Its broad brand demand is re-estimated below.
- Semrush has no free page for compari.ro or pricy.ro (404, above).
- Similarweb pages for pricy.ro, shopmania.ro and price.ro were not re-fetched this round.

### Inferences
**Revised 12-month averages, Oct 2025 – Oct 2026** [MY ESTIMATE]
- Method: monthly volume ≈ (12-month Trends sum on the C7 scale) × 21.7–22.1 searches per unit.
- Terms in other comparisons are converted to the C7 scale through a shared term: "istoric pret" (C4 → C7 factor 2.356) and "rtx 3060" (C8 → C7 factor 12.40).
- Trends uses broad match, so the figures approximate all searches containing the words.
- Uncertainty is about ±30%. It comes from tool rounding into buckets, the broad- versus exact-match gap, and the rounding of small Trends values.

| Query | Round-1 estimate | Revised estimate / month | Cross-checks |
|---|---|---|---|
| istoric pret | 1.2–2.2K | ≈4.4–4.5K | Semrush 6.6K; via the compari bridge ≈5.5K |
| istoric preturi | 1.0–1.6K | ≈3.4K | Semrush 6.6K (same grouped figure) |
| both together | 2.2–3.8K | ≈7.8–8.0K | Semrush 6.6K if grouped |
| comparator preturi | 1.1–1.5K | ≈3.1K (mostly ANRE's energy comparator) | Semrush "compara preturi" 3.6K, probably the grouped figure |
| compara preturi (that exact wording) | <50 | ≈0.1K | — |
| cel mai mic pret | 5.7–8K | ≈16.7–17.0K | via the compari bridge ≈16.4–16.7K |
| iphone 17 pret (broad: includes Pro and Pro Max variants) | 4.5–6.3K | ≈14.0–14.3K | via the compari bridge ≈12.7–12.9K |
| black friday emag | 17–23K (≈200–280K a year) | ≈48–49K (≈580–590K a year) | — |
| reduceri emag | 0.8–1.1K | ≈1.3–1.4K (low precision) | — |
| compari (broad brand) | 32–45K | ≈93–95K | Ahrefs exact match: compari 15K + compari.ro 26K = 41K |
| black friday (broad) | 100–140K | ≈0.32M (≈3.8M a year) | press: more than 2M a year in 2019 |
| reduceri (broad) | — | ≈0.19M | — |

- **Black Friday window:** 31% of yearly "istoric pret" searches and 52% of "istoric preturi" searches fell in the five weeks from 26 Oct to 29 Nov 2025 (Trends C4). That is about 16.7–17.0K and 20.8–21.2K searches, or about 38K price-history searches in the 2025 Black Friday window. The round-1 estimate was 5–12K for each term [MY ESTIMATE].
- **Why round 1 was low:** Trends counts every query that contains the words, while Ahrefs and Semrush report exact-match volumes.
  - Head brand terms (emag, altex, compari) have many longer variants, so their Trends totals are large relative to their exact-match volume. Anchoring long-tail terms to them shrinks the long-tail estimates.
  - The two long-tail anchors, which have few variants, agree with each other (21.7 and 22.1 searches per unit).
  - The head-term anchors give much lower values: 7.8 for "rtx 3060" and 5.6 for "pc gaming" [inference].
- **Grouped Semrush figures:** Semrush shows an identical 6,600 for "istoric pret" and "istoric preturi", and 3,600 for "compara preturi" even though Trends shows that wording is rare. Both fit Google Keyword Planner's practice of reporting one volume for a group of close variants [inference; I did not re-read Keyword Planner's grouping rules this session].
- **Category volumes (broad, indicative)** [MY ESTIMATE]:
  - From Trends C5 and the calibration, broad "laptop" ≈ 7.65 × broad "compari" ≈ 0.71–0.73M searches a month. The exact query "laptop" is 27K, about 4% of that.
  - On that scale, all queries containing each word:
    - parfum ≈1.1M a month
    - carti ≈0.70M
    - iphone 17 ≈0.58M
    - telefoane ≈0.32M
    - frigider ≈0.31M
    - televizor ≈0.24M
    - televizoare ≈67K
    - frigidere ≈58K
    - laptopuri ≈24K
  - These broad totals include accessory and informational queries. Treat them only as the relative size of each category.
- **Seasonality for launch planning:**
  - Electronics heads (laptop, televizor) and "carti" peak in the first week of November (Black Friday).
  - parfum peaks in mid-December.
  - frigider peaks in late June to early July.
  - telefoane and televizoare both spiked in 15–21 Feb 2026. I did not check the cause.

### Gaps
- **1.1 Founder action (validates every figure above in 10 minutes):**
  1. Create a free Google Ads account. No campaign or payment is needed to open Keyword Planner.
  2. Open Keyword Planner → "Get search volume and forecasts", with location Romania and language Romanian.
  3. Paste: istoric pret, istoric preturi, comparator preturi, compara preturi, cel mai mic pret, iphone 17 pret, pret iphone 17, black friday emag, reduceri emag, compari, laptop, televizor, frigider, parfum, carti, telefoane.
  4. Export the monthly breakdown.

  Accounts without spend see ranges (for example 1K–10K). The monthly series still shows seasonality.
- Ubersuggest, Mangools and Moz need accounts and were not used.
- **1.5 Founder action:** open Similarweb's free pages for pricy.ro, shopmania.ro and price.ro in a browser if their traffic is needed for the model.

---

## 2. Romanian display-ad yields and ad-network terms

### Takeaway
- **RPM:** no 2024–2026 AdSense or Prebid RPM for Romanian web traffic is published. The only country-level figure is YouTube's roughly $1.15 per 1,000 views.
- **IAB ROADS:** the study appears to have stopped after its 2021 edition. The best 2025 market figure is still Initiative's digital spend of €327M ([Economedia](https://economedia.ro/piata-media-din-romania-a-crescut-la-838-milioane-de-euro-in-2025-venituri-de-415-milioane-de-euro-in-tv.html), round 1).
- **Arbomedia/ThinkDigital:** ARBOMEDIA has absorbed ThinkDigital. It runs an outsourced ad-sales network of more than 140 websites but publishes no publisher terms.
- **Journey by Mediavine** accepts non-US publishers and non-English sites. It pays a 70% revenue share on Net 65 terms and needs at least four months of domain history and 30 days of its Grow script.
- **AdSense consent:** since 16 Jan 2024, AdSense requires a Google-certified CMP integrated with the TCF to serve personalised ads in the EEA. Google's own "Privacy & messaging" CMP qualifies.

### Cited Findings

**Gap 2.1: Romanian AdSense or Prebid RPM, 2024–2026** (gaps_growth Q3; monetization §3 and §11). **Status: NOT PUBLIC.**
- Searches in Romanian and English found no RPM for Romanian web display.
  - The only country figure is YouTube creator RPM for Romania of about $1.15 per 1,000 views (Dynamoi, labelled 2026 data). — [Dynamoi](https://dynamoi.com/data/youtube-adsense-rpm/ro) [SNIPPET]
  - The Softpedia forum's AdSense threads are from 2005–2007 and give no RPM. — [Softpedia forum: AdSense Romania](https://forum.softpedia.com/topic/219742-adsense-romania/page__st__18/) [SNIPPET]
- Generic "RPM by country" pages give only US/UK bands, not Romania. — [Ranktracker](https://www.ranktracker.com/de/blog/adsense-payment-trends-by-country/) [SNIPPET]

**Gap 2.2: IAB Romania / ROADS 2025 ad-spend figure** (gaps_growth Q3). **Status: NOT PUBLIC** (apparently discontinued).
- Revista Biz's ROADS tag lists editions up to "Rezultatele IAB ROADS 2021 Full Year". The 2019 study put the online ad market at about €80M. — [Revista Biz: ROADS tag](https://www.revistabiz.ro/etichete/roads/) [DIRECT]
- IAB Romania's site mentions ROADS only as an example of its research projects. No 2022–2025 edition, value or report link is shown. — [IAB Romania](https://www.iab-romania.ro/) [DIRECT]

**Gap 2.3: ThinkDigital and Arbomedia publisher terms and minimums** (gaps_growth Q3; monetization §3). **Status: NOT PUBLIC.**
- thinkdigital.ro now shows only a notice that ThinkDigital "is now part of Romania's most comprehensive and integrated media offering", with a link to the former site. — [ThinkDigital](https://thinkdigital.ro/) [DIRECT]
- arbomedia.ro, 2026 [DIRECT]:
  - It says the integration of ARBOmedia and ThinkDigital is complete.
  - It describes itself as outsourced ad sales ("servicii externalizate de vânzări de publicitate").
  - Network: "peste 100 de influenceri, peste 110 posturi de radio, peste 140 de website-uri, peste 40 de canale de televiziune, peste 30 de titluri locale de presă scrisă".
  - It publishes no publisher requirements, revenue share or minimums. The only route is a contact form.
  - Source: [ARBOMEDIA](https://arbomedia.ro/)

**Gap 2.4: Mediavine's country-of-origin rules and the Journey wording on language** (gaps_growth Q3; monetization §3). **Status: PARTIAL.** The language rule is now confirmed on first-party pages. The weighting of traffic geography is still not quantified.
- Mediavine's approval page [DIRECT]:
  - "To start with Journey by Mediavine, sites need over 1,000 sessions. To start with Mediavine Official, sites need $5,000+ in annual ad revenue."
  - Reviewers also look at "Traffic countries of origin" and "Traffic sources". No thresholds are given.
  - Source: [Mediavine Help](https://help.mediavine.com/what-does-it-take-to-get-approved-by-mediavine)
- Journey's FAQ (published 15 Apr 2024, modified 17 Sep 2024) [DIRECT]:
  - "having an English-language site is not a requirement"
  - Revenue share is 70%, paid "on a Net 65 schedule". It can rise to 90% on Mediavine or PubNation.
  - The Grow script must run for at least 30 days.
  - "Our Mediavine ad partners require at least four months of domain history".
  - Source: [Journey FAQ](https://www.journeymv.com/getting-started-with-journey-by-mediavine/)
- Journey's international-publishers article [DIRECT]:
  - It answers "Yes!" to publishers outside the US and to non-English sites.
  - Payments go through Tipalti (PayPal, ACH, wires), and currency conversion fees are about 2%.
  - Source: [Journey help: International Publishers](https://journeymv.zendesk.com/hc/en-us/articles/23783500242075-Journey-and-International-Publishers)

**Gap 2.5: AdSense CMP requirement for the EEA** (legal gap cross-check; monetization §3). **Status: CLOSED.**
- AdSense, Ad Manager and AdMob publishers must use "a consent management platform (CMP) that has been certified by Google and integrates with the IAB's Transparency and Consent Framework (TCF)" for personalised ads.
  - EEA and UK: required "As of 16 January 2024". Switzerland: from 31 July 2024.
  - Traffic from a non-certified CMP "may be eligible for non-personalized ads or limited ads".
  - The European regulations messages in Google's own "Privacy & messaging" tab "are certified in accordance with the new TCF requirement".
  - Source: [AdSense Help 13554116](https://support.google.com/adsense/answer/13554116?hl=en) [DIRECT]

**Gap 2.6: Adoperator, Publicitas and "Promo Consult"** (gaps_growth Q3). **Status: NOT RESEARCHED** (search budget). Round 1 found nothing for these names.

**Gap 2.7: Romanian newsletter-sponsorship and sponsored-deal rates** (monetization §3 and §8). **Status: NOT PUBLIC.** No rate card was found in round 1, and none was sought this round.

### Inferences
- Display revenue can only be measured, not looked up. Plan it from Pretoscop's own first 30 days of AdSense or Journey data, starting from the round-1 range (low single-digit dollar RPMs, based on Romanian click values of about $0.07–0.11 per visit) [inference].
- Journey is open to a Romanian-language site in principle. Its four-month domain-history rule means a domain registered in Nov 2026 could not run Journey ads before about Mar 2027 [MY ESTIMATE from the stated rule].
- Use Google's free certified "Privacy & messaging" CMP for EEA consent instead of buying a CMP at launch [inference].

### Gaps
- **2.1 Founder action:**
  1. After launch, read AdSense → Reports → "Countries" (page RPM for Romania) after 30 days. Compare it with Journey once eligible.
  2. Meanwhile, ask two or three Romanian publishers you know for their AdSense page RPM for RO traffic, or ask in Romanian SEO groups.
- **2.2 Founder action:** email IAB Romania (contact on iab-romania.ro) and ask whether ROADS 2023–2025 exists, perhaps for members only. If not, cite the Initiative Media Fact Book 2026 figure.
- **2.3 Founder action:** write to ARBOMEDIA through [arbomedia.ro/contact](https://arbomedia.ro/contact/). Ask for minimum monthly pageviews, revenue share, exclusivity, payment terms, header-bidding or Prebid support, and whether comparison or e-commerce-adjacent sites are accepted.
- **2.4 Founder action:** ask Journey support whether mostly-Romanian traffic is accepted and what share of sessions must come from tier-1 countries. Do it by email before installing Grow.
- **2.7 Founder action:** ask Cuponescu, Kuponiada and TeamDeals for media kits. They are listed in round-1 notes.

---

## 3. Comparator benchmarks: engagement, attribution, reversals, revenue and the business models of peers

### Takeaway
Two new hard benchmarks:
- **Ceneo** (an Allegro segment), H1 2025: revenue PLN 165.0M (+9.3%) and EBITDA PLN 44.7M (27% margin). Marketing spend was PLN 83.9M, or 51% of revenue, and a fifth of revenue came from inside the Allegro group.
- **Moltiply's "Shopping" line** (Trovaprezzi's comparison business), 2025: revenue €43.6M (−1.7%). The company blames Google's own comparison unit.

Profitshare's public programme pages give value-based commission approval rates of 72–100% for electronics shops. eMAG's is 73.35%, meaning about 27% of recorded commission value is reversed; approval takes about 31 days.

Still behind filings that need a browser, captcha or payment: idealo's revenue, Heureka's revenue split, Árukereső's, Skroutz's and Geizhals' accounts.

No public click-outs-per-session benchmark exists.

On consumer price-tracking peers: Keepa has 5M Chrome users and Honey 13M. PriceRunner has no paid tier; it offers a free account with alerts and Buyer Protection, moving to Klarna sign-in on 25 Jan 2027.

### Cited Findings

**Gap 3.1: click-outs per session for comparison sites** (monetization §11). **Status: NOT PUBLIC.**
- No published click-out rate was found. The closest public proxies are Similarweb engagement figures, Sep 2026 [DIRECT][EST]:

| Site | Pages per visit | Bounce rate | Average visit | Source |
|---|---|---|---|---|
| ceneo.pl | 3.01 | 29.83% | 1:45 | [Similarweb: ceneo.pl](https://www.similarweb.com/website/ceneo.pl/) |
| trovaprezzi.it | 2.76 | 41.97% | 2:26 | [Similarweb: trovaprezzi.it](https://www.similarweb.com/website/trovaprezzi.it/) |
| istoric-preturi.info | 2.19 | 42.52% | 0:40 | [Similarweb: istoric-preturi.info](https://www.similarweb.com/website/istoric-preturi.info/) |

- Heureka's CEO David Chmelař, interviewed on 15 Sep 2025 [DIRECT]:
  - Heureka "přestali nakupovat traffic, na kterém jsme nedokázali vydělat" (stopped buying traffic it could not make money on), which means fewer leads for shops.
  - "Masivní utrácení firem jako Allegro nebo Temu za PPC reklamu Heurece výrazně zdražilo vstupy" (Allegro's and Temu's heavy PPC spending made Heureka's inputs much more expensive).
  - "Ověřeno zákazníky" (Verified by Customers) is now free only for e-shops actively using PPC; others get a freemium model.
  - Source: [Lupa.cz](https://www.lupa.cz/clanky/david-chmelar-heureka-cz-nebyli-jsme-v-dobre-kondici-ale-loni-uz-jsme-rostli-ve-vsech-ohledech/)
- A third-party guide gives Heureka.cz CPCs of €0.25–0.51. — [webappick](https://webappick.com/best-price-comparison-sites-europe/) [SNIPPET; unverified]

**Gap 3.2: real attribution loss on mobile** (monetization §11). **Status: PARTIAL.** There is qualitative first-party evidence but no measured Romanian rate.
- 2Performant's 2025 annual report says it "reproiectat complet sistemul de tracking în aplicații mobile, unde se generează peste 50% din vânzările multor comercianți" (completely redesigned in-app tracking, where over 50% of many merchants' sales are generated). It also introduced a "Low Approval Rate Fee" against abusive commission rejection. — [2Performant Raport anual 2025 (BVB)](https://www.bvb.ro/info/Raportari/2P/2P_20260423225924_Raport-anual-2025-RO.pdf) [DIRECT, saved]
- 2Performant's cashback documentation lists the most common reasons a transaction is not tracked: third-party cookie blocking ("mai ales pe iOS"), browsers or antivirus blocking cookies, cross-browser or cross-device purchases, and clicks on other affiliate links (for example coupon sites) before checkout. — [2Performant: Documentatie Cashback](https://support.2performant.com/ro/cashback-documentation) [DIRECT]
- A deep-linking vendor claims affiliates lose 30–50% of commissions in in-app environments, with no method given. — [Bouncy blog](https://blog.bouncy.ai/blog/deep-linking-affiliate-marketers/) [SNIPPET; vendor claim]
- Awin answers Safari ITP with server-to-server tracking. — [Awin](https://www.awin.com/ie/news-and-events/awin-news/mitigate-itp-impact-with-awins-tracking) [SNIPPET]

**Gap 3.3: approval periods and reversal rates on 2Performant and Profitshare** (monetization §1). **Status: CLOSED for Profitshare's public pages; NOT PUBLIC for 2Performant.**
- Each Profitshare programme page carries tooltips such as "Rata medie de aprobare valorică a comisioanelor la advertiserul eMAG.ro este de 73.35% din valoarea comisioanelor înregistrate" (average value-based approval rate of recorded commissions) and "Perioada medie pentru aprobarea comisioanelor … este de 31 zile". Pages retrieved 2026-10-27 [DIRECT, saved]:

| Advertiser | Value approval rate | Days to approve | Commission (cookie) period | Source |
|---|---|---|---|---|
| eMAG | 73.35% | 31 | 2–15 days | [Profitshare: eMAG](https://profitshare.ro/affiliate-programs/retail/emag) |
| Flanco | 84.01% | 45 | 10 days | [Profitshare: Flanco](https://profitshare.ro/affiliate-programs/retail/flanco) |
| Vonmag | 90.23% | 31 | 30 days | [Profitshare: Vonmag](https://profitshare.ro/affiliate-programs/it-c/vonmag) |
| ITGalaxy | 88% | 11 | 60 days | [Profitshare: ITGalaxy](https://profitshare.ro/affiliate-programs/it-c/itgalaxy) |
| Techstar | 85.93% | 31 | 30 days | [Profitshare: Techstar](https://profitshare.ro/affiliate-programs/it-c/techstar) |
| ForIT | 71.76% | 31 | 30 days | [Profitshare: ForIT](https://profitshare.ro/affiliate-programs/it-c/forit) |
| Vexio | 98.7% | 31 | 5 days | [Profitshare: Vexio](https://profitshare.ro/affiliate-programs/it-c/vexio) |
| Dualstore | 100% | 31 | 30 days | [Profitshare: Dualstore](https://profitshare.ro/affiliate-programs/it-c/dualstore) |

  The Flanco page was saved earlier on 2026-10-27; whether the programme is still open is handled in the affiliate-gap notes.
- On 2Performant, commission statuses are Pending, Approved, Rejected and Paid. "Odata ce un comision este procesat ca Approved sau Rejected, nu se mai pot face modificari" (once processed, it cannot be changed). A commission cut requires 30 days' notice, or less if the cookie window is shorter. — [2Performant: Documentatie Cashback](https://support.2performant.com/ro/cashback-documentation) [DIRECT]
- I found no public per-advertiser approval rates on 2Performant. In round 1, programme details sat behind the affiliate login.

**Gap 3.4: idealo's absolute revenue, 2024–2025** (gaps_growth Q5; monetization §10). **Status: NOT PUBLIC.**
- Axel Springer, FY2025 (announced 21 May 2026) [DIRECT]:
  - Pro forma revenue €2.2bn. Adjusted EBIT €241.4M (+29.4%) and adjusted EBITDA €364.0M (+12.9%).
  - Mathias Döpfner cited "Idealo's continued excellent performance".
  - Axel Springer holds 74.9% of idealo and 52.5% of Awin.
  - No idealo or Commerce-segment figures were disclosed.
  - Source: [PPC Land](https://ppc.land/axel-springer-posts-29-ebit-jump-in-its-first-year-as-an-independent-company/)
- North Data lists idealo internet GmbH's statutory accounts for 2006–2024, but revenue and earnings are premium-only. — [North Data: idealo internet GmbH](https://www.northdata.com/idealo%20internet%20GmbH,%20Berlin/HRB%2076749) [DIRECT]

**Gap 3.5: Heureka's revenue split (CPC, marketplace, ads) and compari.ro's revenue** (gaps_growth Q5; monetization §2 and §10). **Status: NOT PUBLIC.**
- Heureka's audited Czech annual-report PDF returned HTTP 403 to automated fetches. — [Heureka Group FY22 výroční zpráva](https://heureka.group/media/cprhhneo/heureka-group-fy22-výroční-zpráva-auditovaná-cz-31-3-2022.pdf) [DIRECT: 403]
- Public material describes CPC as the core model, with advertising and "Ověřeno zákazníky" as secondary. Heureka Marketplace charges a commission but is "free of charge" to register, with no commission on cancelled or returned orders. — [Heureka Marketplace](https://heureka.group/sk-en/for-e-shops/heureka-marketplace/) [SNIPPET]; [Lupa.cz, 15 Sep 2025](https://www.lupa.cz/clanky/david-chmelar-heureka-cz-nebyli-jsme-v-dobre-kondici-ale-loni-uz-jsme-rostli-ve-vsech-ohledech/) [DIRECT]

**Gap 3.6: Árukereső's financials** (gaps_growth Q5; monetization §10). **Status: NOT PUBLIC** (filed, but only through a JavaScript register).
- The operator is Online Comparison Shopping Kft., Budapest: company registration number 01-09-186759, tax number 24868291-2-42. It runs arukereso.hu, compari.ro and pazaruvaj.com. — [Árukereső: contact](https://www.arukereso.hu/static/elerhetosegeink.html) [SNIPPET]
- Its DSA monthly-active-recipient figures for Dec 2024 – May 2025: about 7.9M in Hungary, 2.4M in Romania and 922K in Bulgaria. These come from a search summary of arukereso.hu's static pages ([contact](https://www.arukereso.hu/static/elerhetosegeink.html), [general terms](https://www.arukereso.hu/static/general_terms_and_conditions.html)). I did not confirm which page carries them. [SNIPPET]
- Hungarian press searches returned no revenue figure. — search of hvg.hu, telex, economx [SNIPPET; nothing found]

**Gap 3.7: Skroutz's 2024 and 2025 revenue and EBITDA** (gaps_growth Q5). **Status: NOT PUBLIC** (GEMI filings not reachable by search).
- Known so far: revenue of about €150M "today" and a €650M valuation in the Blackstone deal (May 2026, round 1).
- Profit rose to €12.5M in 2020 from €5M in 2019. — [Powergame](https://www.powergame.gr/epichirisis/133647/skroutz-mazepse-olo-to-charti-kai-moirase-114-ekat-se-ypallilous-tis/) [SNIPPET]
- Merchants' turnover on Skroutz rose 22% on average in 2025. — [SKAI](https://www.skai.gr/news/finance/ayksimenes-oi-ilektronikes-agores-ton-ellinon-to-2025) [SNIPPET]

**Gap 3.8: the year behind Geizhals' revenue figure** (gaps_growth Q5). **Status: NOT PUBLIC.**
- German Wikipedia gives no revenue for Geizhals [DIRECT]:
  - About 2.8M unique clients in March 2018 (ÖWA).
  - Heise holds over 90% (also stated as 97.5%).
  - Merchants pay per click or per order, and advertising is minor.
  - Source: [de.wikipedia: Geizhals Preisvergleich](https://de.wikipedia.org/wiki/Geizhals_Preisvergleich)
- English Wikipedia's €14.2M remains undated.

**Gap 3.9: Ceneo's traffic and revenue** (market §4 → monetization §10). **Status: CLOSED.**
- Allegro.eu half-year report 2025, Ceneo segment, PLN thousands [DIRECT]:

| Item | H1 2025 | H1 2024 (restated) |
|---|---|---|
| Revenue | 164,955 | 150,860 |
| of which inter-segment (from the Allegro group) | 33,652 | 26,144 |
| Marketing services | (83,921) | n/a in extract |
| Staff costs, net | (23,889) | (20,296) |
| EBITDA | 44,686 | 44,313 |

  Source: [Allegro.eu Group H1 2025 report (PAP)](https://biznes.pap.pl/download/attachment/52459388/DOC.20250918.52459388.zal01_2025_Half-Year_Report_Of_Allegro.eu_Group.pdf)
- Similarweb, Sep 2026 [DIRECT][EST]:
  - 28.2M visits ("Total Visits", shown with a last-3-months chart), −10.04% m/m.
  - #34 site in Poland and #1 in Price Comparison.
  - Organic search 42.71% of desktop traffic, with paid search ranked second.
  - Source: [Similarweb: ceneo.pl](https://www.similarweb.com/website/ceneo.pl/)

**Gap 3.10: Trovaprezzi's traffic and revenue** (market §4 → monetization §10). **Status: CLOSED.** The revenue line is the group's Italian e-commerce comparison business.
- Moltiply Group, FY2025 results (16 Mar 2026) [DIRECT]:
  - Group revenue €674.1M (+48.6%) and EBITDA €177.4M (+44.5%).
  - "Mavriq Shopping" revenue €43.6M (6.5% of the group), against €44.4M in 2024 (−1.7%).
  - The line "è attiva in Italia nel campo della comparazione e-commerce, che rappresenta il business predominante, nonché come fornitore di soluzioni di recensioni online" (is active in Italian e-commerce comparison, its main business, and in online reviews).
  - "Il business si è contratto nel 2025 a causa della sfida nel competere con il servizio di comparazione di Google stesso, incorporato nella pagina dei risultati di Google Search" (it shrank in 2025 because it competes with Google's own comparison service built into the results page).
  - Outlook for 2026: "tra stabilità e una moderata contrazione" (between stability and a moderate contraction). A favourable DMA decision expected in 2026 "potrebbe fornire sollievo" (could bring relief).
  - Source: [Moltiply FY2025 release](https://www.emarketstorage.it/sites/default/files/comunicati/2026-03/20260316_179019.pdf)
- Trovaprezzi is named as one of Mavriq's comparison brands (19 brands in five countries, more than 250M visits a year). — [Moltiply release, 21 Mar 2025](https://emarketstorage.it/sites/default/files/comunicati/2025-03/20250321_162535.pdf) [DIRECT]
- Similarweb, Sep 2026: 15.4M visits, −8.6% m/m, #100 in Italy. Organic search is 38.12% of desktop traffic, with paid search second. — [Similarweb: trovaprezzi.it](https://www.similarweb.com/website/trovaprezzi.it/) [DIRECT][EST]

**Gap 3.11: Keepa's official pricing and user counts, plus Honey** (market §4; monetization §9). **Status: PARTIAL.** User counts are closed. Keepa's price comes from a third party.
- Keepa's Chrome Web Store listing [DIRECT]:
  - 5,000,000 users, 3.4 stars from 5.1K ratings, version 5.75, updated 26 Oct 2026.
  - It claims charts "on over 7 billion products" and "No account required".
  - "When you click an eBay link in the Keepa Box, it's routed through the eBay affiliate program."
  - Source: [Chrome Web Store: Keepa](https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo)
- PayPal Honey's Chrome Web Store listing: 13,000,000 users, 2.2 stars from 179.6K ratings, version 19.7.0, updated 2 Oct 2026. "When you use PayPal Honey, merchants may pay us affiliate commissions." — [Chrome Web Store: Honey](https://chromewebstore.google.com/detail/paypal-honey-automatic-co/bmnlcjabgnpnenekpadlanbbkooimhnj) [DIRECT]
- Keepa's paid plan costs €29 a month or €290 a year, and the API starts at €49 a month, per RevenueGeeks (not Keepa). keepa.com renders only with JavaScript. — [RevenueGeeks](https://revenuegeeks.com/keepa-pricing/) [SNIPPET]

**Gap 3.12: PriceSpy and PriceRunner premium features** (monetization §4). **Status: CLOSED for PriceRunner; PARTIAL for PriceSpy.**
- PriceRunner [DIRECT]:
  - "Do I need an account? No – you can use PriceRunner without an account."
  - A free account adds price alerts, lists and Buyer Protection, which covers items not delivered and items damaged where the retailer does not resolve the issue.
  - "From 25 January 2027, you sign in with Klarna."
  - No paid tier is offered.
  - Source: [PriceRunner account page](https://www.pricerunner.com/info/pricerunner-membership)
- PriceSpy's app is free, with price alerts by push notification or email. No premium tier was found. — [AppFollow: PriceSpy](https://appfollow.io/ios/pricespy-shopping-deals/369151774?country=us) [SNIPPET]

**Gap 3.13: how Heureka, Árukereső and Skroutz sequenced free and paid listings** (monetization §2 and §10). **Status: NOT PUBLIC.**
- Heureka was founded in 2007 by the Miton group and entered Slovakia in 2008 [SNIPPET, search summary].
- In the 2016 Alza dispute, shops complained "Zaplatíte Heurece za proklik. Ta investuje do PPC." (you pay Heureka per click, and it invests in PPC). — [Prague Municipal Court file](https://msp.gov.cz/documents/d/mestsky-soud-v-praze/1cm_18_2016_74) [SNIPPET]
- No source dates the switch from free to paid listings.

**Gap 3.14: years to profitability; conversion benchmark for comparison-referral traffic** (gaps_growth Q5; monetization §1). **Status: NOT PUBLIC.** Nothing new was found. The 2Performant category conversion rates in round 1 (electronics 2.20%) describe paid-CPC affiliate traffic.

### Inferences
- **Ceneo as a model:**
  - About half of Ceneo's revenue goes back into marketing, much of it presumably paid search, yet it keeps a 27% EBITDA margin. About 20% of its revenue comes from inside its own group, as marketplace clicks.
  - A Romanian comparator without a marketplace parent must earn margin on organic traffic. Paid traffic arbitrage is what Heureka has just cut back [inference].
- **Reversals in the revenue model:**
  - Use eMAG's 73% value-approval rate as the base case for eMAG-heavy traffic, and 85–90% for mid-size IT shops.
  - Approval lag is about 31 days, and up to 45 for Flanco.
  - So affiliate cash arrives roughly 1–2 months after the click [MY ESTIMATE from the Profitshare tooltips].
- **Google is the stated headwind:** the two listed pure comparators (Trovaprezzi and Heureka) were flat or shrinking in 2025 and both point at Google, not at AI assistants. Round 1 found that idealo, with a ChatGPT app and German scale, is the exception [inference].
- **Consumer price-tracking peers:** they stay free and earn from affiliate links (Keepa's eBay links, Honey's commissions). PriceRunner adds Buyer Protection as its account perk. A paid consumer tier would be unusual in this category [inference].

### Gaps
- **3.1 Founder action:** measure Pretoscop's own outbound clicks per session from day 1 (an outbound-link event in analytics). Ask the compari/Heureka merchant team or 2Performant's account managers for "leads per visit" or "clicks per session" benchmarks during partnership talks.
- **3.2 Founder action:** for eMAG traffic, run two weeks of tracking links with and without 2Performant/Profitshare app deep-link parameters. Compare click-to-sale match rates by device. Ask network support for per-advertiser app attribution statistics.
- **3.3 Founder action:** after opening free publisher accounts on 2Performant and Profitshare, export each target merchant's approval rate, approval days and cookie window into the revenue model.
- **3.4 Founder action:** search "idealo internet GmbH" (Berlin, HRB 76749) on [unternehmensregister.de](https://www.unternehmensregister.de) and download the 2023 and 2024 Jahresabschluss. It is free, but there is a captcha.
- **3.5 Founder action:** open the latest Heureka Group výroční zpráva in a browser (heureka.group → investor documents) or in the Czech Sbírka listin ([or.justice.cz](https://or.justice.cz), Heureka Group a.s.). Read the revenue note ("tržby") for CPC, marketplace and advertising.
- **3.6 Founder action:** on [e-beszamolo.im.gov.hu](https://e-beszamolo.im.gov.hu), search tax number 24868291 (Online Comparison Shopping Kft.) and download the 2024 and 2025 beszámoló PDFs. They are free and need no login.
- **3.7 Founder action:** on the Greek GEMI publicity portal ([publicity.businessportal.gr](https://publicity.businessportal.gr)), search "SKROUTZ" and download the 2024 financial statements (2025 when filed).
- **3.8 Founder action:** get an Austrian Firmenbuch extract for "Preisvergleich Internet Services AG" (paid, a few euros) or check the Heise Medien group report.
- **3.11 Founder action:** open keepa.com → Data/Subscription in a browser to confirm the €29 price.
- **3.13 Founder action:** ask compari's country manager about Heureka's and Árukereső's early monetisation sequence, for example in a partnership conversation. Alternatively, check Wayback Machine snapshots of heureka.cz and arukereso.hu merchant pages from 2007–2010 manually. The archive was unreliable for automated access this session.

---

## 4. Community channels and willingness-to-pay proxies

### Takeaway
- **Reddit:** r/Romania is large (about 1.03M subscribers in Feb 2025). Its rules tolerate links to one's own site only "once every few weeks" and ban "Ads, PR, promos".
- **Telegram:** a probe of 32 likely Romanian deal handles found no deal channel. The directories (TGStat, telemetr.io, telegramchannels.me) block automated access. Telegram still looks like a white space, or simply unused.
- **Facebook groups:** member counts need a login.
- **Willingness to pay:** Revolut has passed 5M retail clients in Romania (Sep 2026). The last third-party estimate put Netflix at about 1M subscribers (Feb 2023). No Spotify Romania figure is public.

### Cited Findings

**Gap 4.1: Romanian Telegram deal channels (names and sizes)** (gaps_growth Q2; market §3; monetization §9). **Status: NOT PUBLIC** (directories blocked; none found).
- telemetr.io's Romania catalogue and telegramchannels.me's search both returned HTTP 403. TGStat was blocked in round 1 (403). — [telemetr.io](https://telemetr.io/en/catalog/romania); [telegramchannels.me](https://telegramchannels.me/search?type=all&search=reduceri) [DIRECT: 403]
- Public t.me pages were probed for 32 handles: reduceri, reduceriro, reduceriromania, emagreduceri, reduceriemag, oferte, oferteromania, ofertezilnice, promotii, promotiiromania, dealuri, dealuriro, dealsromania, romaniadeals, chilipiruri, chilipir, chilipiruriro, preturimici, reducerionline, reduceriazi, cuponescu, evoucher, blackfridayromania, techdealsro, hotdealsro, ofertebune, oferte_emag, reduceri_emag, promotii_emag, chilipiruri_romania, pricyro and istoricpreturi.
  - Only two exist, and neither is a deal channel. @dealuri has an unrelated Arabic title. @cuponescu ("Domnul cuponescu") is a personal account with no subscriber count.
  - Sources: [t.me/dealuri](https://t.me/dealuri); [t.me/cuponescu](https://t.me/cuponescu) [DIRECT]
- A web search for Romanian eMAG deal channels on Telegram returned only eMAG campaign news. — [search summary] [SNIPPET; nothing found]
- Round 1 found one 84-member group, "Faintur". — [gaps_growth_and_demand.md Q2](gaps_growth_and_demand.md)

**Gap 4.2: Facebook deal-group member counts** (gaps_growth Q2; monetization §9). **Status: NOT PUBLIC** (needs a Facebook login).
- A search found no current list of Romanian deal groups. A long-running Softpedia forum thread, "Oferte, promotii, reduceri – topic general", is indexed at post offset 7,686, so it has thousands of posts. — [Softpedia forum thread](https://forum.softpedia.com/topic/1081981-oferte-promotii-reduceri-topic-general/page__st__7686) [SNIPPET; forum returns 403 to automated fetches]
- The deal pages found in round 1 (TeamDeals about 80K followers, Kuponiada 114K+ likes) remain the only sized Facebook deal audiences. — [gaps_growth_and_demand.md Q2](gaps_growth_and_demand.md)

**Gap 4.3: r/Romania size and rules on self-promotion** (monetization §9). **Status: CLOSED.**
- Arctic Shift subreddit metadata. The archive retrieved r/Romania on 14 Feb 2025 and r/programare on 15 Feb 2025; I did not check the retrieval dates for r/bucuresti and r/cluj [DIRECT]:
  - r/Romania: **1,025,473 subscribers** and 610,715 archived posts.
  - r/programare: 84,663; r/bucuresti: 188,089; r/cluj: 110,682.
  - Source: [Arctic Shift: r/Romania](https://arctic-shift.photon-reddit.com/api/subreddits/search?subreddit=Romania)
- r/Romania's rules, archived on 20 Jan 2025 [DIRECT]:
  - "Self-promotion / spam: * Ads, PR, promos and vote manipulation will not be tolerated. * Don't spam your own websites or creations! If others link to your stuff it's fine, but otherwise limit the linking to once every few weeks. This applies mostly to websites and blogs; images, videos or self-posts are judged on a case by case basis. If in doubt, contact the moderators."
  - Simple questions belong in the stickied "Întrebați România Orice" thread.
  - Source: [Arctic Shift: subreddit rules](https://arctic-shift.photon-reddit.com/api/subreddits/rules?subreddits=Romania,programare)
  - Round 1 found two comparator-idea posts removed: one by automod on 27 Nov 2025, and one on 17 Sep 2026.

**Gap 4.4: TikTok and Instagram deal accounts** (gaps_growth Q2). **Status: PARTIAL** (no new data this round).
- Round 1: eVOUCHER has 33.9K TikTok followers and eMAG's official account 122.7K. — [gaps_growth_and_demand.md Q2](gaps_growth_and_demand.md)
- Instagram profiles need a login.

**Gap 4.5: how often "pricy" and "istoric-preturi" are mentioned on Reddit** (gaps_growth Q2). **Status: NOT PUBLIC** with these tools.
- Arctic Shift's comment full-text search returned "Timeout. Maybe slow down a bit" (HTTP 422) for "pricy" and "istoric-preturi" in r/Romania. A date-restricted retry also failed. — [Arctic Shift API](https://arctic-shift.photon-reddit.com/api/comments/search?subreddit=Romania&body=pricy&limit=100) [DIRECT]

**Gap 4.6: Netflix, Spotify and Revolut penetration as willingness-to-pay proxies** (monetization §4). **Status: PARTIAL.**
- Revolut, 30 Sep 2026 [DIRECT]:
  - Passed "pragul de 5 milioane de clienți retail în România" (5 million retail clients in Romania).
  - Users who make Revolut their main account rose 40%.
  - Revolut Business is approaching 30,000 business clients in Romania.
  - Sources: [Economica](https://www.economica.net/?p=981338); [Revista Biz](https://www.revistabiz.ro/revolut-a-ajuns-la-5-milioane-de-clienti-in-romania-si-deschide-un-sediu-central-local-in-bucuresti/)
- Netflix: about **1M subscribers** in Romania, from FlixPatrol data for Feb 2023. Voyo had 300K, HBO Max 250K, Disney+ about 150K implied, and Amazon Prime 100K paying. — [Economica, 30 Mar 2023](https://www.economica.net/netflix-amazon-hbo-voyo-sau-disney-ce-preferinte-au-romanii-si-cum-se-compara-cu-tendintele-globale-pentru-streaming-video_657046.html/amp) [DIRECT]
- Netflix Romania prices from Jan 2025: €5.99 (Basic), €10.99 (Standard), €13.99 (Premium). — [Puterea](https://www.puterea.ro/?p=421297) [SNIPPET]
- Spotify: no Romanian subscriber figure was found. Spotify notified Romanian users of a price rise, Individual from 24 to 26 lei; the year is not confirmed. — [Economedia](https://economedia.ro/?p=286682) [SNIPPET]

**Gap 4.7: Romanian Patreon examples; subscription conversion benchmarks for price tools** (monetization §4). **Status: NOT RESEARCHED** (Patreon) and **NOT PUBLIC** (conversion).

### Inferences
- **Reddit seeding:** do not post Pretoscop links as ads. Post data, such as a Black Friday "real discount" analysis, as a self-post with the link in context, at most once every few weeks. Let others link to the tool [inference from the rules].
- **Telegram:** a Telegram channel would start from zero, with no incumbent to beat or borrow from. Keep it cheap: auto-post price drops and Black Friday "real deals" [inference].
- **Willingness to pay:** about 5M Revolut retail clients is roughly a quarter of Romania's population (about 19M; my assumption, not sourced here). Paying for digital services is mainstream. Free price-tracking peers (PriceRunner, Keepa's free tier) still set the expectation that core features cost nothing [inference].

### Gaps
- **4.1 Founder action:** in the Telegram app, use global search for "reduceri", "oferte", "promotii", "emag", "black friday" and "chilipiruri". Note channel names and subscriber counts, and optionally open tgstat.com in a normal browser.
- **4.2 Founder action:** in a logged-in Facebook session, search Groups for "reduceri", "oferte emag", "black friday romania", "chilipiruri" and "reduceri si oferte". Record member counts and posts per day for the top 10, and check each group's rules on links.
- **4.4 Founder action:** search TikTok and Instagram (logged in) for "reduceri emag", "oferte zilei" and "black friday romania". Record follower counts of the top 10 accounts as possible partners.
- **4.5 Founder action:** run Reddit's own search in a browser ("pricy" and "istoric preturi" in r/Romania and r/programare, sorted by new).
- **4.6:** for Spotify, there is no action worth the time. Use Revolut and Netflix as the proxies.

---

## 5. Market figures: GPeC 2025, number of shops, seasonal peaks, cash on delivery, eMAG's share, GTINs, price dispersion, and retailer-list checks

### Takeaway
- **Cash on delivery (COD):** the best new datapoint comes from ANAF. Couriers declared about **31bn lei of COD across 111M shipments in 2024**, against ANCOM's **335M parcels** that year. So about a third of all parcels were COD, with an average COD value of about 279 lei. Prepaid Asian platforms are excluded, and some COD is B2B or C2C.
- **Back to school:** eMAG's school items grew about 10% in Aug 2025 and 41% in Aug 2026. 42% of back-to-school orders in 2026 went to lockers.
- **Flanco** had its first revenue fall in four years in 2025: 1.36bn lei, −2.47%, with a 66.3M lei net loss.
- **Not found:**
  - a GPeC full-year 2025 figure
  - an official count of online shops (CAEN 4791 firms are a proxy, at about 17K by main activity)
  - 11.11 or Easter data
  - GTIN coverage by category
  - a 2025–26 cross-shop price-dispersion study

### Cited Findings

**Gap 5.1: GPeC's full-year 2025 market figure** (market §1). **Status: NOT PUBLIC** (not found).
- A search returned GPeC's latest estimate only for 2024: €7.7bn of goods delivered by courier plus about €4bn of services. The 2025 figures come from Gomag (more than €8bn of goods) and MerchantPro (€8.1bn), both already in `market_and_competitors.md` §1. — [ZF (GPeC 2024)](https://www.zf.ro/companii/retail-agrobusiness/2024-piata-e-commerce-s-situat-7-7-miliarde-euro-zona-bunuri-produse-22745144); [Bursa (Gomag 2025)](https://www.bursa.ro/raport-piata-de-ecommerce-din-romania-a-depasit-8-miliarde-de-euro-in-2025-68566858) [SNIPPET]

**Gap 5.2: an official count of Romanian online shops** (market §1). **Status: NOT PUBLIC** (no official count). A proxy exists.
- termene.ro states that about 17,300 companies have CAEN 4791 (retail via mail order or internet) as their main activity. The figure is undated. Its list pages show 49,614 firms for the same code, apparently including secondary activity. — [termene.ro CAEN 4791 list](https://termene.ro/cod_caen/4791-activitati-de-servicii-anexe-pentru-transporturi-terestre/11) [SNIPPET; page slug is mislabelled]
- Other proxies in round 1: compari has 2,500+ merchants, Pricy claims 2,400+ shops, and eMAG Marketplace has 64,000+ sellers.

**Gap 5.3: 11.11, Christmas, Easter and back-to-school sales data** (market §1). **Status: PARTIAL.**
- Back to school 2025 (article dated 29 Aug 2025) [DIRECT]:
  - About 50,000 school items were ordered on eMAG in the first three weeks of August, up 10% year on year.
  - Textbooks and auxiliary materials rose more than 30%. School items were 11% of eMAG orders with flexible payment, three times the share a year earlier.
  - 80% of school products had free Genius delivery.
  - Source: [Revista Biz](https://www.revistabiz.ro/back-to-school-la-emag-aproape-50-000-de-rechizite-comandate-si-de-trei-ori-mai-multe-achizitii-in-rate-prin-my-wallet/)
- Back to school 2026 (article dated 31 Aug 2026) [DIRECT]:
  - School supplies were up 41% in the first 20 days of August versus 2025. Geometry sets rose 61%, paints and drawing pads 60%, notebooks 29%, tablets 6%.
  - 42% of back-to-school orders were delivered to a locker, up 21%.
  - Source: [Spotmedia](https://spotmedia.ro/stiri/economie/parintii-au-inceput-mai-devreme-cumparaturile-pentru-scoala-comenzile-derechizite-au-crescut-cu-41-pe-emag)
- Christmas [SNIPPET]:
  - An Aqurate analysis says December brings online shops sales 28% above the annual monthly average, with furniture +58.8% and equipment and accessories +53.4%. The year was not confirmed. — [Economedia](https://economedia.ro/?p=160991)
  - MerchantPro reported December 2020 orders up 83% and order value up 99% year on year. — [Profit.ro](https://profit.ro/povesti-cu-profit/retail/infografic-nou-record-de-cresteri-in-ecommerce-ziua-z-19886917)
- 11.11 and Easter: no Romanian sales data was found. A search for 11.11 returned only Black Friday results. [SNIPPET; nothing found]

**Gap 5.4: share of COD by order volume, 2025** (market §1). **Status: PARTIAL.** There is an official-data proxy, but no e-commerce-only share.
- ANAF data on Form 395, the courier COD declaration, presented by Cosmin Neculiță of ANAF's anti-fraud directorate (article dated 2 Oct 2025) [DIRECT]:
  - About **31bn lei of COD** in 2024 across **111M shipments**.
  - About 18.5bn lei and 69M shipments in Jan–Jul 2025.
  - "Dimensiunea față de anul trecut nu o văd prea mult crescută" (I don't see the volume growing much on last year).
  - Asian platforms pay electronically and are not on Form 395. If they added COD, "Aceste expediții reprezintă un volum uriaș din total" (these shipments would be a huge share of the total).
  - Source: [Puterea](https://www.puterea.ro/?p=526571)
- ANCOM's 2024 postal market (article dated 15 Oct 2025) [DIRECT]:
  - **335M parcels** (+27%), for the first time more than the 267M letter items.
  - Postal revenue of nearly 6.5bn lei, about 80% of it (about 5bn lei) from parcels.
  - More than 8,200 lockers (+42%).
  - Source: [Capital.ro](https://www.capital.ro/piata-serviciilor-postale-impulsionata-de-comertul-online-veniturile-au-crescut-cu-15-in-2024-iar-traficul-de-colete-a-depasit-corespondenta-pentru-prima-data.html)
- Survey-based shares already in `market_and_competitors.md` §1: Cargus/Visa found 18.72% of respondents use COD in cash as their main online method. A sponsored source claims "two-thirds" of orders are COD.

**Gap 5.5: eMAG's 2025 market share** (market §1; monetization §1). **Status: PARTIAL** (no published share).
- No published share was found. A search summary quoted eMAG as saying that "1 din 2" (1 in 2) online shoppers in the region choose eMAG. That is a regional company claim, and I did not confirm which article carries it. — [Business Forum](https://www.businessforum.ro/industry/20260520/emag-plans-eur300-million-investment-and-ai-expansion-3217); [PlayTech](https://playtech.ro/2026/emag-pariaza-12-miliarde-de-lei-pe-ai-logistica-si-servicii-financiare-ce-urmeaza-pentru-comertul-online-din-romania/) [SNIPPET]

**Gap 5.6: GTIN coverage by category** (market §6). **Status: NOT PUBLIC.** No source exists. Round 1 found none either, and none was sought this round.

**Gap 5.7: a 2025–2026 cross-shop price-dispersion study for Romania** (market §6). **Status: NOT PUBLIC** (none appears to exist).
- The only study surfaced is the older Millward Brown "Price Index":
  - 150 products in 15 categories across 27 online and offline shops.
  - Online prices 5–43% lower during promotions.
  - eMAG had the lowest index for TVs, microwaves, espresso machines, fridges and washing machines.
  - Source: [Wall-Street.ro](https://www.wall-street.ro/articol/eCommerce/175282/produsele-din-magazinele-online-preturi-cu-40-mai-mici-fata-de-magazinele-traditionale.html) [SNIPPET; round 1 dated it to 2014]

**Gap 5.8: Statista and iSense market sizes** (market §1). **Status: NOT PUBLIC** (paywalled). Not pursued.

**Gap 5.9: retailer domains not verified in round 1** (market §2). **Status: CLOSED.** Homepage status checks on 2026-10-27 [DIRECT]:

| Domain | Result |
|---|---|
| quickmobile.ro | HTTP 503: "Maintenance Page – Platforma trece printr-un proces de actualizare" |
| eurogsm.ro | 200 |
| domo.ro | DNS resolves (193.25.112.73; mail handled by odin.cel.ro, which suggests it is linked to cel.ro); HTTPS connection timed out |
| nod.ro | 200 (B2B distributor) |
| ccc.eu/ro | 200 (→ ccc.eu/ro/ro/) |
| dm.ro | 200 (dm-drogeriemarkt.ro redirects to dm.ro) |
| ikea.com/ro/ro | 200 |
| mobexpert.ro | 200 |
| vivre.ro | 200 (→ vivre.eu/ro) |
| bonami.ro | 200 |
| homelux.ro | 200 |
| books-express.ro | 200 |
| hervis.ro | **301 → sportsdirect.ro** |
| freshful.ro | 200 |
| zoomania.ro | 200 |
| intercars.ro | 403 (bot protection) |

**Gap 5.10: marketplace status of Flanco, PC Garage, Dedeman, Elefant, Decathlon, Notino and Modivo** (market §2). **Status: NOT PUBLIC** with automated checks.
- pcgarage.ro, decathlon.ro, notino.ro and flanco.ro homepages return 403 to automated requests.
- The dedeman.ro, elefant.ro and modivo.ro homepages show no clear marketplace signal. Modivo's front-end config has an "IS_MARKETPLACE_ENABLED" flag, but its value is minified. [DIRECT]

**Gap 5.11: current size of Altex Marketplace** (market §2). **Status: PARTIAL.**
- Altex Marketplace has "peste 100 de selleri" and "peste 30,000 de produse"; the article is undated. — [Economedia](https://economedia.ro/?p=128042) [SNIPPET]
- The number of sellers tripled in 2024. — [Mobilissimo](https://www.mobilissimo.ro/stiri-diverse/cum-s-a-pregatit-altex-de-black-friday-2024-ce-asteptari-sunt-si-cand-vom-avea-livrare-la-lockere) [SNIPPET]
- Interview dated 21 Sep 2023 [DIRECT]:
  - Altex charges "un comision unic de 8% pentru selleri" (a single 8% commission).
  - Sellers need "un istoric de minim 2 ani și o cifră de afaceri de minim 500.000 euro în măcar unul din ultimii 2 ani" (at least two years of history and at least €500,000 turnover in one of the last two years).
  - Source: [Wall-Street.ro](https://www.wall-street.ro/articol/ecomteam/300938/monica-ciolanel-altex-incepe-sa-se-stearga-granita-intre-cumparaturi-online-si-offline-ce-produse-noi-se-vor-lansa-in-curand-in-altex-marketplace.html)

**Gap 5.12: Flanco and PC Garage 2025 revenue** (market §2). **Status: CLOSED for Flanco; NOT PUBLIC for PC Garage.**
- Flanco Retail SA, 2025 (article dated 7 Jun 2026) [DIRECT]:
  - Net turnover 1.36bn lei, down 2.47%; it was about 1.4bn in 2024. This is its first decline in four years.
  - Net loss 66.3M lei, against 12.54M lei in 2024. Total expenses were 1.42bn lei.
  - 1,443 employees on average.
  - Source: [Capital.ro](https://www.capital.ro/flanco-raporteaza-in-2025-prima-scadere-a-cifrei-de-afaceri-si-pierdere-neta-record-de-663-milioane-de-lei.html)
- Economica's headline frames the loss as following Flanco's restructuring on a "hard discounter" model. — [Economica](https://www.economica.net/flanco-smart-discounter-marcheaza-pierderi-record-dupa-restructurarea-pe-modelul-hard-discounter-si-vanzarile-scad_947469.html) [SNIPPET: headline]
- PC Garage: no 2025 figure was found in search results.

**Gap 5.13: Trafic.ro data** (market §2). **Status: CLOSED** (no data exists).
- Trafic.ro is live but ranks only sites that install its counter. The emag.ro, altex.ro and compari.ro pages are empty placeholders ("Data inscrierii 01-01-0001", rank #0). — [Trafic.ro: emag.ro](https://www.trafic.ro/statistici/emag.ro) [DIRECT]

**Gap 5.14: ANPC's official Black Friday 2025 tally** (gaps_growth Q7; market §5). **Status: NOT PUBLIC** (site unavailable to automated access).
- anpc.ro and its search returned HTTP 503 on 2026-10-27. — [ANPC](https://anpc.ro/) [DIRECT: 503]

**Gap 5.15: 2023–2025 fake-discount studies; the 2018 Competition Council inquiry's sample and platform list** (gaps_growth Q7). **Status: NOT RESEARCHED** this round (search budget). Round 1 found no 2023–2025 study.

**Gap 5.16: Reddit threads asking for a "Romanian Keepa"** (market §5). **Status: CLOSED** in round 1. `gaps_growth_and_demand.md` Q2 lists the 2019–2026 threads (fake-discount anger, "live" comparator requests, a Pricy extension thread).

**Gap 5.17: affiliate commission rates by category** (market §6; monetization §1). **Status: NOT PUBLIC** (network logins). Profitshare's public pages give approval rate, approval days and cookie window (§3.3), but not commission grids.

### Inferences
- **COD scale** [MY ESTIMATE]:
  - 111M COD shipments out of 335M parcels is about 33% of all 2024 parcels.
  - The average COD value is about 279 lei (31bn ÷ 111M), roughly €56. Jan–Jul 2025 averaged about 268 lei.
  - COD value of 31bn lei is about 80% of the €7.7bn (about 38bn lei) goods market in 2024. That is an upper bound for COD's e-commerce share, because COD also covers B2B and C2C parcels and the two scopes differ.
  - Share of web-shop orders: domestic web-shop orders might have been about 140M in 2024 (€7.7bn ÷ about €55 average order value; my assumption). If so, 111M COD shipments would be up to about 80% of them.
    - Part of the 111M is B2B or C2C, so the true share is lower.
    - PayU's statement that only 35% of Romanians choose online payment (round 1) also points to COD being about half or more of web-shop orders by count. Urban online surveys still rank card first.
    - Support for COD shops, and labelling them, matters for a Romanian comparator.
- **eMAG share:** about 25–26% of physical-goods e-commerce. This is 10.6bn lei of 2025 platform sales at about 5.1 RON/EUR, or about €2.1bn, against MerchantPro's €8.1bn. It is the same estimate as round 1 [MY ESTIMATE].
- **Seasonality for the crawl calendar:**
  - Black Friday: early November for eMAG, Altex and Flanco; late November for Notino and international shops.
  - Christmas: about +28% above an average month.
  - Back to school: the first three weeks of August, and growing in 2026.
  - Use these windows for "real discount" studies [inference].
- **Retailer list:**
  - Drop hervis.ro (it now redirects to Sports Direct).
  - Keep QuickMobile on watch (maintenance page).
  - Treat Domo as part of cel.ro's group (from its MX record; unconfirmed).
  - Flanco's losses and its "hard discounter" repositioning make it more likely to want comparator traffic [inference].
- **Price dispersion:** no recent cross-shop dispersion study exists. A Pretoscop study on 2026 data would be the first public one [inference].

### Gaps
- **5.1 Founder action:** check gpec.ro's press section for the "Raport GPeC" on 2025 (normally March–May), or email GPeC.
- **5.2 Founder action:** download ONRC's company open data from data.gov.ro (if the CAEN field is included) and count active firms with main CAEN 4791. Otherwise buy a CAEN 4791 list export from termene.ro or listafirme.ro. Quote it as "firms registered for online retail", not "online shops".
- **5.3 Founder action:** ask MerchantPro or Gomag for monthly seasonality indices (they publish yearly reports). Pretoscop's own crawl will measure 11.11 and Easter from 2026–27.
- **5.4 Founder action:** ask ANAF (or Sameday/FAN, through their press offices) for COD shipments as a share of B2C parcels. Otherwise use the one-third (by count) to two-thirds (by e-commerce orders) range.
- **5.6 Founder action:** in week 1, measure the share of offers with a valid GTIN-13 per category from the first feeds and crawls (sample 1,000 offers per category).
- **5.7 Founder action:** publish Pretoscop's own cross-shop dispersion study for Black Friday or Christmas 2026 as a PR asset.
- **5.10 Founder action:** in a browser, open three product pages per shop and look for "Vândut de" / "Livrat de" seller labels or a "Vinde pe …" link in the footer.
- **5.12 Founder action:** look up PC Garage's CUI on [mfinante.gov.ro](https://mfinante.gov.ro) ("Informații fiscale și bilanțuri"; free, with a captcha) for the 2025 turnover.
- **5.14 Founder action:** open anpc.ro's press releases for 15 Nov – 31 Dec 2025 in a browser and record the Black Friday checks, fines and online-specific findings.
- **5.15 Founder action:** download the Competition Council's 2018 e-commerce sector-inquiry report from consiliulconcurentei.ro (search "investigație sectorială comerț electronic 2018") for the sample size and platform list.
- **5.17 Founder action:** open free publisher accounts on 2Performant and Profitshare and export category commission grids for eMAG, Altex, Flanco, evoMAG and Notino.

---

## 6. AI search and Google: what is live in Romania, and what Google changed in 2026

### Takeaway
- **AI Mode ("Modul AI")** has been officially available in Romania and in Romanian since 8 Oct 2025. AI Overviews reportedly work in Romanian but only for logged-in users (one blog source, May 2025). Neither launch described shopping, price or price-tracking features for Romania.
- **Free product listings:** after the European Commission's €890M DMA fines (24 Jul 2026), Google removed free product listings across the EEA in mid-September 2026. No Romanian SERP measurement or Romanian SEO coverage of this was found.
- **CSS is now the channel for products in Romania:** Google's CSS help page lists Romania as a CSS country, where CSSs "must be used" to place Shopping ads and free product listings on behalf of merchants. A comparator's own pages can be bought into the Shopping carousel only as "CSS Product Listing ads".
- **Structured-data changes in 2026** for products are small: `Product.category`, sale-date properties and `hasAdultConsideration`. Since 30 Aug 2026, site-reputation manual actions no longer apply to EEA users.
- **Comparators on AI and Google:** the only first-party statements found (Moltiply/Trovaprezzi, Heureka) blame Google's own units, not AI assistants. Third-party data shows tiny AI referral volumes, for example 51 ChatGPT visits a month to istoric-preturi.info.

### Cited Findings

**Gap 6.1: does Google's EEA free-listings removal show in Romanian SERPs?** (gaps_growth Q6). **Status: PARTIAL.** It is very likely, since the removal is EEA-wide, but it has not been observed for Romania.
- The European Commission fined Google €890M in two DMA decisions: €460M for favouring its own services in Search and €430M over Google Play. Google had 60 days to comply. Google called the measures "o degradare directă a produselor noastre" (a direct degradation of our products). The Romanian article does not mention Romania. — [Economedia, 24 Jul 2026](https://economedia.ro/?p=362447) [DIRECT]
- Round 1: Search Engine Roundtable (18 Sep 2026) reported the removal "from the European Economic Area", with Google's confirmation and drops measured in DE, FR, BE, SE and NL. — [Search Engine Roundtable](https://www.seroundtable.com/google-drops-free-product-listings-eea-42113.html)
- A Romanian-language search found only international coverage and nothing measuring google.ro. — [search summary] [SNIPPET]
- Google's Merchant Center free-listings page does not mention the EEA removal. — [Merchant Center Help 13889434](https://support.google.com/merchants/answer/13889434?hl=en) [DIRECT]

**Gap 6.2: are AI Overviews and AI Mode shopping features active in Romania?** (gaps_growth Q6; monetization §9). **Status: CLOSED for AI Mode; PARTIAL for AI Overviews and shopping features.**
- Google's Romanian blog, 8 Oct 2025 [DIRECT]:
  - "Google anunță disponibilitatea în România și pentru limba română a „Modului AI”" (Google announces AI Mode in Romania and in Romanian), rolled out "gradual, în următoarea săptămână" (gradually over the following week).
  - It describes product comparison ("compararea de produse") as a use, but no shopping or price features.
  - Source: [Google Blog RO](https://blog.google/intl/ro-ro/produse/cautarile-google-in-modul-ai-disponibile-in-romania/)
- Mobilissimo, 11 Oct 2025: AI Mode runs on Gemini 2.5 on google.com and in the Google app, as an extra option that does not replace classic search. It gives "comparații de produse" as an example. No shopping, price-comparison or price-tracking feature is described. — [Mobilissimo](https://www.mobilissimo.ro/stiri-telefoane/google-search-iti-ofera-de-acum-raspunsuri-la-intrebari-mai-complexe-in-limba-romana-prin-modul-ai-bazat-pe-gemini-2-5) [DIRECT]
- A personal Substack, 19 May 2025 [DIRECT; single blog source]:
  - "Rezultatele de tip „AI Overviews" sunt disponibile doar în mod „Logged-in"" (AI Overviews show only to logged-in users).
  - "Platforma Google Search Labs nu este disponibilă în România" (Search Labs is not available in Romania).
  - Source: [oncescuradu.substack.com](https://oncescuradu.substack.com/p/exclusiv-google-ai-overviews-in-ro)
- Search Central changelog: on 27 May 2026, "Preferred sources" started rolling out to AI Overviews and AI Mode. On 30 Apr 2026 it reached "all languages where Google Search is available". — [Google Search Central updates](https://developers.google.com/search/updates) [DIRECT]

**Gap 6.3: what PriceRunner, Kelkoo and Skroutz say about AI traffic** (gaps_growth Q6; monetization §9). **Status: PARTIAL.** No statement from those three exists. Comparable first-party statements were found.
- Moltiply (Trovaprezzi's group), 16 Mar 2026: the e-commerce comparison line shrank in 2025 because of Google's own comparison service in Search results, despite the Google Shopping antitrust decision and the Commission's preliminary DMA findings on self-preferencing (Art. 6(5)). Quotes in §3.10. — [Moltiply FY2025 release](https://www.emarketstorage.it/sites/default/files/comunicati/2026-03/20260316_179019.pdf) [DIRECT]
- Heureka's CEO (15 Sep 2025): Heureka supplies data to Google, which sends traffic back. He gave no figure for any AI Overviews effect. — [Lupa.cz](https://www.lupa.cz/clanky/david-chmelar-heureka-cz-nebyli-jsme-v-dobre-kondici-ale-loni-uz-jsme-rostli-ve-vsech-ohledech/) [DIRECT]
- Third-party AI referral estimates (Semrush):
  - istoric-preturi.info: 51 ChatGPT visits (0.029%) in Sep 2026. — [Semrush](https://www.semrush.com/website/istoric-preturi.info/overview/) [DIRECT][EST]
  - pricerunner.se: about 5K ChatGPT visits (Oct 2025). — [Semrush](https://www.semrush.com/website/pricerunner.se/overview/) [SNIPPET][EST]
  - skroutz.gr: 17K from ChatGPT, 7K from Gemini, 2K from Perplexity (undated). — [Semrush](https://www.semrush.com/website/skroutz.gr/overview/) [SNIPPET][EST]
- No official PriceRunner, Kelkoo or Skroutz statement on AI traffic was found. — [search summary] [SNIPPET; nothing found]

**Gap 6.4: Google's 2026 product structured-data and merchant-listing changes** (gaps_growth Q6). **Status: CLOSED.** From Google's Search Central changelog (last updated 2026-10-26) [DIRECT]:
- **7 Jul 2026:**
  - Merchant listing documentation now details `Product.category` as Text or CategoryCode, aligned with `product_type` and `google_product_category`.
  - A new "Sale duration" section covers `validFrom`, `validThrough` and `priceValidUntil` for sale prices, aligned with `sale_price_effective_date`.
- **20 May 2026:** `hasAdultConsideration` was added to Merchant listing and Product variant markup.
- **15 May 2026:** a guide on optimising for generative AI features (including shopping content and "AEO/GEO" myths). Spam policies now explicitly apply to generative AI responses.
- **8 May 2026:** FAQ rich results were deprecated and stopped appearing from 7 May 2026. The documentation was removed on 15 Jun 2026.
- **8 Sep 2026:** new "regional differences in Search experience" documentation (aggregator units, supplier units, carousels). **18 Sep 2026:** aggregator and supplier units also support local-business queries.
- **28 Aug 2026:** "Following discussion with the European Commission", from 30 Aug 2026 "For users inside the EEA, the impact of the manual action won't apply" for site-reputation-policy manual actions. Affected sections "may be separated in our systems so that, over time, it ranks independently". — [Google Search Central blog](https://developers.google.com/search/blog/2026/08/update-site-reputation-policy)
- Product markup split: product snippets are "For product pages where people can't directly purchase the product". Merchant listings are "For pages where customers can purchase products from you" (Product doc, last updated 2025-12-10). — [Google: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- Source for the changelog entries: [Google Search Central updates](https://developers.google.com/search/updates)

**Gap 6.5: can comparison sites use Merchant Center free listings, and is Romania a CSS country?** (monetization §6 and §9). **Status: CLOSED.**
- "Comparison Shopping Services (CSSs) must be used to place Shopping ads and free product listings on Google on behalf of merchants in the following countries: Austria, Belgium, Czech Republic, Denmark, Finland, France, Germany, Greece, Hungary, Ireland, Italy, the Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Spain, Sweden, Switzerland, and the United Kingdom."
- "Shopping ads need to take users directly to a merchant's landing page", and ads show a "By CSS" link to the CSS's site.
- Source: [Merchant Center Help 12653197](https://support.google.com/merchants/answer/12653197?hl=en) [DIRECT]
- CSS Product Listing ads put a comparator's own product pages into the PLA carousel, competing "on an non-discriminatory basis". Requirements [DIRECT]:
  - The landing page must be on the CSS Center domain.
  - No pop-ups or interstitials.
  - It "must prominently show relevant offers … from multiple merchants".
  - Products are uploaded through the CSS API, and a Google Ads account must be linked.
  - Source: [Merchant Center Help 14645037](https://support.google.com/merchants/answer/14645037?hl=en)

**Gap 6.6: how many CSSs target Romania** (monetization §6). **Status: NOT PUBLIC** with static fetches. Google's CSS partner directory ("Find a partner") loads its list with JavaScript and exposes no country data in the HTML. — [Comparison Shopping Partners: Find your match](https://comparisonshoppingpartners.withgoogle.com/find-your-match) [DIRECT]

**Gap 6.7: measured AI-search traffic losses for CEE comparators** (monetization §9). **Status: NOT PUBLIC.** Only qualitative statements and flat or declining revenue exist (Heureka flat at about CZK 2.2bn, round 1; Trovaprezzi's line −1.7%, §3.10).

### Inferences
- **What remains free for products in Romanian Google:**
  - organic blue links
  - EEA aggregator units and structured-data carousels, which for products need CSS enrolment (round 1)
  - AI Overviews and AI Mode citations
  - Pretoscop's own pages cannot be free product listings. A CSS Product Listing ad is the paid route to the carousel [inference].
- **Markup to ship:**
  - `Product` + `AggregateOffer` product-snippet markup (Pretoscop pages do not sell)
  - `ItemList` category pages for carousels
  - the 2026 sale-date properties on offers, where merchants' sale windows are known
  - [inference]
- **Site reputation:** the EEA carve-out reduces the risk that coupon or partner sections are demoted for Romanian users, although Google says such sections may still be "separated" to rank independently [inference].

### Gaps
- **6.1 Founder action:**
  1. From a Romanian IP, in a clean, logged-out browser profile on google.ro, run 20 product queries (for example "iphone 17 256gb", "televizor samsung 55", "aspirator robot").
  2. Screenshot whether free "popular products" or listing units, aggregator units, CSS-labelled ads or AI Overviews appear.
  3. Repeat while logged in.
  4. After launch, check Search Console's Merchant listings and Product snippets reports.
- **6.2 Founder action:** in the same session, run five shopping-intent questions ("cel mai bun laptop sub 3000 lei") in AI Mode. Note whether product cards, prices or shop links appear.
- **6.6 Founder action:** open the CSS partner directory in a browser and filter by Romania. Also record the "By [CSS]" labels on Romanian Shopping ads for 30 queries.

---

## 7. Costs and infrastructure: extension stores, sitemaps, Cloudflare, Hetzner, Romanian hosting, Digi, latency

### Takeaway
Most cost gaps are now closed. Prices are excluding VAT unless stated.
- **Extension stores:** Chrome Web Store registration is a one-time fee (US$5 per secondary sources; Google's page omits the amount), and Romania is supported. Apple charges $99 a year and requires the programme for Safari extensions.
- **Sitemaps:** 50,000 URLs or 50MB uncompressed per file.
- **Cloudflare Free** includes 10 Cache Rules, which can make HTML cacheable. Its minimum Edge TTL override is 2 hours. Pro costs $20 a month (annual billing).
- **Hetzner:** AX41 and EX44 are both €59.00 a month with no setup fee, in stock at FSN1 and HEL1. A dedicated server's primary IPv4 is €1.70 a month; a cloud server's is €0.50.
- **Romanian options:** Hostico's cloud VPS starts at €8.99 a month (promo) with a free IP. Digi Business fibre with one fixed IPv4 costs €9–13 a month on a 24-month bundle. Neither publishes PTR (reverse DNS) control.
- **Latency:** Bucharest to Falkenstein is about 28–34 ms (two-week median 33.6 ms).

### Cited Findings

**Gap 7.1: Chrome Web Store registration fee in 2026** (monetization/architecture cost gaps). **Status: CLOSED.** The amount comes from secondary sources.
- "Before you can publish items on the Chrome Web Store, you must register as a CWS developer and pay a one-time registration fee." Romania is on the list of supported registration countries. The page (last updated 2024-02-13) does not state the amount. — [Chrome for Developers: Register](https://developer.chrome.com/docs/webstore/register) [DIRECT]
- The fee is US$5, introduced in 2010 to deter malicious extensions. — [Computerworld](https://www.computerworld.com/article/1554628/google-makes-chrome-devs-dig-into-pockets.html) [SNIPPET]

**Gap 7.2: Apple Developer Program for Safari extensions** (cost gaps). **Status: CLOSED.**
- "Join the Apple Developer Program — $99 annual membership". — [Apple Developer Program](https://developer.apple.com/programs/) [DIRECT]
- Apple's distribution documentation [DIRECT]:
  - "To distribute your web extension, first join the Apple Developer Program."
  - On macOS, one can "sign and notarize your extension's app with a Developer ID to distribute it outside the Mac App Store".
  - On iOS and visionOS, distribution is through the App Store, with TestFlight for beta testing.
  - Source: [Apple: Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

**Gap 7.3: Google's sitemap limits** (cost/architecture gaps). **Status: CLOSED.**
- "All formats limit a single sitemap to 50MB (uncompressed) or 50,000 URLs." Larger sites should use a sitemap index (page last updated 2026-07-08). — [Google: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) [DIRECT]

**Gap 7.4: Cloudflare Free plan Cache Rules for HTML, and paid plan prices** (cost gaps). **Status: CLOSED.**
- Cache Rules plan limits: Free 10 rules, Pro 25, Business 50, Enterprise 300 (page last updated 14 Aug 2026). — [Cloudflare: Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/) [DIRECT]
- "The Cloudflare CDN does not cache HTML or JSON by default." The cacheable file-size limit is 512MB on Free, Pro and Business (updated 14 Sep 2026). — [Cloudflare: Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/) [DIRECT]
- A Cache Rule set to "Eligible for cache" makes matching requests cacheable. Its Edge TTL can follow the origin's Cache-Control or override it. — [Cloudflare: Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/) [DIRECT]
- "Minimum Edge Cache TTL: Free 2 hours, Pro 1 hour, Business 1 second, Enterprise 1 second." — [Cloudflare: Edge and Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/) [DIRECT]
- Prices on 2026-10-27: Free $0; Pro $20 a month billed annually or $25 monthly; Business $200 a month billed annually or $250 monthly. — [Cloudflare plans](https://www.cloudflare.com/plans/) [DIRECT]

**Gap 7.5: Hetzner IPv4 add-on price and AX41/EX44 stock** (cost gaps). **Status: CLOSED.** Page data retrieved 2026-10-27; prices exclude VAT.
- Hetzner's IP pricing document [DIRECT]:
  - Dedicated servers: "Primary IPv4 € 1.70" a month.
  - Additional single IP: €1.70 a month plus €4.90 setup.
  - "Cloud Primary IPv4 € 0.50 ($ 0.60) monthly".
  - Primary IPv4 can be removed from dedicated and cloud servers.
  - Document "Last change on 2023-04-13". — [Hetzner Docs: IP pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/)
- AX41 [DIRECT]:
  - AMD Ryzen 5 3600, 64 GB DDR4, 2× 512 GB NVMe, 1 Gbit/s, unlimited traffic.
  - €59.00 a month (€0.0945 an hour), €0.00 setup.
  - Available locations FSN1 and HEL1; the page's schema.org availability is "InStock".
  - Source: [Hetzner AX41](https://www.hetzner.com/dedicated-rootserver/ax41/)
- EX44 [DIRECT]:
  - Intel Core i5-13500, 64 GB DDR4, 2× 512 GB NVMe.
  - €59.00 a month, €0.00 setup, FSN1 and HEL1, "InStock".
  - Source: [Hetzner EX44](https://www.hetzner.com/dedicated-rootserver/ex44/)
- AX42 starts at €79.00 a month. No "EX44-LTD" variant is listed. — [Hetzner AX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-ax/) [DIRECT]

**Gap 7.6: Romanian hosting providers with PTR control, and their prices** (bot-legitimacy and cost gaps). **Status: PARTIAL.** Prices exist for one provider. PTR control is not stated by anyone.
- Hostico cloud VPS (promo price, then renewal price) [DIRECT]:

| Plan | Promo / renewal per month |
|---|---|
| 1 vCPU AMD EPYC, 2 GB RAM, 25 GB NVMe | €8.99 / €9.99 |
| 2 vCPU, 4 GB | €17.99 / €19.99 |
| 4 vCPU, 8 GB | €33.99 / €39.99 |
| 4 vCPU, 16 GB | €63.99 / €74.99 |
| 8 vCPU, 32 GB | €119.99 / €149.99 |
| 16 vCPU, 64 GB | €239.99 / €299.99 |

  Each plan lists "IP Gratuit" (free IP), DDoS protection and free management. PTR/reverse DNS, data-centre location and VAT treatment are not stated. — [Hostico VPS](https://hostico.ro/vps/)
- GTS Telecom offers public, private and multi-cloud, server colocation, GPU as a service and IP transit, with no public prices. — [GTS](https://www.gts.ro/ro) [DIRECT]
- Not retrieved [DIRECT]:
  - zitec.com/cloud: 404
  - netsystems.ro/vps: 404
  - ishosting's Romania VPS page: 403 (bot protection)

**Gap 7.7: Digi's fixed-IP business offer in 2026** (bot-legitimacy gaps). **Status: CLOSED** (PTR not stated).
- "DIGI INTERNET Acces 500 — 9 euro/lună fără TVA": up to 500/250 Mbps, unlimited traffic, "1 adresă IPv4 publică fixă" (one fixed public IPv4).
- "Acces 1000 — 13 euro/lună fără TVA": up to 1 Gbps/500 Mbps, with one fixed IPv4.
- The displayed price applies when internet is bought together with mobile services for 24 months. It may vary by installation location, and it is billed in lei at the BNR rate.
- Where FTTH is not available: up to 100/100 Mbps on fibre, or up to 50 Mbps on EoC or radio.
- Source: [Digi Business: Internet Broadband](https://www.digi.ro/business/servicii/internet/broadband) [DIRECT]

**Gap 7.8: Falkenstein → Bucharest latency** (cost gaps). **Status: CLOSED.**
- WonderNetwork runs hourly 30-ping tests from its Bucharest host. Over 13–27 Oct 2026 (336 samples each) [DIRECT]:

| Route | Median of hourly averages | p10 | p90 | Latest (27 Oct) | Source |
|---|---|---|---|---|---|
| Bucharest → Falkenstein | 33.6 ms | 28.2 ms | 74.7 ms | 29.6 ms (17:19) | [WonderNetwork](https://wondernetwork.com/pings/Bucharest/Falkenstein) |
| Bucharest → Nuremberg | 32.0 ms | 26.6 ms | 81.9 ms | 26.9 ms | [WonderNetwork](https://wondernetwork.com/pings/Bucharest/Nuremberg) |
| Bucharest → Frankfurt | 35.1 ms | 29.7 ms | 78.2 ms | 29.9 ms | [WonderNetwork](https://wondernetwork.com/pings/Bucharest/Frankfurt) |
| Bucharest → Helsinki | 57.9 ms | 53.8 ms | 96.8 ms | 58.7 ms | [WonderNetwork](https://wondernetwork.com/pings/Bucharest/Helsinki) |

  Percentiles are my computation from the page's embedded hourly data. WonderNetwork does not say which network its test hosts are on.

### Inferences
- **HTML caching on Cloudflare Free:** a Cache Rule ("Eligible for cache") can cache product HTML on the Free plan.
  - Overriding Edge TTL cannot go below 2 hours.
  - Shorter freshness for price pages would rely on "use cache-control header if present" with the origin's `s-maxage`, or on purging by URL or tag. Whether origin `s-maxage` values below 2 hours are honoured on Free was not tested.
  - Pro ($20 a month) lowers the override floor to 1 hour [inference from the cited plan tables].
- **Crawling from Germany:** latency to Romanian shops is not a constraint. 28–35 ms round trip is negligible against page render times, so FSN1/NBG1 servers are fine for crawling and serving Romanian users. HEL1 adds about 25 ms [inference].
- **IP and hosting options:** Hetzner charges €1.70 a month per dedicated IPv4.
  - Romanian residential or business fibre (Digi, €9–13 a month with a fixed IPv4) or a Romanian VPS (Hostico, from about €9 a month) gives Romanian-geolocated IPs.
  - Of these, only Hetzner documents rDNS self-service. For Hetzner this is round-1 knowledge, not re-verified here.

### Gaps
- **7.1 Founder action:** the amount is shown on first login to the Chrome Web Store developer dashboard. Budget US$5.
- **7.6 Founder action:** email Hostico, GTS and M247 sales:
  1. "Can you set a PTR (reverse DNS) record for my VPS IPv4 on request, or self-service?"
  2. "Which ASN, and is the data centre in Bucharest?"
  3. "Is the price including VAT?"
  4. "Are there restrictions on outbound crawling traffic?"
- **7.7 Founder action:** ask Digi Business support whether reverse DNS can be set on the fixed IPv4, and whether the €9 or €13 price requires a Digi mobile subscription at the same company.
- **7.4:** test whether origin `s-maxage` values below 2 hours are honoured under a Free-plan Cache Rule. Deploy a test page with `s-maxage=300` and check the `cf-cache-status` and `age` headers.

---

## 8. Summary of all gaps in this cluster, with status

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
