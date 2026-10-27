# Monetization and growth playbook

Numbers are from `docs/01-research-report.md` §5–6 (dated 2025–2026) unless marked as assumptions.

## 1. Revenue streams, in the order to switch them on

| # | Stream | When | Evidence / numbers | What to build | Realistic size (year 1–2) |
|---|---|---|---|---|---|
| 1 | **Affiliate links** on click-outs to shops whose programs accept comparators | Launch | 2Performant 2025: EPC ≈ €0.137, conversion 3.72%, basket €60, commission ≈ 6.1% of sales (electronics ≈ 1.5–3%; fashion ≈ 7.7%; beauty ≈ 8.6%; books ≈ 10%). eMAG pays nothing (Profitshare excludes comparators). pricealert.ro (feeds-based comparator) ranked #2 affiliate with 10,824 sales in three weeks of Oct 2026 | `affiliate_url` per offer; program sync via 2Performant API (`comparator yes/maybe/no`); click logging; commission import; revenue dashboard (M24). Reachable electronics pool: 2Performant (evoMAG 1.5%, F64, GSMnet, spy-shop, bitmi, conectica) and Profitshare's non-eMAG IT&C programs (ITGalaxy 2–10%, ForIT 2%, Vexio 2%, Techstar 15%, Dualstore 5%, Vonmag 3%, PCMadd 6%). Plan with an EPC of €0.08–0.12 after attribution leakage; Profitshare publishes approval rates (Flanco 84%, IT shops 72–100%, about 31 days to approval), so expect 15–30% of commissions reversed | €0.5–3k/month at 100–300k sessions |
| 2 | **Merchant free listing → paid placement (CPC / "Promovat")** | Free listing from month 1; paid after ≈25–50k click-outs/month | Ceneo earns 86.5% of revenue from merchant click fees; Heureka.sk CPC median €0.28 at €100 products, €0.48 at €500; Árukereső (same group, 2024 list) charges €0.10–0.21 per phone click; compari.ro's 2011 list was 0.10–0.19 RON; compari.ro today: 150 RON minimum top-up, free tier capped at 100 clicks/day, 4.31M active Romanian users (DSA disclosure), price charts since each product's launch, a 14-day-minimum "Reducere" label and 30-day email alerts | Merchant portal (M20): feed URL in compari/Google format pulled ≥4×/day free (compari's Premium tier refreshes 6×/day), dashboard; later Stripe top-ups, bid per category, `Promovat` labels, and sponsored "reducere verificată" slots sold only where the discount passes our 30-day test (M25) | €1–5k/month once 30+ paying merchants |
| 3 | **B2B price intelligence** (dashboards, alerts, exports, API for shops and brands) | Pilot at month 6–9 | Market prices: Price2Spy from $39.95/month (500 URLs), Prisync from $99/month (100 products); Heureka bought Dataweps and sells "Heureka Insights" | Merchant dashboard with competitor positions, history CSV/API keys, plans €49/€149/€399 (M28). Exclude Icecat data | €1–4k/month with 10–20 customers; not seasonal |
| 4 | **Consumer premium** (unlimited alerts, extension pro, ad-free, API) | Month 9+ | Keepa charges ≈ €19/month for data access; conversion to paid typically 0.5–2% | Plan + Stripe; keep free tier generous | €0.3–1k/month |
| 5 | **Display ads** (AdSense, later Journey by Mediavine from ~1,000 sessions, programmatic via local partners) | After 100k sessions/month | No Romanian RPM benchmark found; proxies suggest low single-digit € RPM; Ezoic now requires 250k users; Raptive needs mostly English-market traffic | One or two slots outside the offers table, labelled `Publicitate` | €0.2–1k/month |
| 6 | **Black Friday studies, media partnerships, sponsored newsletters** | BF 2026 (small), BF 2027 (full) | The Competition Council's 2018 study got national coverage; no comparator-run study exists for 2023–2025 | Report tooling (M23), newsletter, press list | Brand value, links, direct traffic |
| 7 | **Google CSS partner** (run Shopping ads for merchants) | Only after ≥50 merchant domains | Required for aggregator carousels in the EEA since Sept 2026 (a comparator's own pages reach the Shopping carousel only through paid CSS product listing ads); margin "erodes to zero" per Heureka's CEO; useful to win merchants, not for profit | Merchant Center, CSS application (D4) | — |
| 8 | **Cashback / coupons** | Not planned | Conflicts with several program rules (eMAG bans cashback and coupon sites); OnBuy entered Romania with cashback in 2026 | — | — |
| 9 | **Data licensing / price index for media** | Opportunistic | Our own database (sui generis right); exclude Icecat | Exports | small |

Base-case model: **≈ €26 per 1,000 sessions** blended (range €9–49), from `revenue = sessions × click-out rate (25–35%) × conversion (2–4%) × basket (€60–190 by category) × commission (1.5–8%) + merchant and B2B fees`. Reaching €5k/month needs roughly 190k sessions/month on affiliate alone, or about half that with merchant and B2B revenue.

## 2. Sequencing and guardrails

1. Launch with affiliate links where allowed and **plain links everywhere else** (never hide a cheaper shop because it does not pay).
2. Add merchant free listing at launch: the pitch is "you already have a compari.ro feed; paste its URL". Free listing creates the merchant base needed for CPC and CSS.
3. Switch on promoted placements only with labels, never changing the default total-price ranking.
4. Start the B2B pilot with 3 merchants who onboarded feeds; they already trust the data.
5. Ads last, and never inside the offers table.

## 3. Growth channels (what the evidence says works in Romania)

| Channel | Evidence | Actions |
|---|---|---|
| **SEO on product + price queries** | "emag" 835K and "altex" 722K searches/month; recalibrated volumes (round 2): "istoric pret" ≈4.5K and "istoric preturi" ≈3.4K/month (Semrush shows 6.6K grouped), "cel mai mic pret" ≈17K, "iphone 17 pret" ≈13–14K per variant, "black friday emag" ≈49K, with ≈38K price-history searches in the five Black Friday weeks of 2025; category demand index (laptop = 100): parfum 154, carti 97, telefoane 45, frigider 43, televizor 34 | Product pages titled "{product} – prețuri de la {min} lei la {n} magazine"; category pages with `ItemList`; fast pages; internal linking from brand/category/deals; sitemaps with price-change `lastmod` |
| **Black Friday PR** | 63% think brands cheat; Competition Council 2018 study widely covered; slot empty since | Publish "Raportul reducerilor Black Friday 2026" (even small: top 500 products tracked since early November) within 48 hours of eMAG's 6 Nov event; full study in 2027 |
| **Browser extension** | Pricy's extension has 100K users (3.6★, "stale" complaints); Istoric Preturi 10K; eMAG Helper 1K | Extension overlay on eMAG/Altex/Flanco/PC Garage product pages with our history and best price elsewhere (M26) |
| **Alerts and owned audience** | Alerts are the retention loop of every comparator | Email alerts at launch, Telegram and web push later |
| **Communities** | Reddit fake-discount threads get 80–280 upvotes; r/Romania has 1.03M members but allows a self-link only once every few weeks; r/ReduceriPreturi tiny (339); no Romanian Telegram deal channel found among 32 handles; Facebook pages/TikTok carry deals (TeamDeals ≈80K, Kuponiada ≈114K, eVOUCHER 34K TikTok) | Post verified drops and the BF report; partner with deal pages (they need data) |
| **Media** | ZF, Profit.ro, Economica, StartupCafe, Hotnews, Digi24 cover price stories | Monthly "indexul prețurilor" for a basket of 50 products |
| **AI assistants** | idealo has a ChatGPT app since 2026; compari admits GPTBot/OAI-SearchBot | Allow well-behaved AI search bots in robots.txt (except where Icecat terms require blocking); publish a clean public API (M28) |

## 4. KPIs to watch weekly

Sessions, product pages indexed, click-out rate, EPC by shop, alerts created, alert emails sent/opened, merchants onboarded, freshness %, match precision, revenue by stream, cost by line.

## 5. Pricing sketches (to validate with the first customers)

- Promoted placement: bid per click by category and price band, floors €0.05–0.15, caps €0.60; minimum top-up €30.
- B2B: Starter €49/month (200 SKUs, daily), Pro €149/month (2,000 SKUs, 2×/day, API), Enterprise €399+/month (10k SKUs, alerts, exports).
- Consumer premium: €2.99/month or €24.99/year.

## 6. Risks specific to revenue

Program bans (eMAG, Fashion Days, ASUS already exclude comparators), closures (seven 2Performant programs close Oct–Nov 2026; Decathlon on 31 Oct 2026), commission reversals, seasonality (half of price-history demand is in November), Google changes (EEA free listings removed Sept 2026; Trovaprezzi's 2025 revenue fell 1.7% and it blames Google's own comparison unit; Heureka stopped buying traffic it could not monetise). Mitigation: diversify streams by month 9 and keep B2B non-seasonal revenue as the goal.

## 7. Outreach templates (Romanian)

**Merchant feed listing (free):**

> Subiect: Listare gratuită pe Pretoscop pentru {Magazin}
>
> Bună ziua, sunt {Nume}, co-fondator Pretoscop (pretoscop.ro), un comparator de prețuri cu istoric de preț pentru România. Listăm ofertele magazinelor gratuit, ordonate după prețul total (preț + livrare), cu link direct către pagina produsului din magazinul dvs. Dacă aveți deja un feed de produse pentru compari.ro sau Google Shopping, este suficient să ne trimiteți adresa feed-ului (XML/CSV) și îl preluăm zilnic. Nu modificăm prețurile și nu afișăm imaginile fără acordul dvs. Detalii despre cum colectăm datele: pretoscop.ro/bot. Mulțumesc, {Nume}, {telefon}

**Allowlisting request:**

> Subiect: Solicitare acces pentru PretoscopBot
>
> Bună ziua, Pretoscop este un comparator de prețuri care trimite trafic către magazine. Robotul nostru se identifică drept `PretoscopBot/1.0 (+https://pretoscop.ro/bot)`, respectă robots.txt, face cel mult o cerere la 5 secunde și folosește exclusiv adresele IP publicate pe pagina noastră. Vă rugăm să permiteți accesul acestui robot sau, alternativ, să ne indicați un feed de produse. Răspundem la orice solicitare de oprire în maximum o zi lucrătoare.
