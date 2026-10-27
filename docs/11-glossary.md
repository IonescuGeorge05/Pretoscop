# Glossary

| Term | Meaning in this project |
|---|---|
| Offer | One shop's listing of one product (URL, price, stock, seller). Row in `offers`. |
| Product (canonical) | The sellable variant users compare, identified by GTIN where possible. Row in `products`. |
| Product family | Model-level grouping of variants (storage, colour). Row in `product_families`. |
| GTIN / EAN | Global Trade Item Number (EAN-13 is a GTIN-13). Stored as 14-digit zero-padded `gtin14`. |
| MPN | Manufacturer Part Number (e.g. `CFI-2016`, `MXU23`). Normalized uppercase without separators. |
| Match | Linking an offer to a canonical product. Decided by rule, LLM or human; audited in `match_decisions`. |
| Observation | One confirmed reading of an offer's price/stock at a time. Raw observations go to R2; changes go to `price_events`. |
| Price event | A row in `price_events` written when price, old price, shipping or availability changed. |
| Rollup | Daily per-product aggregate (`product_daily`): min, median, offer count. |
| Verdict | Our plain-language assessment of today's price vs history (`good_price`, `usual`, `above_usual`, `insufficient_data`). |
| Total price | Price + estimated delivery cost under the shop's rules; the default ranking key. |
| Shop reference price | The crossed-out "old" price displayed by the shop; labelled as such, never trusted blindly. |
| 30-day low | Minimum price we observed in the last 30 days (ours), distinct from the shop's Omnibus reference. |
| Feed | Machine-readable catalogue (XML/CSV/JSON) from an affiliate network or a merchant. |
| 2Performant | Main Romanian affiliate network (378 public programs, feeds allowed in comparators). |
| Profitshare | eMAG's affiliate network; its eMAG program excludes comparators and browser plugins. |
| Awin / CJ / Tradedoubler | International affiliate networks carrying some Romanian advertisers (Douglas, Samsung, Xiaomi, About You, Answear, Notino, Modivo). |
| CPC | Cost per click: merchants pay per click-out (compari.ro model). |
| EPC | Earnings per click for affiliates (2Performant 2025 average ≈ €0.137). |
| CSS | Google Comparison Shopping Service partner program; needs ≥50 merchant domains per country. |
| Omnibus | EU Directive 2019/2161; in Romania the 30-day prior-price rule (HG 947/2000 as amended) and ranking-transparency duties (Law 363/2007). |
| UCPD | Unfair Commercial Practices Directive (2005/29/EC), transposed by Law 363/2007. |
| DSA | Digital Services Act (EU 2022/2065); Romanian Law 50/2024 requires notifying ANCOM within 45 days of launch. |
| ANCOM | Romanian communications regulator; DSA coordinator. |
| ANPC | Romanian consumer protection authority. |
| ANSPDCP | Romanian data protection authority. |
| ONRC | Trade registry (company formation). |
| SRL / PFA | Limited company / sole trader forms in Romania. |
| e-Factura | Romania's mandatory electronic invoicing system (B2B since 2024, B2C since 2025). |
| SAF-T (D406) | Standard tax audit file; quarterly for small taxpayers. |
| Icecat | Open product catalogue (specs, images) with attribution and share-alike conditions. |
| JSON-LD | Structured data (schema.org `Product`/`Offer`) embedded in shop pages; our primary extraction source. |
| Robots.txt (RFC 9309) | Crawler access rules we obey; wildcards and `$` supported. |
| Verified Bots / Web Bot Auth | Cloudflare (and Akamai) programs to prove a crawler's identity via signed requests or validated IPs. |
| Kill switch | Per-source flag that stops ingestion immediately and hides its offers. |
| Assisted-access channel | Reading the public pages of designated blocked shops through a commercial data-collection service that handles anti-bot challenges, under the founders' legal advice of 2026-10-27; same politeness and budgets as PretoscopBot, cost cap, per-shop kill switch, exit to feeds or allowlists (ADR-015, M05B). |
| ISR / SSR | Incremental static regeneration / server-side rendering in Next.js. |
| pg-boss | Job queue on PostgreSQL used for all background work. |
| Meilisearch | Search engine powering product search and autocomplete. |
| Tier A/B/C refresh | Daily product-page verification / daily listing refresh / weekly long tail. |
| Gate (G0–G4) | Founder approval checkpoints between phases. |
