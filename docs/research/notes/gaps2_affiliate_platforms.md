# Second-pass gap closure: affiliate networks, comparator platforms and catalogue sources for Pretoscop (as of 2026-10-27)

> Method note. Every page was fetched on 2026-10-27 unless another date is shown. Wayback Machine copies are cited by their capture date. "[search summary]" marks a fact seen only in a search-engine result summary, not on a fetched page. I used 19 web searches. Requests to retailer and comparator domains stayed at 2 or fewer per domain: evoMAG 1 (blocked by the Distinct captcha), istoric-preturi.info 1, quickmobile.ro 1, pricy.ro 1, price.ro 0 (Wayback only), compari.ro 0 (Wayback only). This file closes or narrows the gaps listed in `affiliate_networks_and_feeds.md`, `gaps_affiliate_and_merchant_channels.md`, `market_and_competitors.md` §3–§4 and `gaps_growth_and_demand.md` Q4. Gap IDs (G1…G47) are used in the summary table in §7.
>
> Status key:
> - **CLOSED**: answered from a primary or first-party source.
> - **PARTIAL**: narrowed, but something material is still unknown.
> - **NOT PUBLIC**: needs a login or direct contact. The founder action is given.

## 1. 2Performant (2P): feed refresh, the "price comparison" traffic-source type, PFA tax handling, ToS dates, wording of the comparator help article

### Takeaway
- **"Price Comparison Services" is a named 2P traffic-source type.** So are "Product Aggregators", "Promotions Aggregator", "Review Sites" and "Google Shopping Ads (CSS)".
  - Each advertiser marks each type YES, MAYBE or NO.
  - Closing a type that was allowed requires **180 days' notice**.
  - The affiliate API returns each program's yes/maybe/no setting, so Pretoscop can check permissions in bulk once it has an account.
- **The ToS changed substantively on 4 Feb 2026:** most notice periods were halved (6→3 months). The page's last edit was 17 Jun 2026, but that only changed a pricing link.
- **Affiliate-side feed refresh is still undocumented.** Advertiser feeds are pulled 3–4 times a day.
- **PFA payees:** 2P's own guidance treats them as self-assessing CAS/CASS and never says income tax is withheld for them.

### Cited Findings

