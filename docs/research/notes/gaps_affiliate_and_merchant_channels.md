# Gap research: affiliate networks and merchant data channels for Pretoscop (Romanian price comparison + price history), as of 2026-10-27

All URLs were accessed on 2026-10-27 unless a date is given. "[search summary]" means the fact came from a search-engine summary of a page that blocked direct fetching (compari.ro and its subdomains return HTTP 403/Cloudflare to every direct request, and there is no Wayback copy of its pricing pages). Everything listed as "already known" in the brief is not repeated here.

## 1. 2Performant publisher onboarding: who can join and get paid, payout documents, how feeds are downloaded, feed field names, comparator rules

### Takeaway
A natural person (persoană fizică) with no company can register on 2Performant and be paid. PFA, SRL and SA are also supported. Individuals upload an ID card and a bank statement and have 10% income tax withheld at source. Companies upload an invoice with every withdrawal. Feeds are built by the affiliate per accepted program under Tools > My feeds and exported as a CSV or XML URL, and a dedicated help article addresses price-comparison sites. 2Performant has no network-level comparator ban and its guides actively promote comparators. Three constraints apply:
- every program needs the advertiser's approval;
- each advertiser can have at most 5 CSS affiliates;
- a ToS licence clause forbids using platform "data to create a database of their own and/or an information service", which matters for a price-history archive and should be clarified in writing.

### Cited Findings

