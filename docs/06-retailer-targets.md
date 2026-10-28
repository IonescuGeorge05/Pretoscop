# Retailer targets and data channels

Snapshot of 2026-10-27 from the reconnaissance (one polite probe per page from a London IP) and the affiliate-network review. "Access" is what an honest, identified bot got; it can differ from a Romanian or allowlisted IP. Re-probe with `pnpm shops:probe <slug>` (M21) before changing a shop's status. The YAML registry (`packages/config/shops/`) is the source of truth once M04 exists; this page is regenerated from it.

Legend — Channel: **F** affiliate feed, **M** merchant direct feed (free listing), **C** polite crawl (identified PretoscopBot), **U** assisted-access channel (prototype; decision of 2026-10-27, `12-blocked-shops-strategy.md` §0), **A** needs allowlisting/outreach, **X** excluded. Phase: when we expect the shop to be live.

## Electronics, IT, appliances (launch categories)

| Shop | Domain | Affiliate program (2026-10) | Comparator policy | Access to honest bot | Structured data / identifiers | 30-day reference exposed | Channel | Phase | Notes |
|---|---|---|---|---|---|---|---|---|---|
| eMAG | emag.ro | Profitshare (eMAG's own) | **Forbidden** (comparators, aggregators, browser plugins) | Served; robots.txt allows product/category pages; eMAG throttled Common Crawl with status 511 | JSON-LD Product/Offer with price, availability, seller; brand + part number (MPN); no GTIN in JSON-LD | Yes, machine-readable `lowest_price_30_days` per offer | C (founder decision, ADR-013) | 0 | Terms §4.2(j) forbid automated extraction; §6.2 forbids republishing; ≈4.2M product URLs in 841 sitemap files with useless lastmod; refresh via category listings (≈60 offers/request); marketplace sellers identified via `seller`/vendor id; no affiliate revenue |
| evoMAG | evomag.ro | 2Performant, 1.5% (Oct 2026), 10-day cookie, 15+ feeds | Silent (ask in writing; none of the 378 2P programs mentions price-history sites) | CAPTCHA from hosting provider Distinct ("abnormal traffic from your network") on first request; network-reputation filter; Yii platform; listing prices server-side | MPN marked up (WDC 2024); EAN per the teammate's earlier test | Unknown | F | 0–1 | Feed-first; terms ban copying/republishing without written consent; ask captcha@distinct.ro and evoMAG to allowlist PretoscopBot's IPs; evoMAG also sells as an eMAG marketplace seller |
| Altex | altex.ro | None (in-house program closed ≈2022) | — | Blocked (Akamai resets TLS/HTTP2); Common Crawl bot gets 200 on 80%; robots allows product/category pages, no crawl-delay | Magento catalogue behind a Next.js front end; listing pages embed 48 products server-side with price, list price, stock, seller and **EAN** (archived 2026 HTML) | Unknown | U (prototype) → M/A | 0–1 | Largest after eMAG; ≈0.5–0.7M product URLs (one sitemap file holds 228,270 URLs); terms: general IP clause only (May 2026); assisted channel from Phase 0 on the HTTP tier; outreach for feed/allowlisting in parallel; not on compari.ro |
| Media Galaxy | mediagalaxy.ro | None | — | Blocked (Akamai) | Same platform as Altex: listings embed price, stock, seller and EAN server-side | Unknown | U (prototype) → M/A | 0–1 | Altex group; terms: general IP clause only; assisted channel from Phase 0 |
| Flanco | flanco.ro | None: Profitshare inactive; 2P program closed 29.06.2026 (notice archived 2026-06-15) | — | Cloudflare challenge; Common Crawl mostly refused | Magento 2; listing prices server-side; MPN in analytics data, no GTIN (WDC 2024) | — | U (prototype) → M/A | 0–1 | 2025 turnover 1.36bn lei with a 66M lei loss; archived 2025 terms forbid republishing prices, 2026 terms unreadable (save a browser PDF of `/termene-si-conditii`); Pret Alert's code notes "flanco.ro blochează serverul nostru"; not on compari.ro |
| PC Garage | pcgarage.ro | Profitshare inactive (terms from 2023) | — | Cloudflare challenge, even robots.txt; archived robots blocks CCBot and ChangeDetection by name and disallows `/alerta-pret*` | Custom PHP; structured product data; 20 products per listing page | — | U (prototype) → M | 0–1 | Listed on compari.ro, so a feed exists → first direct-feed candidate; terms bind buyers only (`/info/comenzi/termeni-si-conditii/`); assisted channel until the feed arrives |
| cel.ro | cel.ro | None found | — | TCP timeout from the UK (re-probe from a Romanian IP); own captcha; robots blocks generic tokens (`bot/`, `crawl`, `spider`) but allows product pages; no Common Crawl captures | Modified Zen Cart; listing prices server-side; **serves fake products with random hex names and prices to crawlers behind its captcha**, so challenge pages must never be ingested | — | U (prototype) → M | 0–1 | On compari.ro (feed exists); terms ban republishing without written consent (browsewrap); assisted channel until the feed arrives |
| Vexio | vexio.ro | Profitshare, 2%, 5-day cookie, **feeds available** (the earlier "no feed" misread an icon); bans Google Ads | Silent (ask) | Cloudflare challenge | MPN only, no GTIN (WDC 2024) | — | F (Profitshare feed) → M | 1 | On compari.ro; also an eMAG marketplace seller; terms ban republishing without written consent (browsewrap); the assisted channel is not needed once the Profitshare feed is approved |
| iStyle | istyle.ro | None | — | Shopify behind Cloudflare challenge | GTIN marked up (WDC 2024) | — | A | 3 | Apple reseller; terms: prices are "Content", no use outside the site (3.2, 3.4), no robot clause |
| EuroGSM | eurogsm.ro | None found | — | Reachable; price not in raw HTML | — | — | C (needs inspection) | 3 | Terms ban copying/republishing without written consent |
| QuickMobile | quickmobile.ro | Profitshare inactive (2021) | — | Maintenance page (503) | — | — | X | — | Re-check in 2027 |
| IT Galaxy | itgalaxy.ro | Profitshare, 2–10% (Oct 2026) | Check (Profitshare lets advertisers restrict media) | Served | JSON-LD; EAN in Flixmedia attributes | — | C, F | 0–1 | |
| forit | forit.ro | Profitshare, 2% (Oct 2026) | Check | Served | JSON-LD; no GTIN | — | C, F | 0–1 | |
| F64 | f64.ro | 2Performant (electronics listing, Oct 2026) | Silent on comparators (no ban) | Not probed | — | — | F | 1 | Photo and electronics; ask in writing about price-history use |
| GSMnet | gsmnet.ro | 2Performant, 12% (Oct 2026) | Silent on comparators (no ban) | Not probed | — | — | F | 1 | Phones; ask in writing about price-history use |
| Flip (refurbished) | flip.ro | None | — | Served (`__NEXT_DATA__`, sitemap) | Page JSON; condition refurbished | Text | C | 1 | Separate "resigilate/refurbished" section; never in the main minimum |
| Dedeman | dedeman.ro | None | — | Served; listing ≈71 offers/request | JSON-LD; no GTIN | — | C | 0–1 | Appliances, tools |
| Carrefour | carrefour.ro | None | — | Served | JSON-LD; EAN via Flixmedia | — | C | 1 | Electronics subset |
| Auchan | auchan.ro | None | — | Served; VTEX platform with public catalogue JSON (EAN, seller, stock) | JSON-LD + VTEX | — | C | 1 | Use the public VTEX catalogue endpoint only if robots/terms allow; else HTML |
| Samsung RO store | samsung.com/ro | Awin, up to 2%, 30-day | Check | Not probed | — | — | F | 3 | |
| Xiaomi RO store | mi-store.ro / xiaomi | Awin, up to 5%, 30-day, product feeds | Check | Not probed | — | — | F | 3 | |
| ASUS eShop | — | 2Performant | **Forbidden** ("nu putem accepta… agregatoarele de prețuri") | — | — | — | X | — | |

## Books, beauty, home, other (expansion)

| Shop | Domain | Affiliate program | Comparator policy | Access | Structured data | Channel | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| Libris | libris.ro | 2Performant | **Allowed** (CSS only with approval; no multi-network) | Served | JSON-LD with gtin13 (ISBN) | F, C | 1 (electronics subset), 4 (books) | Model partner |
| Elefant | elefant.ro | 2Performant (bans Google Ads/CSS) | Not stated | Served | JSON-LD; EAN in spec table | F, C | 1 | |
| Cărturești | carturesti.ro | 2Performant | Not stated | Cloudflare challenge | — | F | 4 | |
| Notino | notino.ro | CJ | Check | Cloudflare challenge; Common Crawl mostly refused | GTIN marked up (WDC 2024) | F | 4 | |
| Douglas | douglas.ro | Awin, 5%, 30-day, daily product data | Check | Akamai 403 (Common Crawl served) | — | F | 4 | |
| Sephora | sephora.ro | None found | — | Akamai 403 | — | A | 4+ | |
| Bonami | bonami.ro | 2Performant | Not stated | Served | JSON-LD with gtin; "dead product" sitemaps | F, C | 1 | Small appliances |
| JYSK | jysk.ro | None | — | Served | JSON-LD; no GTIN | C | 2+ | Home |
| Vivre | vivre.ro | None found | — | Reachable; incomplete | — | — | 4+ | |
| Leroy Merlin | leroymerlin.ro | None | — | DataDome | — | A | 4+ | |
| Hornbach | hornbach.ro | None | — | Fastly client challenge (HTTP 200) for unknown bots; serves Common Crawl 97%, so allowlisting is plausible | — | A | 4+ | |
| Decathlon | decathlon.ro | 2Performant 5% incl. "comparatoare de produse" — **program closes 31 Oct 2026** | Allowed until closure | Cloudflare on HTML; robots/sitemaps served | — | F → A | 4+ | |
| Noriel | noriel.ro | 2Performant | Not stated | Cloudflare challenge | — | F | 4+ | Toys |
| Dr. Max | drmax.ro | 2Performant | Not stated | Cloudflare challenge | — | F | 4+ | |
| Petmart | petmart.ro | 2Performant | Not stated | Reachable; incomplete | — | F | 4+ | |
| Fashion Days | fashiondays.ro | eMAG group program | **Forbidden** (comparators and price-history sites); its terms (eMAG's template, archived 2026-03-01) ban robots (4.2(j)) and republishing prices (6.2) | Tencent EdgeOne JS challenge; Common Crawl served | — | X | — | |
| Answear | answear.ro | CJ | Check | Akamai 403 | — | F | 5 | Fashion |
| About You | aboutyou.ro | CJ / Tradedoubler (June 2026) | Check | Reachable; incomplete | — | F | 5 | |
| Modivo / ePantofi | modivo.ro | Tradedoubler / CityAds | Check | Not probed | — | F | 5 | |
| Mega Image | mega-image.ro | None | — | Prerendered page without prices | — | X | — | Grocery |
| OLX, Publi24 | olx.ro, publi24.ro | — | — | OLX CloudFront 403 for unknown bots (serves Common Crawl 82%); Publi24 served but private sellers' names in JSON-LD; Publi24 terms allow personal non-commercial use only; OLX terms unreadable (JavaScript shell) | — | X | — | Out of scope (classifieds) |

## Where the next shops come from

0. **Assisted-access channel** for the designated set (Altex, Media Galaxy, Flanco, PC Garage, cel.ro; evoMAG and Vexio until their feeds are live), per the decision of 2026-10-27; every other blocked shop needs a founder decision before it is added.
1. **2Performant**: 378 public Romanian programs; 18 smaller ones explicitly accept comparators (list in `docs/research/notes/gaps_affiliate_and_merchant_channels.md`); median commission 8%, median cookie 30 days; electronics programs include evoMAG (1.5%), GSMnet (12%), spy-shop, F64, a2t, bitmi (feed refreshed every 24 h), bsgmag, vonmag, case-smart and conectica; none of the 378 programs mentions price-history sites and only ASUS refuses aggregators. Apply broadly; the API exposes each program's "Price Comparison Services" permission (yes/maybe/no), and withdrawing an allowed type needs 180 days' notice.
1b. **Profitshare's non-eMAG programs** (IT&C listing, Oct 2026): ITGalaxy 2–10%, ForIT 2%, Vexio 2%, Techstar 15%, Dualstore 5%, Vonmag 3%, PCMadd 6%, CITGrup 8%, Streamstore 10%, Contakt 10%, ABDComputer 7%. Profitshare belongs to eMAG and lets each advertiser restrict media, so declare the site precisely and ask each program.
2. **compari.ro's merchant base** (2,500+ shops with feeds): every one of them can paste the same feed URL into our merchant portal (M20).
3. **Allowlisting** (M21): Altex/Media Galaxy, Flanco, PC Garage, cel.ro, iStyle, Douglas, Sephora, Notino, Leroy Merlin, Hornbach, Decathlon.

## Change signals and sitemaps (round-2 findings, 2026-10-27)

Only Elefant publishes a real per-URL `lastmod` (Carrefour partly); elsewhere it is missing or equals the generation date. eMAG's `offers-latest` index has about 9 files (≈45k offers); its `offers-unavailable` index shrank from 3,991 files in January 2026 to 27, so it is not a reliable delisting signal (use absence from listings plus product-page 404/410). eMAG product HTML carries the other sellers' offers in a `secondary_offers` analytics array, where evoMAG, Vexio and Flanco appear as marketplace sellers. Altex has roughly 0.5–0.7M product URLs. Terms that explicitly ban republishing prices without written consent: eMAG, Fashion Days, Flanco (2025 text), cel.ro, evoMAG, Vexio, EuroGSM, iStyle (prices as "Content"); Altex and Media Galaxy have only a general IP clause; PC Garage's terms bind buyers only.

## Shipping rules to verify at onboarding (placeholders from the prototype; mark `shipping_verified`)

eMAG (free over a threshold, courier fee otherwise, lockers), Altex, Flanco, PC Garage (paid shipping at any value per the prototype's note), evoMAG, Dedeman, Flip (courier fee; free only with subscription). Each shop's rules live in `shipping_rules` and show as "livrare estimată" until verified.

## Registry snapshot (generated)

<!-- shops:table:start (generated by `pnpm shops:table`; edit packages/config/shops/*.yaml instead) -->

_Generated 2026-10-27 from the registry._

| Shop | Domain | Status | Channel | Trust tier | Affiliate (comparator policy) | Sources enabled/total | Shipping rules | Notes |
|---|---|---|---|---|---|---|---|---|
| Altex | altex.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Akamai resets TLS/HTTP2 for unknown bots; listings embed 48 products with price, stock, seller and EAN server-side. Designated for the assis |
| Answear | answear.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Akamai 403; CJ program. Phase 5. |
| Auchan | auchan.ro | active | C (polite crawl) | 2 | — | 11/11 (listing) | to verify | Online electronics range is small and mostly unavailable (Price 0 in the state = not sold online): such products are skipped and the listing |
| Bonami | bonami.ro | active | C (polite crawl) | 2 | 2performant (unknown, to_apply) | 2/2 (listing) | to verify | Listing data in __NEXT_DATA__ (exact money amounts, crossed retailPrice, stock, brand). JSON-LD with gtin only on product pages; publishes p |
| Carrefour | carrefour.ro | active | C (polite crawl) | 2 | — | 23/23 (listing) | to verify | Listing cards: article code (= JSON-LD sku and URL tail), price in meta[itemprop=price], crossed price rebuilt from its spans, brand and ava |
| CEL.ro | cel.ro | blocked | — | 2 | — | 0/0 (—) | to verify | TCP timeout from London; serves fake random-hex products behind its captcha (never ingest challenge pages). robots blocks generic tokens bot |
| Decathlon | decathlon.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Cloudflare on HTML; robots/sitemaps served; 2Performant program closes 31 Oct 2026. |
| Dedeman | dedeman.ro | active | C (polite crawl) | 1 | — | 19/20 (sitemap, listing) | to verify | Listing cards: product code (= /p/<code>), Magento price amounts (decimal), crossed price only on discounted cards, stock line as worded. La |
| Douglas | douglas.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Akamai 403; Awin feed (5%, 30 days). Phase 4. |
| Elefant | elefant.ro | active | C (polite crawl) | 2 | 2performant (unknown, to_apply) | 0/0 (—) | to verify | EAN in the spec table; the only shop with a real per-URL lastmod; the 2026-10-27 recon found no JSON-LD Product on a product page (price in  |
| eMAG | emag.ro | active | C (polite crawl) | 1 | profitshare (forbidden) | 43/44 (listing, product_page, sitemap) | to verify | Crossed price = eMAG's lowest price of the last 30 days; PRP is the manufacturer's recommended price (never a reference). Marketplace seller |
| evoMAG | evomag.ro | blocked | — | 2 | 2performant (unknown, to_apply) | 0/1 (feed) | to verify | Distinct Traffic Filter CAPTCHA on the first request from London; feed first (2Performant). Designated for the assisted channel until its fe |
| Fashion Days | fashiondays.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Tencent EdgeOne challenge; eMAG-group program forbids comparators and price-history sites; terms ban robots and republishing. Excluded. |
| Flanco | flanco.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Cloudflare challenge; Magento 2; MPN in analytics data. Designated for the assisted channel (M05B). |
| Flip | flip.ro | active | C (polite crawl) | 2 | — | 1/1 (sitemap) | to verify | Refurbished phones with warranty, in grades (Bun, Foarte bun, Excelent, Ca nou) chosen with ?shape=; a page without it shows its default gra |
| forit | forit.ro | active | C (polite crawl) | 2 | profitshare (unknown, to_apply) | 25/26 (sitemap, listing) | to verify | JSON-LD Product, sku = manufacturer code (also on listings), no GTIN. Offers state their delivery cost. Titles in JSON-LD carry HTML entitie |
| Hornbach | hornbach.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Fastly client challenge served with HTTP 200 to unknown bots; serves Common Crawl 97% → allowlisting plausible. |
| iStyle | istyle.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Shopify behind a Cloudflare challenge; GTIN marked up. Needs allowlisting (M21). |
| IT Galaxy | itgalaxy.ro | active | C (polite crawl) | 2 | profitshare (unknown, to_apply) | 25/26 (sitemap, listing) | to verify | Listing cards: id (= product-page JSON-LD sku), title, price and crossed price in Romanian format, stock text, EAN ('Cod EAN') on many cards |
| JYSK | jysk.ro | active | C (polite crawl) | 2 | — | 0/0 (—) | to verify | JSON-LD on product pages (no availability); listing prices client-rendered. M10 (2026-10-27): not probed again and no source: JYSK sells fur |
| Leroy Merlin | leroymerlin.ro | blocked | — | 2 | — | 0/0 (—) | to verify | DataDome. Needs allowlisting. |
| Libris | libris.ro | active | C (polite crawl) | 2 | 2performant (allowed, to_apply) | 0/0 (—) | to verify | JSON-LD with gtin13 (ISBN). M10 (2026-10-27): no electronics or appliance assortment, so no source in the launch phase; books, games and LEG |
| Media Galaxy | mediagalaxy.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Same platform as Altex (Akamai). Designated for the assisted channel (M05B). |
| Notino | notino.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Cloudflare challenge; CJ program (feed). Phase 4. |
| OLX | olx.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Classifieds: out of scope (02-product-and-scope §4.3). CloudFront 403 for unknown bots. |
| PC Garage | pcgarage.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Cloudflare challenge even on robots.txt; disallows /alerta-pret*. On compari.ro → first direct-feed candidate. Designated for the assisted c |
| Sephora | sephora.ro | blocked | — | 2 | — | 0/0 (—) | to verify | Akamai 403; no program found. Needs allowlisting. |
| Vexio | vexio.ro | blocked | — | 2 | profitshare (unknown, to_apply) | 0/0 (—) | to verify | Cloudflare challenge. Listed on compari.ro (has a feed). Also an eMAG marketplace seller. |

<!-- shops:table:end -->