**G1 — How often affiliate "My feeds" URLs are regenerated. Status: NOT PUBLIC**
- What the advertiser feed-spec article says:
  - "Feed-ul va fi adăugat în platforma noastră printr-un link către fișier. Ne veți furniza un URL pe care îl vom accesa de 3-4 ori pe zi (programul poate fi ajustat)." (→ the feed is added via a link to the file; you give us a URL that we access 3–4 times a day, and the schedule can be adjusted.)
  - The same article lists **"Disponibilitate" (availability) as a mandatory advertiser field**, with accepted values "0, 1, In Stock, Backorder, Out Of Stock, Preorder". The affiliate export shows only "Active".
  - Source: [2P help: Care sunt specificatiile feed-ului de produse…](https://support.2performant.com/ro/hc/en-us/articles/224718548-care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-)
- The affiliate feed article gives no refresh interval. — [2P help: Cum adaugi feed-uri de produse in site-ul tau](https://support.2performant.com/ro/hc/en-us/articles/360015619800-cum-adaugi-feed-uri-de-produse-in-site-ul-tau)
- The 2016 YouTube tutorial "How do I generate a product feed?" (uploaded 2016-08-05, 2,568 views) shows how to combine several advertisers' feeds into one ("hit the star button… in which feed you want to add it"). The XML or CSV link is copied from My Feeds. No refresh interval is given. — [YouTube 6C6wRbwyzgI](https://www.youtube.com/watch?v=6C6wRbwyzgI); linked from [2P help: tutoriale](https://support.2performant.com/ro/hc/en-us/articles/115003022427-cateva-tutoriale-despre-functionalitatile-2performant-eng-)
- Advertiser-side proxies:
  - bitmi.ro (2P): "Oferim feed de produse actualizat o data la 24h" (→ product feed updated once every 24h). — [2P – bitmi.ro](https://2performant.com/affiliate-programs/electronics/bitmi-ro/)
  - Douglas_RO (Awin): "Daily updated product data". — [Awin – Douglas_RO](https://ui.awin.com/merchant-profile/16122)
- How removed products behave: if an advertiser "scoate din feed un produs care nu mai este disponibil" (→ removes an unavailable product from the feed), the affiliate gets a "Missing tool" notice (tool type `product_store`). The shopper is redirected to the advertiser's homepage, and an order still earns commission. — [2P help: Primesc mesaje de Missing tool](https://support.2performant.com/ro/hc/en-us/articles/360004412251-primesc-mesaje-de-missing-tool)
- **Founder action:**
  1. Log into 2Performant → Tools → My feeds → Add Product Feed for one large program (e.g. evoMAG).
  2. Fetch the CSV URL hourly for 48 h, logging HTTP `Last-Modified`/`ETag`, row count and a hash of the price column.
  3. Separately, ask support (via the platform's messaging) how often affiliate feed exports are rebuilt.

**G2 — Does a "price comparison" traffic-source type exist? Status: CLOSED** (the exact label in the affiliate-profile picker is still unseen)
- 2P's advertiser article "Advertiseri – Preferințele Tipurilor de Surse de Trafic" defines the types (verbatim):
  - "Price Comparison Services: Afiliații rulează site-uri sau aplicații care compară prețurile produselor la diferiți comercianți, atrăgând trafic informat către site-ul advertiserului." (→ affiliates run sites or apps that compare product prices across merchants.)
  - "Product Aggregators: Afiliații colectează și prezintă produse…"
  - "Promotions Aggregator…", "Review Sites…", "Cashbacks…", "Coupons/Vouchers…"
  - "Google Shopping Ads (CSS): Afiliații folosesc anunțurile Google Shopping prin propriile lor Servicii de Comparare a Cumpărăturilor…"
  - The other types are ads (Google search/display/video, Facebook, Bing, TikTok, other PPC), socials, generalist content sites, user-generated sites and forums, and retargeting.
- Rules in the same article:
  - The states are Yes, Maybe ("doar după ce primesc o confirmare prin mesaj de la dvs." → only after the advertiser confirms by message) and No.
  - "nu poate fi selectat 'No' pentru toate tipurile… Cel puțin un tip… trebuie să fie desemnat ca 'Maybe'." (→ an advertiser cannot mark every type No; at least one must be Maybe.)
  - "Daca modificare include inchiderea unei surse de promovare, atunci se va aplica un preaviz egal cu 180 de zile. Daca se deschida o noua sursa de promovare, atunci aceasta schimbare poate fi aprobata instant." (→ closing a traffic source carries **180 days' notice**; opening one can be approved instantly.)
  - Source: [2P help: Preferințele Tipurilor de Surse de Trafic](https://support.2performant.com/ro/advertiseri-preferin%C8%9Bele-tipurilor-de-surse-de-trafic)
- On the affiliate side, the profile article says: "Adauga toate sursele de trafic pe care le folosesti… (ex: site, forum, pagina de Facebook, canal de YouTube etc.)… Trebuie sa selectezi o sursa principala de trafic – aceasta va aparea in profilul tau si in Marketer Ranking." (→ add all your traffic sources; you must pick one main source, shown in your profile and in Marketer Ranking.) It does not list the type names. — [2P help: Cum creez un profil 2Performant atractiv?](https://support.2performant.com/ro/hc/en-us/articles/224717568-cum-creez-un-profil-2performant-atractiv-)
- The ToS says an application means "full unconditional acceptance of the participation terms… including but not limited to the Traffic Sources types indicated by the Advertiser". — [2P Terms of Services](https://2performant.com/terms-conditions/)
- **API:** `GET /affiliate/programs` and `GET /affiliate/programs/:program_id` return `program.advertisers_traffic_sources[]` with `traffic_source_id` and `usage`, described as "Traffic source usage. Can be ['yes', 'maybe', 'no']". The public docs do not give the ID for "Price Comparison Services". — [doc.2performant.com api_data.js](https://doc.2performant.com/api_data.js)
- **Founder action** (to confirm the picker label and the type IDs):
  1. Log into 2P → Settings → Profile settings → Traffic sources and choose "Price Comparison Services" (or the nearest label) as the main source.
  2. Call `GET /affiliate/programs` and map `traffic_source_id` to names, so every program can be filtered on usage = yes or maybe.

**G3 — PFA: withholding or self-assessment? Status: PARTIAL**
- The payment profile offers three payee types: "persoana fizica, persoana juridica (S.R.L. / S.A.) sau persoana fizica autorizata". The form then asks for billing data "individual/company". — [2P help: Cum creez un profil de plata?](https://support.2performant.com/ro/hc/en-us/articles/115003981607-cum-creez-un-profil-de-plata-)
- The tax article covers only these payee types; **PFA is not named**:
  - "Persoana Fizica Romania – se retine la sursa, impozitul pe venit de 10%."
  - Romanian legal entities upload an invoice.
  - EU and non-EU individuals have 10% withheld.
  - Source: [2P help: Ce taxe platesc afiliatii…](https://support.2performant.com/ro/hc/en-us/articles/115001197532-ce-taxe-platesc-afiliatii-pentru-veniturile-inregistrate-prin-afiliere-)
- 2P's 27 Dec 2017 explainer ("Modificări Cod Fiscal…"):
  - For individuals, affiliate income is "venituri din alte surse" (→ income from other sources), withheld by 2P and not subject to CAS.
  - For PFAs: "PFA au obligația de a depune la… ANAF declarații în baza cărora se calculează contribuția la pensii (CAS) și cea la sănătate (CASS)… Plata CAS și CASS intră în sarcina afiliaților." (→ PFAs must file the declarations used to compute CAS and CASS; the affiliates pay them.)
  - It says nothing about 2P withholding income tax for PFAs. The page's CMS date shows a 2026-10-16 modification, but the text is 2017-era (1,900 lei minimum wage).
  - Source: [Business League blog, 27 Dec 2017](https://blog.businessleague.com/modificari-cod-fiscal/) (redirected from ro.2performant.com/blog/modificari-cod-fiscal/)
- **Founder action:**
  1. Create a draft PFA payment profile (Payments → Profiles → New Payment Profile → "company" billing data) and see whether a withdrawal asks for an uploaded invoice (i.e. self-assessment) or shows a withholding line.
  2. Confirm with support and an accountant.

**G4 — ToS "last updated" date. Status: CLOSED**
- The live page carries schema and OpenGraph metadata `"dateModified":"2026-06-17T09:06:47+00:00"` and `datePublished 2017-05-24`. — [2P Terms of Services](https://2performant.com/terms-conditions/)
- A diff against the [19 May 2026 Wayback copy](https://web.archive.org/web/20260519191315/https://2performant.com/terms-conditions/) (dateModified 2026-02-04T12:46:24) shows that the 17 Jun 2026 edit only:
  - changed the Service Package link from www.2performant.com/pricing to https://businessleague.com/pricing;
  - renamed a menu label from "Advertisers" to "eShops".
- **Substantive change on 4 Feb 2026.** The [22 Jan 2026 copy](https://web.archive.org/web/20260122072648/https://2performant.com/terms-conditions/) (dateModified 2025-08-27) differs from the May copy as follows:

  | Notice period | Jan 2026 text | May 2026 text |
  |---|---|---|
  | Amending program conditions | "6 months in advance" | "3 months in advance" |
  | Removal/ban, Unicorn affiliates | 6 months | 3 months |
  | Removal/ban, Corporation affiliates | 4 months | 2 months |
  | Removal/ban, Company affiliates | 2 months | 1 month |
  | Removal/ban, Start-up/Freelancers | 1 month | 1 month |
  | Commission decrease | "a prior notice 6 months" | "a prior notice 3 months" |
  | Approval-time increase | "6 months in advance" | "3 months in advance" |

- In-page notes still reference the October–November 2023 traffic-source migration (deadline 6.11.2023). — [2P Terms of Services](https://2performant.com/terms-conditions/)

**G5 — Exact wording of the comparator help article. Status: CLOSED**
- The title is "Cum adaugi feed-uri de produse in site-ul tau". The full body, verbatim:
  > "Cum sa preiei un feed de produse pentru un site de comparare de preturi sau agregator de produse. Daca detii un site care este un comparator de preturi sau un agregator de produse, va trebui sa implementezi in site-ul tau feed-uri de produse ale advertiserilor. In continuare vom vedea cum sa pregatesti si sa preiei un feed de produse pentru a-l implementa in site-ul tau. Pentru inceput trebuie sa te asiguri ca esti acceptat in programul de afiliere al carui feed vrei sa il preiei. Apoi trebuie sa navighezi spre Tools > My feeds si in dreapta sus a ecranului sa faci click pe butonul 'Add Product Feed'. Se va deschide o fereastra in care trebuie sa alegi numele (Product feed name) pe care il dai feed-ului, iar apoi poti cauta toate feed-urile de produse ale programelor in care ai fost acceptat cu butonul 'Select program'. O lista cu feed-urile disponibile ale programului selectat va aparea, iar pentru a adauga feed-ul dorit in lista ta de feed-uri va trebui sa faci click pe simbolul '+'. In continuare, in josul paginii daca faci scroll down vei putea configura campurile care vor aparea in feed. Primele trei campuri sunt blocate si nu le vei putea modifica. Pentru a adauga sau a scoate un camp trebuie sa faci click pe el si prin Drag and Drop sa il muti din lista de Available in cea de Active sau invers. [field list: Product title; Marketer Link; Sale price; Merchant Program; Image URLs; Description; Merchant program ID; Old price; Category; Product ID; Other data (JSON); Brand; Active; Added at; Merchant URL; Product URL; GTIN; Custom Field 1–4] Recomandarea noastra este sa creezi un singur feed per advertiser. Nu uita sa salvezi folosind butonul de Save din dreapta jos a ecranului. In pagina My Feeds din sectiunea Tools vei gasi listate feed-urile create. Pentru a prelua un feed si a-l introduce in importer-ul site-ului, fa click, dupa preferinta pe butonul de CSV sau XML si URL-ul feed-ului va fi salvat in clipboard si il vei putea introduce in importer."
- Source: [2P help article 360015619800](https://support.2performant.com/ro/hc/en-us/articles/360015619800-cum-adaugi-feed-uri-de-produse-in-site-ul-tau)

**G6 — Eligibility, approval times and the feed download mechanism (from affiliate_networks_and_feeds.md). Status: CLOSED**
- These were answered in `gaps_affiliate_and_merchant_channels.md` §1:
  - natural persons, PFAs and SRLs can join;
  - payment profiles submitted by Thursday are approved by Friday;
  - program applications are auto-processed within 15 days by traffic-source matching;
  - feeds come from Tools > My feeds as a CSV or XML URL.
- Re-verified today on the same help pages, e.g. [2P help: Cum aplic la o campanie?](https://support.2performant.com/ro/hc/en-us/articles/224717548-cum-aplic-la-o-campanie-)

### Inferences
- **Approval strategy.** Declare "Price Comparison Services" as the main traffic source, then pull `advertisers_traffic_sources` for every program:
  - YES programs can be integrated immediately;
  - MAYBE programs need a written message from the advertiser, and that message is the evidence to keep;
  - NO programs must be excluded.
- **Notice periods.** The 180-day rule for closing a traffic source protects a comparator more than the general 3-month notice does. Once a program allows comparators, it cannot quietly withdraw that within weeks. This reading is mine, not 2P's.
- **Feed freshness.** The cadence will probably be bounded by 2P's 3–4 daily advertiser pulls, so a comparator built on 2P feeds will show prices up to about 6–8 hours old. This is an inference, not documented. Pair feeds with on-page price checks for the top SKUs. The feed also lacks an availability field (only "Active"), even though advertisers must supply one.

### Gaps
- G1: the exact affiliate-feed rebuild cadence (founder action above).
- G2: the exact picker label and type IDs (founder action above).
- G3: PFA treatment (founder action above).

## 2. Electronics affiliate programs on 2P and Profitshare, Profitshare labels and API, eMAG/evoMAG commission grids, Flanco/cel.ro/EuroGSM/QuickMobile status

### Takeaway
- **Mid-tier electronics programs are all open and none bans comparators explicitly**:
  - on 2P: F64, GSMnet, spy-shop, bitmi, conectica, Vonmag, PCMadd and evoMAG;
  - on Profitshare: ITGalaxy, ForIT, Techstar, Dualstore, Vonmag, PCMadd and Vexio.
- Several ban particular channels instead:
  - **Google CSS:** ITGalaxy, ForIT and Dualstore;
  - **Google Ads:** Vexio and Dualstore;
  - **Google Search/DSA:** conectica.
- **Corrections to earlier notes:**
  - Profitshare's unlabelled figures are the value-based approval rate, the average approval period, "No" = no phone number shown to Profitshare visitors, and "Feed" = product feeds offered.
  - **Vexio does offer feeds.** The earlier "No Feed" reading merged two separate icons.
  - eMAG shows no feed icon.
- **Not public:** the eMAG grid (Profitshare login) and the evoMAG PDF (blocked by the Distinct captcha, not archived).
- **Flanco:** the 2P program was live on 22 Apr 2026 and the page is gone now.

### Cited Findings

**G7 — 2P electronics programs (F64, GSMnet, spy-shop, bitmi, conectica, Vonmag, PCMadd, evoMAG). Status: CLOSED**

Every page shows "Tools available: Banners, Product feeds" (a template label). Category: "Electronics (32)".

| Program | Listed since | Commission (verbatim gist) | Cookie | Time to payment | Feed / channel rules | Comparator clause | Source |
|---|---|---|---|---|---|---|---|
| **F64** | July 2017 | "1% pentru comenzile valide din categoriile: Aparate Foto, Obiective Foto, Camere Video, Camere de acțiune și Drone. 3% pentru… toate celelalte categorii" | 30 days; "posibilitatea extinderii până la 64 de zile, la cerere, pentru creatorii de conținut" | 64 days | Program "dedicat creatorilor de conținut"; "Fiecare solicitare de înscriere este analizată individual"; commissions validated within 30 days after the return period | none | [2P – f64.ro](https://2performant.com/affiliate-programs/electronics/f64-ro/) |
| **GSMnet** (Mobiparts SRL) | January 2026 | "12% pentru comenzile plasate de utilizatori finali… valabil pentru toate categoriile", net of VAT and shipping | 30 days | 16 days | Only 2P banners; no spam; no clone or URL-masking sites or "gsmnet" in domain; brand keywords banned; "Comisionam doar cupoanele dedicate afiliatului"; 30 days' notice for changes | none | [2P – gsmnet.ro](https://2performant.com/affiliate-programs/electronics/gsmnet-ro/) |
| **spy-shop** | November 2012 | "Comisionul general este de 5%": 5% "Optica de noapte", 2% "Sisteme solare fotovoltaice" | 31 days | 81 days | Approval time is long because of supplier-stock products | none | [2P – spy-shop.ro](https://2performant.com/affiliate-programs/electronics/spy-shop-ro/) |
| **bitmi** | June 2023 | 5% standard; monthly top-3 at 7.5/7/6.5% for affiliates with ≥15,000 lei and ≥15 approved orders | 30 days | 22 days | "Oferim feed de produse actualizat o data la 24h"; "commision approval time a fost setat la 60 de zile" | none | [2P – bitmi.ro](https://2performant.com/affiliate-programs/electronics/bitmi-ro/) |
| **conectica** (Impact Advertising SRL) | April 2019 | 6% | 30 days | 10 days | "Prin Google Adwords, excepție Search si DSA. Ai voie sa promovezi… doar prin… Google Display"; Facebook organic and paid allowed | none | [2P – conectica.ro](https://2performant.com/affiliate-programs/electronics/conectica-ro/) |
| **Vonmag** | November 2014 | 3% | 31 days | 56 days | none stated | none | [2P – vonmag.ro](https://2performant.com/affiliate-programs/electronics/vonmag-ro/) |
| **PCMadd** (Madd Electronics, refurbished Dell/HP) | June 2025 | 6% | 30 days | 31 days | none stated | none | [2P – pcmadd.com](https://2performant.com/affiliate-programs/electronics/pcmadd-com/) |
| **evoMAG** | May 2009 | 1.5% for 1.10–31.10.2026 | 10 days | 48 days | "Avem peste 15 feed-uri de produse"; grid PDF linked (G10) | none | [2P – evomag.ro](https://2performant.com/affiliate-programs/electronics/evomag-ro/) |

**G8 — Profitshare IT&C programs (ITGalaxy, ForIT, Techstar, Dualstore, Vonmag, PCMadd, Vexio) and eMAG. Status: CLOSED**

Figures come from each page's tooltip `title` attributes (see G9). "Cookie" is "Perioada de comisionare".

| Program | Commission | Cookie | Value approval rate | Avg. approval period | Feed | Key rules (verbatim gist) | T&C last modified | Source |
|---|---|---|---|---|---|---|---|---|
| **ITGalaxy** | 2%; 10% for NEX brand ("Gadgeturi Utile") | 60 days | 88% | 11 days | yes | PPC brand keywords banned and must be negatives; allowed: "Facebook Ads… Google AdWords, Google Shopping Ads"; **"Este interzisa promovarea prin Google CSS."**; only official materials | 18/04/2023 | [Profitshare – ITGalaxy](https://profitshare.ro/affiliate-programs/it-c/itgalaxy) |
| **ForIT** | 2% | 30 days | 71.76% | 31 days | yes | Brand keywords banned; **"Este interzisa promovarea prin Google CSS."**; only official materials | 18/04/2023 | [Profitshare – ForIT](https://profitshare.ro/affiliate-programs/it-c/forit) |
| **Techstar** | 15% "(incepand cu 12.02.2017)" | 30 days | 85.93% | 31 days | yes | Brand keywords banned; Google-spam sites refused; "Pot fi folosite oricare dintre tipurile de materiale" | 14/01/2025 | [Profitshare – Techstar](https://profitshare.ro/affiliate-programs/it-c/techstar) |
| **Dualstore** | 5% in T&C (description says "3%", a conflict) | 30 days | 100% | 31 days | yes | **"din data de 13.11.2024 Nu mai acceptam promovarea prin css, google ads, facebook ads, tiktok ads"**; brand keywords DualStore and iSEN banned | 15/11/2024 | [Profitshare – Dualstore](https://profitshare.ro/affiliate-programs/it-c/dualstore) |
| **Vonmag** | 3% "(incepand cu 19.03.2026)" (description says "5%", a conflict) | 30 days | 90.23% | 31 days | yes | No commission on installer-partner orders; refuses sites "care promoveaza coduri de reducere sau informatii eronate privind ofertele"; brand keywords VonMag/Vonrep | 18/03/2026 | [Profitshare – Vonmag](https://profitshare.ro/affiliate-programs/it-c/vonmag) |
| **PCMadd** | 6% | 30 days | not shown | not shown | yes | Brand bidding "pc madd", "pcmadd" banned; only platform materials | 10/11/2016 | [Profitshare – PCMadd](https://profitshare.ro/affiliate-programs/it-c/pcmadd) |
| **Vexio** | 2% | 5 days | 98.7% | 31 days | **yes** (correction) | "Este interzisa promovarea prin Google Ads incepand cu 16 iunie 2020"; brand keywords must be negatives; only official materials; no commission on distribution clients | 15/11/2023 | [Profitshare – Vexio](https://profitshare.ro/affiliate-programs/it-c/vexio) |
| **eMAG** (for contrast) | 1–20% | 2–15 days ("telefoane mobile, televizoare, laptop / notebook" = 2 days) | 73.35% | 31 days | **no feed icon** | Bans sites that "preiau automat informatii de pe website-ul eMAG… (ex site-uri comparatoare de preturi, plugin-uri de browsere)" and those "construite sub forma unor comparatoare de preturi, agregatoare de produse"; PPC banned | 27/10/2025 | [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag) |

**G9 — Labels behind the unlabelled Profitshare figures. Status: CLOSED**
- The raw HTML tooltips read:
  - percentage: "Rata medie de aprobare valorică a comisioanelor la advertiserul … este de 88% din valoarea comisioanelor înregistrate." (→ average value-weighted approval rate of commissions);
  - days: "Perioada medie pentru aprobarea comisioanelor… este de 11 zile." (→ average approval period);
  - "No": "Advertiserul nu afiseaza numar de telefon pentru vizite Profitshare." (→ the advertiser hides its phone number from Profitshare visitors, which protects attribution);
  - "Feed": "Advertiserul ofera feed-uri de produse." (→ the advertiser offers product feeds).
  - Source: [Profitshare – ITGalaxy](https://profitshare.ro/affiliate-programs/it-c/itgalaxy)
- **eMAG's "73.35% / 31 zile / No"** therefore means a 73.35% approval rate, a 31-day average approval period and no phone number shown. It is **not** "no feed". eMAG simply shows no feed icon. — [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag)
- **Vexio's earlier reading "98.7% / 31 days / No Feed"** was two icons, "No" (phone) plus "Feed". Vexio offers feeds. — [Profitshare – Vexio](https://profitshare.ro/affiliate-programs/it-c/vexio)

**G10 — eMAG category commission grid (from 27.10.2025) and evoMAG commission chart PDF. Status: NOT PUBLIC**
- eMAG T&C: "Grila de comisionare a produselor eMAG valabila incepand cu 27.10.2025 este disponibila la adresa URL: https://app.profitshare.ro/affiliate/advertiser-catalog/different-categories/id/35. Grila de comisionare face parte integranta din Termenii si Conditiile de promovare eMAG." This is a logged-in affiliate URL. — [Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag)
- The evoMAG grid is linked from the 2P page as https://www.evomag.ro/upload/files/file-1675862845.pdf. The file name's Unix timestamp decodes to 8 Feb 2023.
  - My single request on 2026-10-27 got the Distinct "Traffic Filter" captcha page ("Sistemul de protecție de la Distinct a detectat trafic anormal").
  - The Wayback Machine has no copy (HTTP 404 for `web/2024*/…file-1675862845.pdf`).
  - Source: [2P – evomag.ro](https://2performant.com/affiliate-programs/electronics/evomag-ro/)
- **Founder action:**
  1. Log into Profitshare (affiliate) and open `app.profitshare.ro/affiliate/advertiser-catalog/different-categories/id/35`. Export or save the grid.
  2. Open the evoMAG PDF link in a normal browser and save it.

**G11 — Profitshare API documentation and affiliate feed format. Status: PARTIAL**
- **API, reconstructed from the WordPress plugin "WP Profitshare" v1.4.9 (PHP 8 compatible):**
  - Base URL: `http://api.profitshare.ro` (BG: `api.profitshare.bg`).
  - Endpoints: `affiliate-advertisers`, `affiliate-campaigns` (paged), `affiliate-commissions` (paged), `affiliate-info`, and `affiliate-links` (POST, to create tracking links).
  - Authentication: HMAC-SHA1 over `METHOD + path + '/?' + query + '/' + api_user + Date`, keyed with the api_key. Headers: `Date`, `X-PS-Client: <api_user>`, `X-PS-Accept: json`, `X-PS-Auth: <hmac>`.
  - **No product or feed endpoint** appears in the plugin.
  - Source: [plugins.svn.wordpress.org – wp-profitshare functions.php](https://plugins.svn.wordpress.org/wp-profitshare/trunk/includes/functions.php); [readme](https://plugins.svn.wordpress.org/wp-profitshare/trunk/readme.txt)
- **Feed workflow:**
  1. "Select 'feed-uri de produse' in the Advertising Tools section."
  2. "Select one of your advertisers in the 'Selecteaza advertiserii' dropdown."
  3. "Give a name to the feed in the 'Nume feed' field."
  4. "Click the Generate feed button."
  5. "Download and open the feed URL."
  - Links in the feed carry the affiliate ID "between / / in front of ?redirect".
  - Sources: [Datafeedr docs (updated 21 Jan 2021)](https://datafeedrapi.helpscoutdocs.com/article/242-how-to-find-your-profitshare-affiliate-id); [affiliate.com resources (updated 7 Sep 2023)](https://resources.affiliate.com/article/73-find-your-profitshare-affiliate-id)
  - Datafeedr, a paid product-data aggregator, supports Profitshare as a network. That is a possible indirect route.
- The column list of the Profitshare affiliate feed is still unpublished.
- **Founder action:**
  1. Open a Profitshare affiliate account → Advertising Tools → "feed-uri de produse" → generate a feed for Vexio and one for ITGalaxy.
  2. Record the header row, encoding, delimiter and whether EAN or stock columns exist.
  3. Request API credentials (API user and key under the account settings).

**G12 — Flanco's 2P closure date (29.06.2026 unverified). Status: PARTIAL**
- The [22 Apr 2026 Wayback copy](https://web.archive.org/web/20260422174212/https://2performant.com/affiliate-programs/electronics-itc/flanco-ro/) shows the program **active**:
  - "Electronics IT&C (52)", listed since April 2023;
  - commission "variable", cookie life 10 days (header), time to payment 93 days;
  - the text says "comision între 1 și 10% la fiecare comandă pe o perioadă de recurență de 45 zile" (a header/text conflict on cookie length);
  - PPC brand keywords banned;
  - **no closure notice**.
- The same URL returns **404 today**. A 14 Jun 2026 capture of the category page held no usable listing. So the program closed between 22 Apr and 27 Oct 2026; the exact date is unconfirmed.
- **Founder action:** in a 2P affiliate account, check Merchants → "Past merchants" for Flanco's end date, or ask 2P support.

**G13 — cel.ro and EuroGSM. Status: PARTIAL** (all evidence is negative)
- profitshare.ro/affiliate-programs/it-c/cel and …/it-c/eurogsm redirect to the generic programs list, so no program page exists. — [Profitshare programs](https://profitshare.ro/affiliate-programs)
- 2performant.com/affiliate-programs/electronics/cel-ro/ returns 404.
- Neither appears in the 2P Electronics list (32 programs) or the Profitshare IT&C list (14). — [2P electronics](https://2performant.com/affiliate-programs/electronics/); [Profitshare IT&C](https://profitshare.ro/affiliate-programs/it-c)
- **Founder action:** email cel.ro's and EuroGSM's marketing teams about a direct feed or affiliate deal. Compari's indexed pages show cel.ro already supplies a Compari feed (see `gaps_affiliate_and_merchant_channels.md` §6).

**G14 — Why QuickMobile shows a maintenance page. Status: PARTIAL**
- https://www.quickmobile.ro/ returned **HTTP 503** on 2026-10-27, from a single request.
- On 10 Sep 2018, Profit.ro reported that QuickMobile's distribution company, Electro Distribution SRL (owned by Angela and Tudor Țiboc), "intră direct în faliment, prin procedură simplificată, având datorii totale de peste 34,4 milioane lei". It added: "Portalul supervizor semnalează că afacerea ar fi fost mutată pe o altă firmă" (→ the business had reportedly been moved to another company). — [Profit.ro, 10 Sep 2018](https://profit.ro/stiri/surpriza-compania-de-distributie-a-quickmobile-ro-unul-dintre-cele-mai-importante-magazine-online-de-telefoane-tablete-gadgeturi-si-accesorii-din-romania-intra-direct-in-faliment-18394392)
- No 2026 explanation was found.
- **Founder action (low priority):** check the current operator in the site footer or terms when it is back up, and check portal.just.ro / ONRC.

### Inferences
- **Commercial pool is small but feed-ready.** GSMnet (12%) and Techstar (15%) are high-commission accessory and gadget shops. evoMAG (1.5%), Vexio (2%), ITGalaxy and ForIT (2%) are the IT generalists. All of these offer feeds, which makes them the realistic seed catalogue for an electronics comparator.
- **CSS bans are not comparator bans.** ITGalaxy and ForIT ban Google CSS but allow "Google Shopping Ads" and PPC with brand negatives. A pure organic comparator falls in none of their banned categories, but this should still be confirmed in writing.
- **Vexio's 5-day cookie and evoMAG's 10-day cookie** cut comparator revenue. Pretoscop users who compare over a week will often be unattributed.

### Gaps
- G10: the eMAG grid and evoMAG PDF.
- G11: Profitshare feed columns.
- G12: Flanco's closure date.
- G13: cel.ro and EuroGSM terms.
- G14: QuickMobile's operator.

Founder actions for each are given above.

## 3. Other networks (Awin, CJ, Tradedoubler/CityAds, Impact, Partnerize, Webgains, Sovrn/Skimlinks, Kelkoo) and Google CSS economics

### Takeaway
- **Awin's public profiles** (re-fetched today) confirm the Samsung RO, Xiaomi RO and Douglas_RO terms, with no comparator clause.
- **Logins required:** CJ, Tradedoubler and CityAds terms for the fashion retailers.
- **Impact** is detected on only 31 small Romanian stores and **CJ** on 15 (StoreLeads). No evidence was found for Partnerize, Webgains, Sovrn or Skimlinks in Romania.
- **Kelkoo** entered Romania in 2019.
- **Google:**
  - lists Romania as a CSS country, but has **not launched "CSS product pages" in Romania**;
  - does not publish the ~20% Google Shopping margin.
  - Árukereső (Heureka group) runs CSS on a 10%-of-spend model.

### Cited Findings

**G15 — Samsung RO, Xiaomi RO and Douglas RO (Awin). Status: CLOSED**
- **Samsung RO** (ID 21720, Samsung Electronics Romania SRL):
  - "Commission: earn up to 2% commission"; "Attribution Period (Cookie Length) 30 Days";
  - vouchers "both generic and exclusive codes possible";
  - codes not meant for affiliates are paid at 0%;
  - assets "provided under strict confidence";
  - **no feed mention, no comparator clause**.
  - Source: [Awin – Samsung RO](https://ui.awin.com/merchant-profile/21720)
- **Xiaomi RO** (ID 118223):
  - "Tiered Commission Structure: Earn up to 5% based on category and performance"; 30 days;
  - "Regularly refreshed banners, product feeds, and tracking tools";
  - invites "a deal aggregator";
  - no comparator clause.
  - Source: [Awin – Xiaomi RO](https://ui.awin.com/merchant-profile/118223)
- **Douglas_RO** (ID 16122):
  - "5% commission per sale"; 30 days;
  - "Daily updated product data… The product data meet all legal requirements for the basic price and shipping costs";
  - "Tracking switch for fair attribution";
  - only coupon codes explicitly approved for affiliates may be used;
  - the full "Terms & Conditions Affiliate" are not linked publicly (contact affiliate@douglas.de).
  - Source: [Awin – Douglas_RO](https://ui.awin.com/merchant-profile/16122)

**G16 — CJ, Tradedoubler and CityAds terms for About You, Answear, Notino, Modivo and ePantofi. Status: NOT PUBLIC**
- None publishes terms outside the network login. Third-party listings only:
  - FlexOffers (a sub-network) lists Notino RO with a 15-day cookie and a "0.4% of sales" payout. [search summary] — [FlexOffers – Notino RO](https://www.flexoffers.com/affiliate-programs/notino-ro-affiliate-program/)
  - affi.io reportedly lists "Modivo RO" on Awin as "Closed", with cookie and revenue "n/c". [search summary; the page did not render without JavaScript] — [affi.io – Modivo](https://affi.io/m/modivo)
- Affilitizer, the source used earlier, returned HTTP 500 today. — [Affilitizer RO](https://www.affilitizer.com/countries/ro)
- **Founder action:**
  1. Open a CJ publisher account → Advertisers → search "Notino RO", "Answear RO", "About You RO" → read Program Terms (commission, cookie, "Promotional Methods", product catalog yes/no).
  2. Do the same on Tradedoubler (Modivo, ePantofi, About You) and CityAds (offers 42381 and 42371).

**G17 — Impact, Partnerize, Webgains, Rakuten, Sovrn/Skimlinks presence in Romania. Status: PARTIAL**
- StoreLeads, updated 23 Oct 2026, says "Impact is currently installed on 31 ecommerce stores in Romania". The top five by rank are ouku.com, danessamyricksbeauty.eu, nupo.ro, boltom.ro and lcpackagingshop.ro, with casaimperia.ro added on 2026-10-23. **No major retailer is among them.** — [StoreLeads – Impact in Romania](https://storeleads.app/reports/technology/Impact/country/RO)
- StoreLeads detects the "CJ Affiliate" tag on 15 Romanian stores. It does not track Partnerize, Webgains, Awin, 2Performant or Profitshare (404). — [StoreLeads – CJ Affiliate in Romania](https://storeleads.app/reports/technology/CJ%20Affiliate/country/RO)
- Searches found no Romanian merchants on Skimlinks or Sovrn. Both work by sub-affiliating the main networks, so Romanian advertisers would appear only if their Awin or CJ programs permit it. Rakuten Advertising was not checked (Affilitizer down).
- **Founder action (optional):** sign up as an Impact and Skimlinks publisher and search the marketplace for ".ro" brands. Expected yield is low.

**G18 — Kelkoo in Romania. Status: PARTIAL**
- Awin case study, 6 Nov 2019: "this year Kelkoo launched in four new markets: Romania, Greece, Hungary and Slovakia, bringing their global reach to a total of 26 countries." — [Awin – Publisher spotlight: Kelkoo Group](https://www.awin.com/gb/publishers/case-studies/publisher-spotlight-kelkoo-group)
- The current Kelkoo Group homepage says "thousands of advertisers across 29 markets" but lists none. — [kelkoogroup.com](https://www.kelkoogroup.com/en/)
- Kelkoo's publisher API docs have a `country` parameter (example `country=fr`) but no country table. — [Kelkoo docs – offers feeds request](https://docs.kelkoogroup.com/for-publishers/shopping-api-feeds/feeds-offers/offers-feeds-request)
- www.kelkoo.ro returned HTTP 403.
- **Founder action:** request a Kelkoo publisher token and call the Shopping API with `country=ro`, or ask Kelkoo's publisher team whether Romania is still live and which Romanian merchants run Kelkoo campaigns.

**G19 — The "20% Google Shopping margin" and CSS fee models. Status: PARTIAL** (Google publishes no figure)
- Smarter Ecommerce, a Shopping-ads tooling vendor, podcast episode 47 (released 28 Jul 2026): "If you enter via the Google default—let's say you make a €1 bid— … 20% is deducted from your bid, so $0.80 actually enters the auction. Now, if you're doing it via a third party… there is no 20% deduction… So you can see that there was no 20% discount, but rather your bid is worth $0.20 more relative to those other items." — [smec podcast: Google's CSS "20% Discount" Myth, Busted](https://smarter-ecommerce.com/en/podcast/season-4/google-s-css-20-discount-myth-busted-plus-the-hidden-cpc-tax-of-pmax-shopping/)
- CSS vendors say Google does not disclose the exact margin. Their own tests put it at 16–20%. [search summary] — [Channable blog](https://www.channable.com/blog/20-percent-margin-advantage-google-css); [Cobiro](https://cobiro.com/google-shopping-css/cpc-advantage/) (the page returned 404 on fetch)
- **Same-group fee model:** Árukereső Shopping (CSS), from an Aug 2025 capture:
  - "A Google hirdetési költségre az Árukereső.hu 10%-os jutalékot számít fel" (→ a 10% commission on Google ad spend);
  - "2021.11.17-től… a maximális átkattintási ár nettó 15 Ft, a napi limit kategóriánként nettó 1000 Ft" (→ since 17 Nov 2021 the defaults are a 15 Ft net max CPC and a 1,000 Ft net daily limit per category).
  - Source: [Wayback 3 Aug 2025 – arukereso.hu pricing-information](https://web.archive.org/web/20250803064420/https://www.arukereso.hu/static/pricing-information.html)
  - The Compari equivalent (0.20 RON default max CPC, 10% fee) is known only from a search summary (`gaps_affiliate_and_merchant_channels.md` §3).
- BigConvert advertises itself as a Google CSS partner active in Romania. [search summary] — [bigconvert.com/css](https://bigconvert.com/css). "Ovidiu.Golea-BigConvert.com" is also 2P's top affiliate by sales (Pulse W43, cited in the earlier file).

**G20 — Romania's CSS status and partner directory. Status: PARTIAL** (the directory is JavaScript-only)
- Google: "CSSs must be used to place Shopping ads and free product listings on Google on behalf of merchants in the following countries: … Hungary, … Romania, Slovakia…"
- But: "CSS product pages opportunity is currently launched in… Austria, Belgium, Czechia, Denmark, France, Germany, Greece, Ireland, Italy, the Netherlands, Norway, Poland, Portugal, Spain, Sweden, and the United Kingdom". **Romania is not on that list.**
- Source: [Google Merchant Center Help – CSS program requirements](https://support.google.com/merchants/answer/7524491?hl=en)
- The help article "Working with Comparison Shopping Services" points to the partner finder. The old `/find_a_partner/` URL now returns 404. The current page, "Find your match", loads its partner list with JavaScript. — [Google Help 12652686](https://support.google.com/merchants/answer/12652686?hl=en); [Comparison Shopping Partners – Find your match](https://comparisonshoppingpartners.withgoogle.com/find-your-match)
- **Founder action:** open Find your match in a browser, filter Country = Romania, and export the partner names and service models (managed vs self-serve). Also look for the "By [CSS]" label on eMAG and Altex Shopping ads in google.ro (closes G21).

**G21 — Does eMAG run Shopping ads through third-party CSSs? Status: NOT PUBLIC**
- **Founder action:** on google.ro Shopping, search 5 to 10 popular SKUs and record the "By Google" or "By <CSS name>" label under eMAG, Altex and Flanco ads.

### Inferences
- **No CSS product-pages unit in Romania (yet).** Becoming a CSS would not get Pretoscop's own product pages a prominent Google placement in Romania. The CSS route is only a Shopping-ads reselling business, with the 2P cap of at most 5 CSS affiliates per advertiser.
- **The "20% advantage" is a structural bid handicap on Google's own CSS**, not a rebate. Vendors agree on the mechanism but not the exact size, so treat 16–20% as an industry estimate.

### Gaps
- G16: fashion program terms (CJ/Tradedoubler/CityAds login).
- G18: Kelkoo's current country list.
- G20: Romania's CSS partner list.
- G21: eMAG's CSS label.

## 4. compari.ro and its Heureka-group sister sites: features, history depth, alerts, app, merchant tariffs, feed timing, big-retailer store pages

### Takeaway
- **Features verified** from 2026 Wayback copies, even though compari.ro returns 403 to bots:
  - a price-evolution chart for **every product, back to its launch**, with the **average and lowest price** for a period;
  - a **"Reducere" (discount) label that Compari computes itself** from the lowest daily price over the **last 14 days**;
  - **email-only** price alerts that each run **30 days**;
  - a "Magazin de încredere" trusted-shop program and buyer reviews;
  - an Android app marked "temporarily unavailable";
  - **4.31M** active users in Romania (its DSA Art. 24(2) disclosure).
- **Current tariffs:** the Compari table is still behind the Partner Portal. Two proxies were recovered:
  - **Compari's own 2011 list:** 0.10–0.19 RON per click;
  - **Árukereső's full 2 May 2024 list:** same operator and platform. Electronics clicks of about 37–117 HUF net, roughly €0.10–0.30.
- **Feed timing:** Compari downloads feeds **daily at 16:00**.

### Cited Findings

**G22 — Compari's price-history chart, depth, alerts, extension, app and merchant ratings. Status: CLOSED**
- "Cum recunoaștem ofertele false?" (→ how do we recognise fake offers?), Wayback 10 Jul 2026. Verbatim:
  - "verifică întotdeauna graficul de evoluție a prețului!… Poți vizualiza evoluția prețurilor pentru fiecare produs." (→ always check the price-evolution chart; you can view it for every product.)
  - "Poți afla cât a costat produsul de la lansarea sa și care este prețul actual." (→ you can see what the product cost **since its launch** and its current price.)
  - "Vei vedea prețul mediu și cel mai mic preț dintr-o anumită perioadă" (→ you will see the average and lowest price for a given period.)
  - "Compari.ro monitorizează constant evoluția prețurilor produselor. Dacă observăm o scădere de preț, marcăm produsul cu eticheta 'Reducere'… Reducerea este calculată pe baza modificărilor celui mai mic preț zilnic din ultimele 14 zile." (→ when Compari sees a price drop it marks the product "Reducere"; the discount is computed from changes in the **lowest daily price over the last 14 days**.)
  - It also promotes the orange "Cumpără" (buy) button, which comes with a money-back guarantee (the marketplace).
  - Source: [Wayback 10 Jul 2026 – compari.ro/static/scadere.html](https://web.archive.org/web/20260710093450/https://www.compari.ro/static/scadere.html)
- Price alert, Wayback 13 Oct 2026: "primiți o notificare automată prin email în cazul în care preţul produsului scade la suma setată de Dumneavoastră. Preţul produsului selectat este monitorizat timp de 30 de zile." (→ an automatic **email** notification when the price falls to your target; each product is **monitored for 30 days**.) The footer reads "© 2004-2026". — [Wayback 13 Oct 2026 – compari.ro/static/alerta_pret.html](https://web.archive.org/web/20261013090502/https://www.compari.ro/static/alerta_pret.html)
- Help Center, Wayback 13 Oct 2026:
  - Operator: "Online Comparison Shopping Kft. in calitate de operator al platformelor online arukereso.hu, compari.ro si pazaruvaj.com".
  - "numarul de utilizatori activi ai serviciului" (→ number of active users of the service), published under DSA Art. 24(2): **4,314,487 in Romania**, 6,367,075 in Hungary and 2,936,320 in Bulgaria. The page gives no reference period.
  - Compari has served users "din 2005".
  - Bucharest office: Iride Business Park.
  - Source: [Wayback 13 Oct 2026 – compari.ro/static/help-center.html](https://web.archive.org/web/20261013090502/https://www.compari.ro/static/help-center.html)
- Android app, Wayback 8 May 2025: "Aplicatia noastra de Google Play este temporar indisponibila." — [Wayback – compari.ro/static/google_play.html](https://web.archive.org/web/20250508231710/https://www.compari.ro/static/google_play.html)
- **Merchant ratings:** the footer links "Program Magazin de încredere" and "Părerea Cumpărătorului" (buyer opinion). Store pages show star ratings from reviews; for example Altex has 1.5★ from 55 reviews (G25). — [same captures](https://web.archive.org/web/20261013090502/https://www.compari.ro/static/help-center.html)
- **Extension:** no Compari extension exists. An earlier Chrome Web Store search found none (see `gaps_growth_and_demand.md` Q4).
- **Correction to earlier notes:** the Wayback Machine *does* hold 2025–2026 copies of compari.ro static pages, even though robots.txt disallows heritrix. Use `web.archive.org/web/2026*/compari.ro/static/*`.

**G23 — Compari click tariffs (XLSX), Árukereső and Pazaruvaj lists, Romanian forum quotes. Status: PARTIAL** (the current Compari table is NOT PUBLIC)
- **Compari's own historical list**, "Costul redirecționării vizitatorilor de la 13 mai 2011" (Wayback 17 Sep 2011). Flat RON per click by category:
  - "Laptop 0.19", "Electronice 0.19", "Electrocasnice 0.19", "Imprimanta 0.19", "Sănătate și cosmetică 0.19";
  - accessories such as "Cititor de carduri", "Switch" and "Alte accesorii calculatoare" at 0.10.
  - Source: [Wayback – compari.ro/static/costul_redirectionarii.html](https://web.archive.org/web/20110917042630/http://www.compari.ro/static/costul_redirectionarii.html)
- **Árukereső (HU) pricing page**, Wayback 3 Aug 2025:
  - The click price "igazodjon a termék árához" (→ follows the product price); base prices depend on main category (or leaf category) and the displayed gross price band; they exclude VAT.
  - "A nem kategorizált ajánlatok és a bolt oldali átkattintás ára nettó 25 Ft." (→ uncategorised offers and shop-page click-throughs cost a flat 25 Ft net.)
  - The system tries to keep "internetes robotok" clicks from being billed.
  - A bid-multiplier footnote applies.
  - The marketplace commission is published as an XLSX.
  - Source: [Wayback 3 Aug 2025 – arukereso.hu/static/pricing-information.html](https://web.archive.org/web/20250803064420/https://www.arukereso.hu/static/pricing-information.html)
- A later version of the same page reportedly says that from 11 February Árukereső moved to a market-tracking model with two-weekly reviews, and that "the current and the last 6 months' price lists are in the Partner Portal 'Áraink' menu". [search summary] — [arukereso.hu pricing-information](https://www.arukereso.hu/static/pricing-information.html)
- **Árukereső's full list "ÁTKATTINTÁSI ÁRAK 2024.05.02-TŐL"** (valid from 2 May 2024; XLSX archived 19 May 2024):
  - 85 categories × 50 gross price bands, in HUF excluding VAT. Products under 250 Ft are free. The maximum is 146 Ft.
  - Source: [Wayback – HU_ppc_pricelist_20240502.xlsx](https://web.archive.org/web/20240519114913/https://image.arukereso.hu/pricelist_20240502/HU_ppc_pricelist_20240502.xlsx)
  - Selected rows (HUF per click, net), computed from that file:

  | Category | at ~19.5k Ft product | ~39k Ft | ~117k Ft | ~195k Ft | ~390k Ft |
  |---|---|---|---|---|---|
  | Mobiltelefon (phones) | 37 | 46 | 71 | 77 | 81 |
  | Notebook | 31 | 35 | 63 | 78 | 91 |
  | LED/LCD/OLED TV | 43 | 54 | 85 | 101 | 117 |
  | Monitor | 60 | 67 | 83 | 92 | 104 |
  | Háztartási gép (appliances) | 60 | 70 | 94 | 107 | 114 |
  | Parfüm | 69 | 75 | 75 | 75 | 75 |
  | Median of 85 categories | 58 | 66 | 80 | 83 | 84 |

- A guessed Compari CDN path (`image.compari.ro/pricelist_20240502/RO_ppc_pricelist_20240502.xlsx`) returns 403 and was never archived. The HU and BG CDN files also return 403 directly.
- A Compari bidding page reportedly gives a worked example of 0.22 RON per click. [search summary] — [compari.ro/static/bidding.html](https://www.compari.ro/static/bidding.html)
- No Romanian forum quoting Compari CPCs was found.
- **Founder action:** register a Compari merchant account (registration fee 1 RON, see the earlier file) → Partner Portal → pricing ("Prețurile noastre", the counterpart of HU "Áraink") → download the current RO XLSX and the last 6 months.

**G24 — Compari feed download time (16:00 or 17:00). Status: CLOSED**
- "We download your feed every day at 16:00, the update of the given products is displayed the following day. If you need earlier updates, we recommend the premium package." — [Heureka Help Center – Romania (Compari) – XML Feed](https://sluzby.heureka.sk/help/xml-feed/)

**G25 — Do Altex, eMAG or Flanco feed Compari, now or in the past? Status: PARTIAL**
- **Altex has a Compari store page** (`/stores/altex-s22536/`), archived from 13 Oct 2010 to **18 Apr 2024**.
  - The 2024 copy shows the company (S.C. ALTEX ROMANIA S.R.L), services and **"1.5 După 55 păreri"** (1.5★ from 55 reviews).
  - It shows no product-offer count, so whether Altex lists offers today is unconfirmed.
  - Source: [Wayback 18 Apr 2024 – compari.ro/stores/altex-s22536/](https://web.archive.org/web/20240418040749/https://www.compari.ro/stores/altex-s22536/)
- An **"eMAG Consumabile"** store page existed in 2012. — [Wayback 1 Nov 2012 – compari.ro/stores/emag-consumabile-s70087/](https://web.archive.org/web/20121101224301/http://www.compari.ro/stores/emag-consumabile-s70087/)
- No archived Compari store page was found for Flanco or a main eMAG store (CDX prefix search, 27 Oct 2026). The Media Galaxy search was truncated by the result limit.

### Inferences
- **The HU list is a usable proxy for Compari** (same operator and codebase).
  - Conversion assumptions (mine, unsourced for 2024): about 390 HUF/EUR. The RON figures use the 5.2442 RON/EUR rate from the earlier file.
  - Phones at a ~€500 price: ≈77 Ft ≈ €0.20 ≈ 1.0 RON per click.
  - TVs at €1,000: ≈117 Ft ≈ €0.30 ≈ 1.6 RON.
  - Median category at €100: ≈66 Ft ≈ €0.17 ≈ 0.9 RON.
  - That is roughly **40–45% of Heureka.sk's medians**.
  - A Pretoscop CPC of 0.25–0.6 RON for electronics would be 2–4× cheaper than the probable Compari level.
- **Compari's "Reducere" uses a 14-day window**, shorter than the EU Omnibus 30-day reference price. A verdict built on Omnibus rules ("lowest price in the 30 days before the discount") plus a long-run history is a defensible differentiator. Compari's email alerts expire after 30 days, so persistent alerts (push or email, no expiry) are another.
- **Altex's 1.5★ store profile with no visible offers** suggests a legacy listing kept for reviews, not an active feed. This is unverified.

### Gaps
- G23: the current Compari XLSX (founder action above).
- G25: whether Altex has live offers on Compari today. **Founder action:** open compari.ro/stores/altex-s22536/ in a browser and check for "produse" or offers.
- Pazaruvaj's (BG) list was not retrieved. It adds little beside HU.

## 5. Other Romanian competitors and benchmark features: price.ro, xPrice, Pricy, istoric-preturi, Pret Alert, plus PriceSpy/PriceRunner/Keepa items

### Takeaway
- **price.ro** (since 2001) has a per-product "Evolutie de pret" chart, offers with stock and shipping, user reviews and a merchant login. No tariffs are public.
- **xPrice** offers a chart, cheaper alternatives and coupons, with no stated history depth.
- **Pricy:** history covers 12 months (earlier file); iOS app 2★ from 1 rating; merchant pricing not public.
- **istoric-preturi:** no Android app on Google Play, and no history depth stated.
- **Pret Alert:** an anonymous non-trader (Gmail contact) covering 130+ shops with daily checks and EAN matching. No user count is displayed.
- **pretheure.com and preturireduse.ro are not competitors.**

### Cited Findings

**G26 — price.ro owner, launch year, features and merchant terms. Status: PARTIAL**
- Homepage, Wayback 7 Oct 2026:
  - "price.ro – Expertul tau in cumparaturi"; "Motor de cautare si comparatii pentru milioane de preturi in toate categoriile";
  - "Price.ro © 2001 - 2026" (→ operating since at least 2001);
  - "Ultimele comentarii" (user reviews), "Sugestiile mele" and **"Inregistrare/login magazin"** (merchant sign-up/login).
  - Source: [Wayback 7 Oct 2026 – price.ro](https://web.archive.org/web/20261007234420/https://www.price.ro/)
- Product page, Wayback 19 Jan 2025:
  - The page has an **"Evolutie de pret"** button that loads a chart via AJAX (`func=graph_text&prod_id=…`).
  - The offer list shows stock ("lipsa informatii stoc") and **shipping cost** ("Transport: 25").
  - "9 comentarii" (user reviews).
  - "Price.ro nu este magazin online si nu vinde in mod direct."
  - Source: [Wayback – price.ro iPhone 13 page](https://web.archive.org/web/20250119015930/https://www.price.ro/preturi-apple-iphone-13-128gb-pink-3345428)
- The owner and the chart depth were not found.
- **Founder action:** open price.ro/admin in a browser ("Inregistrare/login magazin") for merchant terms. Check the site's terms page for the operator's company name.

**G27 — xprice.ro features and merchant terms. Status: PARTIAL**
- Mozilla add-ons API:
  - v4.2.0, last updated 2026-07-13; **2,084** average daily users; 4.33★ from 12 ratings.
  - Features: "Istoric de Prețuri… grafic", "Alternative Mai Ieftine", "Cupoane și Coduri de Reducere"; "peste 1000 de magazine"; "zeci de milioane de produse monitorizate".
  - "Extensia poate include link-uri de afiliere, afișate doar în popup".
  - History depth is not stated, and there is no merchant program.
  - Source: [AMO API – xprice](https://addons.mozilla.org/api/v5/addons/addon/xprice/?lang=ro)
- **Founder action:** none needed. History depth can be checked by installing the extension on an older eMAG product.

**G28 — Pricy and istoric-preturi history depth. Status: PARTIAL**
- Pricy: "ultimele 12 luni" (the last 12 months), from the earlier file. — [Pricy – Istoric prețuri](https://www.pricy.ro/istoric-preturi)
- istoric-preturi.info states no depth. Its homepage lists only encrypted `/link/` redirects and items such as "39 RON (acum 8 luni)" (8 months ago). — [istoric-preturi.info](https://www.istoric-preturi.info/)
- Compari covers products since launch (G22). Pret Alert shows "Graficul prețului din ultimele luni" (G31).
- **Founder action:** paste the URL of a long-listed eMAG product (e.g. an iPhone 13) into istoric-preturi.info and read the first date on the chart.

**G29 — Pricy SellerCenter pricing, and the feed vs crawl share. Status: NOT PUBLIC**
- The pricy.ro homepage shows "Cum adaug produsele mele?" and "Adaugă magazin" (both lead to seller.pricy.ro, a login-only app) and tells users the service is "gratuit, mereu" (free, always). No merchant tariff is shown. — [pricy.ro](https://www.pricy.ro/)
- **Founder action:** create a seller account at seller.pricy.ro, or email Pricy Limited (Dublin), and ask for the merchant fee schedule and the share of offers that come from feeds.

**G30 — Google Play installs and App Store ratings (Pricy, istoric-preturi). Status: CLOSED**
- Pricy Android "ro.pricy.app": 500+ downloads (`gaps_growth_and_demand.md` Q4).
- iOS:
  - "Pricy: compară prețuri", v1.1.22, released 2026-06-30, updated 2026-10-10, **average 2.0 from 1 rating**, seller Pricy LTD. — [iTunes lookup id6782340868](https://itunes.apple.com/lookup?id=6782340868&country=ro)
  - "Pricy pentru browser", v7.1.8, released 2026-08-25, 0 ratings. — [iTunes lookup id6801479522](https://itunes.apple.com/lookup?id=6801479522&country=ro)
- A Google Play search for "istoric preturi" (RO store) returns Pricy's app as the only price-history app. **istoric-preturi.info has no Play app**; its "mobile version" is the mobile website. — [Google Play search](https://play.google.com/store/search?q=istoric%20preturi&c=apps&hl=ro&gl=RO)

**G31 — Pret Alert (pretalert.ro): team and user count. Status: PARTIAL**
- Chrome Web Store listing: "Pret Alert (PretAlert) — istoric preturi si comparator preturi"; v1.4.1, updated **19 Oct 2026**; 5.0★ from 4 ratings; 31.46 KiB.
- **Developer:** "Non-comerciant" (non-trader), contact "pretalert@gmail.com". **No user count is displayed.**
- Claimed features:
  - "Graficul prețului din ultimele luni"; "Minimul și maximul înregistrat, cu data exactă";
  - "Dacă reducerea e reală sau prețul a fost umflat înainte";
  - "Același produs, mai ieftin în alt magazin (potrivire după codul EAN)";
  - "alertă gratuită pe email, fără cont";
  - "Funcționează în peste 130 de magazine… Prețurile vin din verificarea zilnică făcută de PretAlert.ro".
- Privacy: it sends only product URLs to pretalert.ro.
- pretalert.ro returns 403 (Cloudflare).
- Source: [CWS – Pret Alert](https://chromewebstore.google.com/detail/infgkooonmilglligeaffingljedfoab)
- **Founder action (if relevant):** email pretalert@gmail.com. The team is not public.
- A further Romanian extension, "Pretzi – Comparator de prețuri pentru magazinele din România", appeared only as a search-result title. [search result, not verified] — [extscope – Pretzi](https://www.extscope.org/extension/nkjjoklogplebijkbibmhleifchjbdib)

**G32 — pretheure.com and preturireduse.ro (Similarweb "similar sites"). Status: CLOSED**
- pretheure.com is a Canadian payday-loan site ("Fast, no credit check loans from $300 to $1,500 in Canada"). — [pretheure.com](https://www.pretheure.com/)
- preturireduse.ro is an online shop ("Comenzi telefonice… Livrare gratuita la comenzile peste 90 lei"). — [preturireduse.ro](https://preturireduse.ro/)
- Neither is a comparator.

**G33 — PriceRunner/PriceSpy history depth, Árukereső features. Status: PARTIAL**
- PriceSpy's help page describes the price history ("shows when and how often shops change the price") but gives **no depth**. — [PriceSpy UK – Price history](https://pricespy.co.uk/price-history--ecYSSD4hIAACEAXXWu)
- A third-party app listing says "12-month price history charts". [search summary] — [mwm.ai – PriceSpy app](https://mwm.ai/apps/id/369151774)
- No PriceRunner source was found.
- **Árukereső** runs on the same operator and platform as Compari (G22). Its 2025 navigation lists "%Áresések" (price drops), "Megbízható Bolt Program" (trusted shop), "Árukereső Marketplace" and the Shopping/CSS service. — [Wayback 3 Aug 2025 – arukereso.hu](https://web.archive.org/web/20250803064420/https://www.arukereso.hu/static/pricing-information.html)

**G34 — Keepa's official pricing and user counts. Status: PARTIAL** (third-party sources only, and they conflict)
- RevenueGeeks gives "€29 a month or €290 a year" (updated Aug 2026) in one page and "€19 a month, or €189 a year" (updated 11 Jul 2026) in another.
- The API entry plan is "€49 per month for 20 tokens per minute".
- [search summary] — [RevenueGeeks – Keepa pricing](https://revenuegeeks.com/keepa-pricing/); [RevenueGeeks – Keepa API](https://revenuegeeks.com/software/keepa/api)
- **Founder action:** open keepa.com → Data / API in a browser (JavaScript app) to read current prices.

**G35 — Telegram/Facebook deal channels, Reddit threads, a user survey ranking features (market_and_competitors §3–§4). Status: out of scope here**
- Community-demand gaps are handled in `gaps_growth_and_demand.md` Q2. No survey ranking comparator features was found, and none was searched for in this pass.

### Inferences
- **Every Romanian incumbent now shows a history chart:** Compari, Pricy, istoric-preturi, xPrice, price.ro and Pret Alert. The open niches are trust and method, not the chart itself:
  - stated depth (only Compari "since launch" and Pricy "12 months" state one);
  - an Omnibus-correct verdict;
  - alerts that do not expire;
  - seller-level filtering.
- **Pret Alert is the closest conceptual rival** (an EAN-matched "is this discount real" verdict) but is tiny and anonymous.

### Gaps
- G26: price.ro's owner and chart depth.
- G28: istoric-preturi's depth.
- G29: Pricy's merchant fees.
- G31: Pret Alert's user count.
- G33: PriceRunner's depth.
- G34: Keepa's official prices.

Founder actions are given above.

## 6. Catalogue and identifier sources: Open Icecat sponsor coverage of key brands, Romanian marketing text, GTIN lookups, Verified by GS1 / GS1 Romania, free GTIN databases, comparator feed standards (Skroutz)

### Takeaway
I tested Open Icecat's free live API on 2026-10-27 with the public demo shopname `openicecat-live`:
- **Free (sponsored):** Samsung, LG, Lenovo, Dell, Philips and Kingston. They return Romanian-localised titles and specs.
- **Full Icecat only:** Sony, Xiaomi, Logitech and AMD ("este necesar un app_key").
- **Restricted:** Apple ("Product has brand restrictions").
- **Romanian marketing text:** only 1 of 8 free datasheets had it (Philips). Samsung and LG have none even in English.

GTIN lookup works on the free tier. GS1 Romania publishes no API pricing. UPCitemdb had no hits for EU electronics GTINs.

### Cited Findings

**G36 — Open Icecat sponsor list; are Samsung, Apple, Xiaomi, LG and Sony free? Status: CLOSED** (empirical; the official sponsor page is still behind Anubis, including icecat.co.uk)
- Requests: `https://live.icecat.biz/api?lang=RO&shopname=openicecat-live&Brand=<brand>&ProductCode=<code>`. Results:

  | Brand | Product code tested | Result |
  |---|---|---|
  | **Samsung** | SM-S911BZKDEUE (Galaxy S23) | **Free.** Title "Samsung Galaxy S23 15,5 cm (6.1") Dual SIM Android 13 5G… Negru"; RO summary; LongDesc empty |
  | **Samsung** | QE55Q60CAUXXH (TV) | **Free.** "Samsung QE55Q60CA 139,7 cm (55") 4K Ultra HD Smart TV Wi-Fi Negru" |
  | **LG** | OLED55C31LA | **Free.** "LG OLED55C31LA televizor 139,7 cm (55") 4K Ultra HD Smart TV Wi-Fi Negru" |
  | **Lenovo** | 83UM003LRM | **Free** ("Lenovo IdeaPad 5 2-in-1 15AGP11…") |
  | **Kingston** | KF560C40BBK2-32 | **Free** |
  | **Philips** | HD9252/90 | **Free**, with **Romanian marketing text** ("Datorită tehnologiei RapidAir… cu până la 90% mai puţină grăsime") |
  | **Dell** | icecat_id 56195846 | **Free** (the reference product from the earlier file) |
  | **Sony** | WH1000XM5B.CE7 and ILCE7M4B.CEC | **Full only:** 403 "Pentru a accesa conținutul complet Icecat, este necesar un app_key. Utilizatorii Full Icecat îl pot găsi pe pagina 'Profilul meu'." |
  | **Xiaomi** | BHR5771EU and BHR7422GL | **Full only** (same 403) |
  | **Logitech** | 910-005470 (G502 Hero) | **Full only** (same 403) |
  | **AMD** | 100-100001084WOF | **Full only** (same 403) |
  | **Apple** | MTJV3ZM/A, MTP03ZD/A, MLY33ZE/A | 404 "Product has brand restrictions or access is limited" |

  Example request: [Samsung S23](https://live.icecat.biz/api?lang=RO&shopname=openicecat-live&Brand=Samsung&ProductCode=SM-S911BZKDEUE). Codes that returned "not present in the Icecat database" were invalid guesses (Huawei, Bosch, one HP code) and say nothing about sponsorship.
- A search summary says Icecat names HP, LEGO, L'Oréal, Sony, Hotpoint, Signify, Microsoft, Tefal, Whirlpool, Intel and Oral-B as Open Icecat brands, with "more than 500" sponsors. [search summary] — [iceclog – Icecat's mission](https://iceclog.com/icecats-global-mission-product-content-that-helps-buyers-decide/); [iceclog – subscription plans](https://iceclog.com/icecat-subscription-plans/)
  - **Conflict:** my two Sony tests were Full-only. Sony's sponsorship may cover only some categories or countries.

**G37 — Share of products with Romanian marketing text. Status: PARTIAL** (small sample)
- **1 of 8** free datasheets had a non-empty Romanian `Description.LongDesc`: Philips (310 characters).
- Samsung S23, Samsung Q60C TV, LG C3, Lenovo IdeaPad, Kingston FURY and Dell G5 had empty Romanian marketing text.
- Samsung S23 and LG C3 were **also empty in English** (`lang=EN`). They have only specs and generated summaries.
- Source: the same live API calls as G36, e.g. [LG C3 EN](https://live.icecat.biz/api?lang=EN&shopname=openicecat-live&Brand=LG&ProductCode=OLED55C31LA)

**G38 — Index file URLs and JSON API docs. Status: CLOSED**
- Answered in `gaps_affiliate_and_merchant_channels.md` §4 (daily, files, on_market and nobody index files; live JSON API manual v3.0, 13 Oct 2026).
- New today: **GTIN lookup works on the free tier.** `GTIN=8806094724721` returned the Galaxy S23 datasheet in Romanian. — [Icecat GTIN request](https://live.icecat.biz/api?lang=RO&shopname=openicecat-live&GTIN=8806094724721)

**G39 — Verified by GS1 API pricing and eligibility via GS1 Romania. Status: NOT PUBLIC**
- GS1 Romania's page:
  - describes four search functions;
  - says "Acces facil pentru toți membrii GS1" (→ easy access for all GS1 members);
  - links only to validat.gs1.ro and to membership ("Obține licența GS1");
  - gives the contact helpdesk@gs1.ro, +40 21 317 80 31;
  - publishes no API tariff.
  - Source: [GS1 România – Verified by GS1](https://gs1.ro/verified-by-gs1)
- validat.gs1.ro shows a login. It says "This service is being accessed through www.GS1.org". GS1 checks whether a GTIN is well formed, who it is licensed to, whether it exists in the registry and whether the record is complete ("toate cele 7 atribute"). — [validat.gs1.ro](https://validat.gs1.ro/validat/)
- gs1.ro/tarife shows no tariff page (it rendered homepage content).
- **Founder action:** email helpdesk@gs1.ro and ask:
  1. whether a non-manufacturer (a comparison site) can get Verified by GS1 API or batch access;
  2. the membership fee category that applies;
  3. the query limits.

**G40 — A free GTIN source with Romanian electronics coverage; UPCitemdb, Barcode Lookup, Open Product Data, Manufacturer Center. Status: PARTIAL**
- **Open Icecat** is a free GTIN-to-Romanian-specs source for sponsored brands: Samsung, LG, Lenovo, Dell, Philips, Kingston (G36, G38).
- **UPCitemdb's free trial endpoint** returned `"total":0` for the Samsung S23 EU GTIN 8806094724721 and the LG OLED55C31LA GTIN 8806091985521. EU electronics coverage looks poor (2/2 misses). — [UPCitemdb trial lookup](https://api.upcitemdb.com/prod/trial/lookup?upc=8806094724721)
- Barcode Lookup, Open Product Data and Google Manufacturer Center were not tested (lower priority).

**G41 — Skroutz feed field list (Ceneo still open). Status: PARTIAL** (Skroutz closed, Ceneo not retrieved)
- Skroutz XML feed, **required fields:** Unique ID, Name, Product Link, Image Link, Category Name, Price, VAT Rate, Availability, Manufacturer, **MPN / ISBN**, **EAN / Barcode**, Description, Quantity.
- **Optional fields:** Additional Image Link, Size, Weight, Shipping Costs, Color, Wholesale Price, Season, Size Fit, Outlet, Author, Expiration Date, Country of Origin, Specifications, Size Variations (variation ID, availability, size and quantity are required within a variation).
- Source: [Skroutz developer – XML feed](https://developer.skroutz.gr/products/xml_feed/)

### Inferences
- **Free coverage is uneven.** Open Icecat covers the key Romanian electronics brands for TVs and Samsung phones (Samsung, LG) and laptops (Lenovo, Dell). It does not cover Xiaomi, a top-3 phone brand in Romania (Awin profile), Sony or Apple. Apple is restricted even for paying users who are not authorised resellers.
  - Plan a hybrid: Icecat for sponsored brands, and feed and retailer-page data for the rest.
  - Write Romanian marketing copy yourself (respecting the OPL §10 limits on AI-generated text noted earlier).
- **Feed design.** If Pretoscop publishes its own merchant feed spec, Skroutz's required set (EAN and MPN mandatory, explicit VAT rate and quantity) is a stricter, matching-friendly benchmark than 2P's affiliate export, where GTIN is optional and there is no availability field.

### Gaps
- G39: GS1 terms.
- G40: a wider GTIN-database test.
- G41: Ceneo's spec.

## 7. Summary: all gaps and statuses

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
