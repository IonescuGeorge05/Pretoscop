# Affiliate networks and legitimate product-data channels for a Romanian price-comparison site (Pretoscop), as of 2026-10-27

> Method note: everything below comes from public pages fetched on 2026-10-27, unless a different date is shown. Where a fact comes only from a search-engine result summary and I did not fetch the page, it is marked "(search summary)". Partway through, the shared web-search budget for this session ran out. After that I only fetched known official URLs, so some networks and retailers could not be checked (see Gaps). Several retailer and comparator sites (compari.ro, pcgarage.ro, flanco.ro, vexio.ro, evomag.ro, icecat.biz, gs1.org) block automated fetching with Cloudflare or Anubis. I did not try to get around those blocks.

## 1. Verification of the teammate's README claims (Oct 2026)

### Takeaway
The eMAG comparator ban, evoMAG's "15+ feeds" and PC Garage being inactive on Profitshare are all confirmed. "Flanco and Altex closed their programs" is essentially true, but Altex's program was in-house and closed around 2022, and Flanco's closure on 2Performant has no official announcement. "QuickMobile, EuroGSM, cel.ro and Vexio have programs" is mostly wrong: only Vexio has a visible program (on Profitshare). QuickMobile is inactive and its site showed a maintenance page. No program could be found for EuroGSM or cel.ro. One more correction: Profitshare is still owned by the eMAG group, because the 2Performant acquisition fell through on 6 Aug 2025.

### Cited Findings