**Eligibility (verbatim)**
- ToS definition of Affiliates: "legal or natural persons aged over 18 years, holding duly registered Affiliate Accounts in the Platform, who act as professionals, willing to send online traffic to be tracked by 2Performant and paid by Advertisers, on a 'Cost per Action'." — [2P Terms of Services](https://2performant.com/terms-conditions/)
- The ToS also says: "2Performant reserves the right to refuse any User Offer without citing any reasons for its refusal." — [2P Terms of Services](https://2performant.com/terms-conditions/)
- Help centre on payment profiles: "Poti alege sa incasezi banii in calitate de persoana fizica, persoana juridica (S.R.L. / S.A.) sau persoana fizica autorizata." (→ "You can choose to collect the money as a natural person, a legal entity (SRL/SA) or an authorised natural person [PFA].") — [2P help: Cum creez un profil de plata?](https://support.2performant.com/ro/hc/en-us/articles/115003981607-cum-creez-un-profil-de-plata-)
- The help centre has moved to HubSpot. The old Zendesk URLs (`support.2performant.com/hc/en-us`) return 404. The Romanian affiliate hub is at [support.2performant.com/ro/pentru-afiliați](https://support.2performant.com/ro/pentru-afilia%C8%9Bi).

**Payment profile documents (natural person)**
- Steps: Payments > Profiles > New Payment Profile. Choose "Datele de facturare - Individual" and enter the bank name, SWIFT and IBAN.
- The NIN field takes the "Codul Numeric Personal sau CNP pentru cetatenii romani" (→ CNP for Romanian citizens).
- "Incarca toate documentele necesare (extras de cont si carte de identitate) si apasa butonul 'Send to review'." (→ "Upload all the required documents (bank statement and identity card) and press 'Send to review'.")
- "Profilele create pana joi sunt verificate si aprobate cel tarziu vineri." (→ profiles created by Thursday are checked and approved by Friday at the latest.)
- Source: [2P help: Cum creez un profil de plata?](https://support.2performant.com/ro/hc/en-us/articles/115003981607-cum-creez-un-profil-de-plata-)
- "Odată trimis pentru revizuire și validare, profilul nu mai poate fi editat." (→ once submitted, the profile can no longer be edited.) After approval you can withdraw "orice valoare ... atat timp cat este mai mare de 100 lei sau €25" (→ any amount above 100 lei or €25). — [2P help: Verificarea si aprobarea profilelor de plata](https://support.2performant.com/ro/hc/en-us/articles/115000334771-verificarea-si-aprobarea-profilelor-de-plata)

**Taxes by payee type** (verbatim from [2P help: Ce taxe platesc afiliatii pentru veniturile inregistrate prin afiliere?](https://support.2performant.com/ro/hc/en-us/articles/115001197532-ce-taxe-platesc-afiliatii-pentru-veniturile-inregistrate-prin-afiliere-))
- "Persoana Fizica Romania - se retine la sursa, impozitul pe venit de 10%." The tax is paid to ANAF by 2Performant. Individuals with independent-activity income "datoreaza contributii la CAS (25%) si CASS (10%), in anumite conditii prevazute de Codul Fiscal". They must file the annual "Declaratia unica (formularul 212)". (→ 10% income tax withheld; CAS 25% and CASS 10% may be due under conditions; annual form 212.)
- "Persoana Juridica Romania (platitor de TVA) ... va incarca o factura ce va contine si TVA-ul". A non-VAT-payer "va incarca in platforma o factura emisa fara TVA; alte taxe nu mai sunt." (→ a Romanian company uploads an invoice with VAT if VAT-registered, without VAT otherwise; no other taxes.)
- "Persoana Fizică UE / din afara UE - retinem la sursa impozitul pe venit de 10%". Via PayPal there are no other fees. By bank transfer "se retine comisionul de transfer in valoare de 11.22 euro". An EU legal entity must invoice without VAT, since 2Performant is VIES-registered.
- The article does not name PFA separately.

**Invoice and withdrawal mechanics (companies)**
- Generate an invoice for the "Amount you need to invoice" shown in Payments > Withdraw. "Factura trebuie sa aiba data cererii de retragere (aceeasi luna si an)" (→ the invoice must carry the withdrawal request's month and year).
- Billing details: "SC 2Performant Network SA, Bd. Corneliu Coposu 6-8, cladirea Unirii View, Etaj 2, ... Sector 3, Bucuresti; Cod TVA: RO 26405652; Numar de inregistrare: J40/493/2010".
- Upload the invoice as a PDF; the invoiced amount must match exactly.
- "In fiecare saptamana, miercuri, verificam toate cererile de plata facute intre miercurea trecuta si marti ... plata ta va fi procesata joi." (→ requests from Wednesday to Tuesday are checked each Wednesday and paid Thursday.)
- Source: [2P help: Cum pot retrage banii ca firma din strainatate?](https://support.2performant.com/ro/cum-pot-retrage-banii-ca-firma-din-strainatate)
- ToS 7.3: a payment request needs ToS re-confirmation and, "Applicable only to affiliated legal entities", an uploaded fiscal invoice.
- ToS 7.3.2: 2Performant issues a €2 + VAT invoice per withdrawal. It is issued "in lei, for private individuals or legal entities from Romania" and offset against commissions. — [2P Terms of Services](https://2performant.com/terms-conditions/)
- The €2 fee has applied since 2 May 2023. RON withdrawals are converted at the ECB rate on the request date. The fee invoice is downloadable under Payments > History. — [2P help: Cost Operational](https://support.2performant.com/ro/hc/en-us/articles/7928827261084-cost-operational-pentru-incasarea-comisioanelor); [2P help: taxe platforma](https://support.2performant.com/ro/hc/en-us/articles/224717468-ce-taxe-platesc-afiliatii-pentru-folosirea-platformei-)

**Where and how affiliates download feeds (verbatim)**
- Article title: "Cum adaugi feed-uri de produse in site-ul tau". Subtitle: "Cum sa preiei un feed de produse pentru un site de comparare de preturi sau agregator de produse".
- Opening line: "Daca detii un site care este un comparator de preturi sau un agregator de produse, va trebui sa implementezi in site-ul tau feed-uri de produse ale advertiserilor." (→ "If you own a price-comparison or product-aggregator site, you need to implement the advertisers' product feeds.")
- Source for this and the steps below: [2P help: Cum adaugi feed-uri de produse in site-ul tau](https://support.2performant.com/ro/hc/en-us/articles/360015619800-cum-adaugi-feed-uri-de-produse-in-site-ul-tau)
- Steps:
  1. You must first be accepted in the program.
  2. Go to [Tools > My feeds](https://businessleague.2performant.com/affiliate/tools/my-feeds/) and click "Add Product Feed".
  3. Name the feed, use "Select program", and click "+" on the feeds you want.
  4. Configure the fields by drag and drop between Available and Active. "Primele trei campuri sunt blocate" (→ the first three fields are locked).
  5. Click "Save".
  6. On My Feeds, "fa click ... pe butonul de CSV sau XML si URL-ul feed-ului va fi salvat in clipboard" (→ the CSV or XML button copies the feed URL for your importer).
  7. "Recomandarea noastra este sa creezi un singur feed per advertiser." (→ create one feed per advertiser.)
- **Affiliate feed field names** (exact labels from the same article): Product title; Marketer Link ("linkul de afiliere care incepe cu //event.2performant.ro/events/"); Sale price; Merchant Program; Image URLs; Description; Merchant program ID; Old price; Category; Product ID; Other data ("in format JSON"); Brand; Active ("Daca produsul mai este activ sau nu"); Added at; Merchant URL; Product URL; GTIN; Custom Field 1, 2, 3, 4.
- Promotion-specific feeds are marked "Special product feed" under Promotions > Benefits & Tools. — [2P help: Feedul de produse asociat promotiilor](https://support.2performant.com/ro/hc/en-us/articles/115002517751-feedul-de-produse-asociat-promotiilor)
- ToS Product Feed definition: "...Product Feeds supply the content that is presented on many kinds of e-commerce and Affiliates' websites such as search engines, price comparison websites, and other similar aggregators of e-commerce information; Advertisers can (but are not obliged to) upload .csv Product Feeds in the Platform and Affiliates can create, download and use .csv and .xml Affiliate Product Feeds..." — [2P Terms of Services](https://2performant.com/terms-conditions/)
- The public API docs have no feed endpoint. `api_data.js` contains no `feed_url` or `/affiliate/product…` route, only the `product_feeds_count` and `products_count` program fields. — [doc.2performant.com api_data.js](https://doc.2performant.com/api_data.js)

**Approval per program and network-level rules**
- Apply via Merchants > Merchant ranking. "Sistemul 2Performant nu impune o limita de aplicare la campanii." (→ no limit on applications.)
- Statuses: Pending, Approved, Banned, Pending Ban and Pending Remove ("preaviz 30 de zile", → 30 days' notice), and Past merchants.
- "Colaborarile in asteptare (Pending) vor fi procesate automat in 15 zile". This is "bazata pe potrivirea sursei de trafic" (→ pending applications are auto-approved or rejected after 15 days by matching the affiliate's declared traffic sources against the merchant's).
- Source: [2P help: Cum aplic la o campanie?](https://support.2performant.com/ro/hc/en-us/articles/224717548-cum-aplic-la-o-campanie-)
- ToS traffic-source system: advertisers tick each traffic-source type "YES", "NO" or "MAYBE". Those account-level preferences prevail over program text. "Each Advertiser can have a a maximum of 5 collaborations with Affiliates who send traffic to that Advertiser through the CSS Traffic Source." — [2P Terms of Services](https://2performant.com/terms-conditions/)
- ToS on changes and notice: advertisers may "freely approve or refuse any application". Program conditions may be amended "only after having notified his Affiliates 3 months in advance", and termination needs 30 days' notice. Removal or ban notice is 3 months for Unicorn, 2 months for Corporation and 1 month for Company, Start-up and Freelancers affiliates. — [2P Terms of Services](https://2performant.com/terms-conditions/)
- **ToS §9, Platform right of use (verbatim):** "2Performant grants the Users ... a nonexclusive, nontransferable, non-sub licensable and revocable right and license, to use the applications and data, made available through the Platform by 2Performant. For the avoidance of any doubts, no further rights are granted to the User, who is particularly not authorized to: forward or make said applications or data ... available to third parties ...; modify or otherwise alter said applications or data ...; use said applications or data to create a database of their own and/or an information service." — [2P Terms of Services](https://2performant.com/terms-conditions/)
- Network-wide Google Ads rule: "este interzisa derularea de campanii pe cuvinte cheie (keywords) care contin marcile advertiserilor (brand) sau numele de domenii" (→ brand and domain keywords banned network-wide). — [2P help: Google Ads](https://support.2performant.com/ro/hc/en-us/articles/224717828-cum-pot-fi-promovati-advertiserii-prin-google-ads-)
- 2P's own guides promote comparators:
  - "Price comparators — If skilled enough, you can create a site that gathers up products and compares their prices on the different stores that you want to advertise." — [2P guide: Why 2Performant?](https://2performant.com/guides/affiliates-guide-in-2performant/articles/why-2performant/)
  - "You can use a feed for price comparison sites, cash-back sites and/or coupon aggregators." — [2P guide: Promoting tools and methods](https://2performant.com/guides/affiliates-guide-in-2performant/articles/promoting-tools-and-methods/)
  - Affiliate types listed for advertisers include "site aggregators, price comparison sites, cashback". — [2P guide: Types of Affiliates](https://2performant.com/guides/advertisers-guide-in-2performant/articles/types-of-affiliates/)
- Traffic-source names in API examples are "Google Ads - search", "Google Ads - display" (status deleted, end_at 2023-11-22), "Google Shopping Ads (CSS)", "Cashbacks" and "Coupons/Vouchers", with usage values "yes" / "not_defined". No "price comparison" type appears in the examples. — [doc.2performant.com api_data.js](https://doc.2performant.com/api_data.js)

**A comparator-type affiliate already succeeds on 2P**
- Business League Pulse W43 (26 Oct 2026): "Ovidiu.Golea-BigConvert.com reaches 33,042 sales in R3 (+37.1% YoY), followed by pricealert.ro (10,824, +21.7% YoY)". Round 3 ran 5–25 Oct 2026. — [Business League Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/)
- pricealert.ro (page title "PriceArena") is a fashion offer-comparison site. Its "Magazine Partenere" page lists 48 shops. 32 of them match 2P Romanian programs, including Answear, Aldo shoes, Otter, Chicco, Sneakerit, Menzo and Kedoo. The other 16 include Priveboutique (a Profitshare advertiser), Underarmour and Sportdepot. Outbound links run through `/go-best/go-affiliate`. — [pricealert.ro partner shops](https://www.pricealert.ro/magazine-partenere); [pricealert.ro](https://www.pricealert.ro/); [Profitshare fashion](https://profitshare.ro/affiliate-programs/fashion)

**New-affiliate incentive (Oct 2026)**
- 2P's "Operation Robin Hood" first sent the network fee to Newcomers ("in their first 9 months of activity"). "Starting this week ... Freelancers-tier affiliates ... receive 100% of the network fee until the end of Season 5." — [Business League Pulse W42](https://blog.businessleague.com/businessleague-pulse-w42-rankings-numbers-and-round-3-winners/)
- The W43 post instead says "Starting October 22, for an indefinite period, all stores in the Freelancers tier offer 60% higher commissions". This is a conflict: W42 attaches the fee transfer to the affiliate tier, W43 to the store tier. — [Business League Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/)
- Weekly network volume: 44,784 sales (+14.0% YoY) and 1.35M clicks (+29.2% YoY) in W43 2026. — [Business League Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/)

### Inferences
- **Entity:** a persoană fizică can start immediately. At scale an SRL (or PFA) is cleaner: individuals face possible CAS/CASS on top of the 10% withholding, and the ToS frames affiliates as acting "as professionals". Pretoscop will also need B2B invoicing for any later CPC revenue.
- **The §9 licence clause conflicts with 2P's own encouragement of comparators.** It plausibly targets reselling platform data, but a long-term price-history database built from feed prices is literally "a database of their own". Get 2P's written confirmation that storing feed prices and showing price history on a public comparator is allowed. Consider also recording prices observed on the merchant's public page.
- **Engineering:** the affiliate feed has no explicit stock or availability field (only "Active") and no shipping-cost field. Stock and delivery data must come from "Other data" (JSON) or custom fields, where present, or from other sources. Product ID is merchant-specific. GTIN is optional, so matching needs GTIN, brand + MPN-like fields, or titles.
- **Approval:** declare "price comparison / product aggregator / price history" precisely in the affiliate profile and message each advertiser. Auto-processing after 15 days follows traffic-source matching, so a vague profile risks auto-rejection.
- **Commercial:** pricealert.ro's roughly 3,600 sales a week shows that 2P feeds plus fashion advertisers can sustain a comparator-style affiliate at the top of the network. Pretoscop's electronics focus is the harder vertical.

### Gaps
- How often affiliate-side feed URLs (My feeds) are regenerated is not documented. Advertiser feeds are pulled 3–4×/day (known).
- Whether a selectable "price comparison" traffic-source type exists in the logged-in UI could not be verified without an account.
- Whether PFA payees get withholding or self-assess is not stated.
- The ToS page shows no "last updated" date. Its notes reference October–November 2023 changes.

## 2. Advertiser presence and rules for the target retailers (2Performant, Profitshare, Awin, CJ, Tradedoubler, CityAds, others)

### Takeaway
Most named retailers run no affiliate program reachable from Romania. Where programs exist:
- **2P:** Decathlon (closing 31.10.2026), Notino, Answear, Noriel, Dr. Max, Petmart, Bonami and Cărturești. Also XXXLutz, Kärcher, Lancôme, Kiehl's, Yves Rocher, Chicco and the ASUS eShop.
- **Awin:** Douglas RO, Samsung RO and Xiaomi RO.
- **CJ:** About You RO, Answear RO and Notino RO.
- **Tradedoubler and CityAds:** Modivo and ePantofi. About You RO joined Tradedoubler in June 2026.
- **No program found** for Altex, Media Galaxy, Flanco (Profitshare "inactiv", absent from 2P), cel.ro, iStyle, EuroGSM, Dedeman, Leroy Merlin, Hornbach, Jysk, Vivre, Sephora RO, Dyson RO, Sports Direct, Hervis, Carrefour, Auchan or Mega Image/Freshful.
- **Explicit comparator rules:** Decathlon accepts comparators (5%) and the ASUS eShop bans them. Notino and Answear are silent. 18 smaller 2P programs explicitly accept comparators or aggregators.

### Cited Findings

**Directory scans (Oct 2026)**
- **2P Romania directory:** 32 pages and 378 public programs (full scan of [2P country/romania](https://2performant.com/country/romania/) and each program page).
  - Of 335 programs with a numeric commission: median 8.0%, mean 8.63%.
  - Cookie: median 30 days. 271 programs use 30 days, 64 use 60, 21 use 31, 10 use 90; the minimum is 10 days.
  - All 378 pages show "Tools available: Banners, Product feeds", so the label looks like a template and does not prove a live feed.
- **Profitshare's active directory** has about 61 programs (category counts: IT&C 14, Casa & Decoratiuni 11, Retail 7, Fashion 6, other categories 1–4). None of the target retailers appears beyond eMAG, Fashion Days and Libris (known). Kärcher (5%) and Fornello (3%) are in Casa & Decoratiuni. — [Profitshare programs](https://profitshare.ro/affiliate-programs); [Profitshare Casa & Decoratiuni](https://profitshare.ro/affiliate-programs/casa-si-decoratiuni)
- **Flanco on Profitshare:** "Advertiser inactiv in Profitshare". — [Profitshare – Flanco](https://profitshare.ro/affiliate-programs/retail/flanco)
- **Affilitizer** (tracks CJ, Awin, Tradedoubler, CityAds, FlexOffers, Rakuten and others, but evidently not 2P or Profitshare) says Romania has "4,169 affiliate programs available". — [Affilitizer Romania](https://www.affilitizer.com/countries/ro)
  - It returns "Program Not Found" for altex.ro, flanco.ro, mediagalaxy.ro, cel.ro, eurogsm.ro, istyle.ro, dedeman.ro, leroymerlin.ro, hornbach.ro, jysk.ro, vivre.ro, sephora.ro, dyson.ro, sportsdirect.ro, hervis.ro, carrefour.ro, auchan.ro, freshful.ro, mega-image.ro, decathlon.ro, drmax.ro, noriel.ro, petmart.ro, carturesti.ro, pcgarage.ro, elefant.ro and emag.ro. Example: [Affilitizer altex.ro](https://www.affilitizer.com/programs/altex.ro).
  - Global pages show Dyson only on FlexOffers and dgmaxinteractive, and Sephora only on Rakuten and FlexOffers for the US and Canada, with no Romanian entries. — [Affilitizer dyson.com](https://www.affilitizer.com/programs/dyson.com); [Affilitizer sephora.com](https://www.affilitizer.com/programs/sephora.com)

**Per-retailer table** (verbatim rules where stated)

| Retailer | Network(s) and status | Commission | Cookie | Feed | Comparator / other rules | Source |
|---|---|---|---|---|---|---|
| **Decathlon** | 2P, listed since July 2019. **"Vă informăm că programul de afiliere Decathlon se va închide începând cu data de 31.10.2026."** (→ the program closes from 31 Oct 2026) | 5.0% | 10 days; time to payment 46 days | "Product feeds" label | **Accepts comparators:** "5% pentru vânzările generate de catre creatori de content (Blog, YouTube etc) + comparatoare de produse" | [2P – Decathlon](https://2performant.com/affiliate-programs/sports-outdoors/decathlon-ro/) |
| **Answear** | 2P (since Nov 2015, ranked 9th) **and** CJ (program ID 4877962, since May 2024) | 7.0% (2P) | 15 days; time to payment 57 days | label | "Promovare prin Google Adwords, Facebook Ads și TikTok Ads este interzisă." The 2P page says nothing about comparators, but Answear is listed on comparator site pricealert.ro | [2P – Answear](https://2performant.com/affiliate-programs/fashion/answear-ro/); [Affilitizer answear.ro](https://www.affilitizer.com/programs/answear.ro); [pricealert.ro](https://www.pricealert.ro/magazine-partenere) |
| **Notino** | 2P (since Jan 2017) **and** CJ (ID 4536684, since May 2024) | 4.0% (2P) | 30 days; time to payment 42 days | label | "Înainte de a trimite cererea vă rugăm să completați Websites și Other traffic sources. Fără profilul completat cererea dvs. nu va fi aprobată. Promovările prin SEM, PPC sau newsletter sunt interzise!" No comparator rule | [2P – Notino](https://2performant.com/affiliate-programs/beauty/notino-ro/); [Affilitizer notino.ro](https://www.affilitizer.com/programs/notino.ro) |
| **About You** | CJ (advertiser cid 5247366, since May 2024) and Tradedoubler (since Jun 2026). Not on 2P | FlexOffers lists "12% of sales (New Customer) and 1.6% of sales (Existing Customer)" (last updated 3 Feb 2025) | not confirmed (a search summary said 7 days) | unknown | Not public | [Affilitizer aboutyou.ro](https://www.affilitizer.com/programs/aboutyou.ro); [FlexOffers About You RO](https://www.flexoffers.com/affiliate-programs/aboutyou-ro-affiliate-program/) |
| **Modivo** | Tradedoubler (since Mar 2020) and CityAds ("Modivo new RO CPS", offer 42381, since Jul 2025) | FlexOffers: "4.8% of sales" (last updated 24 Jan 2025) | conflicting third-party figures (10 or 30 days) | unknown | Not public | [Affilitizer modivo.ro](https://www.affilitizer.com/programs/modivo.ro); [FlexOffers Modivo RO](https://www.flexoffers.com/affiliate-programs/modivo-ro-affiliate-program/) |
| **ePantofi** (same group as Modivo) | Tradedoubler (since Dec 2018) and CityAds (offer 42371, since Jul 2025) | – | – | – | – | [Affilitizer epantofi.ro](https://www.affilitizer.com/programs/epantofi.ro) |
| **Douglas** | Awin "Douglas_RO" (ID 16122, since Feb 2024); "The registration is valid for Romania!" | "5% commission per sale" | "30 Days" | "Daily updated product data" | "only coupon codes that are explicitly approved for application in the Affiliate Marketing channel may be advertised". No comparator, PPC or CSS rule on the profile | [Awin – Douglas_RO](https://ui.awin.com/merchant-profile/16122); [Affilitizer douglas.ro](https://www.affilitizer.com/programs/douglas.ro) |
| **Samsung RO store** | Awin "Samsung RO" (ID 21720, since Feb 2024; Samsung Electronics Romania SRL) | "earn up to 2% commission" | "30 Days" | not mentioned | Vouchers allowed ("both generic and exclusive codes possible"). "Transactions whereby a code not intended for the Affiliate channel has been used will be paid out at 0% commission". No comparator rule | [Awin – Samsung RO](https://ui.awin.com/merchant-profile/21720); [Affilitizer samsung.com](https://www.affilitizer.com/programs/samsung.com) |
| **Xiaomi RO store** | Awin "Xiaomi RO" (ID 118223, since Sep 2025) | "Earn up to 5% based on category and performance" | "30 Days" | "Regularly refreshed banners, product feeds, and tracking tools" | Targets "tech reviewers, deal aggregators, and lifestyle influencers". No comparator rule | [Awin – Xiaomi RO](https://ui.awin.com/merchant-profile/118223); [Affilitizer mi.com](https://www.affilitizer.com/programs/mi.com) |
| **ASUS eShop** (Apple/OEM proxy) | 2P (since May 2022) | 3.0% | 30 days | label | **Bans aggregators:** "În acest moment nu putem accepta promovarea prin listarea pe agregatoarele de prețuri si de produse. Acceptam promovarea prin PPC si CSS, dar este interzis brand bidding-ul" | [2P – ASUS](https://2performant.com/affiliate-programs/electronics/asus-com/) |
| **Bonami** | 2P active (3%, terms known). CJ program May 2024 – Jan 2025, closed | 3.0% | 30 days; time to payment 61 days | label | No comparator rule | [2P – Bonami](https://2performant.com/affiliate-programs/home-garden/bonami-ro/); [Affilitizer bonami.ro](https://www.affilitizer.com/programs/bonami.ro) |
| **Noriel** | 2P | 7.0% | 14 days; time to payment 50 days | label | (known: no Google/FB Ads) | [2P – Noriel](https://2performant.com/affiliate-programs/babies-kids-toys/noriel-ro/) |
| **Dr. Max** | 2P (3rd in Round 3 sales: 7,302) | variable | 15 days; time to payment 52 days | label | No comparator rule | [2P – Dr. Max](https://2performant.com/affiliate-programs/pharma/drmax-ro/); [Pulse W43](https://blog.businessleague.com/businessleague-pulse-w43-rankings-numbers-and-round-3-winners/) |
| **Petmart** | 2P | 5.0% | 30 days; time to payment 38 days | label | No rules | [2P – Petmart](https://2performant.com/affiliate-programs/pet-supplies/petmart-ro/) |
| **Cărturești** | 2P | 9.0% | 31 days; time to payment 45 days | label | A challenge counts "agregatoare de produse" as legitimate "Non-paid traffic (postări în social media, Facebook Groups, cupoane, cashback, content, agregatoare de produse etc.)" | [2P – Cărturești](https://2performant.com/affiliate-programs/books/carturesti-ro/) |
| **XXXLutz** (furniture, extra) | 2P (since Dec 2024) | "Standard 3% comision"; "Publisheri de tip cupoane & cashback primesc 3% comision" | 30 days; time to payment 60 days | label | No comparator rule | [2P – XXXLutz](https://2performant.com/affiliate-programs/home-garden/xxxlutz-ro/) |
| **Kärcher** (extra) | 2P and Profitshare | 5.0% (both) | 60 days (2P) | label | – | [2P – Kärcher](https://2performant.com/affiliate-programs/home-garden/karcher-com-ro-ro/); [Profitshare Casa](https://profitshare.ro/affiliate-programs/casa-si-decoratiuni) |
| **Lancôme / Kiehl's / Yves Rocher** (beauty brands, extra) | 2P | 8.0% each | 30 days | label | – | [2P – Lancôme](https://2performant.com/affiliate-programs/beauty/lancome-ro/); [2P – Kiehl's](https://2performant.com/affiliate-programs/beauty/kiehls-ro/); [2P – Yves Rocher](https://2performant.com/affiliate-programs/beauty/yves-rocher-ro/) |
| **Hervis** | Named as an active 2P advertiser in Q1 2025 (known) but **absent** from the Oct 2026 directory of 378 programs. Not on Affilitizer | – | – | – | – | [2P country/romania](https://2performant.com/country/romania/) |
| **Flanco** | Profitshare "Advertiser inactiv". Absent from 2P (Oct 2026). No 2026 program found | – | – | – | – | [Profitshare – Flanco](https://profitshare.ro/affiliate-programs/retail/flanco) |
| **Altex / Media Galaxy, cel.ro, iStyle, EuroGSM, Dedeman, Leroy Merlin, Hornbach, Jysk, Vivre, Sephora RO, Dyson RO, Sports Direct, Carrefour, Auchan, Mega Image/Freshful** | No program in the 2P directory, the Profitshare directory or Affilitizer. Searches for an Altex, Flanco or iStyle 2026 program returned nothing | – | – | – | – | [2P country/romania](https://2performant.com/country/romania/); [Profitshare programs](https://profitshare.ro/affiliate-programs); [Affilitizer](https://www.affilitizer.com/programs/altex.ro) |

**2P programs that explicitly accept comparators or aggregators** (verbatim snippets from each program page)
- Libris: "– Agregatoare de produse/oferte – Comparatoare de preturi". Libris also has a one-network rule: "Nota: Este interzisa activarea unui afiliat concomitent in mai multe platforme de marketing afiliat. In caz ca un afiliat inregistreaza comisioane in aceeasi perioada in mai multe platforme, afiliatul va fi notificat, iar ulterior suspendat daca nu se ajunge la un acord intre parti." (→ an affiliate may not be active on several affiliate platforms at once; offenders are notified, then suspended.) — [2P – Libris](https://2performant.com/affiliate-programs/books/libris-ro/)
- Krista: "– Comparatoare de prețuri – Agregatoare de produse (site-uri de feed-uri)". — [2P – Krista](https://2performant.com/affiliate-programs/babies-kids-toys/krista-ro/)
- Liki24: "Allowed types of traffic: ... Google CSS partners; ... price comparison sites". — [2P – Liki24](https://2performant.com/affiliate-programs/pharma/liki24-ro/)
- Depozit Solar: "Google Ads – Shopping (CSS Projects) - Comparatoare de preturi - Agregatoare de produse". — [2P – Depozit Solar](https://2performant.com/affiliate-programs/home-garden/depozitsolar-ro/)
- Detoxmed: "Feed de produse activ: gata de folosit în Google Shopping, CSS și comparatoare de prețuri." — [2P – Detoxmed](https://2performant.com/affiliate-programs/health/detoxmed-ro/)
- Trada: "– Agregatoare de produse/oferte – Comparatoare de prețuri". — [2P – Trada](https://2performant.com/affiliate-programs/online-mall/trada-ro/)
- Bagno: "acceptam ... cashback, agregatoare, comparatoare pret". — [2P – Bagno](https://2performant.com/affiliate-programs/home-garden/bagno-ro/)
- Others with comparator/aggregator wording:
  - [Editura Arthur](https://2performant.com/affiliate-programs/books/editura-arthur-ro/)
  - [Femieko](https://2performant.com/affiliate-programs/health/femieko-ro/)
  - [Aqualine](https://2performant.com/affiliate-programs/home-garden/aqualine-ro/)
  - [Atelier49](https://2performant.com/affiliate-programs/home-garden/atelier49-ro/)
  - [Magazinul de Șah](https://2performant.com/affiliate-programs/games/magazinuldesah-ro/)
  - [Jojofashion](https://2performant.com/affiliate-programs/fashion/jojofashion-ro/) (feed "pentru integrarea ușoară în site-uri, comparatoare")
  - [PrintreCarti](https://2performant.com/affiliate-programs/books/printrecarti-ro/)
  - [Hobik Toys](https://2performant.com/affiliate-programs/babies-kids-toys/hobiktoys-ro/) ("Site-uri de comparare prețuri")
  - [BabyNeeds](https://2performant.com/affiliate-programs/babies-kids-toys/babyneeds-ro/) and [Creativ](https://2performant.com/affiliate-programs/gifts-flowers/creativ-ro/) ("agregatoare de oferte")
- A keyword scan of all 378 program pages, for Romanian and English comparator and aggregator terms ("comparat-", "comparare", "agregat-", "price comparison", "aggregat-"), found only one explicit ban: ASUS (above). Bans worded differently, or in the logged-in ToS text that is not on the public page, would not show up.

**Closure notices on 2P programs (Oct–Nov 2026)**
- Decathlon, 31.10.2026 — [link](https://2performant.com/affiliate-programs/sports-outdoors/decathlon-ro/)
- eHranaAnimale, 05.11.2026 — [link](https://2performant.com/affiliate-programs/pet-supplies/ehranaanimale-ro/)
- Arabescu, 20.11.2026 — [link](https://2performant.com/affiliate-programs/beauty/arabescu-ro/)
- Lesami, 20.11.2026 — [link](https://2performant.com/affiliate-programs/beauty/lesami-ro/)
- Druzy, 22.11.2026 — [link](https://2performant.com/affiliate-programs/jewelry/druzy-ro/)
- Hobik Toys, 25.11.2026 — [link](https://2performant.com/affiliate-programs/babies-kids-toys/hobiktoys-ro/)
- Fără Dăunători, 25.11.2026 — [link](https://2performant.com/affiliate-programs/home-garden/fara-daunatori-ro/)

### Inferences
- **Electronics is the critical hole.** Altex/Media Galaxy, Flanco, PC Garage (Profitshare inactive, known), cel.ro, iStyle and EuroGSM have no live affiliate program. The ASUS eShop bans aggregators, and Samsung pays only up to 2%. Electronics coverage will depend on crawling or direct deals, not affiliate feeds.
- **Fashion and beauty are partly reachable**, but through several networks. About You, Answear and Notino are on CJ; Modivo and ePantofi on Tradedoubler or CityAds; Douglas, Samsung and Xiaomi on Awin. That means three or four extra network accounts, each with its own approval and feed format.
- **One-network clauses** (Libris; Fashion Days, known) mean Pretoscop must choose one network per advertiser, typically 2P for Libris.
- **Decathlon is the only large retailer that explicitly allowed comparators, and it leaves 2P on 31.10.2026.** The cluster of closure notices (seven programs within four weeks) may signal churn ahead of 2P's season and fee changes. That is unverified; it is only a pattern in program texts.
- **"Silent" programs (Notino, Answear, Dr. Max, Petmart) should be asked in writing.** pricealert.ro listing Answear suggests comparator traffic is tolerated in practice, but that is not a rule.

### Gaps
- CJ, Tradedoubler and CityAds program terms (commission, cookie, feeds, comparator policy) for About You, Answear, Notino, Modivo and ePantofi are behind network logins and were not read.
- Impact, Partnerize, Webgains and Sovrn/Skimlinks were not checked directly. Affilitizer's coverage of those networks is unknown, so "not found" is limited to 2P, Profitshare and Affilitizer's networks.
- Apple Authorised Resellers other than iStyle, and Dyson's own RO store, were not found on any checked network. Absence from public directories does not rule out private programs.

## 3. Merchant click prices on Romanian comparators (compari.ro, ShopMania, Pricy, price.ro)

### Takeaway
Compari's per-category XLSX click price list is still unobtainable (403 and no archive copy), but its billing mechanics are now documented:
- **Free mode:** 1 RON registration, capped at 100 clicks/day for the first 60 days, then 25 clicks/day.
- **PPC:** 150 RON minimum top-up; products up to 5 RON are not charged; uncategorised clicks cost 0.3 RON [search summary].
- **Bidding:** multipliers, second-price style.
- **Premium package:** 80–100 RON/month.
- **Compari's CSS service:** 0.20 RON default max CPC plus a 10% fee [search summary].

The best same-group proxy is Heureka.sk's live October 2026 list (EUR, excluding VAT). Its median click price is about €0.28 for a €100 product, €0.48 at €500 and €0.53 at €1,000, with a maximum of €1.51. ShopMania, price.ro and Pricy publish no merchant tariffs.

### Cited Findings

**Compari.ro billing model** (Heureka Group Help Center, "Romania (Compari)" section)
- **Free mode:** "First you have to pay a registration fee of 1 RON ... For the first 60 days after registration, products up to 100 clicks per day will remain on the product cards. After 60 days, this number is reduced to 25 clicks per day. Once this limit is reached, the products are removed from the comparison by the end of the day." — [Heureka Help: Registration (Compari)](https://sluzby.heureka.sk/help/registration/)
- **Paid mode:** "the credit is recharged after receiving the feed ... The minimum amount is 150 RON." The feed URL goes in "Datele magazinului -> Sursa listei produselor", and confirmation follows "within 1-2 working days". — [Heureka Help: Registration (Compari)](https://sluzby.heureka.sk/help/registration/)
- **Bidding:**
  - Bidding gets an offer into "the top three positions of recommended offers in the product cards" on cards "with at least four sellers".
  - "For products up to 5 RON, the price per click is not charged."
  - Ranking uses "the price offered and other established criteria, such as the Verified by Customers certificate level, average rating and product price".
  - "The eshop does not pay the maximum offered price, but only the price required for placement in the given position."
  - Order of application: Product > Category > Basic bidding. Bidding in the feed is via `MaxCPCMultiplier`.
  - Source: [Heureka Help: Compari bidding](https://sluzby.heureka.sk/help/compari-bidding/)
- **Premium package** (Standard vs Premium):
  - Price updates from the feed: 1×/day vs 6×/day. Bidding via feed: 1×/day vs 7×/day. PPC statistics: 30 vs 180 days.
  - Premium adds "Compari Top 50", qualitative analysis, promotional text and the unpaired-products report.
  - Price: 100 RON/month (1 month), 90 RON/month (6 months), 80 RON/month (12 months).
  - Source: [Heureka Help: Premium package (Compari)](https://sluzby.heureka.sk/help/premium-package-pachete-de-servicii-compari-ro/)
- **Per-click prices:** they depend on category and "gross price band" and are published as an Excel table excluding VAT. "Clicks on store-page products that aren't assigned to a category are counted at 0.3 RON." [search summary] — [compari.ro pricing information](https://www.compari.ro/static/pricing-information.html)
- **Compari "Shopping" (CSS) service:** "default maximum price is 0.20 RON net per click, with a daily limit of 15 RON net per category ... Compari charges a 10% commission on Google advertising costs." [search summary] — [compari.ro shopping](https://www.compari.ro/static/shopping.html)
- Direct requests to compari.ro, inspiratie.compari.ro, api.compari.ro, arukereso.hu and pazaruvaj.com pricing pages all returned HTTP 403. The Wayback availability API has no snapshot of `compari.ro/static/pricing-information.html` or `bidding.html`. — [Wayback availability API](https://archive.org/wayback/available?url=compari.ro/static/pricing-information.html)

**Heureka.sk click price list (proxy; EUR, excluding VAT; active list downloaded 2026-10-27)**
- 164 categories × 50 price bands. No charge for products up to €0.66. Clicks from full-text search and the shop-detail page cost a flat "0,153 EUR". Prices have been adjusted in "približne dvojtýždňových intervaloch" (→ roughly two-week intervals) since 9 Oct 2024. — [Heureka.sk Cenník preklikov](https://sluzby.heureka.sk/napoveda/cennik-preklikov/); [CSV](https://api.heureka.sk/v1/price-list/active/download/?format=csv)
- Median across categories (with interquartile range):

| Product price | Median CPC | IQR |
|---|---|---|
| €50 | €0.197 | €0.15–0.27 |
| €100 | €0.279 | €0.20–0.35 |
| €300 | €0.412 | €0.29–0.60 |
| €500 | €0.484 | €0.35–0.68 |
| €1,000 | €0.527 | €0.38–0.75 |

  The maximum is €1.506. Computed from the [CSV](https://api.heureka.sk/v1/price-list/active/download/?format=csv).
- Category examples (CPC at product prices of €100 / €300 / €500 / €1,000; source: [CSV](https://api.heureka.sk/v1/price-list/active/download/?format=csv)):

| Category | €100 | €300 | €500 | €1,000 |
|---|---|---|---|---|
| Mobile phones | €0.181 | €0.292 | €0.339 | €0.418 |
| Notebooks | €0.093 | €0.159 | €0.215 | €0.250 |
| Televisions | €0.141 | €0.276 | €0.332 | €0.378 |
| Monitors | €0.178 | €0.256 | €0.313 | €0.351 |
| Washing machines | €0.218 | €0.444 | €0.539 | €0.620 |
| Refrigerators | €0.263 | €0.403 | €0.461 | €0.536 |

  Perfumes cost €0.278 at €100 and €0.412 from €300. Phone cases cost €0.802 from €100.

**Heureka.cz click price list (proxy; CZK, excluding VAT)**
- 184 categories. "U produktů do 20,00 Kč není cena prokliku účtována" (→ no charge up to 20 CZK). Full-text and shop-detail clicks cost a flat "3,49 Kč". Prices are adjusted "přibližně každé dva týdny" (→ about every two weeks). — [Heureka.cz Ceník prokliků](https://sluzby.heureka.cz/napoveda/cenik-prokliku/); [CSV](https://api.heureka.cz/v1/price-list/active/download/?format=csv)
- Examples at 500 / 2,500 / 7,500 / 12,500 CZK ([CSV](https://api.heureka.cz/v1/price-list/active/download/?format=csv)):

| Category | 500 CZK | 2,500 CZK | 7,500 CZK | 12,500 CZK |
|---|---|---|---|---|
| Mobile phones | 2.50 | 4.93 | 8.09 | 10.59 |
| Notebooks | 1.30 | 2.40 | 5.72 | 7.90 |
| TVs | 2.03 | 5.24 | 9.41 | 12.54 |
| Washing machines | 3.83 | 7.07 | 16.72 | 19.93 |

  All values in CZK.

**Benchmark for Romanian Google Shopping CPC:** a WebDigital analysis says the average CPC rose from 0.85 lei (2024 average) to 1.08 lei (2026 average), about +27%. [search summary] — [StartupCafe / WebDigital](https://startupcafe.ro/analiza-webdigital-efectele-presiunii-jucatorilor-externi-asupra-pietei-de-ecommerce-din-romania-104684)

**ShopMania, price.ro, Pricy**
- ShopMania's about page invites merchants: "Intra in programul de Parteneri ShopMania, listeaza-ti ofertele si pozitioneaza-te la un click distanta de un flux de trafic cu o intentie dovedita de cumparare." No prices are shown. — [ShopMania – about](https://www.shopmania.ro/info/about)
- The old merchant portal https://www.shopmania.biz/ now redirects to https://www.merchantpro.ro/ (HTTP check on 2026-10-27). A third-party guide describes free listing with a seal, plus paid "premium accounts where you pay a Cost-Per-Click". This is undated and has no rates. — [jxtgroup](https://www.jxtgroup.com/list-products-free-shopmania_3912898.html)
- price.ro runs a "Magazine partenere" admin area [search summary]. Direct fetches return 403. — [price.ro admin](https://www.price.ro/admin/)
- Base.com sells a price.ro integration: "Integrarea Base.com cu Price.ro vă permite să listați rapid mai multe oferte în categoriile de produse selectate ... stocurile și prețurile din oferta dvs. vor fi întotdeauna actualizate". Price.ro's fees are not stated. — [Base.com – Price.ro](https://base.com/ro-RO/integrari/pricero/)
- Pricy's SellerCenter description: "gestionează feedurile produselor, monitorizează clickurile și prețurile competitorilor pentru magazinul tău online" (→ manage product feeds, monitor clicks and competitors' prices). No public tariff (the page is a login-only Blazor app). — [seller.pricy.ro](https://seller.pricy.ro/)

### Inferences
- **Rough RON equivalents** of the Heureka.sk medians, at about 5.24 RON/EUR ([ZF ticker 5.2442](https://www.zf.ro/business-hi-tech/sorin-adrian-dochian-country-manager-compari-platforma-comparare-23181804)):
  - ≈1.0 RON per click for a 260 RON product;
  - ≈1.5 RON for a 525 RON product;
  - ≈2.5 RON for a 2,600 RON product;
  - ≈1.8 RON for a 2,600 RON phone.
- Compari's Romanian tariffs are plausibly lower, given lower purchasing power and Compari's 0.20 RON default for its CSS clicks, but that is unverified.
- **Pricing position for Pretoscop:** CPCs of 0.25–1.0 RON per click-out would undercut a Heureka-level schedule by 2–5× in electronics. A free tier with daily click caps, copying Compari's 100/25 clicks-per-day structure, is a proven onboarding pattern in this market.
- **Compari's Premium price-update frequency (6×/day)** sets a benchmark: if Pretoscop refreshes merchant feeds at least 6×/day for free, that is a concrete selling point.

### Gaps
- The actual Compari price table (XLSX) by category and price band remains unavailable because every route returns 403. A merchant account or a merchant contact would be needed.
- No ShopMania, price.ro or Pricy CPC tariffs were found, and no Romanian forum or blog quoting Compari CPC numbers turned up.
- The Árukereső (HU) and Pazaruvaj (BG) price lists also returned 403. They would be closer platform proxies than Heureka.sk.

## 4. Product content: Open Icecat licence and access, Romanian-language coverage, Verified by GS1, free GTIN lookups

### Takeaway
Open Icecat is free for sponsoring brands' data-sheets, under the Open Content License (OPL) and a Fair Use Policy. The obligations:
- "Specs Icecat" attribution and a database-right notice;
- an "AS IS" disclaimer;
- at most 1M data-sheet downloads per month per country/language repository (excess billable at €0.30 per 1,000);
- no AI training;
- a share-alike clause: OPL-derived works must be licensed free of charge to third parties.

Romanian ("RO", langid 23) is a supported locale. A live test returned Romanian-localised titles, summaries and spec labels, but an empty Romanian marketing description. Daily, full, on-market and no-editor index files exist. Verified by GS1 is free for 30 single-GTIN lookups per 24 hours. API and batch access go through member organisations, and GS1 Romania runs validat.gs1.ro. Free alternatives with real Romanian coverage are mainly Open Food Facts (49,003 Romania-tagged products).

### Cited Findings

**Open Icecat Fair Use Policy** (verbatim, [iceclog: Open Icecat Fair Use Policy](https://iceclog.com/open-icecat-fair-use-policy/))
- Requirements: "be fully compliant to the Open Content License Agreement"; "include explicitly the Open Icecat 'AS IS' disclaimer"; inform merchant and manufacturer contacts about Open Icecat.
- Users must also "update your organization's robot.txt to explicitly exclude the systematic download by crawlers that are potentially violating the copyrights of materials on your website for purposes other than promoting your organization's business, for example but not limited to: training of AIs, analytics, content aggregation, etc."
- Prohibited: "usage of product content that violates the purpose for which a manufacturer, brand owner, or other content supplier, is providing the respective product content, typically for the sole purpose of promoting and advancing the respective brand owner's products and services".
- Volume cap: "excessive downloading, i.e., more than 1 million data-sheet downloads per month for a single country/language repository. Icecat can decide to apply an excessive use charge of 0.30 Euro per 1000 downloads in excess of 1 million downloads per month."
- AI: "automated scraping, data mining, or harvesting for the purpose of training machine learning models ... is strictly prohibited without a commercial license."
- "Compliance with the directives in Icecat's robots.txt file is a mandatory condition of your license".

**Open Content License (OPL)** (verbatim, [iceclog: Open Content License](https://iceclog.com/open-content-license/))
- §1: "You may copy and distribute exact replicas of the OIC ... provided that you conspicuously and appropriately publish on each copy an appropriate copyright/database right notice ('Database Right data-sheet [Year] Icecat. All rights reserved.') and disclaimer of warranty ... You may not charge a fee for the OIC itself. You may not charge a fee for the sole service of providing access to and/or use of the OIC via a network".
- §2: modifications must "carry prominent notices stating that you changed it". §2b: "You must cause any work that you distribute or publish, that in whole or in part contains or is derived from the OIC or any part thereof, to be licensed as a whole at no charge to all third parties under the terms of this License, unless otherwise permitted under applicable Fair Use law."
- §4: "you should store and use the most recent (versions of) OIC".
- §7: you register "for a free Open Icecat account" and allow usage information to be shared with the copyright holders.
- §10: "the permission to copy, redistribute, or modify OIC is strictly conditional upon the data NOT being utilized for machine learning training, algorithmic model generation, or automated synthetic content creation."

**Open vs Full; endpoints** ([iceclog: OCI manual, Version 2.8, updated 6 Oct 2026](https://iceclog.com/open-catalog-interface-oci-open-icecat-xml-and-full-icecat-xml-repositories/))
- "The Open Icecat repository is the part of the Icecat XML repository that is sponsored by Brands and is provided for free to the channel." The technical structures are "100% compatible" with Full Icecat.
- Required on web pages: "mention explicitly the 'Specs Icecat' on all product datasheets, with a link to Icecat.biz", "include explicitly an AS IS Disclaimer", and "not use Icecat data for AI training".
- Open uses `https://data.icecat.biz/export/freexml/EN/<id>.xml`; Full uses `.../export/level4/...`. GTIN lookup goes through `xml_server3.cgi?ean_upc=`.
- Brand-restricted products ("Publish=Limited") need authorised-reseller status.
- Requests need login and password plus a whitelisted IP or dynamic tokens.
- The language picker includes "Romanian".
- Locale table: "RO — Romanian – Romania — Română – Romania" with numeric ID 23. — [iceclog: Icecat locales](https://iceclog.com/icecat-locales-and-language-code-table/)

**Index files** ([iceclog: batch processing manual, v2.0, 12 Jun 2026](https://iceclog.com/manual-icecat-product-xmls-batch-processing/))
- "Icecat creates a daily.index.xml file every day to keep channel partners informed about products that were updated in the past 24 hours." It also lists removed products (Quality=REMOVED).
- Other files: `files.index.xml` (full), `on_market.index.xml` ("only the products that we can guarantee are distributed in certain country") and `nobody.index.xml` (no data-sheet).
- Paths are per locale, e.g. `https://data.icecat.biz/export/freexml/EN/daily.index.xml.gz`.

**Live JSON API** ([iceclog: Manual for Icecat JSON Product Requests, v3.0, 13 Oct 2026](https://iceclog.com/manual-for-icecat-json-product-requests/))
- Endpoint `https://live.icecat.biz/api`, authenticated with `api-token` and `content-token` headers.
- "Without tokens, for an Open Icecat product, with the public demo account: https://live.icecat.biz/api?lang=EN&shopname=openicecat-live&icecat_id=56195846". "Open Icecat products need no app key: shopname is enough."
- **Live test with lang=RO** (2026-10-27, demo account, Dell G5 5587, icecat_id 56195846, GTIN 5397184119709):
  - The Romanian title came back ("... Laptop 39,6 cm (15.6\") Full HD 16 Giga Bites ... Negru").
  - The Romanian `LongSummaryDescription` came back ("Tipul de produs: Laptop, Factorul de formă: Clapetă...") along with Romanian feature names ("Tipul de produs").
  - `Description.LongDesc` (marketing text) was **empty**. There were 13 gallery images on images.icecat.biz.
  - The response flagged `DemoAccount: true`.
  - Request: [live.icecat.biz test request](https://live.icecat.biz/api?lang=RO&shopname=openicecat-live&icecat_id=56195846)

**Verified by GS1**
- "The Verified by GS1 service on gs1.org allows users to perform up to 30 single GTIN queries in any 24-hour period. This is a security requirement." On reaching the limit: "please contact your GS1 Member Organisation." — [GS1 support: query limit](https://support.gs1.org/support/solutions/articles/43000734075-how-many-queries-can-a-user-perform-using-the-verified-by-gs1-service-on-gs1-org-)
- "GS1 members can access more advanced querying capabilities like an API connection though their GS1 member organisation". — [GS1 support: who uses Verified by GS1](https://support.gs1.org/support/solutions/articles/43000734112-who-is-using-verified-by-gs1-is-verified-by-gs1-used-by-marketplaces-)
- "Users can query for GTINs one at a time. Batch querying is not supported." — [GS1 support: how to use](https://support.gs1.org/support/solutions/articles/43000734111-how-can-i-use-the-verified-by-gs1-service-on-gs1-org-)
- "Enterprise-level capabilities are also available for retrieving data such as batch querying and API connection". The basic data is mostly licensee (company) information, often "enough for many marketplaces to validate" listings. — [gs1.org Verified by GS1](https://www.gs1.org/services/verified-by-gs1)
- GS1 Romania's portal: "Verified by GS1 este serviciul care permite verificarea identității produselor, companiilor și a altor identificatori GS1, folosind informații furnizate direct de titularii licențelor GS1." It links to [validat.gs1.ro](https://validat.gs1.ro/validat/) and promotes GS1 Romania membership. — [GS1 România – Verified by GS1](https://gs1.ro/verified-by-gs1)

**Free or cheap GTIN alternatives**
- Open Food Facts API: `"count":49003` products tagged Romania. — [OFF API query](https://world.openfoodfacts.org/api/v2/search?countries_tags_en=romania&page_size=1&fields=code)
- Open Beauty Facts: `"count":686` Romania-tagged products. — [OBF API query](https://world.openbeautyfacts.org/api/v2/search?countries_tags_en=romania&page_size=1&fields=code)
- UPCitemdb: "plan FREE allows total of 100 combined requests per day", with a burst limit of 6 requests per minute (HTTP 429 beyond that). — [UPCitemdb rate limits](https://www.upcitemdb.com/wp/docs/main/development/api-rate-limits/)
- EAN-Search.org: "full database with 1,3 billion barcodes". Plans: Trial 100 queries/month (1 EUR first month, then 9 EUR/month); 5,000/month for 19 EUR; 50,000/month for 39 EUR. — [EAN-Search API](https://www.ean-search.org/ean-database-api.html)

### Inferences
- **Using Open Icecat on Pretoscop's free public product pages looks compliant**, given "Specs Icecat" plus a link, the database-right notice, an AS IS disclaimer and staying under 1M downloads a month per locale.
- **Two things are out of bounds:** (a) selling a paid API or data product that contains or derives from Icecat content (§1 no-fee rule, §2b share-alike); (b) any LLM pipeline that trains on, or generates synthetic text from, Icecat data (§10). Using Icecat text as an LLM input for summaries would be risky under §10's "automated synthetic content creation" wording.
- **The robots.txt condition is unusual and operational.** Pretoscop would have to block AI and content-aggregation crawlers on its own site to keep the Open Icecat licence.
- **Expect Romanian specs** (localised feature names and values, generated titles) **but often no Romanian marketing copy.** Plan for English fallback or Pretoscop-written descriptions.
- **Images:** the OPL covers the data-sheet including its gallery URLs, with no separate image licence found. The safest path is to hotlink or cache images.icecat.biz images with the same attribution and refresh them per §4.
- **Verified by GS1 is not a catalogue source.** It validates ownership, mostly at company level, and 30 queries/day is useless at scale. API access likely needs GS1 Romania membership.

### Gaps
- The list of Open Icecat sponsor brands (icecat.biz/ssr/menu/partners) and whether key phone and TV brands (Samsung, Apple, Xiaomi, LG) are sponsored was not checked, because icecat.biz is behind an Anubis bot wall.
- The share of products with Romanian marketing text versus only generated or spec text is unknown (one sample).
- GS1 Romania's Verified by GS1 API pricing and eligibility for non-manufacturer members was not found.
- Open Food Facts' Romanian coverage is food only. No free GTIN source with Romanian electronics coverage was found.

## 5. How Pricy.ro and istoric-preturi.info collect prices; their extensions; does compari.ro show price history and alerts?

### Takeaway
Pricy says it reads prices from shops' own product pages (crawling) for 2,400+ shops; its shop list has 2,451 entries, including Altex, PC Garage, Flanco and Media Galaxy. Popular products are refreshed several times a day and the rest at least daily. Pricy also runs a feed-based SellerCenter, uses some affiliate links, and publishes market statistics: 19.5M offers and 820M+ price observations in 35 days. Its Chrome extension has **100,000 users** (3.6★ from 160 ratings), which corrects the "few thousand users" estimate in earlier notes.

istoric-preturi.info covers 563 shops and adds shops on request. Its extension has 10,000 Chrome users (4.4★ from 23 ratings) and affiliate links only inside the extension.

compari.ro reportedly shows price-evolution charts and email price alerts [search summary]. No Compari iOS app exists in the Romanian App Store.

### Cited Findings

**Pricy.ro**
- Data collection (verbatim, [Pricy – Cum ordonăm ofertele](https://www.pricy.ro/cum-ordonam-ofertele)):
  - "Folosim prețul afișat de magazin pe pagina produsului, pentru o singură bucată, fără costul livrării." (→ "We use the price displayed by the shop on the product page, for one unit, excluding delivery.")
  - "Lângă fiecare ofertă scrie când am citit ultima oară prețul." (→ "Next to each offer we state when we last read the price.")
  - "O ofertă e în stoc dacă, la ultima citire, pagina magazinului s-a deschis și magazinul nu scria că produsul lipsește." (→ in stock if the shop page opened at the last read and did not say the product was missing.)
  - "Regulile sunt aceleași pentru toate magazinele" (→ the rules are the same for all shops).
  - Offers not re-read for over 7 days lose the green tick ("Actualizat acum 52 de zile").
  - Coupons and cart discounts are read "de la magazinele ale căror pagini le citim pentru reduceri" (→ only from shops whose pages we read for discounts) and must have been seen "în ultimele 48 de ore".
- "Pricy.ro scanează zilnic peste 2.400 de magazine online din România și salvează prețul fiecărui produs." "Prețurile produselor populare se actualizează de mai multe ori pe zi. Restul sunt verificate cel puțin o dată pe zi". The history covers "ultimele 12 luni". — [Pricy – Istoric prețuri](https://www.pricy.ro/istoric-preturi)
- The shop directory has 2,451 shop links, including altex.ro ("peste 100.000 produse"), pcgarage.ro ("peste 100.000 produse"), flanco.ro ("peste 50.000 produse") and mediagalaxy.ro ("peste 50.000 produse"). — [Pricy – Magazine](https://www.pricy.ro/magazine)
- The press kit cites an analysis of 1 Aug 2026 covering "19,5 milioane de oferte observate" and "peste 820 de milioane de observații de preț din ultimele 35 de zile". It found that 1 in 4 offers was above its window minimum, the mean gap was +15% (median 3.2%), and 32% of offers changed price at least once. — [Pricy – Presă](https://www.pricy.ro/presa)
- Privacy policy: "Unele linkuri sunt de afiliere: magazinul ne poate plăti un comision, fără cost pentru dvs." (→ some links are affiliate links). It also describes clicks arriving from ChatGPT answers. Footer links: "Cum adaug produsele mele?" and "Adaugă magazin" (→ seller.pricy.ro). Operator: "Pricy Limited, 6-9 Trinity Street, Dublin 2". — [Pricy – privacy](https://www.pricy.ro/legal/privacy/)
- **Chrome Web Store:**
  - "100,000 users", 3.6 out of 5 from 160 ratings; version 7.0.0, updated June 30, 2026; publisher PRICY LIMITED.
  - Declared data: PII, authentication information, location.
  - The listing claims "tracks over 60 million products" and "peste 1000 de magazine", which is inconsistent with the site's 50M+ products and 2,400+ shops.
  - Source: [CWS – Pricy](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb)
- **Review themes** ([CWS – Pricy reviews](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb/reviews)):
  - "Many incorrect prices and slow updates" (Dec 6, 2025).
  - "price history on eMag and FashionDays (same group) is no longer visible" (Nov 1, 2025); the developer replied "This is available on all stores at the moment".
  - "it has some inaccuracies but overall i think its very useful" (Mar 30, 2026).
  - Older reviews: "created to spam you with affiliate links" (Sep 2021); a wrong ITGalaxy price (Feb 2021); a chrome://settings access worry (Dec 2023).
  - The developer replying is Sorin Oboroceanu.
- **Apps:** "Pricy: compară prețuri" (Pricy LTD), released 2026-06-30, v1.1.22 (2026-10-10), 1 rating. Its listing promises "Istoric prețuri" and "Alerte de preț". "Pricy pentru browser" (Safari) was released 2026-08-25. — [App Store – Pricy](https://apps.apple.com/ro/app/pricy-compar%C4%83-pre%C8%9Buri/id6782340868); [App Store – Pricy pentru browser](https://apps.apple.com/ro/app/pricy-pentru-browser/id6801479522)

**istoric-preturi.info**
- "Vezi mai jos lista cu cele 563 magazine pentru care avem istoric de preturi. Nu te teme, lista se va mari in timp pe masura ce creste cererea." (→ 563 shops; the list grows with demand.) It claims "peste 43 milioane produse si peste 1.16 miliarde preturi". — [istoric-preturi.info](https://www.istoric-preturi.info/)
- The contact form asks: "Vrei sa adaugam un magazin la istoricul de preturi?" (→ "Want us to add a shop?"). It adds: "Site-ul nostru nu comercializeaza produse". — [istoric-preturi.info – contact](https://www.istoric-preturi.info/contact)
- Extension features: the list of shops "care stim noi ca vand un anumit produs", "variatia procentuala pretului din ultimele 30 sau 90 de zile", centralised reviews, and "sugestii de produse similare din partea unui sistem AI". — [istoric-preturi.info – extension](https://www.istoric-preturi.info/extension/)
- **Chrome Web Store:**
  - "10,000 users", 4.4 out of 5 from 23 ratings; version 2.41, updated April 3, 2026; "Created by the owner of the listed website".
  - "Extensia poate contine link-uri affiliate dar doar in interiorul acesteia, nu va modifica nimic in site-urile vizitate" (→ affiliate links only inside the extension).
  - Declared data handled: PII, Location, **Website content**.
  - Source: [CWS – Istoric Preturi](https://chromewebstore.google.com/detail/istoric-preturi/hdhclckbeelgahmklefjjnpmhbljhcmd)
- The only English review is "Must have extension for romanian shoppers" (Jan 15, 2025). — [CWS reviews](https://chromewebstore.google.com/detail/istoric-preturi/hdhclckbeelgahmklefjjnpmhbljhcmd/reviews)
- Outbound link test (2026-10-27): the first `/link/…` redirect on the homepage returned HTTP 302 straight to https://www.emag.ro/ with no affiliate-network hop. — [istoric-preturi.info](https://www.istoric-preturi.info/)
- The privacy policy mentions only email at registration and Google Analytics. — [istoric-preturi.info – privacy](https://www.istoric-preturi.info/privacy)

**compari.ro features**
- compari.ro product pages have a price-evolution graph and a price alert: users set a maximum price and get an email when the price drops below it. Its Black Friday guide uses the graph to judge whether a discount is real and cites the 30-day lowest-price rule. Some pages show only a last-known price with a date. [search summary] — [compari.ro despre noi](https://www.compari.ro/static/despre_noi.html); [inspiratie.compari.ro Black Friday](https://inspiratie.compari.ro/black-friday/)
- iTunes Search API, Romanian store: searches for "compari.ro", "compari" and "heureka" return Heureka.cz and Heureka.sk apps (Heureka Group a.s.) but no Compari.ro app. — [iTunes search "compari"](https://itunes.apple.com/search?term=compari&country=ro&entity=software&limit=25); [iTunes search "heureka"](https://itunes.apple.com/search?term=heureka&country=ro&entity=software&limit=25)
- New entrant seen in the same search: "Economix" (Erik Geiger, released 2025-12-23), with "Căutare Unificată ... eMAG, evoMAG, PC Garage, Flanco, Flip" and "Istoric Preț Real". — [App Store – Economix](https://apps.apple.com/ro/app/economix/id6756882488)

### Inferences
- **Pricy is a crawler first**, with feeds as a secondary channel. Its 2,451-shop list therefore does not show feed partnerships with Altex, Flanco and others. The Nov 2025 complaint about eMAG and Fashion Days history vanishing fits eMAG-group blocking or a takedown, but that is unverified.
- **Correction for the report writer:** Pricy's Chrome reach (100k users) is an order of magnitude above the Firefox figures in market_and_competitors.md. Romanian price-history extensions are not uniformly tiny.
- **istoric-preturi's "Website content" declaration** is consistent with the extension reading the product page a user is viewing, possibly to capture prices (crowdsourcing). The site makes no explicit statement, so treat this as a hypothesis.
- **Stale prices are the shared weakness.** Both incumbents tell users to check the last-read time, and reviews complain about wrong prices. A visible "last checked" timestamp plus frequent re-reads is table stakes, not a differentiator.

### Gaps
- Compari's price-history depth, chart behaviour and alert channels could not be verified first-hand because every compari.ro host returns 403.
- Pricy's merchant pricing (SellerCenter) and the share of offers coming from feeds versus crawling are not public.
- Google Play install counts for ro.pricy.app and the istoric-preturi mobile version were not retrieved.

## 6. Direct merchant feed partnerships: which big electronics retailers supply comparators, and typical merchant terms

### Takeaway
Compari is feed-based: a listed shop must register and supply an XML or CSV feed. So a Compari store page is evidence of a merchant feed. Indexed Compari store or offer pages exist for **PC Garage, Vexio, evoMAG and cel.ro**. No Compari store page was found for **eMAG, Altex/Media Galaxy or Flanco**, whose names appear only in other shops' reviews. Typical terms:
- **Compari:** feed URL plus prepaid credit (min 150 RON), CPC by category and price band, optional bids; or free mode with click caps.
- **price.ro:** a partner-store admin and Base.com feed sync.
- **Pricy:** SellerCenter, while it crawls everyone else.

### Cited Findings
- **Compari feed requirement:** "In order to be able to import products into our search engine, it is necessary to have a so-called XML file or csv file (feed) created." — [Heureka Help: Compari – XML Feed](https://sluzby.heureka.sk/help/xml-feed/)
- **Listing requirements** ([Heureka Help: Registration (Compari)](https://sluzby.heureka.sk/help/registration/)):
  - Romanian-language store pages and RON prices including VAT;
  - Romanian terms and complaint policy;
  - a contact email and phone;
  - a feed "primarily in Romanian";
  - "The store must provide a cash on delivery method";
  - "The business must be registered in the commercial register";
  - unique product pages, and goods purchasable directly in the store.
- **Onboarding flow:** register via "Pentru parteneri -> Centrul de clienti". Enter the feed URL under "Datele magazinului -> Sursa listei produselor" and wait for confirmation within 1–2 working days. Top up credit (min 150 RON) under "Setari financiare -> Sold si facturi", payable "Prin PayU+", by card or by bank transfer. — [Heureka Help: Registration (Compari)](https://sluzby.heureka.sk/help/registration/)
- **Compari store pages found in domain-restricted searches:**
  - PC Garage store page: [compari.ro/stores/pc-garage-s173904](https://www.compari.ro/stores/pc-garage-s173904/). Desktop listings exist under the brand filter [compari.ro sisteme-desktop/pc-garage](https://compari.ro/sisteme-desktop-c3083/pc-garage). A Logitech G502 Hero page lists PC Garage at 193.51 RON [search summary]: [compari.ro Logitech G502](https://mouse.compari.ro/logitech/g502-hero-910-005470-p430029036/).
  - VEXIO store page, "about 60,900 reviews ... 90.63%" recommend [search summary]: [compari.ro/stores/vexio-s41065](https://www.compari.ro/stores/vexio-s41065/).
  - evoMAG appears on phone pages with "52025 recenzii" [search summary]: [compari.ro Galaxy S25 Ultra](https://www.compari.ro/telefoane-mobile-c3277/samsung/galaxy-s25-ultra-5g-256gb-12gb-ram-dual-sm-s938-p1170025309/).
  - cel.ro appears as a merchant with 65 reviews on the Galaxy A56 page [search summary]: [compari.ro Galaxy A56](https://www.compari.ro/telefoane-mobile-c3277/samsung/galaxy-a56-5g-128gb-8gb-ram-dual-sm-a566b-p1182769558/).
- **No store page found for Altex, eMAG or Flanco.** Domain-restricted searches returned only other stores' pages whose reviewers mention them, e.g. "Mai bine plătiți puțin mai mult dar luați de la un site de încredere precum eMag, Altex" on [FLAX](https://www.compari.ro/stores/flax-s104575/) and "preturi mult prea mari in comparatie cu competitorii(altex, emag)" on [BRICKDEPOT.RO](https://www.compari.ro/stores/brickdepot-ro-s92759/) [search summary]. Media Galaxy returned nothing.
- **Pricy** lists Altex, PC Garage, Flanco and Media Galaxy, but says it reads prices from shop pages (see §5). — [Pricy – Magazine](https://www.pricy.ro/magazine); [Pricy – Cum ordonăm ofertele](https://www.pricy.ro/cum-ordonam-ofertele)
- **price.ro** merchants can sync offers via Base.com ("stocurile și prețurile din oferta dvs. vor fi întotdeauna actualizate"). — [Base.com – Price.ro](https://base.com/ro-RO/integrari/pricero/)

### Inferences
- **Mid-tier IT retailers already maintain Compari-format feeds and pay per click:** PC Garage, Vexio, evoMAG and cel.ro. They are the most realistic first direct-feed partners for Pretoscop. Ask for the same feed URL, offer free listing at first, and later lower CPCs.
- **eMAG, Altex/Media Galaxy and Flanco** show no comparator feed relationships on Compari and no affiliate programs (§2). They remain crawl-only or business-development targets. Their presence on Pricy reflects crawling, not partnership.
- **Merchant terms to mirror:**
  - a feed URL checked within 1–2 days;
  - a prepaid balance with a low minimum;
  - category and price-band CPC with optional multipliers;
  - a free tier with daily click caps;
  - Compari's eligibility rules (COD, registered business, Romanian-language site) as quality gates, perhaps relaxing COD.

### Gaps
- Whether Altex, eMAG or Flanco send feeds to Compari under a different store name, or did so in the past, is unconfirmed because the Compari shop directory is blocked.
- No public statement from Altex, Flanco, PC Garage, cel.ro or Media Galaxy about comparator feed terms was found.
- Merchant counts per category on Compari, and whether the largest electronics shops use the marketplace (3–5.5%) instead of PPC, are unknown.
