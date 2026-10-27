# Build Pretoscop as Romania's neutral discount verifier

> **Editor's note (2026-10-27, after this report was written).** Two decisions were taken by the founders after legal advice and are recorded in `progress.md`: (1) an assisted-access channel through a commercial data-collection service is used for the designated blocked shops during the prototype (`12-blocked-shops-strategy.md` §0, ADR-015), which supersedes this report's "never evasion" posture for that specific tool; (2) eMAG remains a separate decision (ADR-013): this report recommends asking eMAG for a licence, linking out without extracted prices at launch, and crawling only after a written legal opinion, while the plan's default is polite crawling behind a kill switch conditional on that written opinion. Confirm with the lawyer whether the advice of 2026-10-27 covers eMAG's terms 4.2(j) and 6.2, and record the answer.

> **Round-2 corrections (same day, five more agents; details in `13-open-items.md` and `research/notes/gaps2_*.md`).** ONRC registration is free and decided within one working day (not RON 152 and 3–5 days); Vexio's Profitshare program does provide feeds; 2Performant has an explicit "Price Comparison Services" traffic-source setting per advertiser and none of its 378 programs mentions price-history sites; Altex and Media Galaxy listing pages embed prices, stock, seller and EAN server-side; cel.ro serves fake products to crawlers behind its captcha; Cloudflare already verifies small comparators including a Romanian one; Romanian price-history search demand is about 2–3× the round-1 estimate; compari.ro's features are verified (price chart since launch, 14-day discount label, 30-day email alerts, 4.31M active users); the cookie "reject all" bill is on the Chamber of Deputies' agenda for 26–28 Oct 2026; ANCOM has not yet issued the DSA notification form.

Pretoscop can be built legitimately and cheaply, but only as a neutral, Omnibus-aware "is this discount real?" verifier. Its data should come mostly from licensed feeds and an openly identified crawler, not from scraping a copy of eMAG. What limits it is permission, not technology. The three biggest electronics sellers offer no data channel a comparator can use. eMAG's Profitshare programme explicitly excludes price comparators, and its site terms forbid "any robot … to extract data". Altex and Flanco run no affiliate programme at all. By contrast, 2Performant lists 378 public Romanian programmes with a median 8% commission, and mid-tier IT shops (PC Garage, Vexio, evoMAG, cel.ro) already maintain Compari-format product feeds. The market is large: about €8.1bn of physical goods in 2025, roughly a quarter of it through eMAG. Yet it is served by one scaled comparator that is turning itself into a marketplace (compari.ro, about 3.6M visits a month) and by price-history tools whose shared weakness is stale data. The strongest of these, Pricy, has 100,000 Chrome users and 12 months of history. Nobody has published a recurring, data-driven fake-discount study since the Competition Council found in 2018 that about 80% of monitored reference prices were above the legal level. That gap is Pretoscop's opening. The money starts with affiliate links: 2Performant's 2025 network average was €0.137 per click, which works out to roughly €20–26 per 1,000 Pretoscop sessions. It matures into merchant pay-per-click, a Google CSS and B2B price intelligence. Display ads and cashback stay marginal. Running costs are small: about €70–100 a month at 50,000 offers and €230–385 at 500,000. On the legal side, a pure comparator is not bound by the 30-day prior-price rule, but it is bound by the UCPD's rules on ranking and paid-placement disclosure. It must also notify ANCOM within 45 days of launch, needs express opt-in for price-alert e-mails, and belongs in an SRL. The most urgent task is to start recording prices now. eMAG's Black Friday is on 6 November 2026, ten days away, and price history cannot be backfilled.

## Romania's €8bn market has one scaled comparator and no trusted referee

The market's size depends on what is counted. B2C goods plus services reached **€12.9bn in 2025 (+10%)**, with **€13.5bn forecast for 2026** ([Wall-Street.ro, 15 Oct 2026](https://www.wall-street.ro/articol/ecommerce/sectorul-de-comert-electronic-din-romania-estimat-la-135-miliarde-de-euro)). Physical goods alone were about **€8.1bn (+6%)**, forecast to pass €8.5bn in 2026 ([Economica / MerchantPro](https://www.economica.net/piata-de-ecommerce-din-romania-ar-putea-depasi-85-miliarde-de-euro-in-2026-dupa-un-avans-de-5-mai-mic-decat-in-2025924159_924159.html)). Growth is mid-single-digit and consumers are weak: retail sales volume fell 5.8% year on year in Q1 2026, and non-food fell 9.3% ([Wall-Street.ro, 9 Jun 2026](https://www.wall-street.ro/articol/ecommerce/romania-principala-piata-catre-care-merg-investitiile-cehilor-de-la-heureka.html)).