| README claim | Verdict | Evidence (verbatim RO → EN) | Source |
|---|---|---|---|
| "eMAG (Profitshare) forbids price comparators" | **TRUE** | Terms last modified 27/10/2025. They exclude media that "sunt construite sub forma unor comparatoare de preturi, agregatoare de produse sau continut ale altor website-uri" (→ "are built as price comparators, product aggregators or content of other websites"). They also exclude sites that "preiau automat informatii de pe website-ul eMAG sau din alte website-uri, fara acordul acestora (ex site-uri comparatoare de preturi, plugin-uri de browsere)" (→ "automatically take information from the eMAG website or other websites without their consent (e.g. price-comparison sites, browser plugins)"). | [Profitshare – eMAG program](https://profitshare.ro/affiliate-programs/retail/emag) |
| "evoMAG (2Performant) has 15+ feeds" | **TRUE** | "Avem peste 15 feed-uri de produse" (→ "we have over 15 product feeds"). The English version of the page says "We have 15 product feeds". | [2Performant – evomag.ro](https://2performant.com/affiliate-programs/electronics/evomag-ro/) |
| "PC Garage is inactive on Profitshare" | **TRUE** | "Advertiser inactiv in Profitshare". Terms last modified 02/11/2023, 1% commission, "No Feed". PC Garage is also absent from all 3 pages of 2Performant's Electronics listing. | [Profitshare – PC Garage](https://profitshare.ro/affiliate-programs/it-c/pcgarage); [2P electronics p1](https://2performant.com/affiliate-programs/electronics/), [p2](https://2performant.com/affiliate-programs/electronics/page/2/), [p3](https://2performant.com/affiliate-programs/electronics/page/3/) |
| "Flanco closed its affiliate program" | **LARGELY TRUE (nuanced)** | **Profitshare:** "Advertiser inactiv in Profitshare" (terms 11/04/2023). **2Performant:** joined in spring 2023, initially "doar prin Comparison Shopping Services (CSS)" (→ "only through CSS"), then opened all channels exclusively on 2P in June–July 2023 (blog dated 01 Jun 2023). Flanco is still named as an active advertiser in 2P's Q1 2025 report. On 2026-10-27 both 2P program URLs return HTTP 404. A search-engine summary of the program page mentioned a closure dated 29.06.2026; I could not verify this. | [Profitshare – Flanco](https://profitshare.ro/affiliate-programs/retail/flanco); [Business League/2P blog](https://blog.businessleague.com/all-in-on-2performant-flanco-deschide-toate-canalele-de-promovare-timp-de-2-luni-exclusiv-in-ecosistemul-2performant/); [2P Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf); 404s: [URL 1](https://2performant.com/affiliate-programs/electronics-itc/flanco-ro/), [URL 2](https://ro.2performant.com/affiliate-programs/electronics/flanco-ro/), [URL 3](https://2performant.com/affiliate-programs/electronics/flanco-ro/) |
| "Altex closed its affiliate program" | **TRUE (it was in-house)** | A blog post (dated Nov 26, 2022, with an earlier Jan 2021 date also shown) reports that Altex closed "sistemul de afiliere Altex" (→ "the Altex affiliate system"). Balances under the 100-lei payout threshold were stranded: "Banii ăștia nu îi pot retrage, pentru că nu îndeplinesc pragul de 100 de lei" (→ "I can't withdraw this money because I don't meet the 100-lei threshold"). A 2015 post described Altex's own program, run outside Profitshare and 2Parale, as launched in 2012 and later abandoned (search summary). No Altex or Media Galaxy program appears on 2P or Profitshare listings in Oct 2026. | [alphablog.ro](https://alphablog.ro/altex-inchide-sistemul-de-afiliere-neseriosi/); [nwradu.ro 2015](https://www.nwradu.ro/2015/07/altex-cauta-sa-si-reporneasca-programul-de-afiliere-si-alte-stiri-din-domeniu/) (search summary) |
| "QuickMobile has a program" | **FALSE / outdated** | Profitshare shows "Advertiser inactiv in Profitshare" (terms 17/09/2021; 3% standard, 1.5% on promo products; explicit comparator ban). A 2P blog post about QuickMobile returning dates from around 2017 (search summary), and QuickMobile is not in the current 2P Electronics listing. On 2026-10-27, https://www.quickmobile.ro/ served a "Maintenance Page": "Platforma trece printr-un proces de actualizare" (→ "the platform is being updated"). | [Profitshare – QuickMobile](https://profitshare.ro/affiliate-programs/it-c/quickmobile); [2P blog](https://ro.2performant.com/blog/quickmobile-revine-2performant/) (search summary); [quickmobile.ro](https://www.quickmobile.ro/) |
| "EuroGSM has a program" | **UNVERIFIED (no evidence)** | Not in 2P Electronics (3 pages) or on page 1 of Profitshare IT&C. The homepage HTML fetched 2026-10-27 has no "afiliere", 2Performant or Profitshare references. A web search found nothing. | [2P electronics](https://2performant.com/affiliate-programs/electronics/); [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c); [eurogsm.ro](https://www.eurogsm.ro/) |
| "cel.ro has a program" | **UNVERIFIED (no evidence)** | Not in either network's listings. A web search found nothing. cel.ro timed out on an automated fetch. | [2P electronics](https://2performant.com/affiliate-programs/electronics/); [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c) |
| "Vexio has a program" | **TRUE (Profitshare)** | Listed in Profitshare IT&C: 2% commission, "Perioada de comisionare oferita de Vexio este de 5 zile" (→ 5-day commission period), "No Feed", terms last modified 15/11/2023. Also: "Este interzisa promovarea prin Google Ads incepand cu 16 iunie 2020" (→ Google Ads banned since 16 Jun 2020). No comparator clause. Not found on 2P. | [Profitshare – Vexio](https://profitshare.ro/en/affiliate-programs/it-c/vexio); [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c) |

- **Profitshare ownership (relevant to the README's "eMAG (Profitshare)" framing).** 2Performant signed on 6 May 2025 to buy Profitshare RO and BG from Conversion Marketing S.R.L./E.O.O.D. and Dante International (eMAG). Its EGM approved the deal on 10 June 2025. The BVB filing then said: "Contractul a încetat în mod automat în dată de 6 august 2025 potrivit prevederilor sale" (→ "the contract terminated automatically on 6 August 2025 under its terms"), citing "circumstanţe noi care au influențat în mod semnificativ premisele economice ale tranzacției" (→ "new circumstances that significantly affected the deal's economic premises") — [gadget.ro, 11 Aug 2025](https://gadget.ro/surpriza-verii-platforma-de-marketing-afiliat-2performant-a-anuntat-ca-nu-mai-cumpara-profitshare-romania-si-bulgaria/); [mobilissimo.ro](https://www.mobilissimo.ro/stiri-diverse/tranzactia-2performant-profitshare-a-cazut-ce-motive-au-invocat-cei-de-la-2performan) (search summary).
- The price was 4.307m lei: 55% cash and 45% in 2P shares — [gadget.ro](https://gadget.ro/surpriza-verii-platforma-de-marketing-afiliat-2performant-a-anuntat-ca-nu-mai-cumpara-profitshare-romania-si-bulgaria/). Before the collapse, start-up.ro (7 May 2025) had reported the deal as "finalizată". Treat that article as superseded — [start-up.ro](https://start-up.ro/2performant-finalizeaza-achizitia-profitshare-vom-avea-acces-la-rafturi-infinite/).
- Profitshare's affiliate and advertiser pages still carry the footer "© 2026 Conversion Marketing SRL" — [Profitshare advertiser signup](https://profitshare.ro/en/advertiser-signup).

### Inferences
- The README's list of electronics programs is out of date. The electronics affiliate pool that is actually reachable in Oct 2026 is mid-tier: evoMAG, F64, GSMnet and others on 2P, plus Vexio, ITGalaxy and ForIT on Profitshare. The three biggest electronics retailers (eMAG, Altex/Media Galaxy, Flanco) cannot be sourced through affiliate feeds for a comparator. eMAG prohibits it outright, and Altex and Flanco have no active program.
- Before integration, check each program's current page or the API, because program status changes often (Flanco moved through Profitshare, then 2P, then a 404 within about 3 years).

### Gaps
- No official notice or date was found for Flanco's 2P closure. The 29.06.2026 date is unverified.
- No positive or negative evidence was found for cel.ro or EuroGSM. Ask 2P/Profitshare support or the retailers directly.
- No source explains why QuickMobile's site shows a maintenance page.

## 2. Affiliate networks active in Romania: join requirements, comparator rules, feeds, APIs, commissions, payouts

### Takeaway
Two networks dominate Romanian retail affiliation. 2Performant (BVB-listed, also branded "Business League") had 674 active shops in Q1 2025, provides feeds and a REST API, and its documentation says feeds are meant for price comparators. Profitshare (eMAG group) runs about 250 programs, but many big advertisers there are inactive and eMAG forbids comparators. Admitad entered Romania in 2022 with little visible local inventory. Adtraction, Daisycon and TradeTracker do not list Romania. Amazon has no .ro store and has retired PA-API in favour of the Creators API, which requires at least 10 sales in 30 days. Kelkoo's Romania coverage is unconfirmed.

### Cited Findings

#### 2.1 Network overview table

| Network | Romania relevance (Oct 2026) | Publisher eligibility | Comparator stance (network level) | Feeds | API | Payout |
|---|---|---|---|---|---|---|
| **2Performant** (2performant.com / Business League) | Largest RO network. 674 active shops in 24 sectors in Q1 2025 ([Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf)). The Romania program listing runs to 32 pages ([2P Romania](https://2performant.com/country/romania/)) | Not stated in the help articles fetched (gap) | Feed docs say marketers can use products "în comparatoare de prețuri", cashback and promo aggregators ([2P feed spec](https://support.2performant.com/hc/en-us/articles/224718548-Care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-)). Rules vary per program (§3) | Advertiser feeds in CSV/TSV/XML, pulled 3–4×/day (§2.2) | REST API at https://api.2performant.com ([docs](https://doc.2performant.com/)) | Min. "100 RON or 25 EURO", excl. VAT; paid weekly on Thursdays; withdrawal request due by Tuesday 23:59 ([2P payouts](https://support.2performant.com/hc/en-us/articles/115000094711-when-and-how-are-commissions-paid-)) |
| **Profitshare** (profitshare.ro/.com; Conversion Marketing SRL, eMAG group) | "aproximativ 250 de programe de afiliere" in RO+BG ([gadget.ro](https://gadget.ro/surpriza-verii-platforma-de-marketing-afiliat-2performant-a-anuntat-ca-nu-mai-cumpara-profitshare-romania-si-bulgaria/)); "200+ advertisers" ([advertiser signup](https://profitshare.ro/en/advertiser-signup)) | Adults 18+ as individuals, PFA with a marketing/advertising activity, or companies with such activity. Unauthorized individuals who earn regularly must get authorized (terms last modified 13.09.2024) ([affiliate signup](https://profitshare.ro/en/affiliate-signup)) | Network terms do not name comparators but let advertisers restrict media (s. 4.13) ([affiliate signup](https://profitshare.ro/en/affiliate-signup)). Big advertisers ban comparators (eMAG, QuickMobile, Fashion Days) | Advertiser feeds "sent automatically through the API" ([advertiser signup](https://profitshare.ro/en/advertiser-signup)). Affiliates generate feeds in the panel under "Advertising Tools" → "feed-uri de produse" ([Datafeedr help](https://datafeedrapi.helpscoutdocs.com/article/242-how-to-find-your-profitshare-affiliate-id), search summary) | API user + API key from the account (WP plugin docs, search summary: [wp-profitshare](https://en-gb.wordpress.org/plugins/wp-profitshare/)). No official public docs found | Min. withdrawal 100 lei excl. VAT; monthly (balances recorded on the 22nd, paid on the 5th); taxes withheld at source for individuals (s. 7.3–7.4) ([affiliate signup](https://profitshare.ro/en/affiliate-signup)) |
| **Admitad** | "has begun entering the Romanian market on a full-scale" (press release, 28 Oct 2022). No Romanian advertisers named; AliExpress and Revolut cited as "familiar to Romanian consumers" ([PR Newswire](https://prnewswire.co.uk/news-releases/responding-to-a-growing-demand-for-local-brands-admitad-enters-the-romanian-market-301662554.html)) | Not stated | Not stated | Not stated in the release | Not stated in the release | Mentions an "Instant Payout" service ([PR Newswire](https://prnewswire.co.uk/news-releases/responding-to-a-growing-demand-for-local-brands-admitad-enters-the-romanian-market-301662554.html)) |
| **Awin** | A company profile for "Awin Romania" (Iași) exists ([Târgul de Cariere](https://www.targuldecariere.ro/companii/awin-romania), search summary). https://www.awin.com/ro returns 404 (no RO market page) | Publishers join free ([awin.com/gb/getting-started](https://www.awin.com/gb/getting-started), search summary) | Not researched | Not researched | Not researched | Not researched |
| **Adtraction** | Romania **not** in its 13 markets (UK, SE, NO, DK, FI, PL, ES, NL, DE, CH, AT, FR, IT) ([adtraction.com](https://adtraction.com/)) | – | Lists "comparison sites" as a partner type ([adtraction.com](https://adtraction.com/)) | – | api.adtraction.com linked ([adtraction.com](https://adtraction.com/)) | – |
| **Daisycon** | Romania **not** in its market/language switcher (EN, NL, BE, DE, DA, ES, FI, FR, NO, SV) ([daisycon.com](https://www.daisycon.com/en/)) | – | Has "Comparison Engines" and "Product Feeds" tools ([daisycon.com](https://www.daisycon.com/en/)) | – | – | – |
| **TradeTracker** | Romania **not** in its 24-entry country selector (which includes CZ, HU, PL, EE) ([tradetracker.com](https://tradetracker.com/)) | – | – | – | – | – |
| **Tradedoubler** | Market pages include "CEE"; Romania not named; claims "90+ markets" ([tradedoubler.com](https://www.tradedoubler.com/en/)) | – | – | – | Developer portal/API docs linked ([tradedoubler.com](https://www.tradedoubler.com/en/)) | – |
| **Kelkoo Group** | "29 Markets globally", not listed; Romania unconfirmed ([kelkoogroup.com](https://www.kelkoogroup.com/)) | "No approval steps" after integration ([for publishers](https://www.kelkoogroup.com/en/for-publishers/)) | Search API is "Perfect for shopping and comparison sites" ([for publishers](https://www.kelkoogroup.com/en/for-publishers/)) | Feeds API for catalogue publishers ([for publishers](https://www.kelkoogroup.com/en/for-publishers/)) | Search API + Feeds API; CPC model ([for publishers](https://www.kelkoogroup.com/en/for-publishers/)) | Not stated |
| **Amazon Associates** | No amazon.ro. The Associates/Creators API site selector lists DE, FR, IT, ES, NL, SE, PL, BE and IE among 22 marketplaces, with no Romania ([Creators API intro](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)) | Enrolment in the Associates program for the target marketplace ([Creators API intro](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)) | – | – | PA-API 5.0 "has been **deprecated** and is being replaced by the **Creators API**" ([deprecation notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)). The old docs URL now redirects to that notice ([webservices.amazon.com](https://webservices.amazon.com/paapi5/documentation/)). Creators API access needs "at least 10 qualifying sales in the past 30 days" ([intro](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)) | – |

- **Unverified third-party data:** a 2026 technology-detection ranking (wmtips) reportedly puts CJ at 22.9%, Impact at 19.5% and Admitad at 11.9% of affiliate technologies detected on Romanian sites. This comes from a search summary only; the page returned 403 — [wmtips](https://www.wmtips.com/technologies/affiliate-marketing/country/ro/).
- **Conflicting retirement dates for PA-API:** third-party and regional sources give April 30, 2026 and May 15, 2026 (search summaries: [dev.to](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek), [webservices.amazon.ca](https://webservices.amazon.ca/paapi5/documentation/api-reference.html)). The official notice fetched gives no date — [Amazon notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation).

#### 2.2 2Performant: feeds, API and business metrics (engineering and revenue detail)

**Advertiser feed specification.** This is what affiliates receive, so it is the de-facto field set.

| Field (RO) | Required | Notes |
|---|---|---|
| Titlu | Yes | Max. 255 characters |
| Descriere | Yes | Simple HTML allowed |
| Preț redus (current price) | Yes | Number, no thousands separator, "." as decimal separator |
| Preț vechi (old price) | Optional | Same format |
| Categorie | Yes | Category tree, free format |
| URL produs | Yes | http(s) |
| Imagini | Yes | Comma-separated URLs |
| ID produs | Yes | Must be numeric |
| Disponibilitate | Yes | `0`, `1`, `In Stock`, `Backorder`, `Out Of Stock`, `Preorder` |
| Brand | Optional | Text |
| GTIN | Optional | UPC/JAN/EAN/ISBN/ITF-14; "more than 8 and fewer than 14 characters" |
| Alte date | Optional | JSON/YAML, <16 MB |
| Câmp personalizat | Optional | Up to 4 custom fields, ≤254 characters |

- Source for the table: [2P support – feed spec](https://support.2performant.com/hc/en-us/articles/224718548-Care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-).
- Accepted formats are CSV/TSV (UTF-8, one product per line, separators `,` `;` tab or `|`) and XML (RSS or Atom). Google Merchant feeds work as-is. Feeds are added by URL and accessed "de 3-4 ori pe zi" (→ 3–4 times a day) — [2P support – feed spec](https://support.2performant.com/hc/en-us/articles/224718548-Care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-).
- **Conflict:** the 2P "guides" version of the same spec (published 2020-05-12, modified 2025-06-04) says "For the moment our platform supports only CSV files" — [2P guide JSON](https://2performant.com/guides/wp-json/wp/v2/docs/34890).
- Q1 2025 report: "Magazinele pot acum să-și creeze feed-urile în câteva click-uri, folosind direct Google Merchant Feeds" (→ "shops can now create their feeds in a few clicks, directly from Google Merchant feeds") — [2P Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).
- **API** (apiDoc v1.0.1, base `https://api.2performant.com`). Source for all API facts below: [doc.2performant.com](https://doc.2performant.com/), with endpoint data in [api_data.js](https://doc.2performant.com/api_data.js).
  - **Authentication:** `POST /users/sign_in` with `user.email` and `user.password` (plus a `user-key` header). Later calls send the `access-token`, `client`, `uid` and `token-type` headers.
  - **Affiliate endpoints:** `GET /affiliate/programs` (filters: query, category, country, relation), `GET /affiliate/programs/:program_id`, `GET /affiliate/programs/:program_id/me`, `GET /affiliate/commissions`, `GET /affiliate/banners`, `GET /affiliate/advertiser_promotions` (and `/export`, which returns CSV), `POST /affiliate/lost_orders` and `POST /affiliate/google_ads_linker/tracking_settings`.
  - **`/affiliate/programs` fields** include `cookie_life`, `product_feeds_count`, `products_count`, `default_sale_commission_rate`, `approval_time`, `average_payment_time`, `selling_countries` and `advertisers_traffic_sources[]`. Each traffic source has a `name` (examples: "Google Ads - search", "Google Ads - display", "Facebook profiles", "Cashbacks") and a `usage` documented as: "Traffic source usage. Can be ["yes", "maybe", "no"]".
  - **Rate limits:** "You can make a maximum of 100 requests to these endpoints per minute… a 5 minute penalty will be applied. The server will return 429".
  - **Tracking link format** (from a doc example): `https://event.2performant.com/events/click?ad_type=quicklink&aff_code=…&unique=…&redirect_to=…`.
  - The docs' group order lists "affiliateProductFeeds", but **no product-feed endpoints are published**.
- **2P business model** (Q1 2025 report):
  - Monthly subscriptions "începând de la 69€" (→ from €69).
  - Commission from sales of "în medie 1,2 €/vânzare" (→ on average €1.2 per sale).
  - The network commission is "aproximativ 2% din valoarea vânzărilor" (→ about 2% of sales value).
  - Source: [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).
- **Network KPIs, Jan–Apr 2025, monthly:**
  - Sales: 169k / 154k / 180k / 176k.
  - Clicks: 5.7M / 4.7M / 5.5M / 4.9M.
  - Sales value excl. VAT: €9.9M / €8.9M / €10.9M / €11M.
  - Affiliate commissions: €600k / €552k (the report prints "552M €", an obvious typo) / €656k / €663k.
  - Network commissions: €192k / €179k / €212k / €211k.
  - AOV: €59 / €57.6 / €60.6 / €62.8.
  - Conversion rate: 3.0% / 3.3% / 3.3% / 3.6%.
  - Cumulative to end of Q1 2025: 14.3M sales worth €705M and 767M clicks.
  - Source: [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).
- **Sales mix by category, Q1 2025:** Books/Film/Music 20%, Pharma 18%, Fashion 14%, Beauty 11%, Electronics IT&C 9%, Home & Garden 6%, Health & Personal Care 6%, Pet 5%, Toys 3%, Sports 1% — [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).

**Per-category metrics, Q1 2025.** The report labels the last column "Venituri la 100 de clickuri" (revenue per 100 clicks) and does not define it further. Source: [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).

| Category | AOV | Conversion | Revenue per 100 clicks |
|---|---|---|---|
| Books | €23.92 | 4.63% | €11.80 |
| Pharma | €30.95 | 3.90% | €5.10 |
| Fashion | €58.34 | 3.00% | €14.48 |
| Beauty | €40.07 | 3.64% | €12.25 |
| Electronics IT&C | €171.21 | 2.12% | €12.11 |
| Home & Garden | €133.56 | 1.68% | €12.38 |
| Health & Personal Care | €36.91 | 2.65% | €10.44 |
| Pet supplies | €43.68 | 4.26% | €9.93 |
| Babies, Kids & Toys | €64.48 | 2.82% | €12.15 |
| Sports & outdoors | €80.91 | 2.49% | €11.37 |

- **Active 2P advertisers named in the Q1 2025 report:** Answear, BestValue, Bookzone, Cărturești, Chicco, Cupio, Decathlon, Dr.Max, DY Fashion, ePantofi, Esteto, evoMAG, F64, FashionDays, FitLife, Flanco, Flip, Fornello, Hervis, iHunt, Kit Unghii, Lensa, LibrăriaDelfin, Librărie.net, Librex, Libris, Litera, Nichiduță, Noriel, Notino, Ookee.ro, Optiblu, Optiplaza, Otter, Sinsay, Spring Pharma — [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf).
- **Top-ranked Romanian programs on 2P, Oct 2026** (ranked by accepted plus pending commissions): springfarma.com, drmax.ro, otter.ro, carturesti.ro, libris.ro, librarie.net, scule365.ro, noriel.ro, answear.ro, petmax.ro, remediumfarm.ro, petmart.ro — [2P Romania](https://2performant.com/country/romania/).
- **2P Electronics category, Oct 2026:** 32 programs over 3 pages:
  - Page 1: evomag.ro (rank 15 overall, the top electronics program), gsmnet.ro, spy-shop.ro, f64.ro, a2t.ro, bitmi.ro, bsgmag.ro, vonmag.ro, case-smart.ro, GSMnet.de, ecovent.ro, conectica.ro.
  - Page 2: blacktech.ro, rovision.ro, photosetup.ro, cosori.ro, xkids.ro, timebox.ro, dwyn.ro, flip.bg, geekmall.ro, interlink.ro, asus.com, avatar-shop.ro.
  - Page 3: istanonline.ro, itarena.ro, printingmall.ro, bazaiot.ro, stingem.ro, pcmadd.com, 1cctv.ro, havit-romania.ro.
  - Sources: [p1](https://2performant.com/affiliate-programs/electronics/), [p2](https://2performant.com/affiliate-programs/electronics/page/2/), [p3](https://2performant.com/affiliate-programs/electronics/page/3/), [evoMAG page](https://2performant.com/affiliate-programs/electronics/evomag-ro/).
- **Business League branding:** described as "Primul campionat de e-commerce din lume" (→ "the world's first e-commerce championship"), built by 2Performant. The footer lists BusinessLeague® alongside 2Performant Network S.A. (BVB symbol 2P). 2P blog URLs now redirect to blog.businessleague.com — [Business League blog](https://blog.businessleague.com/all-in-on-2performant-flanco-deschide-toate-canalele-de-promovare-timp-de-2-luni-exclusiv-in-ecosistemul-2performant/).
- **2P promotion tools** listed in the RO help article: banners and product feeds — [2P support – tools](https://support.2performant.com/ro/hc/en-us/articles/224717788-care-sunt-uneltele-de-promovare-disponibile-).

#### 2.3 Profitshare: catalogue and fees
- Advertiser fee: "Profitshare fee is 30% calculated on affiliates commissions". The page's example is a 10% commission costing 3% of sales. Advertisers named on the page: eMAG.ro, FashionDays.ro, Vexio.ro, MatHaus.ro, Libris.ro, Depozitsolar.ro, ITGalaxy.ro, Vegis.ro, Vapetronic.ro, Pint.ro, ForIT.ro, Parmashop.ro — [Profitshare advertiser signup](https://profitshare.ro/en/advertiser-signup).
- **Retail category, Oct 2026** (7 advertisers): eMAG.ro (1–20%), Vapetronic (8%), Sole (5%), Alecoair (5%), Coffeepoint (1–10%), Transilvaniamag (5%), Hotpick (12%) — [Profitshare retail](https://profitshare.ro/affiliate-programs/retail).
- **IT&C category, Oct 2026** (14 advertisers; page 1 of 2 shown): Vexio 2%, ITGalaxy 2–10%, ForIT 2%, Dwyn 2–5%, Techstar 15%, Dualstore 5%, Vonmag 3%, CITGrup 8%, Streamstore 10%, Contakt 10%, PCMadd 6%, ABDComputer 7% — [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c).
- Affiliate tools in the terms: Affiliate Code, Slider, Widget, Profitshare Widget. Links may only be shortened with services such as bitly (s. 4.12). Cookie stuffing, pop-ups and misleading links are banned (s. 4.3, 4.9) — [Profitshare affiliate signup](https://profitshare.ro/en/affiliate-signup).
- **Unofficial tooling:**
  - An unofficial Go client (2015) exposes advertisers, campaigns and products calls (search summary; pkg.go.dev redirected to a login page): [go-profitshare](https://beta.pkg.go.dev/github.com/claudiu/go-profitshare).
  - The "WP Profitshare" plugin was closed on wordpress.org on 11 Mar 2025, citing a security issue (search summary): [wp-profitshare](https://en-gb.wordpress.org/plugins/wp-profitshare/).

### Inferences
- **Average affiliate commission across 2P** is about 6% of sales value. Arithmetic on the report's figures: €600k / €9.9M = 6.1% (Jan); €656k / €10.9M = 6.0% (Mar); €663k / €11.0M = 6.0% (Apr). 2P keeps about 1.9–2.0% (for example €212k / €10.9M in March).
- **Network-wide affiliate earnings per click** were about €0.105–0.135 (€600k / 5.7M clicks in Jan to €663k / 4.9M in Apr). Average affiliate commission per sale was about €3.5–3.8.
- **The "revenue per 100 clicks" column is most likely affiliate commission per 100 clicks.** Checking Electronics: 2.12% conversion × €171.21 AOV ≈ €363 of sales per 100 clicks, and €12.11 is about 3.3% of that, which fits typical electronics commission rates. On that reading, 100k outbound electronics clicks a month ≈ €12k gross. Treat this as an upper bound: comparator traffic may convert differently, Electronics is only 9% of 2P sales, and the largest electronics retailers are missing from the pool.
- **Engineering:** 2P's `advertisers_traffic_sources[].usage` (yes/maybe/no) can be ingested to gate each program automatically before its offers are shown. I did not confirm whether a "price comparison" traffic-source type exists (the doc examples only show Google Ads, Facebook and Cashbacks).
- **Legal entity:** Profitshare accepts individuals and withholds tax. Running Pretoscop through an SRL avoids per-network differences and fits B2B invoicing. Both networks quote amounts excluding VAT.

### Gaps
- 2P publisher eligibility (individual, PFA or SRL), tax handling and publisher approval times are not in the public articles I fetched.
- The 2P affiliate feed download mechanism (URL/format) is not in the public API docs: there is an "affiliateProductFeeds" group with no entries.
- No official Profitshare API documentation or affiliate feed format (CSV/XML fields) was found.
- CJ, Impact, Partnerize, Rakuten Advertising, Webgains and Sovrn/Skimlinks were not verified for Romanian advertisers because the search budget ran out.
- Kelkoo's 29 markets are not listed, so Romania is unconfirmed.
- The "20% Google Shopping margin" and any CSS fee models are not verified (see §5).

## 3. Advertiser-level details for major Romanian retailers

### Takeaway
Explicit comparator rules are rare. eMAG and QuickMobile (inactive) ban "comparatoare de preturi". Fashion Days bans comparators and "istoric preturi" (price-history) sites, which hits Pretoscop's concept directly. Libris explicitly allows comparators. Most other 2P programs say nothing on the subject and should be confirmed in writing. Google CSS promotion is a separate permission: banned by Elefant, allowed only with approval by Libris (and, historically, evoMAG), and allowed by Flanco's old programs.

### Cited Findings

| Retailer | Network & status (date of terms) | Commission | Cookie / commission period | Feed | Comparator / CSS / other key rules | Source |
|---|---|---|---|---|---|---|
| **eMAG** | Profitshare, listed (terms 27/10/2025) | "1.00% - 20.00%" by category grid valid from 27.10.2025; page marketing text says "de pana la 5%" (→ up to 5%) | "perioada de comisionare pentru comenzile eMAG variaza intre 2 zile si 15 zile" (→ 2 to 15 days); phones, TVs and laptops 2 days | Not mentioned | Comparators and aggregators banned (§1). "Promovare prin Google AdWords, Facebook Ads sau alte campanii de tip „Pay-per-Click" nu este permisa." (→ PPC not allowed). Brand terms ("eMAG", "eMMAG", "eAMG", emag.ro, any Dante trademark) banned. Coupon sites, "website-uri de reduceri de tip bani inapoi/ cashback" (cashback sites), email campaigns, and FB/IG/TikTok groups plus WhatsApp/Telegram groups all excluded. No commission on "Corporate" orders | [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag) |
| **Altex / Media Galaxy** | No program found; in-house program closed ~2022 | – | – | – | – | [alphablog.ro](https://alphablog.ro/altex-inchide-sistemul-de-afiliere-neseriosi/) |
| **Flanco** | Profitshare inactive (terms 11/04/2023); 2P program page 404 (Oct 2026) | 1–10% (Profitshare); "între 1 și 10% din valoarea comenzilor generate" (2P, 2023) | 10 days (Profitshare) | Profitshare page shows "Feed" (unlabelled) | Profitshare: "Este acceptată promovarea de către parteneri Google" (→ promotion by Google [CSS] partners accepted). 2P 2023: CSS-only at first | [Profitshare – Flanco](https://profitshare.ro/affiliate-programs/retail/flanco); [2P/Business League blog](https://blog.businessleague.com/all-in-on-2performant-flanco-deschide-toate-canalele-de-promovare-timp-de-2-luni-exclusiv-in-ecosistemul-2performant/) |
| **PC Garage** | Profitshare inactive (02/11/2023) | 1% | "2 zile calendaristice incepand cu 9 Ianuarie 2023" (→ 2 calendar days from 9 Jan 2023) | "No Feed" | "Promovare prin Google AdWords sau Facebook Ads nu este permisa." Coupon and cashback sites excluded. Competitors excluded | [Profitshare – PC Garage](https://profitshare.ro/affiliate-programs/it-c/pcgarage) |
| **evoMAG** | 2P active (terms 1.10–31.10.2026); Profitshare inactive (23/06/2022) | "comisionul standard va fi de 1,5%" (→ 1.5% standard on the whole catalogue). 1.6% in Jul–Sep 2026 (search summary) | "10 zile cookie life" (→ 10 days); auto-approval within 15 days; invoices paid weekly; "time to payment" 48 days | >15 feeds | 2P page: no comparator, PPC or cashback rules. Old Profitshare terms: "Promovarea prin Goolge Shopping este perimsa doar cu acord scris in prealabil" (→ Google Shopping only with prior written consent; typos are in the original) | [2P – evoMAG](https://2performant.com/affiliate-programs/electronics/evomag-ro/); [Profitshare – evoMAG](https://profitshare.com/ro/affiliate-programs/retail/evomag) |
| **Vexio** | Profitshare (15/11/2023) | 2% | 5 days | "No Feed" | Google Ads banned since 16 Jun 2020. Brand keywords must be added as negatives. Only official materials allowed | [Profitshare – Vexio](https://profitshare.ro/en/affiliate-programs/it-c/vexio) |
| **QuickMobile** | Profitshare inactive (17/09/2021) | 3% standard, 1.5% on promo products | 30 days | "No Feed" | Comparators, cashback, coupons, Black Friday sites and Google Search Ads banned | [Profitshare – QuickMobile](https://profitshare.ro/affiliate-programs/it-c/quickmobile) |
| **ITGalaxy / ForIT** | Profitshare IT&C listing (Oct 2026) | 2–10% / 2% | – | – | Not checked | [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c) |
| **F64, GSMnet** | 2P Electronics listing (Oct 2026) | – | – | – | Not checked | [2P electronics](https://2performant.com/affiliate-programs/electronics/) |
| **Fashion Days** | Profitshare (terms 12/03/2025); also named as an active 2P advertiser in Q1 2025 | Grid from 31.10.2022: apparel 5%, footwear 4%, accessories/bags/watches 3%, home/outdoor/cosmetics/computer accessories 1% | "Perioada de comisionare oferita de Fashion Days este de 10 zile" (→ 10 days) | Shows a "Feed" label | **Banned:** "site-uri de tip comparatoare de preturi sau istoric preturi" (→ "price-comparator or price-history sites"), including through apps and browser plugins. PPC on Google Ads, Meta Ads and Pinterest banned. Voucher, coupon and cashback sites need written approval (since Jan 2021). **One network only:** "Afiliatii pot promova programul de afiliere Fashion Days in cadrul unei singure retele de afiliere, la alegere." (→ affiliates may promote Fashion Days in only one network of their choice) | [Profitshare – Fashion Days](https://profitshare.ro/affiliate-programs/fashion/fashiondays); [2P Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf) |
| **Answear** | 2P (ranked #9 among RO programs, Oct 2026) | 7% | 15 days; time to payment 57 days | Product feeds | "Promovare prin Google Adwords, Facebook Ads și TikTok Ads este interzisă." (→ banned). Comparators not mentioned | [2P – Answear](https://2performant.com/affiliate-programs/fashion/answear-ro/) |
| **Notino** | 2P (page shows "January 2017") | 4% | 30 days; time to payment 42 days | Product feeds | "Promovările prin SEM, PPC sau newsletter sunt interzise!" (→ SEM, PPC and newsletter banned). Comparators not mentioned | [2P – Notino](https://2performant.com/affiliate-programs/beauty/notino-ro/) |
| **Libris** | 2P (ranked #5); also named on Profitshare's advertiser page | 8% | 10 days; weekly payment; time to payment 27 days | "Feedurilor de produse actualizate zilnic" (→ daily-updated feeds) | **Comparators explicitly allowed** ("Comparatoare de preturi"); cashback allowed. "NU acceptam promovarea prin campanii PPC (Google Ads)". Brand targeting banned. Google Shopping/CSS "doar cu acord prealabil" (→ only with prior approval), on a single approved account, using Libris feeds only. Email only with prior agreement | [2P – Libris](https://2performant.com/affiliate-programs/books/libris-ro/); [Profitshare advertiser signup](https://profitshare.ro/en/advertiser-signup) |
| **Cărturești** | 2P (ranked #4) | "9% comision fix, indiferent de categorie" (→ 9% flat in every category), plus 1 leu per confirmed newsletter lead | 31 days; time to payment 45 days | A dedicated campaign feed is mentioned | Rejects Facebook pages with over 70% affiliate-link posts. No comparator rule | [2P – Cărturești](https://2performant.com/affiliate-programs/books/carturesti-ro/) |
| **Elefant** | Profitshare **inactive** (27/04/2023); 2P status unknown (an old 2Parale post cites 7% and a 1-month cookie, search summary) | 1.5–5% (books 5%, cosmetics/watches 3.5%, perfume 3%, home 4%, IT & Mobile 2%, electro and appliances 1.5%) | 5 days | "No Feed" | "Promovarea prin Google ADS si Google CSS nu este permisa." (→ Google Ads and Google CSS not allowed). Cashback listed as allowed | [Profitshare – Elefant](https://profitshare.com/en/affiliate-programs/retail/elefant); [2P blog](https://ro.2performant.com/blog/ce-face-libraria-elefant-ro-pentru-un-plus-de-41-in-vanzarile-prin-afiliere-in-2parale) (search summary) |
| **Bonami** | 2P | "procentul comisionului standard este de 3%", rising to 6% for special pages | 30 days; approvals twice a month; time to payment 61 days | One standardized CSV feed | No comparator rule | [2P – Bonami](https://2performant.com/affiliate-programs/home-garden/bonami-ro/) |
| **Dr. Max** | 2P (ranked #2) | "5% comision pentru produsele marca proprie" (own brand 5%); "2% comision pentru restul produselor" (everything else 2%); 10% on exclusive products in a promo window | 15 days; time to payment 52 days | Product feeds | No comparator rule | [2P – Dr. Max](https://2performant.com/affiliate-programs/pharma/drmax-ro/) |
| **Noriel** | 2P (ranked #8) | "7% pentru toate categoriile de produse" (→ 7% on all categories) | 14 days; time to payment 50 days | "Iti punem la dispozitie feed de produse" (→ a product feed is provided) | Google Ads and Facebook Ads not accepted | [2P – Noriel](https://2performant.com/affiliate-programs/babies-kids-toys/noriel-ro/) |
| **Petmart** | 2P (ranked #12) | "5 % (după scăderea taxelor, transportului etc.)" (→ 5% after taxes, shipping etc.) | 30 days; time to payment 38 days | Product feeds | No rules stated | [2P – Petmart](https://2performant.com/affiliate-programs/pet-supplies/petmart-ro/) |
| **Decathlon** | Named as an active 2P advertiser in Q1 2025. A 2019 promo page cites 2%, 15-day cookie and 45-day approval (search summary) | – | – | – | – | [2P Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf); [2P promo 2019](https://hi.2performant.com/promo-decathlon/) (search summary) |
| **Hervis** | Named as an active 2P advertiser in Q1 2025 | – | – | – | – | [2P Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf) |
| **Carrefour** | Old 2Parale program (3%, 1 month; search summary); current status unknown | – | – | – | – | [2P blog](https://ro.2performant.com/blog/carrefour-online-lanseaza-program-de-afiliere-2parale/) (search summary) |
| **Spring Farma, Otter, Librarie.net, Scule365, Petmax, Remedium Farm** | Top-ranked RO programs on 2P, Oct 2026 | – | – | – | – | [2P Romania](https://2performant.com/country/romania/) |

### Inferences
- **Categories where affiliate feeds and comparator listing look feasible now:** books (Libris explicitly allows it; Cărturești has no ban), pharma (Dr. Max), toys (Noriel), pets (Petmart), home (Bonami) and mid-tier electronics (evoMAG at 1.5%, Vexio at 2%). Fashion is restricted: Fashion Days bans price-history sites, and Answear bans Google, Facebook and TikTok ads.
- **Revenue per sale is sensitive to cookie length.** Electronics programs use short windows (eMAG 2 days for phones, TVs and laptops; PC Garage 2 days; Vexio 5 days; evoMAG 10 days), which lowers what a comparator earns, since users often compare and buy later.
- **"Silent" terms are not permission.** Profitshare's network terms let advertisers restrict media, and 2P exposes traffic-source usage flags. Get written approval from each advertiser for a "comparator / price history" use case.

### Gaps
- The eMAG category commission grid (in force from 27.10.2025) and the evoMAG commission chart PDF were not retrieved.
- No program evidence was found for iStyle, About You, Modivo, Douglas, Sephora, Vivre, Jysk, Dedeman, Leroy Merlin, Hornbach, Media Galaxy, cel.ro or EuroGSM. Their status is unknown, not confirmed absent, because searches were limited.
- The unlabelled figures on Profitshare pages (e.g. eMAG "73.35% / 31 zile / No"; Vexio "98.7% / 31 days / No Feed") look like approval rate, payment days and feed flag, but the labels are not shown.

## 4. eMAG specifically

### Takeaway
eMAG's only affiliate route is Profitshare, which bans comparators, aggregators and automatic data harvesting. No official eMAG price or feed partnership with comparison sites was found. The Marketplace API is seller-side only. eMAG pages do carry schema.org JSON-LD (Product and Offer, with price, availability and seller), and eMAG publishes daily offer sitemaps. But using either is scraping, it conflicts with eMAG's Profitshare terms, and it needs legal review.

### Cited Findings
- **Profitshare rules for eMAG:** see §1 and §3 for the verbatim comparator, PPC, coupon, cashback and email exclusions — [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag).
- **More eMAG terms:**
  - Excluded sites include those that "sunt concurentii eMAG.ro" (→ are eMAG competitors).
  - Social promotion is allowed on personal or managed Facebook, Twitter, Instagram or TikTok timelines. "Nu este permisa promovarea in grupurile de discutii din Facebook, Instagram si TikTok" (→ not in Facebook/Instagram/TikTok discussion groups) and not "in grupuri de WhatsApp sau in grupuri de Telegram" (→ in WhatsApp or Telegram groups).
  - Commission is paid only on invoiced, paid orders whose return period has expired.
  - Source: [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag).
- **eMAG eLITE (creator program):** prices of promoted products must not be mentioned (search summary) — [GPeC blog](https://www.gpec.ro/blog/emag-elite-un-program-de-afiliere-dedicat-exclusiv-creatorilor-de-continut).
- **Failed eMAG integration via 2P:** 2P's Q1 2025 report planned "integrarea eMAG începând cu trimestrul III" (→ eMAG integration starting Q3), in the context of the Profitshare purchase, and Dorin Boerescu said "feed-urile de produse au altă dimensiune la eMAG" (→ "product feeds are on another scale at eMAG"). The deal lapsed on 6 Aug 2025 — [Q1 2025 report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf); [start-up.ro](https://start-up.ro/2performant-finalizeaza-achizitia-profitshare-vom-avea-acces-la-rafturi-infinite/); [gadget.ro](https://gadget.ro/surpriza-verii-platforma-de-marketing-afiliat-2performant-a-anuntat-ca-nu-mai-cumpara-profitshare-romania-si-bulgaria/).
- **Marketplace API (seller-side), as described by integrator PlentyONE:** access is username/password plus seller IP whitelisting and callback URLs. Products are exported daily; price and stock changes are pushed every 15 minutes; orders are imported every 15–20 minutes. The first lister becomes the product "owner", and other sellers publish offers. eMAG manually checks product data. Marketplaces: RO, BG, HU. No API read access to competitor offers is described — [PlentyONE eMAG manual](https://knowledge.plentyone.com/en-gb/manual/main/markets/emag.html).
- **Old API documentation:** a v4.4.2 copy (June 2021) has a changelog saying `product_offer/read` added `ownership_id` (2017) and earlier gained offer-count and best-price fields (search summary) — [Scribd copy](https://www.scribd.com/document/493172928/eMAG-Marketplace-API-documentation-v4). A seller plugin describes the API as the "public REST API operated by Dante International SA for sellers" (search summary) — [WordPress plugin](https://wordpress.org/plugins/?p=309598).
- **JSON-LD on product pages** (one page sampled 2026-10-27):
  - Two `application/ld+json` blocks: `BreadcrumbList` and `Product`.
  - `Product` keys: additionalProperty, brand, category, description, image, itemCondition, keywords, manufacturer, mpn, name, offers, potentialAction, productID, sku (= PNK `DK9P23BBM`), url.
  - Offer: `{"@type":"Offer","price":"453.75","priceCurrency":"RON","availability":"http://schema.org/OutOfStock","seller":{"@type":"Organization","name":"Urban Bag"}}`.
  - No `gtin*` field and no aggregateRating on this sample.
  - Source: [sample eMAG product page](https://www.emag.ro/pantofi-barbati-sagra-shoes-model-torino-nero-41-eu-torv101/pd/DK9P23BBM/).
- **robots.txt (2026-10-27):**
  - Disallows `/compare/*`, `/product/`, `/search/listall`, `/cart/*`, `/user/*` and more.
  - Fully blocks the user-agents "008", Yandex, Baiduspider, AhrefsBot and Synthesio.
  - Declares sitemaps including `offers-available-index.xml`, `offers-unavailable-index.xml`, `offers-latest-index.xml`, `vendors-index.xml` and `brands-index.xml`.
  - Source: [eMAG robots.txt](https://www.emag.ro/robots.txt).
- **Offers sitemap:** `offers-latest-index.xml` lists 9 sub-sitemaps with lastmod 2026-10-27. `offers-latest-0.xml` holds 5,000 product URLs, each with `changefreq` daily, `priority` 1.0 and `image:loc` — [eMAG offers-latest index](https://www.emag.ro/sitemaps/offers-latest-index.xml).
- **How comparators list eMAG:** Pricy.ro features eMAG (plus Altex, Dedeman, PCGarage, FashionDays, CEL.ro, evoMAG and Flanco) among its stores and says stores are indexed in bulk — [Pricy.ro](https://www.pricy.ro/). Compari.ro could not be checked because Cloudflare blocked it.

### Inferences
- There is no legitimate bulk data channel for eMAG prices today. Affiliation is banned for comparators and no feed program exists. Options, in order: (1) approach eMAG commercially, for example as a CSS or marketing partner; (2) use only manually curated links with no affiliate tracking; (3) read structured data or sitemaps, which is scraping and needs a legal opinion and eMAG's terms of use. Option 3 would be expressly incompatible with being an eMAG Profitshare affiliate.
- Product matching keys for eMAG: `sku`/`productID` (the PNK) plus brand and MPN. GTIN was absent from the sample, so EAN matching for eMAG offers may need MPN-based matching.

### Gaps
- eMAG's website terms of use on automated access were not reviewed.
- How compari.ro, Pricy and ShopMania obtain eMAG data (feed versus crawl) is unknown.
- I did not check whether eMAG runs Shopping ads through third-party CSSs.

## 5. Google channels: Merchant Center, the CSS program, free listings, and the Content/Merchant API

### Takeaway
Romania is a CSS program country for Shopping ads and free listings, but not for "CSS product pages". To become a CSS, a site needs at least 50 distinct merchant domains shipping to Romania, its own search with price sorting and filtering, open access, and no on-site transactions. The CSS Partner tier additionally needs at least 50 merchants with active Shopping campaigns and a top-20% impression rank. The Content API for Shopping was sunset on 18 Aug 2026 and replaced by the Merchant API.

### Cited Findings
- **CSS countries (21):** Austria, Belgium, Czech Republic, Denmark, Finland, France, Germany, Greece, Hungary, Ireland, Italy, the Netherlands, Norway, Poland, Portugal, **Romania**, Slovakia, Spain, Sweden, Switzerland and the UK — [Merchant Center help](https://support.google.com/merchants/answer/12652686?hl=en); [CSS program requirements](https://support.google.com/css-center/answer/7524491?hl=en).
- **CSS product pages are available in 16 countries, not Romania:** AT, BE, CZ, DK, FR, DE, GR, IE, IT, NL, NO, PL, PT, ES, SE, UK — [CSS program requirements](https://support.google.com/css-center/answer/7524491?hl=en).
- **Merchants and CSSs:** merchants must work with at least one CSS to run Shopping ads or free listings, and may use several. "In Europe, free listings can go through any CSS, but you can select only one CSS for free listings in your CSS dashboard" — [Merchant Center help](https://support.google.com/merchants/answer/12652686?hl=en).
- **Minimum CSS requirements** (verbatim excerpts; source for all: [CSS program requirements](https://support.google.com/css-center/answer/7524491?hl=en)):
  - "Your business must have a registration in at least one country where the CSS program is available", and the website must show a matching business address.
  - "The site allows users to search and compare different products." It "should also allow users to compare the price and selling conditions for the same product".
  - "The site shows products offered by at least 50 distinct merchant domains for every country", and those merchants must ship to that country.
  - "The site shows products and leads users to a page where they can buy them."
  - The site needs a search box. Its search must mainly use its own dynamic, automated processes, not technology substantially licensed or syndicated from Google.
  - "The site offers options to sort or filter product results by price", plus at least one other dimension such as brand, merchant or shipping time.
  - "The site is accessible to everyone without sign-up."
  - "If your business is primarily a marketplace allowing transactions on your own domain, you can't participate as a CSS".
  - A CSS may not share a name or logo with a brand or business that sells physical goods on its site.
  - A prominent filter must not restrict results to fewer than 3 merchants on most queries.
  - Sites are reviewed periodically; non-compliance can lead to suspension.
- **Onboarding:**
  1. Create a new Merchant Center account.
  2. Set the display name ("a maximum of 10-15 characters"), address and support contacts.
  3. Verify the website (claim it, or verify through Search Console if the domain already runs Shopping ads).
  4. Submit Google's CSS sign-up form to convert the account into a CSS multi-client account. "Don't upload any offers to this initial account."
  5. Confirm eligibility per country in CSS Center using the 50-merchant "CSS Requirements report". You can upload a list of extra merchants.
  - For several countries, the page suggests separate brands, ccTLDs or subdomains, each with its own CSS Center. No fees or timeline are stated.
  - Source: [CSS Center – get started](https://support.google.com/css-center/answer/14233609?hl=en).
- **CSS Partner Program tiers** (source: [Comparison Shopping Partners – partners](https://comparisonshoppingpartners.withgoogle.com/partners); [portal home](https://comparisonshoppingpartners.withgoogle.com/)):
  - **Partner:** "Have at least 50 merchants running active Shopping Ads campaigns" (with at least one impression in the last 30 days), and rank in the top 20% of CSSs by Shopping Ad impressions in the region.
  - **Premium Partner:** top 10%, plus an Annual Joint Partnership Plan and four Quarterly Business Reviews.
  - Benefits: training and certifications, a directory listing with a badge, a Google point of contact, and so on.
- **CSSs serving Romania (examples found):**
  - "Shopping in EU", a Slovak Premier CSS Partner: "Currently, our CSS is being used by 154 Hungarian e-shops, 128 Romanian e-shops, and 93 Polish e-shops" (Dec 2023, modified May 2025) — [cssshoppingin.eu](https://www.cssshoppingin.eu/google-comparison-shopping-partners-where-are-we-on-the-ladder/).
  - Kelkoo offers advertisers access to "Google and Bing Shopping through our CSS" — [kelkoogroup.com](https://www.kelkoogroup.com/).
  - ShopMania's listings include automated integration with Google Shopping (2021) — [revistabiz.ro](https://www.revistabiz.ro/shopmania-ro-trece-prin-rebranding-catre-o-noua-verticala-de-business/).
- **Affiliate programs that reference CSS:** Flanco on 2P was CSS-only at launch (2023) — [Business League blog](https://blog.businessleague.com/all-in-on-2performant-flanco-deschide-toate-canalele-de-promovare-timp-de-2-luni-exclusiv-in-ecosistemul-2performant/). Libris allows Google Shopping (CSS) only with approval — [2P – Libris](https://2performant.com/affiliate-programs/books/libris-ro/). Elefant bans Google CSS — [Profitshare – Elefant](https://profitshare.com/en/affiliate-programs/retail/elefant).
- **Content API:** "Content API for Shopping was sunset on August 18, 2026." From 1 Sep 2026 "requests will experience progressive errors". The Merchant API is "the new version of the Content API for Shopping", and an extension-request form exists — [Google for Developers](https://developers.google.com/shopping-content/guides/quickstart).

### Inferences
- Pretoscop cannot become a CSS for Romania until it shows offers from at least 50 merchant domains that ship to Romania. Affiliate-feed merchants from 2P and Profitshare could make up that base, provided each program permits CSS or comparator use.
- A "CSS + affiliate" hybrid is a recognised pattern in Romania (Flanco 2023, Libris with approval). Pretoscop could buy Shopping clicks on behalf of merchants who pay CPS or CPC.
- Because CSS product pages are not available in Romania, Google will not surface Pretoscop's own comparison pages through the CSS program there. Shopping ads and free listings point to merchant pages.
- Any Merchant Center integration must be built on the Merchant API. The Content API is gone.

### Gaps
- The widely cited "~20% margin advantage" of non-Google CSSs could not be checked against a Google source, and the vendor pages failed to load (Channable returned 429, CompareCSS 526). Treat it as unverified industry lore.
- The full CSS Partner directory for Romania was not retrieved.
- CSS business models and pricing (monthly fee versus a percentage of spend) were not verified.

## 6. Merchant-submitted feed standards and comparator onboarding (Compari/Heureka, Google, Skroutz, Ceneo; CPC)

### Takeaway
Romanian shops already produce two feed dialects: Compari.ro (Heureka Group), with XML or CSV fields and a `MaxCPCMultiplier` bid, and Google Merchant, which 2P also accepts unchanged. Pretoscop should natively ingest Google-spec feeds and Compari-spec feeds. I found no public CPC prices for Romanian comparators.

### Cited Findings

**Compari.ro feed specification** (Heureka Help Center, Romania/Compari section). Root element `<Products>`, one `<Product>` per item, with details in `<Attributes><Attribute><Attribute_name>/<Attribute_value>`. CSV/TSV is also accepted with a header line. Source: [Heureka Help – Compari XML feed](https://sluzby.heureka.sk/help/xml-feed/).

| Field | Status | Notes |
|---|---|---|
| Identifier | Required | Unique, never changes |
| Manufacturer | Required | Can instead lead the Name |
| Name | Required | No advertising text |
| Category | Required | e.g. `Electronice > Camere foto si video > Aparate foto` |
| ProductUrl | Required | |
| Price | Required | Final consumer price incl. VAT, for the minimum orderable quantity |
| ProductNumber | Recommended | Manufacturer code; mandatory for electronics, IT, home goods |
| EanCode | Recommended | 8–13 digits, unique |
| DeliveryCost | Recommended | `FREE` or e.g. `30 RON` |
| DeliveryTime | Recommended | Working days, e.g. `2 zile`; `NO` = not orderable; ranges are invalid |
| MaxCPCMultiplier | Recommended | `BIDx` + 1.5–100.0 (one decimal), relative to the category base price |
| ImageUrl, ImageUrl2 | Recommended | At least 150×150 px; real product photos only |
| Description | Recommended | |
| Color, Size | Fashion only | One value per variant |
| GroupId | Recommended | Groups variants |
| EnergyEfficiencyA-G, EnergyLabelA-G, DetailedSpecificationA-G | Recommended | |
| ShoppingDisabled | Optional | `1` hides the item |
| Marketplace fields | Marketplace partners | BasketDisabled, FreeDelivery, Oversize, Weight, DeliveryCostByProduct |

- Category-specific rules: books need ISBN13; DVDs need ReleaseDate/OriginalTitle; mobile phones are shown only if SIM-free. The feed is downloaded daily at 16:00 and updates appear the next day; earlier updates need the premium package — [Heureka Help – Compari XML feed](https://sluzby.heureka.sk/help/xml-feed/).
- **Conflict on download time:** a search summary of compari.ro's own requirements page said daily at 17:00. That page sits behind a Cloudflare challenge — [compari.ro feed requirements](https://www.compari.ro/static/feed-requirements.html) (search summary).
- **Compari onboarding:** the feed is hosted on the merchant's own site and its link saved in "Centrul de clienti" under "Datele magazinului". PPC means paying only for clicks; a marketplace alternative charges commission on completed orders (search summary) — [compari.ro feed requirements](https://www.compari.ro/static/feed-requirements.html); [Compari client centre](https://www.compari.ro/admin/).

**Google Merchant Center product data specification** (source for all rows: [Google product data spec](https://support.google.com/merchants/answer/7052112?hl=en)):

| Attribute | Status / format |
|---|---|
| id | Required, max. 50 characters |
| title | Required, max. 150 characters |
| description | Required, max. 5000 characters |
| link, image_link | Required |
| additional_image_link | Up to 10 |
| availability | Required: `in_stock`, `out_of_stock`, `preorder`, `backorder` |
| availability_date | Required if `preorder` |
| price | Required, e.g. `15.00 USD` |
| sale_price, sale_price_effective_date | Optional |
| unit_pricing_measure | Where required by law |
| google_product_category, product_type | Optional |
| brand | Required for new products (with exceptions) |
| gtin | Strongly recommended; UPC 12, EAN 13, JAN 8/13, ISBN 13, ITF-14 |
| mpn | Required if there is no GTIN |
| identifier_exists, condition | |
| item_group_id, color, size | Required for variants and apparel in some markets and for free listings |
| certification | EU energy labels (via EPREL) |

- Notable changes on the page: a new minimum image size of 500×500 px, enforced from Jan 31, 2027; smartphones and tablets added to EU energy labelling from Jun 20, 2025 — [Google product data spec](https://support.google.com/merchants/answer/7052112?hl=en). The second part of the page (about 36k characters, including the shipping attributes) was not read.
- **ShopMania:** merchant budgets "sized automatically based on campaign performance"; automated Google Shopping integration; "milioane de produse" (→ millions of products) from thousands of stores (1 Apr 2021) — [revistabiz.ro](https://www.revistabiz.ro/shopmania-ro-trece-prin-rebranding-catre-o-noua-verticala-de-business/). Third-party guides describe it as pay-per-click, with free listing in exchange for a "Listed on ShopMania" seal (undated; search summary) — [jxtgroup](https://www.jxtgroup.com/list-products-free-shopmania_3912898.html); [ShoppingFeeder](https://insights.shoppingfeeder.com/selling-on-shopmania/).
- **Pricy.ro:** over 50 million products from more than 2,400 stores, and "9,046,419 prices updated in the last 24 hours". It offers price history and alerts, browser extensions (Chrome/Edge/Firefox/Opera/Safari) and mobile apps, and has a seller portal at seller.pricy.ro — [Pricy.ro](https://www.pricy.ro/).
- **Skroutz and Ceneo:** specs not retrieved. developer.skroutz.gr/feedspec/ renders client-side and returned no content to a fetch — [Skroutz feedspec](https://developer.skroutz.gr/feedspec/).

### Inferences
- **Suggested canonical ingestion schema:** Google attribute names as the backbone (id, title, description, link, image_link, availability, price, sale_price, brand, gtin, mpn, condition, item_group_id, shipping), extended with:
  - Compari's `DeliveryTime` (days) and `DeliveryCost`, plus energy-label fields;
  - 2P's "Preț vechi" (old price) as a struck-through price.
  - Also store the raw source fields for audit.
  - Map 2P availability values (`0`/`1`/`In Stock`/…) and Compari's `DeliveryTime=NO` onto one stock enum.
- **Self-serve merchant onboarding** can simply accept an existing Google Merchant feed URL or Compari XML URL, since Romanian shops already maintain these for Google and Compari. Pull at least daily; 2P's 3–4 times a day is a good benchmark.

### Gaps
- No public CPC tariffs were found for Compari (category base prices), ShopMania or Pricy. Typical CPCs in Romania and CEE remain unknown.
- Skroutz and Ceneo field lists were not retrieved (neither operates in Romania, so lower priority).
- The exact Compari download time (16:00 versus 17:00) is unconfirmed.

## 7. Product catalogue enrichment sources (Icecat, GS1 Romania, GTIN databases, images)

### Takeaway
Open Icecat is free, brand-sponsored content (600+ brands, 18M+ datasheets, 70+ languages, XML/CSV/JSON/HTML) and the best free enrichment layer for electronics and IT. Full Icecat (40k+ brands) is paid. Romanian coverage is plausible but not confirmed. GS1 Romania ties "Verified by GS1" access to its licences, and I found no public lookup API.

### Cited Findings
- **Open Icecat:** "600+ brands", "over 18 million datasheets", each "fully approved by the respective sponsoring brand". Content in "over 70 languages". Formats XML, CSV, JSON and HTML. **Full Icecat:** 40,000+ brands, paid subscription plans — [Icecat – structured data content users](https://icecat.com/structured-data-content-users).
- **Icecat plans (Feb 2024 post):** Open Icecat is free. Full Icecat tiers are "Starter", "Single Vertical" and "Complete", invoiced annually; Icecat "reserves the right to change fees at any time". Open Icecat datasheets are "fully sponsored by the respective manufacturers" and free to download and use — [iceclog – subscription plans](https://iceclog.com/?p=12415).
- **Romanian presence:** a Romanian Icecat domain hosts an Open Icecat channel-partners page (search result) — [icecat.ro](https://icecat.ro/no/menu/channelpartners). The main documentation site (icecat.biz) blocks automated fetches with Anubis proof-of-work — [icecat.biz](https://icecat.biz/en/menu/channelpartners/index.html).
- **GS1 Romania:**
  - The site lists GTIN barcode packages, product data synchronization ("ndp-sincronizare-date-produse"), e-commerce standards, GS1 Digital Link, and "Verified by GS1" under Resources (/verified-by-gs1). Contact: helpdesk@gs1.ro — [gs1.ro](https://gs1.ro/).
  - The 2024 licence form says GS1 "permite etichetarea și accesul în platforma VERIFIED BY GS1" (→ enables labelling and access to the Verified by GS1 platform) (search summary) — [GS1 Romania licence form PO-01_F08](https://gs1.ro/wp-content/uploads/2024/08/PO-01_F08_ed4rev1.pdf).
  - The global Verified by GS1 page returned 403 — [gs1.org](https://www.gs1.org/services/verified-by-gs1).
- **Image and material licensing in affiliate programs:**
  - "Pot fi folosite doar materialele de promovare oficiale" (→ only official promotional materials may be used) — [Profitshare – Vexio](https://profitshare.ro/en/affiliate-programs/it-c/vexio); [Profitshare – QuickMobile](https://profitshare.ro/affiliate-programs/it-c/quickmobile).
  - eMAG forbids affiliate links on product images on affiliate sites "or in irrelevant contexts" (search summary) — [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag).

### Inferences
- Use the feed GTIN as the Icecat lookup key (2P `GTIN` is optional, Compari `EanCode` is 8–13 digits, Google `gtin`), falling back to brand plus MPN (Compari `ProductNumber`, Google `mpn`).
- Expect weak GTIN coverage for eMAG-style data (no `gtin` in the sampled JSON-LD) and for 2P feeds where GTIN is optional.
- Show retailer images only for the retailer's own offer, under that program's terms. Use Icecat or manufacturer images for the canonical product page.

### Gaps
- The exact Open Icecat licence (attribution, caching, redistribution), whether Romanian-language content exists, and access methods (live JSON API, product index files) could not be read because icecat.biz blocks bots.
- Verified by GS1 API access, pricing and query limits for non-members are unknown.
- UPCitemdb, Barcode Lookup, Open Product Data and Google Manufacturer Center were not researched (search budget exhausted).

## 8. Direct partnerships with retailers

### Takeaway
I found no public description of how compari.ro, ShopMania or Pricy get feeds from large Romanian retailers. The visible merchant models are Compari's PPC or marketplace commission, ShopMania's auto-budgeted CPC with Google Shopping integration, and Pricy's seller portal plus bulk indexing. Willingness to share feeds is shown by retailers working with CSSs (128 Romanian shops on one CSS) and by Flanco and Libris permitting CSS channels.

### Cited Findings
- Compari: merchants host an XML/CSV feed and register its URL in the client centre. Pricing is PPC, with an optional marketplace that charges commission on completed orders (search summary) — [compari.ro feed requirements](https://www.compari.ro/static/feed-requirements.html); [Compari client centre](https://www.compari.ro/admin/). An optional `MaxCPCMultiplier` bid sits in the feed — [Heureka Help – Compari](https://sluzby.heureka.sk/help/xml-feed/).
- ShopMania: automatically sized budgets and Google Shopping integration — [revistabiz.ro](https://www.revistabiz.ro/shopmania-ro-trece-prin-rebranding-catre-o-noua-verticala-de-business/).
- Pricy: a seller portal (seller.pricy.ro) for adding a store; stores "indexed in bulk"; major retailers featured — [Pricy.ro](https://www.pricy.ro/).
- One CSS reports 128 Romanian e-shops as clients — [cssshoppingin.eu](https://www.cssshoppingin.eu/google-comparison-shopping-partners-where-are-we-on-the-ladder/).
- Flanco ran a CSS-only affiliate phase in 2023 — [Business League blog](https://blog.businessleague.com/all-in-on-2performant-flanco-deschide-toate-canalele-de-promovare-timp-de-2-luni-exclusiv-in-ecosistemul-2performant/). Libris allows CSS on approval — [2P – Libris](https://2performant.com/affiliate-programs/books/libris-ro/).

### Inferences
- A practical pitch to retailers combines three things: (a) "send us the Google or Compari feed URL you already have", (b) pay per sale through your existing 2P or Profitshare program, or per click, and (c) later, once Pretoscop qualifies, Shopping ads through Pretoscop's own CSS.
- The retailers most likely to agree are those already in 2P with permissive terms (Libris, Cărturești, Dr. Max, Noriel, Petmart, Bonami, evoMAG). eMAG, Fashion Days and Elefant (for CSS) are the least likely.

### Gaps
- No evidence was found of direct feed agreements between Romanian comparators and eMAG, Altex or Flanco, or of their terms.
- No public statement from retailers about their willingness to feed comparators was found, beyond the program terms above.