eMAG is the hub that any comparator has to cover. It had **10.6bn lei of platform sales in 2025**, a figure that includes marketplace sales ([Economedia](https://economedia.ro/emag-zonele-afectate-de-concedieri-compania-anunta-un-buget-de-12-miliarde-de-lei-pentru-2026-si-investitii-in-tehnologie.html)), and **more than 64,000 marketplace sellers** ([Wall-Street.ro](https://www.wall-street.ro/articol/ecommerce/romania-principala-piata-catre-care-merg-investitiile-cehilor-de-la-heureka.html)). Naspers has had sole control since the EU cleared the deal in August 2026 ([Romania Insider](https://www.romania-insider.com/business/emag-naspers-eu-approval-aug-2026)). At about 5.1 RON/EUR, eMAG's platform sales are roughly a quarter of the physical-goods market (my calculation). Its operator still lost **370.7M lei** in 2025 on 8.706bn lei of statutory revenue, while Altex made a profit on 8.207bn lei ([Mobilissimo](https://mobilissimo.ro/stiri-telefoane/emag-baga-bani-in-ai-fintech-si-logistica-altex-cumpara-magazine-retailul-romanesc-s-a-impartit-in-doua-tabere-iata-cifrele-comparative-pentru-2025)).

Cross-border platforms are taking traffic. In September 2026 Trendyol and Temu were the #3 and #5 e-commerce sites in Romania ([Similarweb](https://www.similarweb.com/top-websites/romania/e-commerce-and-shopping/)). Within domestic e-commerce, Electro & IT grew **21%** in 2025 while fashion fell 10.3% ([Economica](https://www.economica.net/piata-de-ecommerce-din-romania-ar-putea-depasi-85-miliarde-de-euro-in-2026-dupa-un-avans-de-5-mai-mic-decat-in-2025924159_924159.html)).

Buyer behaviour points to which features matter. **72.9% of emag.ro's web visits come from mobile** ([Semrush](https://www.semrush.com/website/emag.ro/overview/)). In a Cargus × Visa survey (September 2025, n=1,002, mostly urban), 68% said they usually pay online by card. Among the reasons given for choosing cash on delivery, **37% cited distrust of the merchant** ([Cargus whitepaper](https://www.cargus.ro/wp-content/uploads/Cargus-whitepaper-Visa.pdf)). That makes shop-trust signals, COD and locker delivery useful offer facets. Sameday passed 6,000 easybox lockers by March 2026, and FAN Courier reached 3,000 FANbox units in June 2026 ([Gadget.ro](https://gadget.ro/tag/easybox/); [ZF](https://www.zf.ro/companii/fan-courier-ajunge-la-3-000-de-lockere-instalate-la-nivel-national-23175159)).

Black Friday comes in two waves. The Romanian wave is led by eMAG's single day on **Friday 6 November 2026**. Its CEO expects more than 1bn lei, after 986M lei on 7 November 2025 ([Gadget.ro](https://gadget.ro/emag-a-confirmat-oficial-cand-va-organiza-evenimentul-de-shopping-al-anului-black-friday-2026/); [Wall-Street.ro](https://www.wall-street.ro/articol/ecommerce/emag-black-friday-2026-ce-spune-ceo-ul-retailerului-online)). evoMAG's campaign runs alongside it from 29 October. The international wave peaks later, with Notino's main day on 27 November ([Wall-Street.ro calendar, sponsored](https://www.wall-street.ro/articol/retail/black-friday-2026-in-romania-calendarul-magazinelor.html)). For 2026, eMAG says it measures discounts against both the 30-day low and the lowest price of the year ([Wall-Street.ro](https://www.wall-street.ro/articol/ecommerce/emag-black-friday-2026-ce-spune-ceo-ul-retailerului-online)). That is a tacit admission that shoppers now want proof.

### Incumbents are drifting into commerce or serving stale prices

**compari.ro** (Heureka Group) is the only scaled player. It had about **3.6M visits** in September 2026, ranking #93 in Romania and #1 in price comparison ([Similarweb](https://www.similarweb.com/website/compari.ro/)), and its DSA disclosure reports **2.4M average monthly active recipients** ([compari.ro](https://compari.ro/static/about-us.html)). It is turning itself into a marketplace: since July 2025 it charges a 3–5.5% commission on 800K+ offers, and it targets 12,000 active shops ([ZF, 25 Jun 2026](https://www.zf.ro/business-hi-tech/sorin-adrian-dochian-country-manager-compari-platforma-comparare-23181804)). A search-result summary says its product pages carry a price-evolution graph and e-mail alerts ([compari.ro](https://www.compari.ro/static/despre_noi.html)). This could not be checked first-hand, because compari.ro returns 403 to automated requests. It also has no Android app in Romania, since Heureka Group publishes only Czech and Slovak apps ([Google Play](https://play.google.com/store/apps/developer?id=Heureka+Group,+a.s.)).

**Pricy** is the strongest specialist, and it is a crawler first: "Folosim prețul afișat de magazin pe pagina produsului" (we use the price displayed on the shop's product page) ([Pricy](https://www.pricy.ro/cum-ordonam-ofertele)). It lists 2,451 shops, including Altex, PC Garage, Flanco and Media Galaxy ([Pricy – Magazine](https://www.pricy.ro/magazine)), and keeps 12 months of history ([Pricy – Istoric prețuri](https://www.pricy.ro/istoric-preturi)). Its Chrome extension has **100,000 users** at 3.6★ ([Chrome Web Store](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb)), while its new Android app has only 500+ downloads ([Google Play](https://play.google.com/store/apps/details?id=ro.pricy.app)). Reviews complain of "Many incorrect prices and slow updates", and one from November 2025 says eMAG and FashionDays history "is no longer visible" ([reviews](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb/reviews)).

| Service | Model and data method | Scale (date) | Weakness Pretoscop can exploit |
|---|---|---|---|
| compari.ro | Merchant feeds; PPC plus a 3–5.5% marketplace commission | ~3.6M visits, 2,500+ merchants (Sep/Jun 2026) ([Similarweb](https://www.similarweb.com/website/compari.ro/)) | Conflict of interest as it sells; no RO app; brand searches down ~50% since 2021 ([Google Trends](https://trends.google.com/trends/explore?date=today%205-y&geo=RO&q=black%20friday%20emag,istoric%20preturi,istoric%20pret,compari,reduceri)) |
| Pricy.ro | Crawls 2,400+ shops; SellerCenter feeds; some affiliate links; Dublin entity | 100K Chrome users; 98.2K web visits ([Similarweb](https://www.similarweb.com/website/pricy.ro/)) | Accuracy complaints; history only 12 months |
| istoric-preturi.info | Paste-a-link history; extension | 563 shops; 10K Chrome users; 141–177K visits ([site](https://www.istoric-preturi.info/); [CWS](https://chromewebstore.google.com/detail/istoric-preturi/hdhclckbeelgahmklefjjnpmhbljhcmd)) | Homepage shows prices last checked "acum 8 luni" (8 months ago) |
| xPrice | Extension with coupons | 10K Chrome users, 4.8★ ([CWS](https://chromewebstore.google.com/detail/dfmahbmljohdkjopniglmkehnkpkmcoi)) | Developer: "cannot update all prices daily" ([AMO](https://addons.mozilla.org/sr/android/addon/xprice/)) |
| Pret Alert (new) | Extension promising whether a discount is real | 4 ratings; updated 19 Oct 2026 ([CWS](https://chromewebstore.google.com/detail/infgkooonmilglligeaffingljedfoab)) | Direct copy of Pretoscop's wedge; scale unknown |
| price.ro, shopmania.ro | Legacy comparators | ~94K and ~46K visits ([Similarweb](https://www.similarweb.com/website/price.ro/); [Semrush](https://www.semrush.com/website/shopmania.ro/overview/)) | ShopMania fell from ~2M visits in 2009 |
| Skroutz.ro | Greek comparator turned marketplace | 565K visits; Blackstone deal at €635M EV ([Reuters/Yahoo](https://finance.yahoo.com/markets/stocks/articles/blackstone-acquires-greek-e-commerce-130617196.html)) | The capital-rich threat if it expands in Romania |

Neutrality is the opening. Heureka sells "verified discounts" that it computes itself rather than accepting the merchant's claim ([MediaGuru](https://www.mediaguru.cz/clanky/2024/08/heureka-nove-umoznuje-i-vyhledavani-podle-overenych-slev/)). Alza, the largest Czech e-shop, left Heureka, saying it was "no longer independent" ([Lupa.cz](https://www.lupa.cz/clanky/alza-konci-s-heurekou-pry-uz-neni-nezavisla/nazory/)). Pretoscop should stay a referee that never sells.

### Demand spikes 11–15× in Black Friday weeks and centres on one question

Surveys show the appetite. In a tbi bank / iVox survey, **83%** of Romanian internet users said they follow prices before Black Friday, and **58.5%** buy only at discounts of at least 30% ([Agerpres](https://agerpres.ro/economic/2024/11/06/trei-din-zece-romani-vor-sa-cheltuie-cel-putin-1-000-de-lei-de-black-friday-studiu--1382514)). In a separate survey, **63%** told Revolut × Dynata that brands cheat on Black Friday ([Euronews RO](https://www.euronews.ro/articole/romanii-cei-mai-sceptici-dintre-europeni-in-fata-reducerilor-de-black-friday-si-c)).

Search data says the same thing more precisely. Google Trends ratios anchored to Ahrefs brand volumes put "istoric pret" at about **1.2–2.2K searches a month** and "istoric preturi" at **1.0–1.6K** ([Google Trends](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=compari,istoric%20pret,istoric%20preturi,black%20friday%20emag,cel%20mai%20mic%20pret)). Between **51% and 64%** of a year's "istoric preturi" searches fall in the five Black Friday weeks, and the peak week runs 11–15× an average week ([Google Trends](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=istoric%20preturi,iphone%2017%20pret,pret%20iphone%2017,iphone%2017%20emag,compari)). Since 2021 the Black Friday peaks for these terms have risen about 3–4×, while searches for "compari" have roughly halved ([Google Trends](https://trends.google.com/trends/explore?date=today%205-y&geo=RO&q=black%20friday%20emag,istoric%20preturi,istoric%20pret,compari,reduceri)). Product queries dwarf them all: "iphone 14" alone draws **142K searches a month** ([Ahrefs](https://ahrefs.com/websites/compari.ro)).

Communities and regulators confirm the anger. Reddit threads on fake discounts reach hundreds of upvotes. "MediaGalaxy mărește prețurile și oferă reduceri false înainte de Black Friday" (MediaGalaxy raises prices and offers fake discounts before Black Friday) scored 281 in 2021 ([Reddit](https://www.reddit.com/r/Romania/comments/qas6sp/)). A 2025 r/programare thread asking why eMAG has no "vândut de eMAG" (sold by eMAG) filter scored 213 ([Reddit](https://www.reddit.com/r/programare/comments/1p10n4e/)). The Competition Council's 2018 inquiry into Black Friday 2017 found that about **80%** of monitored products carried a reference price above the legal level, and about **29%** were priced above their 30-day maximum ([Capital.ro](https://www.capital.ro/consiliul-concurentei-despre-campaniile-de-black-friday-preturile-sunt-crescute-si-mentinute-artficial.html)). The EU's Black Friday and Cyber Monday 2025 sweep found that at least 30% of 314 traders broke price-reduction rules ([European Commission](https://commission.europa.eu/topics/consumers/consumer-rights-and-complaints/enforcement-consumer-protection/sweeps_ga)).

The demand is product-specific, as the related queries show ("istoric pret emag", "[phone model] compari"), so Pretoscop's indexable pages should answer one question per product: is this price real, and is it the lowest across shops?

## Licensed data covers the long tail, not the electronics majors

The legal analysis ranks the ways of getting data from least to most risky. Safest are affiliate-network feeds, which come with a licence, then direct merchant feeds under contract. Next comes polite crawling of public pages that extracts only facts (price, availability, shipping, identifiers, URL) and links out, then copying descriptions and images. Riskier still is mirroring a shop's own search in real time, the pattern the CJEU condemned in *Innoweb* ([EUR-Lex C-202/12](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62012CJ0202)). At the far end is getting around anti-bot measures, which brings in Criminal Code art. 360(3) and its 2–7 years where access is restricted by technical means ([legeaz.net art. 360](https://legeaz.net/noul-cod-penal/art-360)).

Pretoscop's architecture should follow that order: feeds first, verified polite crawling second, and never circumvention.

### Affiliate networks offer 378 open programmes, but eMAG bans comparators outright

**2Performant** is the backbone. Its public Romanian directory lists **378 programmes**. Of the 335 that state a numeric commission, the **median is 8.0%**, and the median cookie window is **30 days** ([2Performant – Romania](https://2performant.com/country/romania/)). Affiliates build a feed for each accepted programme under Tools > My feeds and export it as a CSV or XML URL. A help article is addressed specifically to the "comparator de prețuri sau agregator de produse" (price comparator or product aggregator) ([2P help](https://support.2performant.com/ro/hc/en-us/articles/360015619800-cum-adaugi-feed-uri-de-produse-in-site-ul-tau)). Advertiser feeds are pulled "de 3-4 ori pe zi" (3–4 times a day) ([2P feed spec](https://support.2performant.com/hc/en-us/articles/224718548-Care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-)). The affiliate feed has no stock field beyond "Active", no shipping field and only an optional GTIN, so stock, delivery and matching keys have to come from elsewhere.

Every programme needs the advertiser's approval. Pending applications are decided automatically after 15 days by matching declared traffic sources, so Pretoscop must declare "price comparison / price history" explicitly. Two terms need attention ([2P Terms](https://2performant.com/terms-conditions/)): Each advertiser may have **at most five affiliates sending traffic through Google CSS**. ToS §9 forbids using platform data "to create a database of their own and/or an information service". Read literally, that covers a price-history archive built from feed prices, so get written clearance before relying on feeds for history.

The model works in practice. The fashion comparison site pricealert.ro logged **10,824 sales** in Business League Round 3 (5–25 October 2026), up 21.7% year on year ([Business League Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/)).

**Profitshare** still belongs to the eMAG group, because 2Performant's takeover lapsed automatically on 6 August 2025 ([gadget.ro](https://gadget.ro/surpriza-verii-platforma-de-marketing-afiliat-2performant-a-anuntat-ca-nu-mai-cumpara-profitshare-romania-si-bulgaria/); [Mobilissimo](https://www.mobilissimo.ro/stiri-diverse/emag-mizeaza-pe-dezvoltarea-interna-a-profitshare-si-lanseaza-initiative-dedicate-partenerilor-in-urma-neconcretizarii-tranzactiei-cu-2performant-platforma-ramane-una-in-house)). Its active directory has about 61 programmes ([Profitshare](https://profitshare.ro/affiliate-programs)).

eMAG's own programme, in terms modified 27/10/2025, excludes sites "construite sub forma unor comparatoare de preturi, agregatoare de produse" (built as price comparators or product aggregators). It also excludes those that "preiau automat informatii … fara acordul acestora (ex site-uri comparatoare de preturi, plugin-uri de browsere)" (automatically take information without consent, e.g. price-comparison sites, browser plugins). PPC, cashback and coupon sites are banned too ([Profitshare – eMAG](https://profitshare.ro/affiliate-programs/retail/emag)). Fashion Days, also eMAG group, goes further and bans "comparatoare de preturi sau istoric preturi" (price comparators or price-history sites) ([Profitshare – Fashion Days](https://profitshare.ro/affiliate-programs/fashion/fashiondays)).

Other networks fill gaps, but not the electronics hole. Awin carries Douglas RO (5%), Samsung RO (up to 2%) and Xiaomi RO (up to 5%), each with a 30-day cookie ([Awin – Douglas_RO](https://ui.awin.com/merchant-profile/16122); [Awin – Samsung RO](https://ui.awin.com/merchant-profile/21720); [Awin – Xiaomi RO](https://ui.awin.com/merchant-profile/118223)). CJ carries About You, Answear and Notino, while Tradedoubler and CityAds carry Modivo and ePantofi ([Affilitizer](https://www.affilitizer.com/programs/aboutyou.ro)). Adtraction does not serve Romania ([Adtraction](https://adtraction.com/)). Amazon has no .ro store, and its replacement for PA-API, the Creators API, requires 10 qualifying sales in 30 days ([Amazon](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)).

The result is a hole in electronics. Altex/Media Galaxy, Flanco, cel.ro, iStyle and EuroGSM have no programme on 2Performant, Profitshare or any network Affilitizer tracks ([Affilitizer – altex.ro](https://www.affilitizer.com/programs/altex.ro)). PC Garage is inactive on Profitshare, and the ASUS eShop bans aggregators ([2P – ASUS](https://2performant.com/affiliate-programs/electronics/asus-com/)).

Programmes also churn quickly. Decathlon, the only large retailer that explicitly accepted comparators, closes its programme on **31 October 2026**, one of seven closure notices on 2Performant within four weeks ([2P – Decathlon](https://2performant.com/affiliate-programs/sports-outdoors/decathlon-ro/)). Re-check each programme's status by API before showing its offers. The 2P API exposes per-programme traffic-source flags (yes/maybe/no) and allows 100 requests a minute ([2P API docs](https://doc.2performant.com/)).

### Merchant feeds already exist for PC Garage, Vexio, evoMAG and cel.ro

Compari is feed-based. A listed shop must host an XML or CSV feed: Identifier, Name, Price including VAT, ProductNumber, EanCode, DeliveryCost, DeliveryTime and an optional `MaxCPCMultiplier` bid ([Heureka Help – Compari XML feed](https://sluzby.heureka.sk/help/xml-feed/)). A Compari store page is therefore evidence that the shop maintains such a feed.

PC Garage ([store page](https://www.compari.ro/stores/pc-garage-s173904/)) and Vexio ([store page](https://www.compari.ro/stores/vexio-s41065/)) have Compari store pages. evoMAG and cel.ro appear as merchants on Compari phone pages ([Galaxy S25 Ultra](https://www.compari.ro/telefoane-mobile-c3277/samsung/galaxy-s25-ultra-5g-256gb-12gb-ram-dual-sm-s938-p1170025309/); [Galaxy A56](https://www.compari.ro/telefoane-mobile-c3277/samsung/galaxy-a56-5g-128gb-8gb-ram-dual-sm-a566b-p1182769558/)). No store page was found for eMAG, Altex or Flanco. Domain-restricted searches turned up only other shops' reviewers mentioning them ([compari.ro – FLAX](https://www.compari.ro/stores/flax-s104575/)).

The practical pitch to a merchant has three parts. First, "send us the Google Merchant or Compari feed URL you already have". Second, list free at first. Third, pay later through your existing affiliate programme or a CPC lower than Compari's. Pretoscop should ingest both dialects natively, using Google attribute names as the backbone ([Google product data spec](https://support.google.com/merchants/answer/7052112?hl=en)). Compari's listing rules make useful quality gates: Romanian-language site, prices including VAT, registered business, and cash on delivery ([Heureka Help – Compari registration](https://sluzby.heureka.sk/help/registration/)).

### Polite crawling reaches 17 of 40 shops; verified identity is the gate for the rest

On 27 October 2026 a probe tested 40 retail domains. It used an honest user agent from a UK IP, sent at most six requests per domain, and stopped at the first block.
**Reached: 17 shops.** Twelve served prices in server HTML or JSON: eMAG, IT Galaxy, forit, Libris, Elefant, Bonami, JYSK, Dedeman, Carrefour, Auchan, Flip and Publi24. **Blocked, challenged or unreachable: 22.** This included nearly every electronics specialist ([Altex probe](https://altex.ro/robots.txt); [PC Garage probe](https://www.pcgarage.ro/robots.txt); [evoMAG probe](https://www.evomag.ro/robots.txt)): Altex and Media Galaxy reset HTTP/2 streams behind Akamai; Flanco, PC Garage, Vexio and iStyle served Cloudflare challenges; evoMAG redirected to a CAPTCHA; and cel.ro timed out.

The telling detail is that the same Akamai shops gave Common Crawl's identified CCBot mostly HTTP 200s: about 80% of captures at Altex, 90% at Douglas and 87% at Sephora ([Common Crawl index – Altex](https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=altex.ro&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp)). Access depends on bot reputation and verification, not on robots.txt. Getting in is a business-development task, not an engineering one.

**eMAG** is technically open but too big to mirror. Its product pages carry JSON-LD with price, availability and marketplace seller, plus an embedded `lowest_price_30_days` field ([eMAG product page](https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/)). Its offers sitemaps hold **841 files of 5,000 URLs**, about **4.2M product pages** ([eMAG sitemap index](https://www.emag.ro/sitemaps/offers-available-index.xml)). At one request every three seconds, a full pass over product pages would take about 146 days. A pass over listing pages, which carry about 60 products each, would take 2–10 days. CCBot received HTTP 511 on 455 of 986 captures, which shows throttling exists ([Common Crawl index – eMAG](https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=emag.ro&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp)).

**Bot verification** gives a newcomer an identity that retailers can recognise. Each vendor handles it differently: **Cloudflare** files "price scraping" under its **Data Collection** verified-bot category. It accepts proof by Web Bot Auth signatures (RFC 9421, with an Ed25519 key directory at `/.well-known/http-message-signatures-directory`) or by dedicated IPs with correct reverse DNS. It rejects generic user agents such as python-requests ([Cloudflare policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/); [Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/); [IP validation](https://developers.cloudflare.com/bots/reference/bot-verification/ip-validation/)). Approval took "a few weeks" in 2022 ([Cloudflare blog](https://blog.cloudflare.com/friendly-bots/)). **Akamai** takes registrations ([Akamai](https://www.akamai.com/lp/bot-agent-registration)). **DataDome**, Leroy Merlin's vendor, accepts Web Bot Auth or IP lists, but its ASN method excludes hosts such as Hetzner ([DataDome](https://docs.datadome.co/docs/bot-authentication)). **Fastly** (Dedeman, Hornbach) has a submission form ([Fastly](https://docs.fastly.com/products/bot-management)). **HUMAN** offers bot operators no route, because its customers manage their own allow lists ([HUMAN](https://docs.humansecurity.com/v1/docs/known-bots-and-crawlers)). **IAB/ABC** takes submissions to its spiders list at spiders.bots@auditedmedia.com ([IAB](https://www.iab.com/submit-newly-discovered-spiders-and-bots/)).

Verification proves who the bot is. It does not oblige any shop to let it in, and it does not override contracts.

Use the user agent `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`, plus a `PretoscopBot-Feed/1.0` variant for feeds. Avoid the words "spider" and "crawler", because Elefant's robots.txt disallows those groups ([Elefant robots.txt](https://www.elefant.ro/robots.txt)). Crawl from one to three dedicated IPs with reverse DNS of the form `crawl-N.bot.pretoscop.ro`, published in `ips.json`.

Never crawl from shared egress. A 2026 open-source monitor runs on a home machine "because GitHub's shared IP range gets blocked by these sites' bot detection" ([bf-price-monitor](https://github.com/NaviAndrei/bf-price-monitor)). A Bucharest VPS costs about $6 a month ([ishosting](https://ishosting.com/en/vps/ro)), which helps where shops geo-filter (cel.ro timed out from the UK).

evoMAG's block is the hosting provider's "DISTINCT TRAFFIC FILTER", a proof-of-work check plus reCAPTCHA. Its own FAQ says to e-mail captcha@distinct.ro with the IP and the reason. evoMAG's 2Performant feeds make crawling it unnecessary anyway ([evoMAG probe](https://www.evomag.ro/robots.txt)).

Commercial unblockers cost about $1–1.5 per 1,000 HTTP requests ([Bright Data](https://brightdata.com/pricing/web-unlocker)). Using them against shops that explicitly block bots contradicts the honest-bot policy and moves toward the "acces fără drept" (access without right) risk, so they are excluded here.

### Per-retailer data channels, electronics and appliances (status 27 October 2026)

How to read the tables below: **Affiliate route:** taken from the networks' public pages. **Feed evidence:** a Compari store presence, a feed-only robots path, or a network feed. **Probe:** the honest-bot result of 27 October 2026 from a UK IP. **Terms:** clauses on automated access or reuse. **Channel:** the recommended way in.

| Retailer | Affiliate route | Feed evidence | Probe (27 Oct) | Terms on automation/reuse | Channel |
|---|---|---|---|---|---|
| **eMAG** | Profitshare. Grid 1–20%; commission window 2–15 days (2 for phones, TVs, laptops). **Bans comparators, aggregators, browser plugins, PPC, cashback** ([Profitshare](https://profitshare.ro/affiliate-programs/retail/emag)) | No Compari store; seller-only Marketplace API | Open, served via CloudFront. JSON-LD has seller and MPN but no GTIN. `lowest_price_30_days` embedded. ~4.2M URLs ([robots](https://www.emag.ro/robots.txt)) | T&C 4.2(j) bans "orice robot, algoritm" (any robot or algorithm) for data extraction. 6.2 bans putting Content, which includes prices, outside the site without written consent ([T&C](https://www.emag.ro/help/termeni-si-conditii/)) | Written licence or partnership. Get a legal opinion before any crawl (see decisions) |
| **Altex / Media Galaxy** | None; in-house programme closed about 2022 ([alphablog](https://alphablog.ro/altex-inchide-sistemul-de-afiliere-neseriosi/)) | None found | Akamai HTTP/2 reset. CCBot got 80% (Altex) and 92% (Media Galaxy) 200s ([CC index](https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=mediagalaxy.ro&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp)) | General IP clause only; no robots clause (archived 19 May 2026) ([Wayback](https://web.archive.org/web/20260519043727/https://altex.ro/termeni-conditii/pag/)) | Ask Altex to allowlist the bot in Akamai, or for a feed |
| **Flanco** | Profitshare "inactiv"; absent from 2P ([Profitshare](https://profitshare.ro/affiliate-programs/retail/flanco)) | None found | robots.txt 200, sitemap Cloudflare challenge. Blocks CCBot and AI bots ([sitemap](https://www.flanco.ro/sitemap.xml)) | Bans publishing Content, prices included, outside the site; personal use only (archived 6 Apr 2025) ([Wayback](https://web.archive.org/web/20250406095656/https://www.flanco.ro/termeni-si-conditii)) | Feed or partnership |
| **PC Garage** | Profitshare inactive (1%, 2 days, no feed) ([Profitshare](https://profitshare.ro/affiliate-programs/it-c/pcgarage)) | **Compari store** ([page](https://www.compari.ro/stores/pc-garage-s173904/)) | robots.txt 403, Cloudflare challenge ([probe](https://www.pcgarage.ro/robots.txt)) | Not retrievable (403, no archive) | Ask for its Compari feed URL |
| **evoMAG** | **2P active: 1.5%, 10-day cookie, "peste 15 feed-uri" (15+ feeds), no comparator rule** ([2P](https://2performant.com/affiliate-programs/electronics/evomag-ro/)) | 2P feeds; Compari merchant | Distinct CAPTCHA filter ([probe](https://www.evomag.ro/robots.txt)) | Not read | 2P feed plus written confirmation; e-mail captcha@distinct.ro |
| **cel.ro** | None found ([Affilitizer](https://www.affilitizer.com/countries/ro)) | **Compari merchant** ([page](https://www.compari.ro/telefoane-mobile-c3277/samsung/galaxy-a56-5g-128gb-8gb-ram-dual-sm-a566b-p1182769558/)) | TCP timeout from UK | Not read | Ask for Compari feed; re-test from a Romanian IP |
| **Vexio** | Profitshare: 2%, 5 days, no feed; Google Ads banned ([Profitshare](https://profitshare.ro/en/affiliate-programs/it-c/vexio)) | **Compari store**; robots disallows `/data/feeds*` ([robots](https://www.vexio.ro/robots.txt)) | Sitemap Cloudflare challenge | Not read | Compari feed plus Profitshare |
| **IT Galaxy** | Profitshare 2–10% ([IT&C list](https://profitshare.ro/affiliate-programs/it-c)) | robots disallows `/data/feeds/*` | **Open**: JSON-LD price, EAN in Flixmedia attributes ([robots](https://www.itgalaxy.ro/robots.txt)) | Not read | Polite crawl; written OK for Profitshare |
| **forit** | Profitshare 2% | – | **Open**: JSON-LD with MPN and shipping ([robots](https://www.forit.ro/robots.txt)) | Not read | Polite crawl |
| **iStyle** (Apple) | None found | – | Shopify behind Cloudflare; robots.txt 403 | Not read | Allowlisting or business development |
| **EuroGSM** | None found | – | Reachable; catalogue client-rendered ([robots](https://eurogsm.ro/robots.txt)) | Not read | Playwright-only crawl, or ask for a feed |
| **QuickMobile** | Profitshare inactive; banned comparators ([Profitshare](https://profitshare.ro/affiliate-programs/it-c/quickmobile)) | – | 503 maintenance page ([site](https://www.quickmobile.ro/)) | – | Skip |
| **Flip** (refurbished) | Active 2P advertiser in Q1 2025 ([2P report](https://2performant.com/wp-content/uploads/2025/05/Raport-trimestrial-T1-2025_RO.pdf)) | – | **Open**: one sitemap with 6,869 product URLs; JSON-LD UsedCondition ([sitemap](https://flip.ro/sitemap.xml)) | Not read | Crawl or 2P; keep used prices out of new-product history |
| **Samsung RO / Xiaomi RO** | Awin: up to 2% / up to 5%, 30-day cookies ([Samsung](https://ui.awin.com/merchant-profile/21720); [Xiaomi](https://ui.awin.com/merchant-profile/118223)) | Xiaomi lists product feeds | Not probed | No comparator rule | Awin feeds |
| **ASUS eShop** | 2P 3%. **Bans price and product aggregators; accepts PPC and CSS** ([2P](https://2performant.com/affiliate-programs/electronics/asus-com/)) | – | Not probed | – | CSS only, or omit |
| **Carrefour** | None current found | – | **Open**: Magento JSON-LD; Flixmedia EAN ([robots](https://carrefour.ro/robots.txt)) | Not read | Polite crawl |
| **Auchan** | None found | – | **Open**: public VTEX catalogue JSON of 14.5 KB versus 2.9 MB of HTML, with EAN, list and sale price, stock ([API](https://www.auchan.ro/api/catalog_system/pub/products/search/zahar-pudra-cu-aroma-de-vanilie-dr-oetker-80-g/p)) | Not read | VTEX JSON after reading the terms |

Two technical conclusions follow for the coding agent.
**Matching keys.** eMAG's JSON-LD exposes `mpn` (for example `SM-S741BZVDEUE`) but no GTIN. EAN appears in JSON-LD only at Libris and Bonami, and otherwise sits in Flixmedia attributes, spec tables or platform state. Matching must therefore lean on brand plus MPN, not on EAN alone. **Internal endpoints are off-limits.** Several hobby scrapers call `sapi.emag.ro` and `fenrir.altex.ro` ([emag-altex-scraper](https://github.com/MarianD2-0/emag-altex-scraper)). These are exactly the servers or services "care nu sunt publice" (that are not public) that eMAG's clause 4.2(k) forbids, so Pretoscop must not use them.

### Per-retailer data channels, other categories (status 27 October 2026)

| Retailer | Affiliate route | Comparator / CSS rules | Probe (27 Oct) | Channel |
|---|---|---|---|---|
| **Libris** (books) | 2P 8%, 10 days; feeds updated daily ([2P](https://2performant.com/affiliate-programs/books/libris-ro/)) | **Explicitly allows** "comparatoare de preturi" (price comparators) and cashback. PPC banned; CSS only with approval. **One network at a time** | **Open**: JSON-LD with gtin13/ISBN ([robots](https://www.libris.ro/robots.txt)) | 2P feed (make 2P the single network) |
| **Cărturești** | 2P 9% flat, 31 days ([2P](https://2performant.com/affiliate-programs/books/carturesti-ro/)) | Counts "agregatoare de produse" (product aggregators) as legitimate traffic | Cloudflare 403 | 2P feed |
| **Elefant** | Profitshare inactive ([Profitshare](https://profitshare.com/en/affiliate-programs/retail/elefant)) | **Google Ads and Google CSS banned**; cashback allowed | **Open** if the UA avoids "spider"/"crawler"; barcode in spec table | Polite crawl; no CSS |
| **Notino** | 2P 4%, 30 days; also on CJ ([2P](https://2performant.com/affiliate-programs/beauty/notino-ro/)) | Silent on comparators; SEM, PPC and newsletter banned | Sitemap Cloudflare challenge ([robots](https://www.notino.ro/robots.txt)) | 2P feed after written OK |
| **Douglas** | Awin 5%, 30 days; "Daily updated product data" ([Awin](https://ui.awin.com/merchant-profile/16122)) | No comparator rule on profile | Akamai 403; CCBot got 90% 200s ([CC index](https://index.commoncrawl.org/CC-MAIN-2026-34-index?url=douglas.ro&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp)) | Awin feed |
| **Sephora** | None found | – | Akamai 403; CCBot got 87% 200s ([CC index](https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=sephora.ro&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp)) | Allowlisting request |
| **Dr. Max** (pharma) | 2P: 5% own brand, 2% other, 15 days ([2P](https://2performant.com/affiliate-programs/pharma/drmax-ro/)) | Silent | Cloudflare challenge ([robots](https://www.drmax.ro/robots.txt)) | 2P feed after written OK |
| **Fashion Days** | Profitshare ([Profitshare](https://profitshare.ro/affiliate-programs/fashion/fashiondays)) | **Bans comparators and price-history sites, including plugins**; one network only | Tencent EdgeOne JS challenge | Exclude |
| **Answear** | 2P 7%, 15 days; also on CJ ([2P](https://2performant.com/affiliate-programs/fashion/answear-ro/)) | Silent; Google, Facebook and TikTok ads banned. Listed by comparator pricealert.ro ([partners](https://www.pricealert.ro/magazine-partenere)) | Akamai 403 | 2P feed |
| **About You / Modivo / ePantofi** | CJ and Tradedoubler / Tradedoubler and CityAds ([Affilitizer](https://www.affilitizer.com/programs/modivo.ro)) | Terms behind network logins | About You reachable, but price not in HTML ([robots](https://www.aboutyou.ro/robots.txt)) | Network feeds |
| **Decathlon** | 2P 5%: **accepts comparators, but the programme closes 31 Oct 2026** ([2P](https://2performant.com/affiliate-programs/sports-outdoors/decathlon-ro/)) | – | HTML challenged; sitemaps open, including a marketplace index ([robots](https://www.decathlon.ro/robots.txt)) | Direct feed request |
| **Noriel** (toys) | 2P 7%, 14 days ([2P](https://2performant.com/affiliate-programs/babies-kids-toys/noriel-ro/)) | Google and Facebook Ads not accepted | Cloudflare challenge ([robots](https://noriel.ro/robots.txt)) | 2P feed |
| **Petmart** | 2P 5%, 30 days ([2P](https://2performant.com/affiliate-programs/pet-supplies/petmart-ro/)) | No rules stated | Reachable; product discovery needs JS | 2P feed |
| **Bonami** (home) | 2P 3%, 30 days ([2P](https://2performant.com/affiliate-programs/home-garden/bonami-ro/)) | Silent | **Open**: gtin in JSON-LD, 30-day prior-price text, `product_dead` sitemaps ([index](https://www.bonami.ro/sitemap/sitemap-index.xml)) | 2P feed plus crawl |
| **XXXLutz / Kärcher** | 2P 3% / 5% ([XXXLutz](https://2performant.com/affiliate-programs/home-garden/xxxlutz-ro/); [Kärcher](https://2performant.com/affiliate-programs/home-garden/karcher-com-ro-ro/)) | Silent | Not probed | 2P feeds |
| **Dedeman / JYSK** (DIY, home) | None found | – | **Open**: microdata / JSON-LD prices ([Dedeman](https://www.dedeman.ro/robots.txt); [JYSK](https://jysk.ro/robots.txt)) | Polite crawl |
| **Leroy Merlin / Hornbach** | None found | – | DataDome 403 on HTML, sitemaps open / Fastly client challenge ([robots](https://www.leroymerlin.ro/robots.txt)) | DataDome and Fastly verification, plus a request |
| **OLX / Publi24** (classifieds) | – | Publi24 terms ban public or commercial use and call unauthorised server access a crime ([T&C](https://ajutor.publi24.ro/termeni-si-conditii/)) | OLX 403 even on robots.txt ([probe](https://www.olx.ro/robots.txt)); Publi24 JSON-LD exposes private sellers' names | **Exclude from the MVP** |

The scan of all 378 2Performant programme pages found only one explicit comparator ban, ASUS. It found 18 smaller programmes that explicitly accept comparators or aggregators, among them Krista, Liki24 (which also lists Google CSS partners) and Depozit Solar ([Krista](https://2performant.com/affiliate-programs/babies-kids-toys/krista-ro/); [Liki24](https://2performant.com/affiliate-programs/pharma/liki24-ro/); [Depozit Solar](https://2performant.com/affiliate-programs/home-garden/depozitsolar-ro/)). Programmes that say nothing are not giving permission, because advertisers can restrict any affiliate. Write to Notino, Answear, Dr. Max and Petmart before showing their offers.

For enrichment, **Open Icecat** is the best free specification layer. Romanian is a supported locale (ID 23), and a live test returned Romanian titles and spec labels but an empty marketing description ([Icecat locales](https://iceclog.com/icecat-locales-and-language-code-table/); [live test](https://live.icecat.biz/api?lang=RO&shopname=openicecat-live&icecat_id=56195846)). **Verified by GS1** allows only 30 single-GTIN lookups a day, so it is not a catalogue source ([GS1](https://support.gs1.org/support/solutions/articles/43000734075-how-many-queries-can-a-user-perform-using-the-verified-by-gs1-service-on-gs1-org-)).

## A Postgres-centred stack serves 2M offers for under €1,700 a month

### Matching: a precision-first cascade with LLM checks at cents per thousand pairs

Never merge two offers automatically on GTIN alone. Google tells merchants to put the main product's GTIN on merchant-created bundles and the single item's GTIN on multipacks. It also rejects restricted prefixes (02, 04, 2) and coupon prefixes (05, 98, 99) ([Google Merchant Center – GTIN](https://support.google.com/merchants/answer/6324461)). Even the WDC Products benchmark, whose labels come from identifier clustering, measured about 4% label noise ([WDC Products](https://webdatacommons.org/largescaleproductcorpus/wdc-products/)).

The recommended cascade: (1) **Normalise.** Apply Unicode NFC, map ş→ș and ţ→ț, and convert GTINs to GTIN-14 with a check-digit test and flags for restricted, coupon and demo ranges. Map brands through an alias table, and reduce MPNs to a base form using brand-specific suffix rules. (2) **Link deterministically.** Match a trusted GTIN or brand + base MPN, but only if hard-constraint attributes agree. (3) **Generate candidates.** Use an inverted index on brand and model tokens, pg_trgm on compact model codes, and pgvector HNSW kNN on `halfvec` embeddings, returning the top 10. (4) **Score.** Features: GTIN trust, MPN equality, model-token overlap, an attribute-agreement vector, embedding cosine, price ratio against the product median (flag outside 0.5–1.8×), image perceptual hash and shop trust. (5) **Route.** At probability ≥0.97 with no conflict, match automatically; at ≤0.30, reject. The grey zone goes to Claude Haiku 5.5 through the Batch API, escalating to Sonnet 5.5, and whatever is still unsure goes to a human review queue. (6) **Hold back the unmatched.** Offers with no acceptable candidate become provisional products, kept `noindex` until they have two offers.

| Category | Hard constraints (must be equal when both present) |
|---|---|
| Smartphones / tablets | Storage, RAM, edition (Pro/Max/Plus/Ultra/FE), Wi-Fi vs cellular, generation |
| Consoles | Digital vs disc, Slim vs original, storage; bundle content sets a bundle flag |
| Laptops | CPU, RAM, SSD, GPU, screen size, keyboard layout (RO/US) |
| TVs / monitors | Diagonal, panel technology, model-year code |
| Appliances | Capacity (kg/l), width, energy class, model code |

The Romanian lexicon covers: **condition:** resigilat, recondiționat, refurbished, second-hand; **accessories:** husă, folie, încărcător, "pentru <model>"; and **bundles:** "+ joc", pachet, "set 3 buc".

Parse prices as "1.299,99 lei" (dot for thousands, comma for decimals). Getting this wrong is a classic source of 1,000× errors.

**Evidence that LLM verification works.** On the hard WDC Products benchmark, zero-shot GPT-4 reached **89.61 F1**, against **84.90** for the fine-tuned Ditto model. GPT-4o-mini reached 81.15, so model size matters on corner cases ([Peeters, Steiner & Bizer, EDBT 2025](https://arxiv.org/abs/2310.11244)). idealo clusters offers with Sentence-Transformers and Faiss ([PyCon DE 2022](https://pycon.de/archive/2022/talks/transformer-based-clustering-identifying-product-clusters-for-e-commerce/)). Heureka runs a "One Matching" team using classic ML and LLMs ([Heureka](https://join.heureka.group/cs/jobs/machine-learning-engineer)).

**Cost is not the constraint** ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)).
**List prices (Oct 2026):** Haiku 5.5 costs $0.10 in / $0.50 out per million tokens, Sonnet 5.5 $2 / $10, and the Batch API halves both. **Per 1,000 pairs:** with a cached 2,000-token instruction prompt, verification costs about **$0.043 on Haiku Batch**, or $0.019 when ten candidates share one request, and $0.75 on Sonnet Batch. **Per month (estimated):** **$4–12 at 50k offers**, $36–120 at 500k and $140–480 at 2M. One-time backfills cost about $12–40, $120–400 and $480–1,600. This assumes about 1% of offers are new or changed each day.

**Targets.** The design targets are ≥99.5% precision on automatic matches and 90–97% automatic coverage. Both are unproven until measured on an internal set of at least 2,000 labelled Romanian pairs.

### Catalog and images: Google taxonomy, Open Icecat, licensed pictures only

**Taxonomy.** Use Google's Romanian product taxonomy as the backbone. It is frozen at version 2021-09-21, so extend it with deeper nodes, and store each node's Google ID for later CSS exports ([taxonomy ro-RO](https://www.google.com/basepages/producttype/taxonomy-with-ids.ro-RO.txt)).

**Variants and markup.** Model products as families containing variants, with one indexable page per variant. Mark each page up with `AggregateOffer` (`lowPrice` and `priceCurrency` required, `highPrice` and `offerCount` recommended). Google explicitly says not to use `AggregateOffer` across variants ([Google – product snippet](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)).

**URLs.** Use `/p/{brand}-{model}-{variant}-{shortid}` and redirect with a 301 on merges. Mark search results and arbitrary facet combinations `noindex`.

**Open Icecat** is free for sponsoring brands, but its licence has teeth ([Fair Use Policy](https://iceclog.com/open-icecat-fair-use-policy/); [Open Content License](https://iceclog.com/open-content-license/)): **Attribution:** show "Specs Icecat" with a link, a database-right notice and an "AS IS" disclaimer. **Volume:** at most 1M data-sheet downloads a month per locale, then €0.30 per 1,000. **Commercial use:** no fee may be charged for the content itself, and a share-alike clause applies, so any B2B data product must exclude Icecat-derived content. **AI:** no machine-learning training or "automated synthetic content creation". **Robots.txt:** it must exclude crawlers that copy for AI training, analytics or content aggregation.

**Images.** Store and resize only licensed images (Icecat with attribution, feed images under programme terms, manufacturer kits), for example as AVIF/WebP derivatives on Cloudflare R2 at $0.015/GB-month with no egress fees ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Never re-host photos crawled from retailers. Under *Renckhoff*, posting a photo copied from another site is a new communication to the public that needs authorisation ([EUR-Lex C-161/17](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0161)). Affiliate programmes such as Vexio's allow only "materialele de promovare oficiale" (official promotional materials) ([Profitshare – Vexio](https://profitshare.ro/en/affiliate-programs/it-c/vexio)).

### Price history: change-only events keep years of data in a few gigabytes

**How often prices change.** Scraped online prices change on **1.3–2.6% of products per day** (0.024 in the US) ([Cavallo, NBER WP 21490](https://www.nber.org/papers/w21490)). Pricy's own 35-day sample found 32% of offers changed price at least once ([Pricy – Presă](https://www.pricy.ro/presa)).

**Design, in PostgreSQL 18.** **`offer`** holds the current state: price, old price, shipping, final price, availability and seller, plus a `state_hash`, `last_seen_at` and `last_changed_at`. **`price_event`** is append-only and written only when `state_hash` changes. It is partitioned monthly on `observed_at`, with a BRIN index (autosummarize on) and primary key `(offer_id, observed_at)` ([PostgreSQL BRIN](https://www.postgresql.org/docs/current/brin.html)). **`product_day`** is a rollup: minimum, median and maximum *final* price across in-stock new-condition offers, plus the cheapest offer. **Raw observations** go to object storage as Parquet or NDJSON for 30–90 days, for replays. **Prices** are stored as integer bani (RON minor units).

| Offers tracked | Daily snapshots per year | Change-only rows per year (2.4%–10% daily change) | `product_day` rows per year |
|---|---|---|---|
| 50k | 18.3M (≈2 GB) | 0.44–1.8M (≈0.05–0.2 GB) | 6.1M |
| 500k | 182.5M (≈19 GB) | 4.4–18.3M (≈0.5–2 GB) | 61M |
| 2M | 730M (≈77 GB) | 17.5–73M (≈1.9–7.7 GB) | 243M (≈25 GB) |

**Engine choices.** One Postgres node is enough. TimescaleDB is an optional later upgrade: its compression and continuous aggregates are free only when self-hosted ([Tiger Data](https://www.tigerdata.com/docs/about/latest/timescaledb-editions)), and Supabase has deprecated the extension on PostgreSQL 17 ([Supabase](https://supabase.com/docs/guides/database/extensions/timescaledb)). ClickHouse is premature.

**Final price.** Compute it as price plus the cheapest home-delivery method, with a toggle for locker delivery, and show "preț + transport = preț final" (price + shipping = final price). By default, never rank resigilat (open-box), refurbished or used offers against new ones.

**Fake-discount heuristics.** Run these only once Pretoscop's own history covers at least 30 days for that offer, and keep the raw evidence: **Reference not supported:** the shop's displayed old price is more than 2% above the lowest price Pretoscop observed *at that shop* in the 30 days before the discount. **Raise then cut:** the maximum over days −30 to −3 is at least 15% above the median of days −60 to −31, and the "discounted" price is at least 97% of that earlier median. **Phantom old price:** the old price was never actually observed in the last 90 days. **Irrelevant discount:** a claimed discount above 30% while the price is at or above the cross-shop median.

**Anomaly guards** for the ingestion layer: Reject prices of 1 RON or less. Quarantine any price more than 3× or less than ⅓ of the offer's 14-day median, re-crawl within 1–2 hours, and publish only when two observations agree. Ratios near 10, 100 or 1,000 usually mean a separator bug. Hold an entire run if more than 20% of a shop's offers move by more than 50%.

None of this can be backfilled honestly, so collection must start before launch.

### Crawling and search run on boring, well-documented tools

**Orchestration.** Run workers on **pg-boss 12.x**, a Postgres-backed queue with cron, singleton keys for debouncing, dead-letter queues and OpenTelemetry since 12.36 ([pg-boss releases](https://github.com/timgit/pg-boss/releases)). Crawl with **Crawlee 3.18.x**, which handles robots.txt, sitemap indexes and Playwright fallback only where needed; 4.0 is still a release candidate ([Crawlee releases](https://github.com/apify/crawlee/releases)).

**robots.txt.** Under RFC 9309, cache robots.txt for at most 24 hours and treat a 5xx response as complete disallow. Crawl-delay is not part of the standard, but honouring it is what verified-bot programmes expect ([RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)).

**Throughput is set by politeness, not hardware.** One request every 3–5 seconds per domain gives **17,280–28,800 requests a day**. That is enough for roughly 0.7–1.7M price observations a day from listing pages at 40–60 offers each, but only 17–29K product pages. So refresh prices from listing pages. Fetch product pages only on discovery, on a price mismatch or monthly, and use sitemaps for discovery and delisting (eMAG's `offers-unavailable-index`, Bonami's `product_dead` files).

**Feed pipeline.** Each run fetches with a conditional GET and skips any file whose sha256 has already been seen. It then stream-parses, upserts offers on `(shop_id, shop_sku)` and writes change events. Finally it matches, recomputes aggregates, evaluates alerts and syncs search.

An offer becomes inactive only after two consecutive full-size runs miss it. If a feed's row count drops more than 30% against its 7-day median, hold the run.

**Block handling.** Treat all of the following as a block and back off for at least 24 hours: 403, 429, 503, 511, `cf-mitigated: challenge`, HTTP/2 stream resets, CAPTCHA redirects, and HTTP-200 interstitial pages. Never auto-follow a redirect to a CAPTCHA host. Never use stealth tooling (nodriver, Camoufox, undetected-chromedriver, playwright-stealth), even though several Romanian hobby scrapers rely on it to get past PC Garage and Flanco ([bf-price-monitor](https://github.com/NaviAndrei/bf-price-monitor)).

**Freshness targets:** at least 95% of active offers observed within 26 hours, and the 10% most-viewed products within 6 hours. Show a per-offer "actualizat la …" (updated at …) timestamp.

**Search.** Self-host **Meilisearch Community Edition 1.56** (MIT, released 26 October 2026) ([releases](https://github.com/meilisearch/meilisearch/releases)).
**Diacritics:** its Latin pipeline decomposes characters, lowercases and strips non-spacing marks, so "ș", the legacy cedilla "ş" and plain "s" all fold together ([Meilisearch – language](https://www.meilisearch.com/docs/learn/what_is_meilisearch/language)). Normalise at ingest anyway: Windows-1250 data uses U+015F, while Unicode prefers U+0219 for Romanian ([Unicode L2/13-225](https://www.unicode.org/L2/L2013/13225-commas.html)). **Plurals:** Meilisearch documents no stemming. Add a few hundred synonyms (televizor / televizoare / televizorul) and per-product aliases generated with PostgreSQL's `romanian_stem` dictionary ([PostgreSQL docs](https://www.postgresql.org/docs/current/textsearch-psql.html)). **Model codes:** disable typo tolerance on model numbers, because "s928b" and "s921b" are different phones. **Alternative:** Typesense, but with `locale: ro` it preserves diacritics, which needs tuning ([Typesense](https://typesense.org/docs/guide/locale.html)).

| Layer | Default (Oct 2026) | Why / rejected alternative |
|---|---|---|
| Language | TypeScript everywhere; Python sidecar only for embeddings and ML | One language for web, workers, extension and bot |
| Web / SSR | Next.js 16.3.x App Router, self-hosted in Docker behind Cloudflare ([Next.js](https://nextjs.org/blog?page=1)) | Vercel ISR would cost ≈$300–600/month at 2M offers and bills bot traffic ([Vercel](https://vercel.com/pricing)) |
| Database | PostgreSQL 18 + pg_trgm + unaccent + pgvector 0.8.7 + pg_partman ([pgvector](https://github.com/pgvector/pgvector)) | One store for catalogue, history, queue and vectors; ClickHouse premature |
| ORM | Drizzle 0.45.x (1.0 still RC), or Prisma 7, plus hand-written SQL for partitions | – |
| Jobs / crawl | pg-boss 12.x; Crawlee 3.18.x | Temporal, Airflow, Celery add infrastructure |
| Search | Meilisearch CE 1.56 | Elasticsearch / OpenSearch too heavy for two people |
| LLM | `claude-haiku-5-5` (Batch) for verification; `claude-sonnet-5-5` for escalations | Opus only to adjudicate the gold evaluation set |
| Auth | Better Auth; Auth.js is now maintained by the Better Auth team ([Better Auth](https://www.better-auth.com/blog/authjs-joins-better-auth)) | Clerk (lock-in) |
| E-mail / push | Amazon SES at $0.10 per 1,000 ([SES](https://aws.amazon.com/ses/pricing/)); Web Push, which works on iOS 16.4+ for home-screen apps ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)); Telegram bot, broadcasts ≈30 msg/s ([Telegram](https://core.telegram.org/bots/faq)) | – |
| Errors / traces | Sentry: free, then Team at $29/month ([Sentry](https://sentry.io/pricing/)); OpenTelemetry | – |
| Delivery | GitHub Actions → container registry → Hetzner; pgBackRest/WAL-G backups to object storage | Provider snapshots alone |

Suggested repository layout: `apps/web`, `apps/worker`, `apps/extension`, `apps/bot`, `packages/db`, `packages/core` (normalisers, GTIN, matching rules, shipping calculator), `packages/extractors` (per-shop extractors with HTML fixtures and snapshot tests) and `services/ml`.

### Hosting costs after Hetzner's 2026 repricing

Hetzner raised prices across the board on 1 April 2026. On 15 June 2026 it raised new-order prices for its performance cloud lines again, for example CPX22 from €7.99 to €19.49 and CCX23 from €31.49 to €85.99 ([Hetzner price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)). Dedicated servers are now the value option: **AX41-1-LTD / EX44-1-LTD at €57.30**, AX42-1 at €97.30 and AX102-1 at €257.30 a month ([Hetzner](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/); [AX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-ax/)). Object storage costs €6.49 a month including 1 TB ([Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)).

Hetzner has no Romanian location ([Hetzner locations](https://docs.hetzner.com/cloud/general/locations/)). Serve anonymous pages from the Cloudflare edge, and add a small Bucharest VPS as a dedicated crawl egress IP.

| Monthly line item | 50k offers | 500k offers | 2M offers |
|---|---|---|---|
| Hetzner dedicated servers | 1× AX41/EX44-LTD, €57.30 | AX42 + AX41-LTD, €154.60 | AX102 + AX42 + 2× AX41-LTD, €469.20 |
| Object storage, Cloudflare, R2 | ≈€7 + $0–6 | ≈€7 + $5–11 | ≈€7–15 + $12–35 |
| E-mail (SES) and Sentry | ≈$0.5 | ≈$10 + $29 | ≈$50 + $89 |
| LLM matching (Claude Batch) | $4–12 | $36–120 | $140–480 |
| **Estimated total** | **≈€70–100** | **≈€230–385** | **≈€760–1,630** |

These totals follow the research cost model. That model also budgeted $0–300 a month for proxies, which the no-evasion policy removes. Add about $6 for a Romanian egress VPS. A managed equivalent at 500k offers costs about **$500–1,100** a month, for example Supabase Pro with XL compute at about $236 plus Vercel and Railway ([Supabase pricing](https://supabase.com/pricing)). The hard limits are crawl permission and founder time, not infrastructure.

### Extension and owned channels

**Build.** Ship a Manifest V3 extension whose content scripts match only supported shop domains. It reads the product identity (JSON-LD `sku`, `gtin13`, `mpn`), asks a CDN-cached `GET /v1/lookup` endpoint, and renders a Shadow-DOM card showing the 30-day low, the all-time low and the best other offers. Request only `storage` plus host access to the API, never `tabs`, `history` or `<all_urls>`.

**Affiliate links.** Chrome forbids affiliate links "without related user action", and listing violations include inserting them "when no discount, cashback, or donation is offered" ([Chrome Web Store – affiliate ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)). Link to Pretoscop's own product page, where the disclosed affiliate links live. Publish a Limited Use statement ([Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)).

**Other browsers.** Firefox needs `background.scripts` in place of a service worker ([MDN](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)). Safari needs the $99-a-year Apple Developer Program ([Apple](https://developer.apple.com/support/enrollment/)).

**Crowd-sourced prices.** Price reports from users' browsers should be opt-in and used only as a signal that schedules a verification crawl. On shops whose terms forbid automated extraction, such as eMAG, gathering prices through users' browsers is arguably the same act. eMAG's affiliate terms name "plugin-uri de browsere" (browser plugins) explicitly. The legal exposure of overlays was not researched and needs counsel.

## The law lets a comparator judge discounts but demands disclosure, consent and restraint

### Collection: database right, contract and Criminal Code art. 360 set the boundary

**Database right.** A shop's product and price catalogue is very likely protected by the EU's sui generis database right. Art. 7(5) also catches "repeated and systematic extraction" of small parts where it conflicts with the database's normal exploitation ([Directive 96/9/EC art. 7](https://www.legislation.gov.uk/eudr/1996/9/article/7)). In *CV-Online Latvia* (C-762/19, 3 June 2021), the CJEU held that a specialised search engine copying and indexing a freely accessible database does extract and re-use it. The maker can prohibit this, however, only where it adversely affects the maker's investment, meaning there is a risk to recouping that investment through normal operation of the site ([SCL](https://www.scl.org/12290-cjeu-search-engine-copying-of-databases-infringes-sui-generis-right-where-it-adversely-affects-database-maker-investment/); [EUR-Lex C-762/19](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0762)). A comparator that shows a few facts per offer and sends traffic to the shop is the low-risk pattern. A real-time meta-search that replicates the shop's own search, the *Innoweb* pattern, is the high-risk one.

**Contract.** Where data is not protected at all, *Ryanair* (C-30/14) lets the site's terms restrict its use by contract ([EUR-Lex C-30/14](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62014CJ0030)).

**Text and data mining.** The TDM exception in DSM Art. 4 covers copies made for analysis. It does not cover republishing current prices, and it falls away when the rightholder has reserved rights in a machine-readable way ([Directive 2019/790 art. 4](https://www.legislation.gov.uk/eudr/2019/790/article/4)).

**eMAG's terms** are the sharpest constraint ([eMAG T&C](https://www.emag.ro/help/termeni-si-conditii/)): protected "Conținut" (content) explicitly includes "tarifele practicate" (the prices charged); clause 4.2(j) bans robots for data extraction; 6.2 bans including content outside the site without written consent; 6.4 limits use to "scopuri personale sau non-comerciale" (personal or non-commercial purposes); and 15.6 claims acceptance merely "prin … utilizarea Continutului" (by using the content).

Whether these terms bind a crawler that never registers is an open legal question, but *Ryanair* keeps a contract claim alive. Flanco's archived terms carry the same republication ban, and Publi24 calls unauthorised server access a criminal offence ([Flanco T&C, archived](https://web.archive.org/web/20250406095656/https://www.flanco.ro/termeni-si-conditii); [Publi24](https://ajutor.publi24.ro/termeni-si-conditii/)).

**Criminal law.** Romania's Criminal Code art. 360 punishes access without right with 3 months to 3 years in prison. The range is 6 months to 5 years when the aim is to obtain data, and **2 to 7 years where access is restricted "prin intermediul unor proceduri, dispozitive sau programe specializate"** (through specialised procedures, devices or programs) ([legeaz.net](https://legeaz.net/noul-cod-penal/art-360)). Bot challenges and IP blocks therefore carry legal weight, not just technical weight. Log robots.txt compliance, rate limits and stop-on-block events as evidence of good faith.

**Personal data.** Marketplace sellers' names can be personal data, so do not ingest reviews or private sellers' identities.

### Display: Article 6a binds the shops, the UCPD binds Pretoscop

**Who carries the 30-day rule.** The Commission's guidance on the prior-price rule says Art. 6a "does not apply to the intermediaries … that merely aggregate and display information about the prices provided by other sellers (price comparison platforms)". Such intermediaries remain subject to professional diligence ([Commission Art. 6a Guidance, 2021/C 526/02](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(06))).

The duty therefore sits with the shops. Under HG 947/2000, as amended by HG 686/2022 and in force since 28 May 2022, a shop announcing a reduction must show "cel mai scăzut preţ practicat de vânzător în perioada ultimelor 30 de zile" (the lowest price the seller charged in the last 30 days) ([gadget.ro](https://gadget.ro/de-azi-28-mai-comerciantii-sunt-obligati-sa-afiseze-in-cazul-reducerilor-ofertelor-si-cel-mai-mic-pret-practicat-in-ultimele-30-de-zile/)). ANPC enforces it. In 2021 it fined eMAG 50,000 lei, partly for not stating when the 30-day window began, and Altex 50,000 lei over more than 1,000 price discrepancies ([TVR Info](https://tvrinfo.ro/anpc-a-amendat-emag-cu-50-000-de-lei-pentru-nereguli-in-timpul-black-friday-emag-aspectele-sesizate-au-fost-rezolvate_894691/); [Economica](https://www.economica.net/reduceri-false-la-peste-1-000-de-produse-de-black-friday-la-altex-retailerul-a-fost-amendat-de-anpc-cu-50-000-de-lei-se-propune-suspendarea-activitatii-pana-la-incetarea-practicii-comerciale-inc_542552.html/amp)).

**Pretoscop's own badges fall under the UCPD.** Claims such as "cel mai mic preț din 30 de zile" (lowest price in 30 days), "−20% vs median" or "best deal" must state their basis next to the claim. They must not look like a seller's markdown, because a comparison "perceived by an average consumer as a price reduction" can breach both regimes (same guidance, §3).

**Ranking disclosure.** UCPD Art. 7(4a) requires the main ranking parameters, and their relative importance, to be published in a section directly reachable from the results page ([Directive 2019/2161 art. 3](https://www.legislation.gov.uk/eudr/2019/2161/article/3)). The Commission confirms this applies to "comparison tools" ([UCPD Guidance, 2021/C 526/01](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(05))).

**Paid placement.** Annex I point 11a makes undisclosed paid ranking always unfair, and the guidance counts "increased commission per transaction" as indirect payment. If commission rates influence ranking, label each affected result "Anunț" or "Promovat" (ad, promoted); otherwise keep commission out of the ranking. A French court found a comparator's paid top-ranking misleading (Cass. com. 2012, *Leguide.com*, cited in the same guidance).

**The Commission's Key Principles add more** ([Key Principles PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)): disclose the business model ("pay-per-click", "pay-per-order/commission") on a page reachable from every page; state coverage ("the number of products and suppliers compared"); rank by final price including delivery; and show "the time of the last update".

**Fines.** Misleading practices cost 5,000–100,000 lei per finding ([OG 37/2015](https://legeaz.net/monitorul-oficial-654-2015/og-37-2015-modificarea)), and coordinated EU actions can reach up to 4% of turnover ([TaxNews, OUG 58/2022](https://taxnews.ro/tag/oug-58-2022/?print=pdf)).

**Fake-discount wording.** Make the flag factual and reproducible: "Prețul de referință afișat de magazin (X lei) este mai mare decât cel mai mic preț observat de Pretoscop în ultimele 30 de zile (Y lei, la data Z)" (The reference price shown by the shop, X lei, is higher than the lowest price Pretoscop observed in the last 30 days, Y lei on date Z). Publish the methodology and offer merchants a correction channel. This limits defamation and unfair-competition exposure.

### Platform duties: P2B toward paying merchants, DSA basics and a 45-day ANCOM notice

**P2B Regulation.** It covers intermediation offered to business users under contract, "irrespective of where those transactions are ultimately concluded" ([P2B art. 2](https://www.legislation.gov.uk/eur/2019/1150/article/2)). Merchants with CPC or feed terms therefore trigger the duties on terms and conditions (Art. 3) and on ranking parameters, including the effect of paid ranking (Art. 5). Small enterprises are exempt from the internal complaint-handling system ([P2B art. 11](https://www.legislation.gov.uk/eur/2019/1150/article/11)).

**DSA.** Merchant feeds and any user reviews make Pretoscop a hosting service. Micro and small platforms are exempt from the Section 3 platform duties ([DSA art. 19](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_19.html)), but contact points, terms and notice-and-action still apply.

**ANCOM notice.** Romania's Law 50/2024 makes ANCOM the Digital Services Coordinator and requires providers to **notify ANCOM within 45 days of starting the service** ([Law 50/2024](https://legeaz.net/monitorul-oficial-232-2024/lege-50-2024)): failing to notify costs 5,000–30,000 lei; substantive breaches run from 5,000 lei up to 6% of turnover, capped at 5,000–100,000 lei in the first year of activity; and a supervision fee can be charged only from 1 January 2027.

**Accessibility.** The European Accessibility Act (Law 232/2022) covers "e-commerce services" concluded with consumers. A redirecting comparator is arguably outside it, and microenterprises (under 10 staff, at most €2m turnover) are exempt ([Law 232/2022](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)). Build to WCAG 2.2 AA regardless, including text alternatives for price charts.

### Alerts and cookies: a price-drop e-mail is direct marketing

**E-mail consent.** Law 506/2004 art. 12(1) prohibits commercial e-mail unless the subscriber "şi-a exprimat în prealabil consimţământul expres" (has given prior express consent). Every message must identify the sender and carry a valid opt-out ([art. 12](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-12)). Fines run 5,000–100,000 lei, or up to 2% of turnover above 5M lei ([art. 13](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-13)).

**Why alerts count.** In *Inteligo Media* (C-654/23, 13 November 2025, a Romanian reference), the CJEU treated even an informative newsletter, sent individually for a commercial purpose, as direct marketing ([Matheson](https://www.matheson.com/insights/cjeu-clarifies-direct-marketing-rules-under-eprivacy-directive/)). Price alerts carrying affiliate links therefore need: an unticked, specific opt-in at the moment the alert is set; double opt-in; a consent log recording time, IP and the exact wording; and a one-click unsubscribe, per alert and global.

ANSPDCP fined Elefant 10,000 lei because it could not prove consent ([StartupCafe](https://startupcafe.ro/elefant-ro-magazin-online-amenda-gdpr-htm-11321)). It fined an online toy shop €3,000 in January 2026 for e-mailing a customer who had objected ([StartupCafe](https://startupcafe.ro/nu-e-de-joaca-magazin-online-de-jucarii-amendat-cu-3-000-de-euro-pentru-ca-a-trimis-e-mailuri-nesolicitate-unui-client-92629)).

**Cookies.** ANSPDCP keeps fining small sites under art. 4(5) for non-essential cookies set without consent: iHunt 20,000 lei, an AI-tools directory 30,000 lei, and Aviziero 5,000 lei in June 2026 ([Economedia](https://economedia.ro/producatorul-de-telefoane-ihunt-amendat-cu-20-000-de-lei-pentru-stocarea-de-module-cookies-pe-dispozitivele-clientilor-fara-acordul-lor.html); [StartupCafe](https://startupcafe.ro/date-personale-site-romanesc-care-ajuta-la-gasirea-aplicatiilor-ai-potrivite-amendat-cu-aproape-6-000-eur-pentru-cookie-uri-89148); [StartupCafe](https://startupcafe.ro/platforma-online-pentru-asociatiile-de-proprietari-din-romania-amendata-cu-mii-de-lei-pentru-cookie-uri-102362)). The Senate **rejected** the "reject all" bill L256/2026 by 96 to 9 on 2 June 2026, and it now sits with the Chamber of Deputies ([Senate record](https://www.senat.ro/legis/lista.aspx?nr_cls=L256&an_cls=2026)). Build equal Accept and Reject buttons on the first layer anyway, since ANSPDCP already enforces prior consent.

**Analytics and tracking.** The EDPB treats affiliate tracking links and IP-based tracking as potentially within ePrivacy Art. 5(3) ([EDPB Guidelines 2/2023](https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf)). Use self-hosted or EU-hosted cookieless analytics loaded after consent. Use GA4 with Consent Mode only if Google Ads attribution needs it. The EU–US Data Privacy Framework survived the General Court's *Latombe* ruling on 3 September 2025, with appeal C-703/25 P pending ([WilmerHale](https://www.wilmerhale.com/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework)).

### Company and tax: an SRL funded above RON 500, on profit tax at first

**Why an SRL.** Pretoscop needs one legal person to: invoice 2Performant, Profitshare and Google Ireland; sign merchant contracts; and carry the P2B, DSA and ANCOM duties.

**Why not personal payouts.** An individual can register on 2Performant and be paid with 10% income tax withheld ([2P help](https://support.2performant.com/ro/hc/en-us/articles/115003981607-cum-creez-un-profil-de-plata-)). However, affiliate promotion is a service, and the Fiscal Code expressly excludes services from "venituri din alte surse" (income from other sources, art. 114(2)(g)). Regular affiliate income is therefore independent-activity income, which requires PFA registration before the activity starts ([ANAF Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm); [ANAF Ploiești](https://static.anaf.ro/static/10/Ploiesti/venituri_pf_activ_independente.pdf)). Profitshare says regular earners "au obligaţia de a se autoriza" (are obliged to register) ([Profitshare terms](https://profitshare.ro/en/affiliate-signup)). Route all revenue through the SRL from day one.

**Formation.** **Capital:** new SRLs need at least **RON 500** of share capital, and RON 5,000 once turnover passes RON 400,000 (Law 239/2025) ([NNDKP](https://www.nndkp.ro/wp-content/uploads/2025/12/NNDKP-Corporate-Legal-News_December-2025.pdf)). **Filing:** online with ONRC ([ONRC](https://www.onrc.ro/index.php/ro/inmatriculari/persoane-juridice)), about RON 152 in fees and 3–5 working days according to a commercial provider ([Bono](https://bono.ro/blog/costuri-infiintare)). **Registered office:** a founder's flat works under a loan-for-use contract plus the administrator's declaration under Law 31/1990 art. 17(6) ([ONRC](https://onrc.ro/index.php/ro/inmatriculari/persoane-juridice/reg-autonome?id=1130)). **Bookkeeping:** typically RON 200–500 a month ([Bono](https://bono.ro/blog/pret-contabilitate-srl)).

**The Law 239/2025 trap.** If net assets fall below half of share capital, the company cannot repay shareholder loans, and fines for this apply from 2027 ([NNDKP](https://www.nndkp.ro/wp-content/uploads/2025/12/NNDKP-Corporate-Legal-News_December-2025.pdf)). With RON 500 of capital, first-year losses trigger the rule almost at once. Put founder funding in as capital, not loans.

**Micro-enterprise regime.** **Rate and ceiling:** 1% tax on revenue, available up to **€100,000** of revenue (RON 509,850), counting linked enterprises. **Employee condition:** at least one employee. A full-time contract, part-time contracts adding up to one full-time equivalent, or a mandate paying at least the minimum wage all count. **Since OUG 8/2026 (25 February 2026),** a new company has **90 days inclusive** from registration to hire that employee. If it misses the window, it owes 16% profit tax from the following quarter ([ANAF Brașov comparison table](https://static.anaf.ro/static/10/Brasov/Brasov/legea_227_III.pdf)). **Above the ceiling:** profit tax at **16%**, with losses carried forward for 5 years up to 70% of later profit ([ANAF Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm)).

**Taking money out.** Dividends are taxed at **16% from 2026** ([Contzilla](https://www.contzilla.ro/dividende-in-2026-cota-restrictii/)), plus health contribution (CASS) of 2,430, 4,860 or 9,720 lei by income band ([ContApp](https://contapp.ro/blog/plafoane-fiscale-2026-pentru-pfa-ii-si-microintreprinderi/)). The minimum gross wage rose to **RON 4,325 from 1 July 2026**, an employer cost of about RON 4,418 a month ([StartupCafe](https://startupcafe.ro/salariul-minim-2026-in-monitorul-oficial-hg-146-96219)).

**Two 50/50 founders** each hold more than 25%, so neither may own another micro-regime company.

An illustrative model in the research (business costs at 10% of revenue, two founders splitting 50/50, 2026 rates) gives this annual state take:

| Annual revenue (≈ per month) | Micro SRL + 1 minimum-wage employee | Profit-tax SRL, no employee | Two PFAs |
|---|---|---|---|
| €12k (€1k) | ~RON 21.7k (39.5% of profit) | ~16.2k (29.4%) | ~10.5k (19.0%) |
| €24k (€2k) | ~35.9k (32.6%) | ~37.3k (33.9%) | ~42.8k (38.9%) |
| €60k (€5k) | ~78.5k (28.5%) | ~100.5k (36.5%) | ~96.1k (34.9%) |
| €100k (€8.3k) | ~109.6k (23.9%) | ~154.5k (33.7%) | ~130.9k (28.5%) |
| €120k (€10k) | not available (ceiling) | ~181.5k (33.0%) | ~148.4k (26.9%) |

The practical sequence: (1) Incorporate now and stay on profit tax while revenue is near zero. (2) Opt into the micro regime from the next 1 January (art. 48(2)) once one founder can be paid the minimum wage, which pays off from about €2k a month. (3) Return to profit tax above €100k.

Two PFAs look cheaper at scale, but they bring unlimited liability, split invoicing and a risk of requalification.

**VAT and invoicing.** **Rates and threshold:** standard VAT is 21% from 1 August 2025 ([EY](https://globaltaxnews.ey.com/news/2025-1622)), and the small-business exemption threshold is RON 395,000 from 1 September 2025 ([Contzilla](https://www.contzilla.ro/plafon-tva-395-000-lei-incepand-cu-1-septembrie-2025/)). The threshold counts only supplies whose place of supply is Romania, so AdSense and EU-network income probably fall outside it (inference; confirm with an accountant). **Special VAT code:** AdSense pays from Google Ireland under the reverse-charge mechanism ([Google AdSense Help](https://support.google.com/adsense/answer/1322031?hl=en-GB)). A non-VAT-registered SRL must obtain an **art. 317 special VAT code before** supplying such services or buying EU services (Google Ads, EU SaaS). It then files monthly D390 recapitulative statements and D301 special returns, paying 21% Romanian VAT on reverse-charged purchases with no deduction ([ANAF Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm)). **e-Factura:** B2B and B2C invoices must be uploaded within **5 working days** ([ANAF table on OUG 89/2025](https://static.anaf.ro/static/10/Brasov/Brasov/facturare_electronica_89.pdf)). B2C reporting applies even to non-VAT SRLs. A B2B invoice sent outside the system draws a fine of 15% of its value ([StartupCafe](https://startupcafe.ro/e-factura-2026-oug-trenulet-a-modificat-termenul-de-transmitere-a-facturilor-ce-amenzi-risca-antreprenorii-daca-nu-l-respecta-si-ce-recomanda-un-contabil-93528)). Invoices to 2Performant and Profitshare go through e-Factura. **SAF-T:** non-VAT SRLs file the SAF-T return D406 quarterly ([Fiscalitatea](https://www.fiscalitatea.ro/termene-saf-t-2026-24629/)).

### Name clearance: "Pretoscop" is free on every register checked

**Trademarks.** A TMview search on 27 October 2026 found **no identical or similar mark** in the Romanian, EU or WIPO registers. That covered "pretoscop", "pretoscope", "pretoscan", "pretscop", "pretometru" and "pretoscopul" ([TMview](https://www.tmdn.org/tmview/)). The nearest live Romanian mark is "preto" (coffee; classes 30/35/43), and "PRICESCOPE" exists only in the US and Greece.

**Domains and handles.** All six domains (.ro, .com, .eu, .net, .io, .app) were unregistered on 27 October ([Verisign RDAP](https://rdap.verisign.com/net/v1/domain/pretoscop.net); [Google Registry RDAP](https://pubapi.registry.google/rdap/domain/pretoscop.app)). @pretoscop is free on GitHub, YouTube, TikTok and X ([GitHub API](https://api.github.com/users/pretoscop); [X](https://x.com/pretoscop)). Not checked: Instagram, Facebook and ONRC company-name availability.

Register all of them today. File an OSIM or EUIPO word mark in classes 35 and 42 (optionally 9 and 38) before launch. The coined whole is allusive, not descriptive. One small warning: a search engine treated "pretoscop" as a misspelling of "proctoscopy" ([search result](https://en.wikipedia.org/wiki/Proctoscopy)), so test the name with a few users.

### Launch compliance checklist

| # | Area | Must exist at launch | Basis |
|---|---|---|---|
| 1 | Entity | SRL with founder money as capital; profit-tax regime; art. 317 code before AdSense or Google Ads; e-Factura and SAF-T through an accountant | Fiscal Code; Law 239/2025 |
| 2 | Legal pages | Consumer terms; merchant terms (P2B Arts 3–5); privacy and cookie policies; "Cum ordonăm rezultatele" (how we rank results); "Cum câștigăm bani" (how we make money); contact page with postal address | UCPD 7(4a); Key Principles; P2B |
| 3 | DSA | Contact points; notice-and-action form; **ANCOM notification within 45 days** | Law 50/2024 |
| 4 | Display | Ranking link beside every results list; "Promovat"/"Anunț" labels; an impartial price sort; final price including shipping; per-offer timestamp; seller-status and condition labels; Pretoscop badges stating their basis | UCPD Annex I 11a; Art. 6a guidance |
| 5 | Data | Written OK from 2Performant on ToS §9 and from programmes that say nothing; public bot page and stop-on-block policy; no reviews, no crawled images | Database right; Criminal Code art. 360 |
| 6 | Privacy | Consent tool with equal Accept/Reject and nothing loaded before consent; double opt-in alerts with per-alert unsubscribe; records of processing | Law 506/2004 arts 4, 12 |
| 7 | SEO | `rel="sponsored nofollow"` on affiliate and CPC links ([Google](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)); original content in place of copied merchant text, which Google treats as "thin affiliation" ([spam policies](https://developers.google.com/search/docs/essentials/spam-policies)) | Google policies |
| 8 | Brand | Six domains and the free handles registered; trademark filed | TMview clearance |

## Affiliate pays first, merchant clicks pay most, data pays most steadily

### Affiliate economics: €0.137 per click, but electronics coverage is thin

2Performant's 2025 filing gives the clearest Romanian benchmark: **Volume:** 61.4M clicks produced 2.28M sales worth €137.1M. **Payout:** affiliates earned **€8.38M**, which is **€0.137 per click**, €3.67 per sale and 6.11% of sales value. **Quality:** conversion was **3.72%** and the average basket **€60.09** excluding VAT. **Merchant cost:** merchants paid 8.4% of sales in total. Source: [2Performant indicators 2020–2025, BVB](https://www.bvb.ro/info/Raportari/2P/2P_20260226230353_Evolutie-indicatori-operationali-si-financiari-2020-2025-2Pe.pdf).

These clicks are mostly non-brand traffic that affiliates buy on Google, Meta and TikTok, so comparison traffic may convert differently. The category split (2025) explains where the money is:

| Category | Affiliate € per 100 clicks | AOV | Conversion | Implied commission (calculated) |
|---|---|---|---|---|
| Fashion | €18.64 | €59.78 | 4.05% | ~7.7% |
| Babies, kids, toys | €15.84 | €67.73 | 3.27% | ~7.2% |
| Beauty | €14.64 | €43.11 | 3.95% | ~8.6% |
| Home & garden | €14.51 | €134.32 | 2.02% | ~5.3% |
| Books | €13.61 | €24.56 | 5.47% | ~10.1% |
| **Electronics IT&C** | **€13.55** | **€190.77** | **2.20%** | **~3.2%** |
| Health & personal care | €12.41 | €37.11 | 3.07% | ~10.9% |
| Pet supplies | €9.61 | €42.58 | 4.08% | ~5.5% |
| Pharma | €7.18 | €32.24 | 4.86% | ~4.6% |

Source: [2Performant Annual Report 2025](https://www.bvb.ro/info/Raportari/2P/2P_20260423225924_Raport-anual-2025-RO.pdf).

An electronics click is worth about the network average. The problem is coverage, not value.
**Electronics:** the merchants that win most "lowest price" clicks (eMAG, Altex, Flanco, PC Garage) cannot be monetised through affiliation. The programmes that exist pay 1.5–2% (evoMAG, Vexio, ForIT) with short windows: 2 days for eMAG phones, 5 for Vexio, 10 for evoMAG. **Elsewhere:** licensed feeds and commission coincide in books (Libris 8%, Cărturești 9%), toys (Noriel 7%), beauty (Douglas 5%, Notino 4%), pets and home (Petmart 5%, Bonami 3%).

pricealert.ro shows the ceiling in affiliate-friendly categories. Its 10,824 sales in three weeks ([Business League Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/)) annualise to about 15,000 sales a month. At the network-average €3.67 per sale, that would be about €55k a month in commissions. This is my arithmetic: its real commission mix is not public.

Cash arrives weeks after the click. 2Performant processes withdrawal requests weekly and pays on Thursdays above 100 lei, with a €2 fee per withdrawal ([2P help](https://support.2performant.com/ro/cum-pot-retrage-banii-ca-firma-din-strainatate); [2P Terms](https://2performant.com/terms-conditions/)).

### Merchant CPC: price click-outs at 0.25–1.0 RON against Heureka's €0.28–0.53

Compari's billing shows what Romanian merchants already accept: **Free mode:** 1 RON registration. Products stay listed up to **100 clicks a day for the first 60 days, then 25** ([Heureka Help – Compari registration](https://sluzby.heureka.sk/help/registration/)). **PPC:** prepaid credit with a **150 RON minimum**. Second-price bids decide the top three positions on product cards that have at least four sellers, and products up to 5 RON are not charged ([Compari bidding](https://sluzby.heureka.sk/help/compari-bidding/)). **Premium:** **80–100 RON a month** buys six feed updates a day instead of one ([Compari Premium](https://sluzby.heureka.sk/help/premium-package-pachete-de-servicii-compari-ro/)).

Compari's actual click tariffs could not be retrieved. The same group's live Heureka.sk list (October 2026, EUR excluding VAT) has these median click prices:

| Product price | Median click price |
|---|---|
| €50 | €0.197 |
| €100 | €0.279 |
| €300 | €0.412 |
| €500 | €0.484 |
| €1,000 | €0.527 |

The maximum is €1.506. Mobile phones run €0.181–0.418 and notebooks €0.093–0.250 ([Heureka.sk price list](https://sluzby.heureka.sk/napoveda/cennik-preklikov/); [CSV](https://api.heureka.sk/v1/price-list/active/download/?format=csv)).

What a merchant can rationally pay per click is conversion × AOV × the 8.4% total cost of sale it already pays affiliates: about €0.35 in electronics, €0.20 in fashion and €0.11 in books.

**Pretoscop's offer.** Price click-outs at 0.25–1.0 RON (about €0.05–0.20), copy the free tier with click caps and the prepaid wallet, and refresh feeds at least six times a day for free. That beats Compari's paid Premium. At 25,000 paid click-outs a month and €0.08 each, CPC is worth about €2,000 a month (my arithmetic). That volume needs roughly 60,000 sessions at 0.4 click-outs per session, which the base case reaches around months 9–12.

Mature comparators live on these fees. Price-comparison fees were **86.5%** of Ceneo's H1 2025 revenue ([Allegro.eu H1 2025](https://biznes.pap.pl/download/attachment/52459388/DOC.20250918.52459388.zal01_2025_Half-Year_Report_Of_Allegro.eu_Group.pdf)). Start with a free merchant dashboard showing clicks sent and price rank. That builds proof before the sales pitch.

### Google CSS turned from optional to necessary in September 2026

**Requirements** to become a CSS ([CSS program requirements](https://support.google.com/css-center/answer/7524491?hl=en)): a business registered in a programme country; at least **50 distinct merchant domains** shipping to the country, with offers leading to purchase pages; its own search; sorting or filtering by price plus at least one other factor; open access without sign-up; no transactions on its own domain; and no name shared with a seller on the site.

**Romania's status.** Romania is one of 21 CSS countries for Shopping ads and free listings, but not among the 16 that offer CSS product pages ([Merchant Center Help](https://support.google.com/merchants/answer/12652686?hl=en)). Partner status additionally needs 50 merchants running active Shopping campaigns and a top-20% impression rank ([CSS Partners](https://comparisonshoppingpartners.withgoogle.com/partners)).

**Value and margin.** Merchants value the roughly 20% bid discount, 16–18% effective ([Channable](https://www.channable.com/blog/save-money-css-partner); [Cobiro](https://cobiro.com/articles/google-shopping-css-discount)). One Slovak CSS already serves 128 Romanian shops ([cssshoppingin.eu](https://www.cssshoppingin.eu/google-comparison-shopping-partners-where-are-we-on-the-ladder/)). Heureka's CEO said the margin "erodes into zero" once agencies pass the discount back to shops ([Lupa.cz](https://www.lupa.cz/clanky/tomas-braverman-heureka-cz-podavame-zalobu-na-google-chceme-395-milionu-usleho-zisku/)).

**What changed in September 2026.** Google dropped free product listings and popular-products carousels across the EEA because of the DMA ruling ([Search Engine Roundtable](https://www.seroundtable.com/google-drops-free-product-listings-eea-42113.html)). Organic product visibility now flows through aggregator units and structured-data carousels, and Google states that "Product queries in CSS Program countries require enrolling in the Comparison Shopping Services (CSS) program" ([Google – carousels](https://developers.google.com/search/docs/appearance/structured-data/carousels-beta); [Google – aggregator features](https://developers.google.com/search/docs/appearance/aggregator-features)). CSS enrolment is therefore an organic-growth requirement, not just a margin product. Whether Romanian results already reflect this was not checked.

**Obstacles.** 2Performant caps each advertiser at five CSS affiliates. Elefant bans CSS, and Libris requires approval. Any integration must use the Merchant API, because the Content API was sunset on 18 August 2026 ([Google for Developers](https://developers.google.com/shopping-content/guides/quickstart)).

**Pricing benchmark.** Compari's own CSS service charges 10% of Google spend [search summary] ([compari.ro](https://www.compari.ro/static/shopping.html)).

### B2B price intelligence is the second business inside the history database

The crawler and history store that run Pretoscop are what price-monitoring SaaS sells. For reference: Price2Spy starts at **$39.95 a month for 500 URLs** and charges $157.95 for 2,000 ([Price2Spy](https://www.price2spy.com/?p=12656)). Prisync costs $99, $199 or $399 a month ([Capterra](https://www.capterra.com/p/153451/Prisync/pricing/)). Heureka bought the price-monitoring firm Dataweps in 2021 ([CEE Legal Matters](https://ceelegalmatters.com/czech-republic/16432-ksb-advises-heureka-group-on-acquisition-of-dataweps)) and launched "Heureka Insights" in 2022 ([MediaGuru](https://www.mediaguru.cz/heureka-group-ma-novou-identitu-i-tri-nove-b2b-znacky)). eMAG scans competitor prices every 15 minutes for its "Super Preț" label ([Revista Biz](https://www.revistabiz.ro/emag-introduce-super-pret-un-algoritm-automat-de-comparare-a-preturilor/)).

**Product ladder.** Start with a free merchant dashboard. Then sell a "Monitor" subscription at €29–99 a month for 100–1,000 SKUs, with Romanian final prices including shipping. Next come brand price-compliance reports at €200–500 a month. Alongside these, publish a free monthly price index for the media, which doubles as PR, and offer paid custom datasets.

Ten clients at €100 is €1k of monthly recurring revenue; fifty at €150 is €7.5k.

**Constraints on what can be sold.** **Icecat:** Icecat-derived content cannot go into a paid product (no fee, share-alike). **2Performant:** its ToS bars passing platform data to third parties. **Retailer terms:** eMAG's 6.2 bans transferring its content to third parties.

So B2B datasets should be built from Pretoscop's own observations of shops that permit it, or from licensed feeds. Data resale also sends no traffic back to the shop, which weakens the *CV-Online* defence (my inference). Pretoscop's own history should earn its own sui generis right through its investment in obtaining and verifying data, a right it can license ([Directive 96/9/EC art. 7](https://www.legislation.gov.uk/eudr/1996/9/article/7)).

### Display ads, premium plans and cashback stay small

**Display advertising.** **Market:** Romanian digital advertising was **€327M in 2025 (+10%)**, forecast at about €334M in 2026, only +2% ([Economedia](https://economedia.ro/piata-media-din-romania-a-crescut-la-838-milioane-de-euro-in-2025-venituri-de-415-milioane-de-euro-in-tv.html)). **Yields:** no Romanian web RPM benchmark exists. The only proxy is a YouTube RPM of about **$1.15** ([Dynamoi](https://dynamoi.com/data/youtube-adsense-rpm/ro)). **Networks:** Ezoic now requires 250k monthly users for new sites ([Ezoic](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements)); Raptive wants 40–50% of traffic from English-speaking markets ([PPC Land](https://ppc.land/raptive-drops-pageview-requirement-to-25-000-monthly-visits/)); Mediavine's Journey programme starts at 1,000 sessions ([Mediavine](https://help.mediavine.com/what-does-it-take-to-get-approved-by-mediavine)); and AdSense pays out from €70 ([AdSense](https://support.google.com/adsense/answer/1709871?hl=en)). **Opportunity cost:** an impression at a €1 RPM earns €0.001, while a click-out earns €0.08–0.14. Ads therefore belong only on guides and archive pages, never beside offers. Profitshare excludes sites with over 50% advertising ([Profitshare terms](https://profitshare.ro/terms)).

**Consumer premium.** Keepa's €19 a month targets Amazon sellers, not shoppers ([RevenueGeeks](https://revenuegeeks.com/software/keepa/pricing)). The research model's guess for Pretoscop is 0.3% of monthly users paying €3 a month. A consumer subscription also brings a 14-day withdrawal right, B2C e-Factura and possibly the Accessibility Act once the company grows past micro size. Launch it late, after 10k monthly users and six months of history, or not at all.

**Cashback** is crowded: CashClub has 1,000+ stores ([Romania Insider](https://www.romania-insider.com/cashclub-seedblink-crowdfunding-april-2025)). "Bani înapoi" offers up to 20% at 470 shops ([App Store](https://apps.apple.com/app/id1613945355)). OnBuy promises at least 1% back instantly ([Wall-Street.ro](https://www.wall-street.ro/articol/ecommerce/un-nou-rival-emag-intra-in-romania-promite-bani-inapoi-la-fiecare-cumparatura.html)).

Giving away half of a €3.67 commission returns about 3% of an order and halves Pretoscop's revenue. Folding valid network coupon codes into the displayed final price helps users more; Pricy already claims to do this ([Pricy changelog](https://www.pricy.ro/ChangeLog)).

**Retail media and sponsored deal slots** come later. Advertising was 13.4% of Ceneo's H1 2025 revenue, and idealo launched "idealo Ads" in May 2026 ([retail-news.de](https://retail-news.de/idealo-umsatz-h1-2026-internationales-wachstum/)). A neutral way to do it is a paid, labelled "verified real discount" slot open only to offers that pass Pretoscop's own 30-day test. Temu's affiliate rates of up to 30% would undermine the watchdog brand.

### The base case earns about €26 per 1,000 sessions, nearer €20 without eMAG

The research model multiplies three factors. The first is sessions times click-outs per session (0.25 / 0.40 / 0.50 in the conservative, base and optimistic cases). The second is the share of click-outs that land on monetisable merchants (0.40 / 0.55 / 0.70). The third is effective EPC (€0.08 / €0.11 / €0.13 after attribution loss). It then adds CPC, display, subscriptions and B2B as each switches on.

| Month | Base sessions | Affiliate | CPC | Ads | Subs | B2B | **Base €/month** | Conservative €/month | Optimistic €/month |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 5,000 | 121 | 0 | 10 | 0 | 0 | **131** | 16 | 491 |
| 6 | 25,000 | 605 | 0 | 50 | 0 | 0 | **655** | 72 | 2,946 |
| 12 | 120,000 | 2,772 | 192 | 240 | 648 | 0 | **3,852** | 360 | 18,355 |
| 18 | 250,000 | 5,225 | 1,200 | 500 | 1,350 | 600 | **8,875** | 730 | 39,885 |
| 24 | 400,000 | 7,480 | 3,200 | 800 | 2,160 | 2,000 | **15,640** | 1,410 | 71,225 |

That means about **€15–18k in year 1 and €118–132k in year 2** in the base case. The conservative case gives €10–11.5k in year 2. Reaching €5k a month needs about 190k sessions a month. The parameters are assumptions, not sourced benchmarks. The only sourced inputs are 2Performant's EPC, conversion and seasonality ([2P indicators](https://www.bvb.ro/info/Raportari/2P/2P_20260226230353_Evolutie-indicatori-operationali-si-financiari-2020-2025-2Pe.pdf)).

**My correction.** The base share of 0.55 allowed for eMAG possibly approving Pretoscop, which its terms now rule out. With an electronics-heavy mix at 0.40, base yield falls from about €26 to about **€20 per 1,000 sessions**, and break-even rises to roughly 255k sessions. Two things pull it back up: tilting the category mix toward books, beauty, toys and home, or getting CPC paying earlier.

**Seasonality.** Q4 was 28.8% of 2Performant's 2025 turnover, and in the research model a Black Friday month at 2.5× normal traffic earns about €7.3k of affiliate revenue at month-12 traffic, roughly 2.5 normal months.

### Mature comparators are mid-sized, marketing-heavy and Google-exposed

| Benchmark | Reported figures | Lesson |
|---|---|---|
| Ceneo (PL) | H1 2025 revenue PLN 164.96M; 86.5% comparison fees; EBITDA 27.1%; marketing 50.9% of revenue ([Allegro](https://biznes.pap.pl/download/attachment/52459388/DOC.20250918.52459388.zal01_2025_Half-Year_Report_Of_Allegro.eu_Group.pdf)) | CPC is the core; traffic is expensive |
| Heureka Group (compari's parent) | FY to Mar 2026: ~CZK 2.2bn revenue (+1.3%), EBITDA CZK 586M, net loss CZK 321M; says no market loses money; court awarded CZK 250M from Google, appealable ([Seznam Zprávy](https://www.seznamzpravy.cz/clanek/316477)) | Flat revenue despite traffic growth; pressure from Google and AI |
| Skroutz (GR) | ~€150M revenue, ~€650M valuation after the shift from comparator to marketplace plus logistics ([newmoney.gr](https://www.newmoney.gr/roh/palmos-oikonomias/epixeiriseis/skroutz-pos-ektinachthike-sta-650-ekat-evro-me-to-chriso-deal-cvc-blackstone/)) | Big money came after the comparator phase |
| Geizhals (AT) | ~€14.2M revenue (year unclear); pay-per-click or pay-per-order ([Wikipedia](https://en.wikipedia.org/wiki/Geizhals)) | Scale of a pure neutral comparator |
| idealo (DE) | Revenue +23% in 2025, +22% in H1 2026 ([retail-news.de](https://retail-news.de/idealo-umsatz-h1-2026-internationales-wachstum/)) | Neutral comparators can still grow |
| Kelkoo | Traffic −65% between 2007 and 2014 as Google favoured its own shopping ([Worldcrunch](https://worldcrunch.com/business-finance/how-google-kills-the-competition-in-europe)) | Google dependence can be fatal |

A neutral Romanian comparator's realistic ceiling is a few million euros a year (my inference from Geizhals' scale and Romania's market size). For two bootstrapped founders, the goal is profitability from affiliate plus B2B, not Ceneo-scale EBITDA.

## Growth comes from product pages, Black Friday verdicts and owned alerts

### SEO: win the model-level query, not the tool keyword

compari.ro already takes about **2.4M organic visits a month from 338.8K keywords**, at roughly $0.10 of search value per visit ([Ahrefs](https://ahrefs.com/websites/compari.ro)). Pretoscop will not win that on generic tool keywords. "istoric pret" draws only about 1–2K searches a month, while a single model-price query such as "iphone 17 pret" draws about 4.5–6.3K per variant ([Google Trends](https://trends.google.com/trends/explore?date=today%2012-m&geo=RO&q=istoric%20preturi,iphone%2017%20pret,pret%20iphone%2017,iphone%2017%20emag,compari)). Build one canonical page per variant whose title answers the query, for example "iPhone 17 256GB preț – istoric și cel mai mic preț".

Each page needs to carry things a shop page cannot show: the price-history chart; the 30- and 90-day lows; the final price including shipping; and a per-shop discount verdict.

**Markup.** Mark these pages up with `Product` and `AggregateOffer`. Merchant-listing rich results are closed to comparators, since "Only pages where a shopper can purchase" qualify ([Google – merchant listings](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)). Add `ItemList` summary pages of three or more items for the EEA carousels.

**Spam policies.** Stay clear of Google's scaled-content, thin-affiliation and doorway policies ([spam policies](https://developers.google.com/search/docs/essentials/spam-policies)): index only products with at least two offers or real history; keep search and facet pages `noindex`; and never copy merchant descriptions.

### AI search: become the dataset that assistants quote

**The threat.** Google's AI Mode has been live in Romanian since October 2025 ([Google Romania](https://blog.google/intl/ro-ro/produse/cautarile-google-in-modul-ai-disponibile-in-romania/)). Google has tested per-store price-history charts directly in results, which Romanian press greeted with "Adio comparatoare de preţuri?" (goodbye, price comparators?) ([Mobilissimo](https://www.mobilissimo.ro/stiri-telefoane/adio-comparatoare-de-preturi-google-search-primeste-grafice-cu-evolutia-preturilor-pentru-fiecare-magazin)). Heureka's revenue is flat, and investor sources say Google is "destroying" it ([Seznam Zprávy](https://www.seznamzpravy.cz/clanek/ekonomika-prodava-se-pomackana-heureka-drti-ji-google-i-ai-majitele-dolili-penize-286132)).

**The opening.** idealo launched a ChatGPT app covering **201M offers** from about 24,000 merchants (March 2026) ([DriversCloud](https://www.driverscloud.com/en/news/2841/shopping-30-when-the-idealo-comparator-invites-itself-into-your-chatgpt-discussions)). OpenAI has moved from instant checkout toward discovery and comparison ([E-Commerce Nation](https://www.ecommerce-nation.fr/?p=126213)). compari.ro's robots.txt already admits GPTBot, OAI-SearchBot and ChatGPT-User ([compari.ro robots.txt](https://www.compari.ro/robots.txt)).

Pretoscop should publish citable, timestamped facts (monthly price indices, Black Friday studies) and later offer an API or MCP endpoint built on its own price observations.

There is one conflict to resolve. Open Icecat's licence requires blocking crawlers that copy content for AI training or aggregation. A workable split is probably to block training bots while allowing retrieval agents. Confirm that reading with Icecat before relying on it (my inference). Track brand searches and alert subscriptions as the health metrics that survive AI answers.

### Extension and mobile: a wedge, not a copy of Pricy

Pricy's **100,000 Chrome users** against about 10,000 each for Istoric Preturi and xPrice and 1,000 for eMAG Helper ([CWS – Pricy](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb); [CWS – eMAG Helper](https://chromewebstore.google.com/detail/gnbapmkgimhnohmenmigclmpbcofafne)) show that extension reach takes years to build.

Pretoscop's extension needs a sharper reason to install: the 30-day verdict; visibly fresher prices; and seller-level filtering of marketplace offers.

That last item is something r/programare users explicitly asked for ([Reddit](https://www.reddit.com/r/programare/comments/1p10n4e/)). Installs do not create community by themselves: Pricy's Discord has about 78 members ([Discord](https://discord.gg/rJ4mJaP)).

On mobile, compari has no Romanian app, and eMAG expected 60% of Black Friday 2025 orders to come from phones ([Wall-Street.ro, sponsored](https://www.wall-street.ro/articol/retail/black-friday-2026-in-romania-calendarul-magazinelor.html)). A PWA with Web Push alerts is the cheap way to own mobile price alerts.

### Communities: Reddit and Facebook pages, not Telegram

**Reddit** is a proven referrer for this niche. It is istoric-preturi.info's top social source ([Similarweb](https://www.similarweb.com/website/istoric-preturi.info/)), and fake-discount threads draw 100–280 upvotes. Dedicated deal subreddits are tiny; r/ReduceriPreturi has 339 subscribers ([Arctic Shift](https://arctic-shift.photon-reddit.com/api/subreddits/search?subreddit_prefix=reduceri)).

**Facebook and TikTok** are where Romanian deal distribution actually lives, which makes these accounts partners or affiliates rather than competitors: TeamDeals, about 80K followers ([Facebook](https://www.facebook.com/teamdealsRomania/)); Kuponiada, 114K+ likes ([Facebook](https://www.facebook.com/Kuponiada/)); and the TikTok voucher account eVOUCHER, 33.9K followers ([TikTok](https://www.tiktok.com/@evoucher)).

**Telegram** looks undeveloped: the only Romanian deal group found had 84 subscribers ([Telegram](https://t.me/+3NeRMdq-bfc4M2Ey)). Treat a Telegram bot as a cheap, optional alert channel.

### Black Friday PR: revive the Competition Council's two metrics

**The precedent.** The Competition Council's 2018 inquiry found that about 80% of reference prices were inflated and 29% of products were priced above their 30-day maximum. It was covered across Capital, Gadget.ro, Profit.ro, TVR Info, StartupCafe and Forbes RO ([Gadget.ro](https://gadget.ro/consiliul-concurentei-confirma-80-din-reducerile-gen-black-friday-sunt-o-pacaleala/)). Since then, coverage has been advice without data: InfoCons recommends "Analizarea istoricului de preț" (analysing the price history) without naming a tool ([InfoCons, 6 Nov 2025](https://infocons.ro/?p=166701)). Euronews RO points generically to "site-uri și extensii de browser" (sites and browser extensions) ([Euronews RO, Oct 2026](https://www.euronews.ro/articole/cum-verifici-daca-reducerile-de-black-friday-sunt-reale)).

PriceSpy shows the international template: an annual fake-sale study, which found 11% of UK Black Friday deals fake in 2023 ([PriceSpy](https://pricespy.co.uk/articles/fake-sales-increase-on-black-friday-2023)).

**The 2026 timeline.** Thirty days before eMAG's 6 November event was 7 October, which has already passed. So 2026 can only support a "pre-Black-Friday" study on the shops Pretoscop can legitimately observe. The **international wave on 27–30 November** can still get a full 30-day window, provided collection starts this week. Christmas 2026 and Black Friday 2027 should get the complete study.

**Method and partners.** Reproduce the Council's two metrics: the share of advertised reductions whose reference price exceeds the shop's own observed 30-day low, and the share of products priced above their 30-day maximum. Pitch the outlets that covered 2018, and offer InfoCons a free tool to cite. Use the neutral wording and correction channel described in the legal section, and have a lawyer review before naming retailers.

## Eight decisions determine whether Pretoscop is legitimate and solvent

The evidence leaves eight choices that the founders must make explicitly. The coding agent cannot infer them.

| # | Decision | Options | Recommendation | Deciding evidence |
|---|---|---|---|---|
| 1 | **eMAG** | (a) ask for a written licence or partnership; (b) show eMAG prices from polite crawling; (c) link out to eMAG search without extracting prices; (d) leave eMAG out | Do (a) now and (c) at launch. Move to (b) only after a written Romanian legal opinion, showing minimal facts and stopping on any objection | About a quarter of the market. T&C 4.2(j) and 6.2 ban extraction and republication. Affiliate programme bans comparators. CCBot throttled with HTTP 511 |
| 2 | **Launch categories** | Electronics only; affiliate-friendly categories only; hybrid | **Hybrid.** Electronics and appliances as the verdict and PR showcase, using evoMAG/PC Garage/Vexio/cel.ro feeds plus open shops. Books, beauty, toys, home and pets for affiliate revenue | Electro & IT +21% and the strongest Black Friday intent, but ~3% commission on thin coverage. Books, beauty and toys pay 7–10% with permissive feeds |
| 3 | **Acquisition posture** | Feeds plus a verified bot, no evasion; or commercial unblockers and residential proxies | **Feeds plus a verified bot, never evasion** | Criminal Code art. 360(3); allowlisting requires an honest identity; unblockers cost ≈$500/month at 500k offers |
| 4 | **Business model** | Neutral comparator; marketplace or checkout | **Stay neutral; no checkout** | CSS bars sites that transact on their own domain. Marketplaces carry extra UCPD duties. Alza left Heureka over independence |
| 5 | **CSS timing** | Defer; or aim for 50 merchant domains early | **Plan for 50 domains by months 6–9** | EEA free listings removed in Sept 2026; product carousels need CSS enrolment; 2P caps each advertiser at five CSS affiliates |
| 6 | **Entity and tax** | Personal payouts or PFA; SRL on micro; SRL on profit tax | **SRL now**, founder money as capital, profit tax until about €2k/month, micro from the next 1 January | Affiliate income is a service needing registration; Law 239/2025 net-asset rule; 90-day micro window |
| 7 | **Specs source** | Open Icecat (free, licence strings attached); own normalised specs | Icecat for electronics specs on free pages only; nothing Icecat-derived in paid data; decide the AI-crawler policy first | No-fee and share-alike clauses; ban on AI use; robots.txt condition |
| 8 | **Black Friday 2026** | Wait for the full product; start capturing now | **Start capturing this week** from open shops and approved feeds | eMAG's day is 6 Nov; the international wave on 27–30 Nov can still get a full 30-day window |

### Sequencing the first twelve months

| When | Product and engineering | Business and legal |
|---|---|---|
| **This week** (from 27 Oct 2026) | Bot page, `PretoscopBot/1.0` user agent, 1–3 dedicated IPs with reverse DNS and `ips.json`, a Web Bot Auth key. Start raw collection from the open shops (IT Galaxy, forit, Flip, Carrefour, Auchan, Libris, Bonami, Dedeman, JYSK, Elefant) | Register the six domains and the free handles. File the SRL. Apply to 2Performant programmes declaring "price comparison / price history". E-mail captcha@distinct.ro and evoMAG. Ask PC Garage, Vexio and cel.ro for feed URLs. Write to eMAG, Altex and Flanco |
| **Weeks 1–4** | Feed ingestion. `offer` / `price_event` / `product_day` schema. Matching v1 (GTIN, MPN, hard constraints) with a 2,000-pair evaluation set | Cloudflare, Akamai, DataDome, Fastly and IAB bot submissions. Written confirmations from 2Performant (ToS §9) and from silent programmes |
| **Months 2–3** | Public beta: product pages, history charts, ranking and business-model pages, double opt-in alerts, consent tool | ANCOM notification within 45 days of launch. Art. 317 VAT code before AdSense or Google Ads. Trademark filing |
| **Months 3–6** | Christmas fake-discount study; Chrome extension; PWA push; free merchant dashboard | Accountant set-up for e-Factura and SAF-T. Merchant terms compliant with P2B |
| **Months 6–12** | Self-serve CPC once click-outs reach 25–50k a month; Merchant API integration; B2B "Monitor" pilot | CSS application at 50 merchant domains. Micro regime from 1 January if one founder is on payroll |

### The risks that can sink it

| Risk | Evidence | Severity | Mitigation |
|---|---|---|---|
| eMAG blocks the bot or takes action | Explicit T&C bans; HTTP 511 throttling; a November 2025 Pricy review said eMAG history vanished (cause unverified) | High | Licence first; link out; legal opinion; stop on objection |
| Electronics majors stay closed | 22 of 40 domains blocked an honest bot while serving CCBot | High | Verification plus business development; feed partners first; publish honest coverage |
| Google and AI erode organic traffic | EEA free listings removed; AI Mode live in Romanian; Heureka flat; Kelkoo traffic −65% | High | CSS, structured data, owned alert channels, brand-building PR |
| Electronics monetisation stays thin | eMAG ban; 1.5–2% commissions; 2–10 day cookie windows | High | Category mix, early CPC, B2B data |
| Incumbents respond | Pricy's 100K-user extension; Pret Alert; compari's marketplace; Skroutz backed by Blackstone | Medium–high | Better verdicts, freshness targets, visible neutrality |
| Programmes churn or tighten terms | Decathlon closes 31 Oct 2026; seven closure notices in four weeks; Flanco went from Profitshare to 2P to nothing; 2P ToS §9 | Medium | API status checks before display; written permissions; several networks |
| Fake-discount labels trigger claims | Naming shops publicly | Medium | Factual wording, stored evidence, correction channel, counsel |
| Compliance slips | ANCOM 45 days, consent, paid-ranking labels, e-Factura 15% fine | Low–medium | The launch checklist above |
| Founder bandwidth | Two people covering crawling, matching, sales and compliance | High | Strict sequencing; review queue ordered by traffic × uncertainty |

**Not resolved by the research:** compari.ro's actual features and click tariffs (every route returned 403); the full terms of Altex, PC Garage and OLX; real keyword volumes, which are Trends-derived (validate in Google Keyword Planner); Romanian display RPMs and comparison click-out rates; whether Open Icecat's sponsors include Samsung, Apple and LG; whether Google's EEA listing changes already show in Romanian results; the Chamber of Deputies' vote on L256/2026; and whether Distinct's filter admits clean, declared IPs.

Each is cheap to test in the first month, and several could move the revenue model by a factor of two.

## Conclusion

The research changes what Pretoscop's scarce asset is. It is not code: the full stack costs under €400 a month at 500,000 offers, and LLM matching costs cents per thousand pairs. The scarce asset is standing, meaning permission from retailers and trust from shoppers. The law hands Pretoscop a structural gift here. Romanian shops must compute their own 30-day low under HG 947/2000, but the Commission says a pure comparator is not bound by that rule. So the one actor able to check every shop across time *and* against its competitors is an independent comparator that never sells anything itself and labels everything it is paid for. Neutrality is therefore the business model, not a slogan. It makes the verdict credible, it keeps merchants willing to send feeds, and it is what qualifies a site as a Google CSS, which since September 2026 is the remaining organic route into EEA product results.

That reverses the usual comparator playbook of maximum coverage first and trust later. Pretoscop should start with a smaller universe it can verify (licensed feeds plus openly crawlable shops) and state its coverage honestly. The Black Friday and Christmas verdicts can then win the audience that eventually brings eMAG, Altex and Flanco to the table, or that makes their absence a story of its own. Judge progress by merchant feeds signed, the share of offers re-checked within 26 hours, and confirmed alert subscribers, not by raw sessions. The three facts most able to change this plan are eMAG's written answer, real keyword volumes and the measured click-out rate per session.
