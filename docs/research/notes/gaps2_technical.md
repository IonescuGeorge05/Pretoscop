# Pretoscop: closing the technical research gaps, round 2

**Scope.** This file covers the gaps listed in `matching_history_architecture.md`, the bot-program gaps in `gaps_bot_legitimacy_and_precedents.md` §1–§2, and the tooling and proxy gaps in `scraping_feasibility_recon.md` §4–§5. It adds a new topic: assisted-access vendors.

**How the evidence was gathered.**
- Research date: **2026-10-27**.
- Prices are as shown on first-party pages that day, in USD and excluding VAT unless stated otherwise.
- Pages were fetched directly, either with WebFetch or with curl for public JSON, HTML or PDF. Sources included vendor sites, the npm and PyPI registries, the GitHub API, Hugging Face, GS1, BNR, Web Data Commons and the Cloudflare Radar mirror.
- No retailer site was contacted, and nothing required a login.
- "(search summary)" marks a claim taken from a search engine's summary of a page I did not fetch myself.
- I used 34 of the 40 planned web searches.

**Status legend.**
- **CLOSED**: answered from a primary source.
- **PARTIAL**: partly answered. The open remainder is stated.
- **NOT PUBLIC**: needs an account, a login, a sales conversation or a live test. The action that would close it is given.
- **NOT RESEARCHED**: in this cluster but outside the six priorities, and deferred. An action is given.

---

## 1. Assisted-access vendors: Zyte API, Oxylabs Web Unblocker, ScrapingBee, Bright Data Web Unlocker, ScraperAPI

### Takeaway
All five vendors make the customer legally responsible, and none promises a success rate in its terms.

Only **Bright Data** documents a mode that respects robots.txt. Without KYC, its Web Unlocker refuses URLs that robots.txt disallows. KYC requires company documents and a human review, with an answer within 48 h. It unlocks those URLs only for the use case Bright Data approves.

- **Zyte** (Irish entity): the clearest pricing. Sites fall into five tiers, only successful responses are billed, and the rate limit is 3,000 RPM.
- **Oxylabs** (Lithuanian entity): bills Web Unblocker per GB.
- **ScrapingBee** (French entity, VostokInc) and **ScraperAPI** (Nevada LLC): bill in credits.

None of these channels reliably carries Pretoscop's own user-agent to the shop.

### Cited Findings

**A1. Zyte API tiers by site difficulty, and how a site gets its tier. Status: PARTIAL** (the tier of each Romanian shop is NOT PUBLIC)

Price per 1,000 successful responses, as listed on [zyte.com/pricing](https://www.zyte.com/pricing/):

| Commitment | HTTP T1 Simple | T2 Easy | T3 Moderate | T4 Complex | T5 Advanced | Browser T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|---|---|---|---|
| Pay as you go | $0.13 | $0.23 | $0.44 | $0.70 | $1.27 | $1.01 | $2.01 | $4.02 | $8.04 | $16.08 |
| $100/month | $0.10 | $0.17 | $0.33 | $0.53 | $0.95 | $0.75 | $1.50 | $3.00 | $6.00 | $12.00 |
| $200/month | $0.08 | $0.14 | $0.26 | $0.42 | $0.76 | $0.60 | $1.20 | $2.40 | $4.80 | $9.60 |
| $500/month | $0.06 | $0.11 | $0.21 | $0.34 | $0.61 | $0.48 | $0.96 | $1.92 | $3.84 | $7.68 |

- **Plan terms.** Enterprise pricing is through sales. New accounts get $5 of free credit for 30 days. There are "No overage penalties": usage above the commitment is billed at the discounted rate. Per-site prices need the calculator ("Add a website URL above to see prices for your specific site"). Source: [zyte.com/pricing](https://www.zyte.com/pricing/).
- **How tiers are assigned.** "Zyte API automatically uses the most cost-efficient technology for each website and assigns price tiers accordingly." "New combinations start with a temporary tier until enough data is gathered." "We review tier assignments quarterly. Affected customers receive 2 weeks notice of any tier changes." Source: [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html).
- **Not public:** the tiers of emag.ro, altex.ro and the other designated shops.
  - Action: at implementation, enter only the designated shops' URLs into the account calculator, or ask Zyte sales for a written per-domain tier quote. Re-check every quarter.
  - Caution: the calculator may make Zyte send test traffic to the shop.

**A2. Zyte browser rendering and paid add-ons. Status: CLOSED**
- Browser-rendered prices are in the table above.
- Add-on prices: screenshots cost $1.34 per 1,000. Actions are billed "Based on CPU and network consumption". Network capture is billed by output size. Automatic extraction costs $0.27–$1.07 per 1,000 per data type. Source: [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html).
- Extended geolocations have a different base cost. "Rate-limiting and unsuccessful responses are free." Source: [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html).

**A3. Zyte's EU entity and GDPR position. Status: CLOSED**
- **Entity and law.** The contracting party is "Zyte Group Limited, an Irish limited company with the registered company number 492771". Notices go to 12 South Mall, Cork, T12 RD34, Ireland. Customers outside the US get Irish law and Dublin arbitration; US customers get New York law. The terms are marked "Last Updated: September 22, 2026". Source: [Zyte Terms of Service](https://www.zyte.com/terms-policies/terms-of-service/).
- **Data protection.** Clause 5.2.2 reads: "you shall comply with Data Protection Law and any and all applicable laws or regulations". Source: [Zyte ToS](https://www.zyte.com/terms-policies/terms-of-service/).
- **DPA (search summary).**
  - Zyte is processor for service personal data and an independent controller for contact data.
  - EU Standard Contractual Clauses (Modules 1 and 4) cover transfers.
  - The sub-processors listed include AWS, Google Cloud, Hetzner (Germany), Salesforce, HubSpot, Slack, Stripe and OpenAI.
  - Sources: [Zyte DPA](https://www.zyte.com/terms-policies/dpa/), [Zyte sub-processors](https://www.zyte.com/terms-policies/subprocessor/), [Zyte Trust Center](https://www.zyte.com/trust-center/).

**A4. Zyte acceptable-use terms, and what the customer warrants. Status: CLOSED**

Terms of Service ([Zyte ToS](https://www.zyte.com/terms-policies/terms-of-service/)):
- **3.4:**
  - "It is up to you to determine the legality of the way you use our Services, Service Data, and/or Data Feeds."
  - "The Services shall be used solely to scrape data from publicly accessible websites."
  - "You represent and warrant that you will utilize the Services legally and ethically."
  - Zyte "reserves the right to refuse service to anyone wishing to use the Services in an illegal or unethical manner."
- **2.3.2:** data services apply only where sources "do not require any login or authentication".
- **2.2.6(iv):** Zyte may suspend the customer if "we, in our sole discretion, determine that you have breached the terms of your targeted data source".
- **3.2:** Zyte may stop serving a target if the website asks it to, or if continuing "poses legal, operational, or business risks".
- **9.1:** "WE CANNOT GUARANTEE SUCCESSFUL DATA EXTRACTION FROM YOUR TARGETED DATA SOURCES."
- robots.txt is not mentioned.

Acceptable Use Policy (undated; [Zyte AUP](https://www.zyte.com/terms-policies/acceptable-use-policy/)) prohibits:
- collecting personal data "in violation of applicable Data Protection Law" (1.3);
- accessing "sites where You explicitly agree to terms of service prohibiting Your manner of access" (1.9);
- scraping LinkedIn (1.10);
- use that "materially interferes with a website's normal operations" (3.1);
- reselling or sublicensing the services or data (1.4–1.5, 2.3);
- EU AI Act prohibited or high-risk uses (5.2).

The AUP does not mention robots.txt either.

**A5. Zyte sessions, Romanian geolocation, rate limits and user-agent. Status: PARTIAL**
- **Rate limits.** Standard plans (pay-as-you-go and commitment) allow 3,000 RPM; Enterprise allows 10,000 RPM. Source: [Zyte pricing docs](https://docs.zyte.com/zyte-api/pricing.html).
- **Geolocation.**
  - "By default, Zyte API uses the most fitting geolocation based on the target website." It can be overridden with `geolocation`, an ISO 3166-1 alpha-2 code. Choosing an extended geolocation affects cost. Source: [Zyte features](https://docs.zyte.com/zyte-api/usage/features.html).
  - The standard geolocations are AU, BE, BR, CA, CN, DE, ES, FR, GB, IN, IT, JP, KR, MX, NL, PL, RU, TR, US and ZA. "All other geolocations are extended" (search summary of the [API reference](https://docs.zyte.com/zyte-api/usage/reference.html)).
  - So RO is an extended geolocation if it is offered at all. I did not see RO in the enum myself.
- **IP type.** `ipType` can be `datacenter` or `residential`. Residential IPs come from devices "whose owners have consented to bandwidth sharing". "Explicitly requesting residential IPs requires business verification and affects request cost." Disabling device residential IPs restricts requests to datacenter IPs and also turns off extended geolocations. Source: [Zyte features](https://docs.zyte.com/zyte-api/usage/features.html).
- **Sessions.**
  - Client-managed sessions use a UUID4 `session.id` and share the IP, network stack and cookie jar.
  - Server-managed sessions use `sessionContext`. Proxy mode supports only client-managed sessions.
  - Lifetimes (search summary): client-managed sessions last 15 minutes, CDP sessions up to 4 h, and CDP `ttl` ranges from 15 to 3,600 s.
  - Sources: [Zyte features](https://docs.zyte.com/zyte-api/usage/features.html), [Zyte CDP](https://docs.zyte.com/zyte-api/usage/cdp.html).
- **User-agent (search summary).**
  - HTTP requests accept a custom User-Agent through `customHttpRequestHeaders`, but Zyte may replace it "for ban avoidance".
  - Browser requests can set only `Referer`.
  - In proxy mode, User-Agent, Accept and Accept-Encoding can be overridden only if listed in `Zyte-Override-Headers`.
  - Sources: [Zyte FAQ](https://docs.zyte.com/zyte-api/faq.html), [proxy mode](https://docs.zyte.com/zyte-api/usage/proxy-mode.html), [HTTP requests](https://docs.zyte.com/zyte-api/usage/http.html).

**A6. Oxylabs Web Unblocker: pricing, Lithuanian entity, terms. Status: CLOSED**
- **Pricing** ([Oxylabs Web Unblocker](https://oxylabs.io/products/web-unblocker)):
  - Billed per GB: $7.2/GB (up to 0.7 GB and up to 4 GB), $6/GB (up to 16 GB), $4.8/GB (up to 104 GB), $3/GB (833+ GB).
  - Account plans: Starter $30/month, Basic $100, Flexible $500, and Enterprise "starting at $2,500/month". There is a $5 welcome credit.
  - "We will only charge you for successfully extracted data". Both upstream and downstream traffic count.
  - JavaScript rendering is built in, with no surcharge stated.
  - 195 countries, targetable by country, city or coordinates. Romania is not named.
  - Pool described as "ethically gathered", 177M+ IPs. SOC 2 Type 2. Self-service purchases are non-refundable.
  - Only marketing claims of a "high success rate", with no figure.
- **Entity and law.** "oxylabs, UAB, a Lithuanian corporation, registered at Švitrigailos str. 32, Vilnius, Lithuania". Lithuanian law applies, and Lithuanian courts have exclusive jurisdiction. The terms are marked "Last updated October 8, 2025". Source: [Oxylabs General Conditions](https://oxylabs.io/legal/oxylabs-terms-of-service).
- **Customer duties** ([Oxylabs General Conditions](https://oxylabs.io/legal/oxylabs-terms-of-service)):
  - "the Customer ensures to comply with laws, regulations, Oxylabs Acceptable Use Policy and any relevant terms of service".
  - Follow "best practice regarding the automated data gathering" (4.2.6).
  - Avoid "any violation of EU, US or any other applicable data protection laws" (4.2.7).
- **Oxylabs' own commitments.** Services are "AS IS" (5.2). Oxylabs makes "reasonable efforts" at 24/7 availability (4.3.4) and may suspend immediately on a suspected AUP breach (10.4). There is no KYC clause. Source: [Oxylabs General Conditions](https://oxylabs.io/legal/oxylabs-terms-of-service).
- **AUP (last updated June 25, 2024).** "Unless the Customer has permission from the site, only publicly available data may be scraped." Customers must not "Be in violation of relevant terms of use/service or other legal documents". Non-public and sensitive data are excluded. robots.txt is not mentioned. Source: [Oxylabs AUP](https://oxylabs.io/legal/oxylabs-acceptable-use-policy).

**A7. ScrapingBee: pricing, French entity, terms. Status: CLOSED**
- **Plans** ([ScrapingBee pricing](https://www.scrapingbee.com/pricing/)):

  | Plan | Price/month | Credits | Concurrent requests |
  |---|---|---|---|
  | Hobby | $19 | 75k | 25 |
  | Freelance | $49 | 250k | 50 |
  | Startup | $99 | 1M | 100 |
  | Business | $249 | 3M | 200 |
  | Business+ | $599 | 8M | 400 |
  | Enterprise 14 | $999 | 14M | 500 |
  | Enterprise 120 | $5,799 | 120M | 900 |

- **Credit rules.** Prices exclude VAT, and credits do not roll over. JavaScript rendering costs 5 credits per successful request. Premium proxy costs 10 or 25 credits. Geotargeting is included on every plan. There are 1,000 free credits. Source: [ScrapingBee pricing](https://www.scrapingbee.com/pricing/).
- **Entity and law.** "VostokInc, a joint-stock company", 66 Avenue des Champs Élysées, 75008 Paris, registered "under number 843 352 683". French law applies, with exclusive jurisdiction of the Paris courts. The terms are marked "Last Updated: July 15th 2024" and "Last reviewed: October 26, 2026". Source: [ScrapingBee T&C](https://www.scrapingbee.com/terms-and-conditions/).
- **Customer duties** ([ScrapingBee T&C](https://www.scrapingbee.com/terms-and-conditions/)):
  - "All Users undertake to comply with all applicable legislation and the Agreement."
  - "The User shall read the terms and conditions and privacy policies of the targeted websites."
  - The user is solely responsible for ensuring that targets' terms authorise the scraping (paraphrase).
  - The user gives a full indemnity, and personal (non-business) use is prohibited.
- **ScrapingBee's commitments.** It "cannot be bound by any obligation, whether best-efforts or result-driven, as to the availability". Payments are non-refundable unless non-conformity is reported within 3 days. robots.txt is not in the terms. Source: [ScrapingBee T&C](https://www.scrapingbee.com/terms-and-conditions/).

**A8. Bright Data Web Unlocker: pricing, KYC and compliance process. Status: CLOSED**
- **Pricing** ([Bright Data Web Unlocker pricing](https://brightdata.com/pricing/web-unlocker)):
  - Free tier of 5K requests/month.
  - Pay-as-you-go $1.5/1K ("Pay only for success").
  - Scale: $499/month including 383K requests, then $1.3/1K.
  - Enterprise is custom and includes a "premium SLA".
  - JavaScript rendering and CAPTCHA solving are included on every plan.
  - The FAQ claims "an extremely high success rate (typically 100%)" and "99.99% Uptime".
  - The $999 and $1,999 tiers cited from a third-party snapshot in `scraping_feasibility_recon.md` are not on this first-party page today.
- **Without KYC** ([Bright Data KYC](https://docs.brightdata.com/products/web-unlocker/kyc-and-access)):
  - "Without KYC your account is in immediate access mode, which honors the target's `robots.txt`."
  - URLs that robots.txt disallows return `ub_bad_endpoint_robots` (HTTP 400): "Requested site is not available for immediate access mode in accordance with robots.txt."
- **KYC steps** ([Bright Data KYC](https://docs.brightdata.com/products/web-unlocker/kyc-and-access)):
  1. Add funds. KYC cannot start in Playground or Limited Trial mode.
  2. Use a company email domain: "KYC applications are accepted only from registered businesses".
  3. Submit a form describing the business and use case, with a company registration document. "Access is granted against the use case you describe."
  4. Wait for human review: "approval is never instant". An update comes within 48 hours.
- **After KYC.** "After KYC, access is scoped to the use case the Bright Data compliance team approved." Government sites (`policy_20051`) and blocked domain classifications (`policy_20000`) return 403 and need KYC. Source: [Bright Data KYC](https://docs.brightdata.com/products/web-unlocker/kyc-and-access).

**A9. ScraperAPI. Status: CLOSED**
- **Plans** ([ScraperAPI pricing](https://www.scraperapi.com/pricing/)):

  | Plan | Price/month | Credits | Threads | Geotargeting |
  |---|---|---|---|---|
  | Hobby | $49 | 100k | 20 | US and EU |
  | Startup | $149 | 1M | 50 | US and EU |
  | Business | $299 | 3M | 100 | Global |
  | Scaling | $475 | 5M | 200 | Global |
  | Professional | $975 | 10.5M | 300 | Global |
  | Advanced | $1,975 | 21.5M | 500 | Global |
  | Enterprise | Custom | 22M+ | 500+ | – |

- **Credit costs.** A standard page costs 1 credit, Amazon 5, Google or Bing 25, and LinkedIn 30. Protected sites (Cloudflare, DataDome, PerimeterX) cost "+10 credits per request when bypassed". There is a 7-day trial with 5,000 credits. Source: [ScraperAPI pricing](https://www.scraperapi.com/pricing/).
- **Terms** (no date shown; [ScraperAPI Terms](https://www.scraperapi.com/terms/)):
  - The entity is "ScraperAPI LLC", under Nevada law and courts.
  - Permitted use is "solely for the purposes of data extraction from publicly accessible pages or APIs on publicly accessible websites", where extraction is "permitted implicitly or where you are authorized to do so" (7.1).
  - Scraping in breach of a site's terms, or logging into protected sites, is "strictly prohibited" (3.3).
  - The customer is "solely responsible for compliance with the Data Protection Laws". ScraperAPI is "neither a Data Controller or a Processor" (18.4).
  - ScraperAPI may suspend use if a target site demands that extraction stop (12.3).
  - There is no reliability warranty (8.4). Refunds can be requested within 7 days of purchase (13.8).

**A10–A13. Comparison across vendors**

Status by question:
- Target-site terms: **CLOSED**
- robots.txt option: **CLOSED**
- Success-rate guarantees: **CLOSED**
- Statements on price-comparison use: **PARTIAL**

| | Zyte | Oxylabs | ScrapingBee | Bright Data | ScraperAPI |
|---|---|---|---|---|---|
| Entity and law | Zyte Group Ltd (Ireland); Irish law outside the US | oxylabs, UAB (Vilnius); Lithuanian law | VostokInc (Paris); French law | Not checked | ScraperAPI LLC; Nevada law |
| Must the customer respect target-site terms? | Indirectly. AUP 1.9 bans sites whose terms the customer "explicitly" agreed to, and Zyte may suspend for breach of target terms | Yes. The AUP forbids being "in violation of relevant terms of use/service" | Must read the targets' T&Cs and is solely responsible | Terms not read; KYC limits use to the approved use case | Yes. Breach of a site's terms is "strictly prohibited" |
| Option to respect robots.txt | None documented | None documented | A vendor blog says the API "respects robots.txt rules when appropriately configured by default"; no parameter documented ([blog](https://www.scrapingbee.com/blog/robots-txt-web-scraping/)) | **Yes**: enforced by default when there is no KYC | None documented |
| Success-rate guarantee | None ("CANNOT GUARANTEE") | None ("AS IS") | None; no availability obligation | Marketing says "typically 100%"; a "premium SLA" on Enterprise only | None |
| Failed requests | Free | Only successful extraction is billed | JS and premium surcharges apply to successful requests | Pay-as-you-go is "pay only for success" | Not stated |

- **Price-comparison statements.** No vendor's terms mention price comparison. On marketing pages, price monitoring and price scraping appear as core use cases, for example Bright Data's "Price Scraper" product and Oxylabs' price-scraper material (search summary). Sources: [Bright Data price scraper](https://brightdata.com/products/web-scraper/price-scraper), [Oxylabs blog](https://oxylabs.io/blog/price-scraper).

### Inferences
- **Indicative monthly cost** for one designated shop at 300k pages/month (10k/day):
  - Zyte, HTTP Tier 3, pay-as-you-go: $132.
  - Zyte, browser Tier 4: $2,412, or $1,152 with a $500 commitment.
  - Bright Data Scale: $499 for up to 383k pages.
  - ScraperAPI Business: $299 covers about 272k protected pages (3M credits at 11 credits each).
  - ScrapingBee Business: $249 covers 300k pages with premium proxy and no JS, or 120k with premium proxy plus JS.
  - Oxylabs at $4.8/GB: about $0.38–1.86 per 1k pages, using the eMAG product page sizes measured in the recon (~80 KB on the wire, ~387 KB decoded). It is unclear which size is billed.
  - Conclusion: Zyte is cheapest for plain HTTP extraction on low tiers. Bright Data's flat per-request price is far cheaper for browser rendering on hard sites.
- **Pretoscop's identity is not carried.** Zyte can replace a custom User-Agent, and browser requests cannot set one. The other vendors send traffic through their own pools. Use this channel only for shops that agreed to it in writing, and log which shop and channel each observation came from.
- **Vendor terms and retailer bans.** Using a vendor against a shop whose terms ban robots, such as eMAG T&C 4.2(j), would breach Oxylabs' AUP and ScraperAPI §3.3, and arguably ScrapingBee's terms. Zyte's AUP 1.9 applies only to terms the customer "explicitly" agreed to, but Zyte can still suspend under 2.2.6(iv). This is a reading of the terms, not legal advice; confirm it with counsel.
- **Bright Data's no-KYC mode fits Pretoscop's polite policy best.** robots.txt is enforced on the vendor side, so an operator mistake cannot fetch disallowed paths. Request KYC only if a consenting shop wants Pretoscop to read paths its robots.txt blocks.
- **Zyte's RO geolocation probably means residential IPs.** RO is "extended", and turning off residential IPs disables extended geolocations. Forcing RO may therefore need business verification and cost more. The default geolocation may be enough.

### Gaps
- **Zyte tiers for the designated Romanian shops: NOT PUBLIC.** See the action under A1.
- **Whether RO is in Zyte's geolocation enum: PARTIAL.** Check the API reference, or at implementation send one request with `geolocation: "RO"` to a test URL on a non-retailer site.
- **Bright Data: NOT RESEARCHED.** Its contracting entity and acceptable-use clauses were not read; only the pricing and KYC pages were.
- **Enterprise SLAs: NOT PUBLIC.** Covers Bright Data's "premium SLA" and Zyte Enterprise. Ask sales for the SLA documents.

---

## 2. Verified-bot programs (Cloudflare, Akamai, DataDome, Fastly, IAB/ABC) and comparison-engine precedents

### Takeaway
**Cloudflare does verify small price-comparison crawlers.** A mirror of the Radar directory taken 2026-10-26 lists idealo, SkroutzBot, CoostiBot and dozens of niche comparators. It also lists two Romanian ones, **PretAlertBot** (pretalert.ro, run by an individual) and **DinteligentBot**, both signing requests with Web Bot Auth. So neither a company nor an enterprise plan appears to be required. Cloudflare publishes no review SLA.

**The other programs:**
- **DataDome:** its "Comparators" category is not allowed by default. Each DataDome customer must allow it.
- **Akamai:** categories and criteria are behind a login.
- **Fastly:** documents no Web Bot Auth support.
- **IAB/ABC list:** free to submit to, but licensing costs $5,000–15,000 a year. It is updated monthly, and Google Analytics 4 uses it to exclude bots.

### Cited Findings

**B1. Cloudflare: can free accounts submit? Status: PARTIAL**
- **Docs (last updated 2026-10-08).**
  - Bots get listed by "filling out the BotBase submission form in the Cloudflare dashboard", at `dash.cloudflare.com/?to=/:account/application-security/botbase/form`.
  - Submission statuses are Waiting For Review, Accepted, Rejected and Cancelled.
  - No plan requirement is stated.
  - Source: [Cloudflare verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/).
- **Blog "BotBase for Operators" (2026-08-28).**
  - "All customers can access this today", under Protect & Connect → Application Security → BotBase.
  - Cloudflare will "fetch your IP list, confirm your reverse DNS, or validate your Web Bot Auth signature".
  - Automated checks cover duplicates, user-agent specificity and verification. Bots that pass "can be tracked right away".
  - For rejections, Cloudflare will "tell you why, with steps you can act on".
  - Source: [Cloudflare blog](https://blog.cloudflare.com/botbase-for-operators/).
- **Conflict on rejection reasons.** The docs say the dashboard does not show the rejection reason and you must contact Cloudflare Support ([verified bots page](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/)). The August blog says Cloudflare will tell you why.
- **Signing up.** A search summary says a Cloudflare developer blog advises signing up for a free account if you have none. The summary did not name the post. It is probably [Message Signatures are now part of our Verified Bots Program](https://blog.cloudflare.com/verified-bots-with-cryptography/); the BotBase-for-Operators post I fetched does not say it. Not verified.
- **Evidence from practice.** The verified PretAlertBot lists its operator as an individual: "Operator: Jamgochian Marius, Loc. Lancram, Jud. Alba" ([PretAlert bot page](https://pretalert.ro/bot)).

**B2. Cloudflare review time. Status: NOT PUBLIC**
- Neither the docs nor the 2026-08-28 blog gives a timeline.
- A community thread says submissions are reviewed in batches and delays are common (search summary; [Cloudflare Community](https://community.cloudflare.com/t/adding-bot-to-verified-bots-list/788076)).
- The 2022 statement "within a few weeks" remains the only figure (see `gaps_bot_legitimacy_and_precedents.md` §1).
- Action: submit on the first day the bot page, IPs and key directory are live, then track the status under Submission history.

**B3. Are price-comparison bots in Cloudflare's verified directory? Status: CLOSED**
- **How the list was obtained.** radar.cloudflare.com/bots/directory returned 403 to my fetcher. I used the [microlinkhq/cloudflare-bot-directory](https://github.com/microlinkhq/cloudflare-bot-directory) dataset instead.
  - It pulls the Radar API (`radar/bots?limit=999`), and its last commit was 2026-10-26 (release 1.0.54).
  - It is licensed CC BY-NC 4.0 and is "Not affiliated with or endorsed by Cloudflare, Inc."
  - It holds exactly 999 entries, which is the script's limit, so the real directory may be larger.
- **Comparison and price bots present** (category as shown in the Radar API):
  - **Idealo** (AGGREGATOR; operator page `https://partner.idealo.com/de/bot`)
  - **SkroutzBot** (FEED_FETCHER, "download XML feeds", UA "SkroutzBot v1.0") and **Skroutz ImageBot** (AGGREGATOR)
  - **Google StoreBot** (SEARCH_ENGINE_OPTIMIZATION)
  - **CoostiBot** (Coosti.dk, AGGREGATOR, UA "Mozilla/5.0 (compatible; CoostiBot/1.0; +https://coosti.dk/bot-info)")
  - **BoardGamePrices Bot** (AGGREGATOR, "All stores give permission to be crawled")
  - **Pricey** (pricey.jp) and **StatistikAustria** (AGGREGATOR)
  - **PretAlertBot**: "Price-comparison crawler for PretAlert.ro: reads public shop prices, obeys robots.txt, signed with Web Bot Auth." (ACADEMIC_RESEARCH; operator page `https://pretalert.ro/bot`)
  - **DinteligentBot**: "Price comparison crawler for dental supplies in Romania. Obeys robots.txt and Crawl-delay; signed with Web Bot Auth." (ACADEMIC_RESEARCH)
  - Niche comparators in other countries, including KrasaBot (UA), ostupilot (EE), PreciumBot (ES), Renopal (BE), KiasuPriceBot (SG), KarsilastirmaBot (TR), TCGCompareBot, FarmetricaBot (IT, "1 req/3s per site, signed requests") and FindMeStockBot (UK).
- **Not present:** Klarna/PriceRunner, Kelkoo, Heureka, Compari, Ceneo, Geizhals, Pricy, ShopMania and eMAG. None matched by name, operator or description.

**B4. Category labels. Status: CLOSED** (the mapping between label sets is undocumented)
- **Radar API categories and counts in the dataset:**
  - MONITORING_AND_ANALYTICS 192; AI_ASSISTANT 114; ACADEMIC_RESEARCH 111; SEARCH_ENGINE_CRAWLER 103; SEARCH_ENGINE_OPTIMIZATION 99
  - FEED_FETCHER 73; SECURITY 49; WEBHOOKS 47; ADVERTISING_AND_MARKETING 46; PAGE_PREVIEW 43
  - AI_CRAWLER 37; AGGREGATOR 35; OTHER 19; AI_SEARCH 12; ACCESSIBILITY 9; ARCHIVER 6; SOCIAL_MEDIA_MARKETING 4
  - Kinds: BOT 933, AGENT 66.
- **Mapping.** These labels differ from the docs' category list, which includes "Data Collection"; see the earlier note. No published mapping links the two.

**B5. Web Bot Auth implementation. Status: CLOSED**
- The implementation details from the Cloudflare docs are in `gaps_bot_legitimacy_and_precedents.md` §1.
- **Library:** the npm package `web-bot-auth` is at **0.2.0** (2026-08-31, Apache-2.0) ([npm registry](https://registry.npmjs.org/web-bot-auth)).
- **A live Romanian implementation, PretAlertBot** ([PretAlert bot page](https://pretalert.ro/bot)):
  - UA: "PretAlertBot/1.0 (+https://pretalert.ro/bot)".
  - Signatures: RFC 9421 Ed25519, with a `Signature-Agent` header. Key directory: `https://pretalert.ro/.well-known/http-message-signatures-directory`.
  - Fetches only listing (category) pages.
  - Checks robots.txt every run and honours Crawl-delay. Otherwise it makes at most "one request every 8–12 seconds" per shop, on one connection, once a day.
  - Stops for the rest of the day after a block or challenge.
  - Publishes no IP list or reverse DNS. Opt-out is through robots.txt.

**B6. Akamai: criteria, timeline and categories. Status: NOT PUBLIC**
- **Public techdocs** say: "Akamai validates known bots to make it easy for you to handle each type as you wish." "Akamai-validated bots usually follow robots.txt directives." They list no categories and no onboarding process. Source: [Akamai detection methods](https://techdocs.akamai.com/cloud-security/docs/detection-methods).
- **Category list.** The API reference for bot categories returned 404. The Terraform data source `akamai_botman_akamai_bot_category` returns the predefined categories only to customers ([Akamai Terraform docs](https://techdocs.akamai.com/terraform/v9.3/docs/botman-datasources)).
- **Size.** The product page claims "over 1,700 known bots" (search summary; [Akamai Bot Manager](https://www.akamai.com/products/bot-manager)).
- **Action.**
  - Submit through [Akamai's registration form](https://www.akamai.com/lp/bot-agent-registration), and ask in the submission which category applies and how long review takes.
  - Ask an Akamai-protected shop, such as Answear or Douglas, how PretoscopBot is classified in their Bot Manager.

**B7. DataDome: default action for price comparators, and the verification form. Status: PARTIAL**
- **Default action.**
  - Allowed by default: "Major Search Engines", "Technical Partners", "Social Networks", "Alt Search Engines", "Digital Libraries".
  - "The following categories are **not automatically allowed** and should be reviewed": "SEO Software", "Ads", "Comparators", "Data Providers", "Marketing Tools", and other commercial bots.
  - "You can adjust the response for each bot in the Verified Bots section."
  - Page updated 2026-05-26. Source: [DataDome checklist](https://docs.datadome.co/docs/checklist-before-activating-protection).
- **Category definitions** (updated 2026-07-24; [DataDome bot definition](https://docs.datadome.co/docs/bot-definition)):
  - Comparators: "Researching and comparing products, services, companies, and prices."
  - Web Aggregator: "Web service aggregating data incoming from multiple sources (comments, reviews, news, prices, products, etc.)… They scrape, index, and publish the data online."
  - Partners: "All IPs manually allowed on your website."
- **Price-scraper category (search summary).** DataDome's public bot list puts Amazonbot, Google StoreBot and TinEye in its "E-commerce & Price Scrapers" category ([DataDome bots](https://datadome.co/bots/)).
- **Form fields and timeline: NOT PUBLIC.** The datadome.co resource and verification pages return 403 to automated fetches.
- **Action.**
  - Open `https://datadome.co/resources/bot-and-ai-agent-verification/` in a normal browser and submit.
  - Then ask Leroy Merlin, a DataDome customer, to allow PretoscopBot under Comparators.

**B8. Fastly: Web Bot Auth support and categories. Status: NOT PUBLIC**
- No Fastly documentation or announcement on Web Bot Auth was found.
- Verified bots are "self-identified bots that have been validated", with no method stated ([Fastly is_verified](https://www.fastly.com/documentation/reference/vcl/variables/miscellaneous/fastly-bot-category-is-verified/)).
- `fastly.bot.category` example values are `SEARCH-ENGINE-CRAWLER`, `AI-CRAWLER` and `SUSPECTED-BOT`. Fastly warns that the values may change ([Fastly bot category](https://www.fastly.com/documentation/reference/vcl/variables/miscellaneous/fastly-bot-category/)).
- The submission form is linked from [Fastly Bot Management](https://docs.fastly.com/products/bot-management).
- Action: in the Fastly community submission, ask which proofs are accepted (IP list, reverse DNS, Web Bot Auth) and which category applies.

**B9. HUMAN and Imperva operator processes. Status: NOT PUBLIC** (not researched again)
- Only the earlier finding stands: the shop controls its own allow list.

**B10. IAB/ABC International Spiders & Bots List: licence, cost, update cadence, use in analytics. Status: CLOSED**
- **Who can subscribe.** "Though members get discounts, you do not have to be a member of the IAB to subscribe to the list." Source: [IAB](https://www.iab.com/guidelines/iab-abc-international-spiders-bots-list/).
- **12-month subscription:** IAB General Member $5,000; IAB Tech Lab Member $5,000; IAB Associate Member $7,500; Non-Member $15,000.
- **Cadence and administration.** "The list will be updated monthly". The Alliance for Audited Media provides "evaluation and management services". A policy board that includes ABC UK oversees changes.
- **Access** is via the Tech Lab Tools Portal after payment and a signed data subscription agreement.
- **Use.** The list is required for "double pass" filtering under IAB's Client Side Counting guidelines.
- **Google Analytics 4** ([GA4 help](https://support.google.com/analytics/answer/9888366)):
  - "Known bot and spider traffic is identified using a combination of Google research and the International Spiders and Bots List, maintained by the Interactive Advertising Bureau."
  - Such traffic "is automatically excluded".
  - "At this time, you cannot disable known bot traffic exclusion."

**B11–B12. Do comparison engines document their crawlers, and are they in the verified directories? Status: PARTIAL**
- **idealo now has an official page** ([idealo partner bot page](https://partner.idealo.com/de/bot); no date shown):
  - Four UAs, for example "Mozilla/5.0 (compatible; idealo-bot pricevalidator; https://partner.idealo.com/de/bot/)", plus inventoryanalyser, inventory-image-downloader and badgechecker.
  - For the price validator: "the crawler respects restrictions defined in robots.txt".
  - Published IPs: price validator 18.185.219.158 and 3.73.173.146; badge checker 18.159.69.248, 18.198.16.30, 3.72.195.90, 3.79.162.144 and 52.59.46.55.
  - Contact: tam@idealo.de. No opt-out procedure is described.
  - idealo is also Cloudflare-verified (B3).
- **Klarna is unchanged.** The FAQ describes "KlarnaBot-PriceWatcher/1.0", which revisits pages bookmarked by users of the Klarna app (search summary; [Klarna Docs](https://docs.klarna.com/klarna-bot)). Klarna is not in the Cloudflare mirror.
- **Skroutz** appears only as Cloudflare directory entries (B3).
- **Akamai and DataDome membership** of any of these bots is unknown.

### Inferences
- **Cloudflare verification is realistic for PretoscopBot** with Web Bot Auth plus a public bot page; a Romanian individual (PretAlert) managed it. But verification only changes the outcome where the shop allows that category or bot.
- **DataDome shops need a per-shop request.** Comparators are not allowed by default, so for Leroy Merlin and any other DataDome customer, verification has to be followed by asking the shop to switch the Comparators entry to allow.
- **Submit to the IAB/ABC list, which is free.** Once listed, retailers' GA4 will drop PretoscopBot traffic automatically, which answers the objection that crawlers pollute their analytics. A $15,000 licence is unnecessary for a bot operator.
- **PretAlert's crawl rate is a useful Romanian reference.** It uses 8–12 s per shop, one connection, daily, listing pages only. Pretoscop's planned 3–10 s minimum interval is in the same range, but crawling product pages means more requests per shop.
- **Competitive signal.** PretAlert.ro is a Romanian price-comparison operator that already has a verified, signed crawler.

### Gaps
- **Cloudflare review time: NOT PUBLIC** (action under B2).
- **Akamai categories and criteria: NOT PUBLIC** (action under B6).
- **DataDome form fields and timeline: NOT PUBLIC** (action under B7).
- **Fastly verification methods: NOT PUBLIC** (action under B8).
- **HUMAN and Imperva: NOT PUBLIC** (B9).
- **Klarna's current bot page: PARTIAL.** The documented URL now redirects to a 404. Action: ask Klarna's merchant support.

---

## 3. Library and version checks (as of 2026-10-27)

### Takeaway
- **Node.js:** Node 24 "Krypton" moved to maintenance LTS on 2026-10-20. Node 26 becomes Active LTS on **2026-10-28**.
- **Next.js:** the latest stable release is **16.4.3**.
- **ORMs:** Drizzle 1.0 is still a release candidate (1.0.0-rc.5); stable is 0.45.4. Prisma 7.10.1 is stable, but the npm `latest` tag of the `prisma` CLI points to an 8.0 RC, so pin versions.
- **Jobs and crawling:** pg-boss 12.38.0 has everything the design needs. Crawlee 3.18.2 has one per-domain politeness option, `sameDomainDelaySecs`; its concurrency and rate options apply to the whole crawler.
- **Meilisearch:** 1.56.0 folds both ș/ş and ț/ţ to s/t. Its licence is now "MIT AND BUSL-1.1".
- **Typesense:** GPL-3.0.
- **Extensions:** WXT is active; Plasmo has had no release since May 2025.

### Cited Findings

**C1–C13. Versions. Status: CLOSED**

Sources were npm registry `time` and `dist-tags` (https://registry.npmjs.org/PACKAGE), the GitHub API releases endpoints, PyPI JSON, the Node release schedule and repository LICENSE files.

| Component | Current version (release date) | Relevant notes | Source |
|---|---|---|---|
| Node.js | 24.22.1 "Krypton" (2026-10-20): maintenance since 2026-10-20, end of life 2028-04-30. 26.12.1 (2026-10-21): "Current", Active LTS on 2026-10-28, end of life 2029-04-30 | 22 "Jod": maintenance, end of life 2027-04-30. 25: end of life 2026-06-01. 27: alpha from 2026-10-28, release 2027-04-22 | [Node schedule.json](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json), [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json), [previous releases](https://nodejs.org/en/about/previous-releases) |
| Next.js | 16.4.3 (2026-10-23); 16.4.0 (2026-10-06) | 16.3.0 was 2026-08-03. Canary 16.5.0-canary.28 (2026-10-26). 15.5.28 backport (2026-10-14) | [npm next](https://registry.npmjs.org/next) |
| Drizzle ORM | 0.45.4 (2026-10-08) on `latest`; 1.0.0-rc.5 (2026-10-21) on `rc` | RC series since 1.0.0-rc.1 (2026-04-30); 1.0.0-beta.1 was 2025-11-03. drizzle-kit 0.31.11 (2026-09-21). npm lists drizzle-orm as Apache-2.0 | [npm drizzle-orm](https://registry.npmjs.org/drizzle-orm), [npm drizzle-kit](https://registry.npmjs.org/drizzle-kit) |
| Prisma | @prisma/client 7.10.1 (npm 2026-10-15; GitHub release 2026-10-19). 7.0.0 was 2025-11-19 | Prisma 8 is in RC (GitHub v8.0.0-rc.20 on 2026-10-22; npm 8.0.0-rc.27 on 2026-10-23). **The `prisma` CLI's npm `latest` tag = 8.0.0-rc.27 and `prev` = 7.10.1.** The repo moved to github.com/prisma/orm | [npm prisma](https://registry.npmjs.org/prisma), [GitHub prisma/orm releases](https://github.com/prisma/orm/releases) |
| Better Auth | 1.7.14 (2026-10-26) | 1.7.0 was 2026-08-18; 1.8.0-beta.3 (2026-10-27). MIT | [npm better-auth](https://registry.npmjs.org/better-auth) |
| pg-boss | 12.38.0 (2026-10-13), MIT | Requires "Node 22.12 or higher, or Bun" and "PostgreSQL 13 or higher". OpenTelemetry since 12.36.0 (2026-10-02). Features below | [GitHub pg-boss](https://github.com/timgit/pg-boss), [jobs API docs](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md) |
| Crawlee (JS) | 3.18.2 (2026-09-29) | 4.0.0-rc.1 (2026-10-06); 4.0 betas published daily (beta.243 on 2026-10-27). Crawlee for Python 1.11.0 (2026-10-15). Apache-2.0 | [npm crawlee](https://registry.npmjs.org/crawlee), [PyPI crawlee](https://pypi.org/project/crawlee/) |
| Meilisearch | v1.56.0 (2026-10-26) | LICENSE: "Part of this work fall under the Meilisearch Enterprise Edition (EE) and are licensed under the Business Source License 1.1 … `SPDX-License-Identifier: MIT AND BUSL-1.1`". JS client 0.62.0 (2026-09-09) | [GitHub releases](https://github.com/meilisearch/meilisearch/releases), [LICENSE](https://github.com/meilisearch/meilisearch/blob/main/LICENSE) |
| Typesense | v30.2 (2026-04-19); 31.0 is in RC (Typesense Cloud offers 31.0.rc22) | Server licence **GPL-3.0**. JS client 3.2.0 (2026-10-19, Apache-2.0) | [GitHub typesense](https://github.com/typesense/typesense), [npm typesense](https://registry.npmjs.org/typesense) |
| pgvector | 0.8.7 (2026-10-01) | PostgreSQL License. The unreleased 0.9.0 drops Postgres 13 and 14 and adds async I/O for HNSW | [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md), [LICENSE](https://github.com/pgvector/pgvector/blob/master/LICENSE) |
| Playwright / Puppeteer | Playwright 1.64.1 (2026-10-14), Apache-2.0; Puppeteer 25.16.0 (2026-10-22) | Playwright `next` tag is 1.65.0-alpha (daily) | [npm playwright](https://registry.npmjs.org/playwright), [npm puppeteer](https://registry.npmjs.org/puppeteer) |
| Anti-detect tools (not recommended under the honest-UA policy) | undetected-chromedriver 3.5.5 (2024-02-17; nothing since; GPL-3.0); nodriver 0.50.99 (2026-10-26, AGPL); camoufox 0.5.8 (2026-10-06, MIT) | curl_cffi 0.17.0 (2026-10-26, MIT); Scrapy 2.19.0 (2026-09-10, BSD-3-Clause) | [PyPI](https://pypi.org/project/undetected-chromedriver/), [nodriver](https://pypi.org/project/nodriver/), [camoufox](https://pypi.org/project/camoufox/), [curl_cffi](https://pypi.org/project/curl_cffi/), [scrapy](https://pypi.org/project/Scrapy/) |
| Temporal / Airflow / Prefect / Celery | Temporal server v1.32.1 (2026-10-08, MIT); Airflow 3.3.2 (2026-09-17, Apache-2.0); Prefect 3.9.0 (2026-10-21, Apache-2.0); Celery 5.6.3 (2026-03-26, BSD-3-Clause) | One line each, as requested. All were rejected for the MVP in the earlier note | [temporal](https://github.com/temporalio/temporal/releases), [airflow](https://github.com/apache/airflow/releases), [prefect](https://github.com/PrefectHQ/prefect/releases), [PyPI celery](https://pypi.org/project/celery/) |
| WXT / Plasmo | WXT 0.21.5 (2026-10-26, MIT); Plasmo 0.90.5 (2025-05-17, MIT) | Plasmo has had no release for about 17 months | [npm wxt](https://registry.npmjs.org/wxt), [npm plasmo](https://registry.npmjs.org/plasmo) |
| ParadeDB (`pg_search`) | v0.26.3 (2026-10-22) | AGPL-3.0 | [GitHub paradedb](https://github.com/paradedb/paradedb) |

**pg-boss features**
- From the README ([pg-boss README](https://github.com/timgit/pg-boss)):
  - "Create jobs in an existing db transaction, including adapters for popular ORMs such as Drizzle, Knex, Kysely, Prisma".
  - "Cron and RRULE scheduling, job deferral".
  - "Queue storage policies to support a variety of rate limiting, debouncing, and concurrency use cases".
  - "Priority queues, dead letter queues with redrive, automatic retries with exponential backoff".
  - "OpenTelemetry traces and metrics".
  - A `@pg-boss/dashboard` package.
- From the jobs API ([pg-boss jobs API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md)):
  - Options `singletonSeconds`, `singletonNextSlot` and `singletonKey`, with `sendThrottled()` and `sendDebounced()`.
  - "a `singletonKey` is only guaranteed unique per state under the `short` and `stately` policies".
  - "Concurrent `upsert()` calls with the same `singletonKey` agree on one job".

**Crawlee option names**
These come from the type definitions in `@crawlee/basic` 3.18.2 (`internals/basic-crawler.d.ts`, package [npm @crawlee/basic](https://registry.npmjs.org/@crawlee%2Fbasic/3.18.2)):
- `maxConcurrency`: "Sets the maximum concurrency (parallelism) for the crawl. Shortcut for the AutoscaledPool `maxConcurrency` option." There is also `minConcurrency`.
- `maxRequestsPerMinute`: "The maximum number of requests per minute the crawler should run. By default, this is set to `Infinity`…" It is a shortcut for AutoscaledPool `maxTasksPerMinute`.
- `sameDomainDelaySecs`: "Indicates how much time (in seconds) to wait before crawling another same domain request. @default 0".
- `respectRobotsTxtFile?: boolean | { userAgent?: string }`: "If not provided, the default user-agent `*` will be used."
- `retryOnBlocked?: boolean`: "the crawler will automatically try to bypass any detected bot protection. Currently supports: Cloudflare Bot Management, Google Search Rate Limiting".
- Also available: `maxRequestsPerCrawl`, `maxRequestRetries` (default 3) and `maxSessionRotations`.

**C8. Meilisearch with Romanian text: diacritics and `localizedAttributes`. Status: CLOSED** (from documentation; confirm with a smoke test)
- **Normalisation.** The Latin-script pipeline applies "Decomposition, lowercase, nonspacing-marks removal". Specialised pipelines exist for German, Swedish, Greek, Turkish ("Specialized case folding (dotted/dotless i)"), Chinese, Japanese and others. Romanian has no specialised pipeline. Source: [Meilisearch language support](https://www.meilisearch.com/docs/learn/resources/language).
- **`localizedAttributes`** is described as "Locales and attribute patterns for language-specific tokenization".
  - It takes rules of the form `{attributePatterns, locales}` and defaults to `[]`.
  - The `Locale` enum includes both **`ro` and `ron`**.
  - Typo tolerance defaults: `minWordSizeForTypos` oneTypo 5 and twoTypos 9; `disableOnNumbers` false.
  - Source: [Meilisearch settings reference](https://www.meilisearch.com/docs/reference/api/settings).
- **Unicode check** (run locally with Python `unicodedata`):
  - ș U+0219 decomposes to s + U+0326 COMBINING COMMA BELOW, a nonspacing mark (Mn).
  - ş U+015F decomposes to s + U+0327 COMBINING CEDILLA (Mn).
  - ț/ţ behave the same way.
  - ă becomes a + U+0306; â and î become a/i + U+0302.
  - So removing nonspacing marks folds both the comma-below and cedilla forms, and every Romanian diacritic, to the base letter.

**C14. Romanian analysers in Elasticsearch and OpenSearch. Status: PARTIAL** (Elasticsearch only)
- Elasticsearch's `romanian` analyser chain is: standard tokenizer, `lowercase`, a stop filter with `_romanian_`, `keyword_marker`, then a stemmer with `"language": "romanian"`.
- There is **no ASCII folding**, and nothing on cedilla versus comma forms.
- Source: [Elastic language analyzers](https://www.elastic.co/docs/reference/text-analysis/analysis-lang-analyzer).
- OpenSearch was not checked.

**C16. Meilisearch RAM and disk needs at about 1M documents. Status: PARTIAL**
- **Docs** ([Meilisearch storage](https://www.meilisearch.com/docs/learn/engine/storage)):
  - "Meilisearch works optimally when the full dataset fits in RAM"; a "RAM‑to‑disk ratio around 1/3 does not materially impact performance".
  - Measured example: movies.json, 8.6 MB (also stated as 9.1 MB) with 19,553 documents, produced "305 MB of RAM and 224 MB of disk space".
  - "It is not possible to calculate the precise maximum amount of space…"
  - Disk space is not returned after deletes.
- **FAQ rule of thumb (search summary):** provision at least 10× the raw dataset size in disk ([Meilisearch FAQ](https://meilisearch.com/docs/learn/resources/faq)).
- **Old user report (search summary):** 10M documents from a 5 GB JSON file used 79 GB of disk and about 17 GB RSS ([GitHub issue #591](https://github.com/meilisearch/MeiliSearch/issues/591)).

### Inferences
- **Node.** For a project starting now, use **Node 26** once it reaches LTS on 2026-10-28, since it is supported until 2029-04-30. Keep Node 24 as a fallback if a dependency lags. pg-boss needs at least 22.12.
- **Pin versions explicitly:** `next@16.4.x`, `drizzle-orm@0.45.4` (or adopt the 1.0 RC on purpose), and `prisma@7.10.1` plus `@prisma/client@7.10.1`. A bare `npm i prisma` currently installs an 8.0 RC.
- **Crawlee politeness.** `maxConcurrency` and `maxRequestsPerMinute` apply to the whole crawler, not to each domain. Per-domain politeness therefore means:
  - one crawler instance (or `RequestQueue`) per domain or small domain group;
  - `maxConcurrency: 1` and `sameDomainDelaySecs: 3–10`;
  - `respectRobotsTxtFile: { userAgent: 'PretoscopBot' }`;
  - `retryOnBlocked: false`, because the option exists to "bypass any detected bot protection".
- **Meilisearch for Romanian.**
  - Folding solves the ș/ş and ț/ţ problem for query/document mismatches.
  - Setting `localizedAttributes: [{ attributePatterns: ['*'], locales: ['ron'] }]` should keep Romanian titles in the plain Latin pipeline. This prevents mis-detection as Turkish, whose dotted/dotless i folding would mangle "I" (inference; test it).
  - Stay with Community Edition features and check `LICENSE-EE` for which features are under BUSL.
- **Elasticsearch/OpenSearch.** If either is ever used, add `asciifolding` (or an ICU folding filter) before the Romanian stemmer, because the built-in analyser does not fold diacritics.
- **Meilisearch sizing at 1M products.** At about 1 KB of JSON per product (~1 GB raw), the ratios above suggest 10–25 GB of disk and 3–8 GB of RAM. This is an inference from the ratios; benchmark with real documents.
- **Typesense** is GPL-3.0, which is fine for an unmodified server run as a service.
- **ParadeDB** is AGPL-3.0, so publish any modifications if you run a modified version as a network service.
- **Choose WXT over Plasmo** for the extension.

### Gaps
- **Which Meilisearch features are Enterprise Edition (BUSL): PARTIAL.** Action: read `LICENSE-EE` and the release notes before enabling replication, sharding or similar features.
- **OpenSearch Romanian analyser: NOT RESEARCHED.**
- **Hosted pricing for Temporal Cloud, Astronomer and Prefect Cloud: NOT RESEARCHED.** These tools were rejected for the MVP.

---

## 4. Pricing and platform limits

### Takeaway
- **HTML caching does not need a paid Cloudflare plan.** Free includes 10 Cache Rules. Override TTLs on Free have a 2-hour minimum, and responses with `Set-Cookie` are never cached.
- **Cloudflare paid plans:** Pro costs $20/month billed annually ($25 monthly). Business costs $200/month billed annually ($250 monthly).
- **Google sitemaps** are capped at 50,000 URLs or 50 MB uncompressed per file.
- **Browsers:** Chrome 121+ ignores `background.scripts` in an MV3 manifest, Firefox uses it, and Safari prefers it. So one manifest can carry both keys.
- **Safari** extensions need the $99/year Apple Developer Program. The Chrome Web Store fee is "one-time", but the amount is not on the official pages I fetched.

### Cited Findings

**D1–D2. Search hosting. Status: CLOSED** (Meilisearch Cloud regions remain PARTIAL)
- **Meilisearch Cloud:**
  - "Starting at $20/month", billed by usage or by resources.
  - Estimator examples: usage-based $30/month for 100K documents and 50K searches; resource-based $23/month (XS instance with 0.5 vCPU and 1 GB RAM at $18, plus 32 GiB of disk at $5).
  - 14-day free trial. Enterprise is custom, with an SLA of up to 99.999%.
  - Regions are not listed on the page.
  - Source: [Meilisearch pricing](https://www.meilisearch.com/pricing).
- **Typesense Cloud** (from the first-party calculator; /pricing redirects to /pricing/calculator, and figures come from its endpoint `https://cloud.typesense.org/pricing/chart_fragment`; Frankfurt, server 30.2):

  | RAM | vCPU | Price/hour | Price/month |
  |---|---|---|---|
  | 0.5 GB | 2 vCPU, 1 h burst | $0.03 | $21.60 |
  | 1 GB | 2 vCPU, 2 h burst | $0.04 | $28.80 |
  | 2 GB | 2 vCPU, 4 h burst | $0.07 | $50.40 |
  | 4 GB | burst | $0.11 | $79.20 |
  | 4 GB | 2 vCPU | $0.20 | $144.00 |
  | 4 GB, 3-node high availability | 2 vCPU | $0.60 | $432.00 |
  | 8 GB | 2 vCPU | $0.24 | $172.80 |
  | 8 GB | 4 vCPU | $0.39 | $280.80 |

  - The 0.5 GB configuration shows "Free: First 720 hrs".
  - Outbound bandwidth costs $0.09/GB; the 0.5 GB configuration shows "Free: First 10 gb".
  - EU regions include Frankfurt, Ireland, London, Paris, Zurich, Stockholm, Milan and Spain.
  - Source: [Typesense Cloud pricing](https://cloud.typesense.org/pricing).

**D3–D6, D11–D12. Auth, push, email and images. Status: CLOSED**
- **Clerk** bills by Monthly Retained Users: "Clerk bills on retained users, not monthly active users (MAU)."
  - Hobby is free up to 50,000 per app.
  - Pro costs $25/month ($20 billed annually) including 50,000. Extra users cost $0.02 each up to 100k, $0.018 up to 1M, $0.015 up to 10M, then $0.012.
  - Business costs $300/month ($250 annually). Extra SSO connections cost $75/month each.
  - Source: [Clerk pricing](https://clerk.com/pricing).
- **OneSignal:**
  - Free: "Max 10,000 subscribers per send" for web push, and "10,000 sends / month" for email.
  - Growth "Starts at $19/mo": "$0.004 per web push subscriber", and email "20,000 free sends / month, then $1.50 / 1,000 sends".
  - Source: [OneSignal pricing](https://onesignal.com/pricing).
- **Postmark:**
  - Free: 100 emails/month, "No overages allowed".
  - 10k/month: Basic $15.00, Pro $16.50, Platform $18.00.
  - Overage per 1k: $1.80, $1.30 and $1.20 respectively.
  - Dedicated IP from $50/month, for senders of 300k+/month on Pro or higher.
  - Source: [Postmark pricing](https://postmarkapp.com/pricing).
- **imgproxy Pro:** $49/month or $499/year ("2 months free"). Priced by total workers, up to 16; above that, "Price on request". 14-day trial. The open-source licence is not stated on the page. Source: [imgproxy pricing](https://imgproxy.net/pricing/).
- **Resend:**
  - Free: 3,000/month, 100/day, 3 domains.
  - Pro: $20 for 50k or $35 for 100k; overage $0.90 per 1k.
  - Scale: $90/100k, $160/200k, $350/500k, $650/1M, $825/1.5M and $1,150/2.5M, with overage falling from $0.90 to $0.46 per 1k.
  - Dedicated IP: $30/month add-on on Scale.
  - Source: [Resend pricing](https://resend.com/pricing).
- **Amazon SES:**
  - "$0.10 / 1,000 emails", with attachments at $0.12/GB.
  - New AWS customers get up to $200 in Free Tier credits.
  - Standard dedicated IP: "$24.95 / month / IP". Managed dedicated IPs: $15/month plus $0.08 per 1k (0–10M).
  - Inbound: $0.10 per 1k plus $0.09 per 1k chunks.
  - Source: [SES pricing](https://aws.amazon.com/ses/pricing/).

**D7–D10. Observability and CI. Status: CLOSED**
- **Grafana Cloud** ([Grafana pricing](https://grafana.com/pricing/)):
  - Free tier: 10k active metric series, 50 GB logs, 50 GB traces and 50 GB profiles per month, all with 14-day retention. Also 100k API and 10k browser synthetic test runs, 500 k6 virtual-user hours, and 3 active users.
  - Pro: from $19/month with the same allowances. Metrics from $6.50 per 1k series. Logs cost $0.050/GB processing + $0.400/GB writing + $0.100/GB retention.
  - Pro retention: 13 months for metrics, 30 days for logs and traces.
- **GitHub Actions** (private repositories; [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)):
  - Included minutes and artifact storage: Free 2,000 minutes and 500 MB; Pro 3,000 and 1 GB; Team 3,000 and 2 GB; Enterprise Cloud 50,000 and 50 GB. Cache is 10 GB per repository.
  - Per-minute prices: Linux 2-core $0.006, Linux 1-core $0.002, Linux arm64 $0.005, Windows $0.010, macOS $0.062.
  - Free for public repositories on standard runners. Self-hosted runners are described as free.
- **Sentry** ([Sentry pricing](https://sentry.io/pricing/)):
  - Developer (free): 1 user, 5,000 errors, 5M spans, 50 replays, 1 GB attachments, 1 uptime monitor and 1 cron monitor, 30-day lookback.
  - Team: $29/month ($26 annually), 50,000 errors, unlimited users, 90-day lookback.
  - Business: $89/month ($80 annually).
- **Better Stack** ([Better Stack pricing](https://betterstack.com/pricing)):
  - Free: 10 monitors and heartbeats, 1 status page, logs 3 GB kept 3 days, traces 3 GB kept 3 days, 30 GB metrics, 100,000 exceptions/month and 5,000 replays.
  - Responder seat: $29/month annually or $34 monthly.
  - EU logs: $0.10/GB ingested plus $0.05/GB-month retained.

**D13–D14. Cloudflare plan prices, and whether HTML caching needs a paid plan. Status: CLOSED**
- **Plans:** Free $0. Pro $20/month billed annually or $25 monthly. Business $200/month billed annually or $250 monthly. Enterprise ("Contract") is custom. Source: [Cloudflare plans](https://www.cloudflare.com/plans/network-cdn.md) (markdown version of [cloudflare.com/plans](https://www.cloudflare.com/plans/)).
- **What each plan includes** ([Cloudflare plans](https://www.cloudflare.com/plans/network-cdn.md)):
  - Bot mitigation: Free "Simple bots", Pro "Easy-to-detect bots", Business "Sophisticated bots + basic bot analytics".
  - Total rules: 70, 225, 450 and 2,700 respectively.
  - Tiered caching comes in the Smart Shield + Argo add-on, from $5/month.
- **Default behaviour.** "The Cloudflare CDN does not cache HTML or JSON by default." The docs point to "Cache Rules to create a rule to cache everything". Responses are not cached if "The Set-Cookie header exists". Page updated 2026-09-14. Source: [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/).
- **Cache Rules allowance:** Free 10, Pro 25, Business 50, Enterprise 300 (updated 2026-08-14). Source: [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/).
- **Cache Rules settings** (updated 2026-10-15; [Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)):
  - "Eligible for cache" makes Cloudflare "attempt to cache them".
  - Edge TTL modes: "Use cache-control header if present, bypass cache if not"; "…use default Cloudflare caching behavior if not"; or "Ignore cache-control header and use this TTL".
  - There is a "Serve stale content while revalidating" toggle.
  - Custom cache keys are Enterprise-only.
- **Minimum override edge TTL:** Free 2 hours, Pro 1 hour, Business and Enterprise 1 second. "Cloudflare honors the cache expiration set in your `Expires` and `Cache-Control` headers." Source: [Edge and Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/).

**D15. Google sitemap limits. Status: CLOSED**
- "All formats limit a single sitemap to 50MB (uncompressed) or 50,000 URLs."
- lastmod is used only if "consistently and verifiably" accurate. changefreq and priority are ignored.
- "there's no limit to the number of sitemaps you can include in your robots.txt file".
- Page updated 2026-07-08. Source: [Google build sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

**D16. Chrome Web Store fee. Status: PARTIAL**
- The official page says only "pay a one-time registration fee", with no amount (page updated 2024-02-13; [Chrome register](https://developer.chrome.com/docs/webstore/register)).
- The Developer Agreement leaves the amount to Google's discretion (search summary; [CWS developer agreement](https://developer.chrome.com/docs/webstore/program-policies/terms)).
- The commonly cited US$5 is **not confirmed** by any official page I fetched. Action: read the amount on the developer dashboard at sign-up.

**D17. Firefox Manifest V2 end of life. Status: PARTIAL**
- Mozilla's March 2024 update said it had no plans to deprecate MV2 and anticipated "a notice of at least 12 months" if it ever does. The May and June 2024 posts said blocking webRequest is "not on a deprecation path" (search summary).
- Sources: [Mozilla Add-ons blog, March 2024](https://blog.mozilla.org/addons/2024/03/13/manifest-v3-manifest-v2-march-2024-update/), [May 2024](https://blog.mozilla.org/addons/2024/05/14/manifest-v3-updates/), [June 2024](https://blog.mozilla.org/addons/2024/06/13/manifest-v3-updates-landed-in-firefox-127/).
- No 2025–2026 post was found, so no end-of-life date has been announced. Action: check blog.mozilla.org/addons before release.

**D18. Safari extension distribution. Status: CLOSED**
- **Requirements.** You must join the Apple Developer Program, which "is 99 USD per membership year" ([Apple enroll](https://developer.apple.com/programs/enroll/)).
- **Distribution routes** ([Apple: Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)):
  - Through the App Store, inside a macOS, iOS or visionOS app.
  - On macOS only, outside the Mac App Store, signed and notarised with a Developer ID.
  - Beta testing on iOS is through ad-hoc builds or TestFlight.
- **Packaging without a Mac.** "The Safari web extension packager enables you to package and distribute your Safari extensions using App Store Connect from any web browser, without requiring a Mac or access to Xcode." Packaging time comes out of the "25 hours per month of Xcode Cloud included". Source: [Apple: Packaging with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect).

**D19. Can one manifest carry both `service_worker` and `scripts`? Status: CLOSED**
All quotes are from [MDN: background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) (last modified 2026-10-14).
- **Chrome:** "before Chrome 121, Chrome refuses to load a Manifest V3 extension with `background.scripts` or `background.page` present. From Chrome 121, their presence in a Manifest V3 extension is ignored."
- **Firefox:** "`background.service_worker` is not supported". Since Firefox 121 the background page starts regardless of the presence of `service_worker`.
- **Safari:** supports both keys. "when both are specified, Safari uses `background.scripts` (or `background.page`) unless `preferred_environment` is set to `service_worker`."

**D20–D23. Hosting extras. Status: CLOSED, PARTIAL or NOT RESEARCHED as marked**
- **Hetzner IPv4: CLOSED.** All prices exclude VAT; the page was last changed 2023-04-13. Source: [Hetzner IPv4 pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/).
  - Cloud: Primary IPv4 €0.50/month; Floating IPv4 €3.00/month.
  - Dedicated servers: an additional single IP costs €1.70/month plus €4.90 setup; a /29 costs €13.60/month plus €34.90; a /28 costs €27.20/month plus €59.90.
- **Latency from Germany to Romania: PARTIAL.**
  - WonderNetwork's hourly Frankfurt–Bucharest pings, 2026-10-13 to 2026-10-27: most runs average about 30 ms. The latest run (2026-10-27 17:10) showed min 33.1 / avg 60.3 / max 90.0 ms. Source: [WonderNetwork](https://wondernetwork.com/pings/Frankfurt/Bucharest).
  - This is not measured from Hetzner itself, and there are no Nuremberg or Helsinki figures.
- **Exchange rate: CLOSED.** The BNR rates for 2026-10-27 were EUR 5.3487 RON and USD 4.7977 RON, which gives EUR/USD ≈ 1.1148 (computed). Source: [BNR XML](https://curs.bnr.ro/nbrfxrates.xml).
- **Current stock of the AX41 and EX44 servers: NOT RESEARCHED.** Action: check the order page at purchase time.

### Inferences
- **Cloudflare Free is enough to cache HTML at the edge.** Use a Cache Rule ("Eligible for cache") in the mode "use cache-control header if present", and send `Cache-Control: public, s-maxage=900, stale-while-revalidate=86400`. Two conditions:
  - Anonymous HTML must never set cookies. A session cookie from Better Auth or analytics on product pages would make Cloudflare bypass the cache.
  - Whether a Free zone honours an origin `s-maxage` shorter than the 2-hour override minimum is not stated anywhere. Test it at implementation.
- **When Business pays off.** At $200/month it buys 1-second minimum TTLs and "sophisticated bots" mitigation. It is worth it only if purge-on-change is not enough.
- **Sitemaps.** Shard at 50,000 URLs and under 50 MB uncompressed per file, and give accurate `lastmod` values.
- **Extension manifest.** One manifest with both background keys works in all three browsers, though WXT builds per-browser manifests anyway.
- **Safari distribution costs $99/year** and does not require a Mac.

### Gaps
- **Chrome Web Store fee amount: PARTIAL** (action under D16).
- **Meilisearch Cloud regions: PARTIAL.** Action: open the "all server sizes & regions" link in a browser.
- **Free-plan behaviour with origin `s-maxage` below 2 h: NOT PUBLIC.** Action: test at implementation.

---

## 5. Data sources and specifications

### Takeaway
- **BNR feed:** works; use the `curs.bnr.ro` host, because `www.bnr.ro/nbrfxrates.xml` redirected curl to the homepage.
- **Google product taxonomy:** last version is 2021-09-21. Google now assigns categories automatically, so `google_product_category` is optional.
- **Claude Message Batches:** prompt caching is "best-effort", with typical hit rates of 30–98%.
- **Embedding models:** multilingual-e5 and BGE-M3 are MIT; Qwen3-Embedding is Apache-2.0.
- **TimescaleDB compression:** unavailable on Neon and Azure (Apache-licensed builds only). AWS RDS does not offer TimescaleDB at all.
- **PostgreSQL 18:** `RETURNING old.*/new.*` is confirmed.
- **GS1:** EAN-8 numbers starting with 0 or 2 are company-internal (RCN-8).
- **Open Icecat:** requires a "Specs Icecat" credit and bans AI training on its data.

### Cited Findings

**E1. BNR exchange-rate feed: URL and format. Status: CLOSED**
- **Format** (fetched 2026-10-27; [curs.bnr.ro/nbrfxrates.xml](https://curs.bnr.ro/nbrfxrates.xml)):
  - Root `<DataSet xmlns="https://www.bnr.ro/xsd">`.
  - Header: `<Publisher>National Bank of Romania</Publisher><PublishingDate>2026-10-27</PublishingDate><MessageType>DR</MessageType>`.
  - Body: `<Cube date="2026-10-27">` containing 37 `<Rate>` elements, for example `<Rate currency="EUR">5.3487</Rate>`, `<Rate currency="USD">4.7977</Rate>` and `<Rate currency="HUF" multiplier="100">1.4577</Rate>`.
- **Redirect.** A plain curl to `https://www.bnr.ro/nbrfxrates.xml` at 2026-10-27 17:34 UTC got HTTP 302 to `https://www.bnr.ro/` with a `TS01910673` cookie. That cookie looks like an F5 load-balancer cookie (my reading).
- **BNR's description (search summary of the official page):**
  - The file is for programmers and is refreshed "right after 13:00" each banking day.
  - The XSD is at `bnr.ro/xsd/nbrfxrates.xsd`.
  - There are also `nbrfxrates10days.xml` and yearly files such as `https://www.bnr.ro/files/xml/years/nbrfxrates2026.xml`, mirrored on curs.bnr.ro.
  - Source: [BNR XML page](https://www.bnr.ro/cursurile-pietei-valutare-in-format-xml-3424.aspx).

**E2. Google Product Taxonomy for ro-RO, and Google's ProductGroup/variant docs. Status: CLOSED**
- **Taxonomy file.** `https://www.google.com/basepages/producttype/taxonomy-with-ids.ro-RO.txt` starts with "# Google_Product_Taxonomy_Version: 2021-09-21". It has 5,596 lines, with HTTP `last-modified: Thu, 23 Sep 2021 16:00:00 GMT`. The en-US file has the same version and line count. Source: [ro-RO taxonomy](https://www.google.com/basepages/producttype/taxonomy-with-ids.ro-RO.txt).
- **Merchant Center attribute** ([Merchant Center](https://support.google.com/merchants/answer/6324436)):
  - `google_product_category` is "Optional for each product".
  - "All products are automatically assigned a product category from Google's continuously evolving product taxonomy."
  - Older categories are translated "to the latest version".
- **ProductGroup** (page updated 2026-09-08; [Google product variants](https://developers.google.com/search/docs/appearance/structured-data/product-variants)):
  - Required: `name`. Recommended: `productGroupID` (the "parent sku"), `variesBy`, `hasVariant`, brand and others. Variants may use `isVariantOf` and `inProductGroupWithID`.
  - `variesBy` values: schema.org color, size, suggestedAge, suggestedGender, material and pattern.
  - Single-page sites need "only one distinct canonical URL for the overall ProductGroup". Multi-page sites repeat the full ProductGroup on each variant page.
  - Each variant "must have a unique ID … (for example, using the sku or gtin properties)".
  - Markup should be in the initial HTML, because JavaScript-generated markup "can make Shopping crawls less frequent and less reliable" (page wording).

**E3. Open Icecat: index files, JSON API, licence and images. Status: PARTIAL**
icecat.biz is behind Anubis, so the sources are Icecat's own blog, iceclog.com.
- **Free tier and brands** ([Icecat FAQ for merchants](https://iceclog.com/faq-for-merchants/); posted 2022-03-15, comments through Sep 2025):
  - "Open Icecat is the free open catalog, part of Icecat's full catalog", "sponsored by your brand suppliers".
  - Content is "distributed under Icecat's open content license".
  - Brand permissions "might be revoked or subject to certain brand-specific limitations".
- **Images:** data-sheets include "Product images (unlimited) and feature logos", but brands may reserve "certain digital assets" for authorised resellers. Same source.
- **Access methods** ([Icecat import manual](https://iceclog.com/manual-how-to-import-product-content-into-your-webshop-via-icecat/); 2024-05-24):
  - XML, CSV, JSON and LiveHTML. For JSON Basic Auth, "the username is used with an app_key instead of the password".
  - "GTIN is unique within all Icecat repository, and hence you may search for the product with GTIN only"; "Product Codes are unique only within a brand".
  - "Maximum limitation is 100 requests per IP per second", with 50–70 recommended.
  - Fair Use Policy: show **"Specs Icecat" with a link to Icecat.biz** on all product data-sheets, include an AS IS disclaimer, and do **not use Icecat data for AI training**.
- **Index files** (search summary of [Icecat batch-processing manual](https://iceclog.com/manual-icecat-product-xmls-batch-processing/)): Open Icecat `https://data.icecat.biz/export/freexml/files.index.xml.gz`, Full Icecat `/export/level/`, plus a `daily.index.xml.gz`.
- **Not found:** the licence text itself, explicit image re-hosting rights, the JSON endpoint URL and Romanian-locale coverage.

**E4. Prompt caching inside the Claude Message Batches API. Status: CLOSED**
- **Caching.** "The pricing discounts from prompt caching and Message Batches can stack… However, because batch requests are processed asynchronously and concurrently, cache hits are provided on a best-effort basis. Users typically experience cache hit rates ranging from 30 percent to 98 percent." Source: [Claude batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing) (docs.claude.com redirects here).
- **Tips from the same page:**
  - "Include identical `cache_control` blocks in every Message request within your batch".
  - "Maintain a steady stream of requests to prevent cache entries from expiring after their 5-minute lifetime".
  - Because batches can take longer than 5 minutes, "consider using the 1-hour cache duration".
- **Limits:** a batch holds at most "100,000 Message requests or 256 MB". It expires after 24 h, and expired requests are not billed. Results are kept for 29 days. Cache pre-warming with `max_tokens: 0` is not supported in batches.
- **Batch prices:** Claude Haiku 5.5 $0.05/MTok in and $0.25/MTok out (prompts up to 100k tokens). Sonnet 5.5 $1 in and $5 out.

**E5. Licences of the embedding models. Status: CLOSED**
These come from the Hugging Face model API `cardData.license` field.
- [intfloat/multilingual-e5-large](https://huggingface.co/intfloat/multilingual-e5-large): **MIT**, as are -base, -small and -large-instruct.
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3): **MIT**.
- [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B): **Apache-2.0**, as are -4B and -8B.

**E6. TimescaleDB compression ratios and availability on Neon, RDS and Azure. Status: CLOSED** (Azure from Microsoft Q&A, not official docs)
- **Neon:** "Only Apache-2 licensed features are supported. Compression is not supported." Source: [Neon TimescaleDB](https://neon.com/docs/extensions/timescaledb).
- **AWS RDS for PostgreSQL:** the 1.1 MB extension-versions page contains no mention of "timescale" (pg_partman 5.5.0 is listed). So TimescaleDB is not offered. Source: [RDS extension versions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html).
- **Azure Flexible Server:** Microsoft moderators say only the Apache-licensed build is offered, without compression or continuous aggregates. A user reports a compression-policy error. Sources: [MS Q&A 1](https://learn.microsoft.com/en-us/answers/questions/1380687/will-azure-have-the-functionality-to-support-commu), [MS Q&A 2](https://learn.microsoft.com/en-us/answers/questions/273163/timescale-db-supported-features), [MS Q&A 3](https://learn.microsoft.com/en-us/answers/questions/2156345/retension-policy-and-compression-not-supported-for).
- **Compression ratios (vendor figures, search summary):**
  - "Understand hypercore" and the basic-compression tutorial say 90–98% is typical.
  - The hypercore reference gives an example of 194 MB compressed to 24 MB.
  - The whitepaper says up to 95%.
  - Lower-cardinality `segmentby` columns compress better.
  - Sources: [Understand hypercore](https://docs.timescale.com/use-timescale/latest/hypercore/), [basic compression](https://www.tigerdata.com/docs/build/how-to/basic-compression), [hypercore reference](https://www.tigerdata.com/docs/reference/timescaledb/hypercore).

**E7. PostgreSQL 18 `RETURNING OLD/NEW`. Status: CLOSED**
- Example from the docs: `UPDATE products SET price = price * 1.10 WHERE price <= 99.99 RETURNING name, old.price AS old_price, new.price AS new_price, new.price - old.price AS price_change;`.
- The syntax is "available in INSERT, UPDATE, DELETE, and MERGE". Old values are typically NULL for INSERT, but "in an INSERT with an ON CONFLICT DO UPDATE clause, the old values will be non-NULL for conflicting rows". Source: [PG18 Returning Data](https://www.postgresql.org/docs/18/dml-returning.html).
- Full grammar: `RETURNING [ WITH ( { OLD | NEW } AS output_alias [, ...] ) ] { * | output_expression … }`. Source: [PG18 UPDATE](https://www.postgresql.org/docs/18/sql-update.html).

**E8. EAN-8 restricted ranges and other non-global GS1 prefixes. Status: CLOSED**
The source is the GS1 General Specifications, **Release 26.0, Ratified, Jan 2026** (a 579-page PDF served at [ref.gs1.org/standards/genspecs](https://ref.gs1.org/standards/genspecs/)).
- **GS1-8 prefixes (Table 1-5):**
  - 000–099 and 200–299: "Used to issue Restricted Circulation Numbers within a company (company defined)".
  - 100–199, 300–951 and 953–976: GTIN-8.
  - 952: demonstrations and examples.
  - 977–999: reserved.
- **RCN-8 (§2.1.11.1):** "RCN-8 Prefix of 0 or 2. It provides two million identification numbers… for internal use in a company". These numbers "do not provide unique identification if they leave the company premises". Prefix 0 is a "velocity code" and can be confused with UPC-E.
- **GS1 prefixes (Table 1-4) that are not global trade items:**
  - 02 and 20–29: Restricted Circulation Numbers within a geographic region (defined by the national GS1 office).
  - 04 and 0000000: RCN within a company.
  - 952: demo.
  - 977: ISSN; 978–979: ISBN/ISMN.
  - 980: refund receipts; 981–983 and 99: coupons; 984–989: reserved.
- RCNs "SHALL only be encoded in EAN-8, EAN-13, UPC-A, or UPC-E".

**E9. WDC Products and Skroutz dataset downloads. Status: CLOSED** (no official Skroutz dataset exists)
- **WDC Products** ([WDC Products](https://webdatacommons.org/largescaleproductcorpus/wdc-products/)):
  - "11715 product offers describing in total 2162 product entities", "extracted in 2020 from 3259 e-shops".
  - First released 2022-12-22; categorised into 24 categories on 2023-07-01.
  - Files: 80pair.zip (21.5 MB), 80multi.zip (2.4 MB), 50pair/50multi, 20pair/20multi, the cleansed corpus `wdcproducts_corpus_with_url.json.gz` (4.3 GB), the categorisation file (134 MB), and validation sets.
  - The page states no licence.
- **Skroutz.** No official Skroutz benchmark was found.
  - The academic dataset by Akritidis et al. has "238,170 products supplied by 652 electronic stores" in 12 Skroutz categories, and a PriceRunner set of "35,311 products from 10 categories, provided by 306 different vendors".
  - Fields are product ID, title and category (plus cluster IDs on OpenML), in CSV and XML.
  - Download: [Kaggle](https://www.kaggle.com/lakritidis/product-classification-and-categorization). Cite: Akritidis, Fevgas, Bozanis, Makris, *Artificial Intelligence Review* (2020).
  - Licence: not stated on the author page; the search summary says GPL-2.0.
  - Sources: [author page](https://people.iee.ihu.gr/~lakritidis/code.php?c=7), [OpenML 45715](https://api.openml.org/d/45715).

**E10. Romania's standard VAT rate. Status: CLOSED** (via Big Four tax alerts, search summary)
- Law 141/2025 raised the standard rate from 19% to **21% from 1 August 2025**, and merged the 5% and 9% reduced rates into a single 11% rate. It was published 25 July 2025.
- Sources: [PwC Romania](https://www.pwc.ro/en/tax-legal/alerts/law-no--141-2025-on-some-fiscal-budgetary-measures.html), [EY](https://taxnews.ey.com/news/2025-1622), [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2025/10/romania-law-repeals-vat-exemption-ngos-vat-divident-tax-rates.html).

### Inferences
- **BNR ingestion.** Fetch `https://curs.bnr.ro/nbrfxrates.xml` daily after 13:15 Europe/Bucharest. Divide rates that carry a `multiplier` (HUF, JPY and so on). Backfill from the yearly files.
- **Taxonomy.** Treat Google's 2021-09-21 taxonomy as a frozen backbone. Google will not ship a newer file, so map new product types internally.
- **Batch costs.** Budget for cache misses: assume about 30% hit rate in cost models, and use the 1-hour cache for the shared instruction prefix.
- **Price history storage.** Self-host TimescaleDB, or use Tiger Cloud, only if compression is needed. Otherwise plain partitioned tables with BRIN indexes work on any managed Postgres, including RDS.
- **Change detection in one statement.** `INSERT … ON CONFLICT (shop_id, shop_sku) DO UPDATE … RETURNING old.price, new.price` lets the ingester write a `price_event` only when `old.price IS DISTINCT FROM new.price`. This removes a read-before-write.
- **GTIN validation.** Before matching on a code, reject or flag:
  - EAN-8 codes starting with 0 or 2;
  - EAN-13 codes with GS1 prefix 02, 04, 20–29, 952 or 980–99, and 0000000;
  - codes with a failing check digit.
  Treat ISBN/ISSN codes (977–979) as books and periodicals.
- **Open Icecat.** Its "no AI training" rule means Pretoscop must not train or fine-tune embedding or matching models on Icecat text. Using Icecat attributes as LLM prompt context at inference time is a grey area; ask Icecat in writing. Show "Specs Icecat" with a link wherever Icecat specs are displayed.

### Gaps
- **Open Icecat licence text, image re-hosting rights and Romanian locale: NOT PUBLIC** (bot wall). Action: read the licence in a normal browser, then sample 1,000 GTINs from the first feeds against the JSON API using a free account.
- **Azure official extension documentation: PARTIAL.** Action: check Microsoft Learn's extension list if Azure is ever considered.

---

## 6. Published statistics on GTIN coverage and schema.org completeness

### Takeaway
- **No published statistics exist for Romanian affiliate feeds.**
- **schema.org markup carries few GTINs.** I computed figures from Web Data Commons' 2024 schema.org Product data (Common Crawl, October 2024). About 7–9% of Product entities carry any `gtin*` property, both worldwide and on `.ro` domains.
- **`.ro` sites expose MPNs more often.** 26% of `.ro` Product entities have an `mpn`, against 14% worldwide; `sku` is on 56%.
- **The best general feed figure is old.** A 2018 UK study (Pricesearcher, more than 10M SKUs) found GTINs on 66.9% of feed products.

### Cited Findings

**F1. EAN/GTIN coverage in Romanian affiliate feeds. Status: NOT PUBLIC**
- No study was found.
- Action: in week 1, compute the share of feed rows per shop with a valid GTIN (check digit plus prefix rules from E8), split by category.

**F2. Completeness of schema.org Product/Offer markup across retailers (Web Data Commons). Status: CLOSED** (my own computation from WDC data)
- **The dataset.**
  - WDC's 2024 extraction (October 2024 Common Crawl, announced 2025-01-10) found 16,525,070 domains with structured data ([WDC structured data](https://webdatacommons.org/structureddata/)).
  - Its Product subset has 3,309,209 hosts, 279,715,051 URLs and 21.5 billion quads ([WDC schema.org subsets](https://webdatacommons.org/structureddata/2024-12/stats/schema_org_subsets.html)).
- **Method.** I streamed `Product_domain_stats.csv` (445 MB, last modified 2025-10-22; [download](https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/Product/Product_domain_stats.csv)). It gives, per domain, the number of Product entities and the share of them that use each property.
  - "Domains" below means the share of domains using the property at all.
  - "Entities" means the share of Product entities that have it.
  - For `gtin_any`, the entity range runs from the largest single `gtin*` property share (lower bound) to their sum capped at 1 (upper bound).

| Property | All domains (3.31M; 570.8M entities): domains / entities | `.ro` domains (19,257; 4.79M entities): domains / entities | `.ro` domains with ≥10 entities (13,418) |
|---|---|---|---|
| any `gtin*` | 7.2% / 8.7–9.1% | 6.9% / 7.7–7.8% | 8.6% / 7.7–7.8% |
| `gtin13` | 4.0% / 4.6% | 4.2% / 4.7% | 5.4% / 4.7% |
| `mpn` | 9.5% / 14.3% | 22.2% / 26.3% | 27.0% / 26.4% |
| `sku` | 62.7% / 50.2% | 82.6% / 55.9% | 83.5% / 55.8% |
| `brand` | 43.2% / 44.8% | 41.9% / 45.3% | 49.9% / 45.4% |
| `offers` | 94.6% / 86.5% | 93.7% / 83.0% | 94.6% / 83.0% |
| `aggregateRating` | 14.4% / 13.2% | 27.3% / 11.6% | 32.1% / 11.6% |

- **Named Romanian retailers.** Each row shows the number of Product entities in the Common Crawl sample, then the share of those entities carrying each property:
  - notino.ro: 429 entities; gtin13 1.0, brand 1.0, sku 1.0
  - bonami.ro: 340; gtin13 0.90, brand 0.97
  - istyle.ro: 270; gtin13 0.81
  - pricy.ro: 274; gtin13 0.67, mpn 0.996
  - flanco.ro: 344; brand, mpn and sku 1.0, no gtin
  - evomag.ro: 427; mpn and brand 1.0
  - vexio.ro: 437; brand, mpn and sku 1.0
  - forit.ro: 63; brand, mpn and sku 1.0
  - libris.ro: 2,683; brand, mpn and sku 1.0
  - auchan.ro: 1,765; brand, mpn and sku 1.0
  - carrefour.ro: 1,249; brand 0.99, sku 0.98
  - dedeman.ro: 9,429; offers only
  - decathlon.ro: 1,966; offers, brand 0.72
  - fashiondays.ro: 1,804; brand and sku
  - aboutyou.ro: 47,331; offers only
  - emag.ro: only 5 entities (brand, offers, sku)
  - Absent (no Product rows in the sample): altex.ro, pcgarage.ro, cel.ro, mediagalaxy.ro, elefant.ro and itgalaxy.ro.
- **Caveats.** Entity counts reflect how deeply Common Crawl crawled each site, not catalogue size. Property shares measure markup only; a GTIN may still appear in page text or a feed.

**F3. GTIN coverage in product feeds generally. Status: PARTIAL**
- **Pricesearcher (2018):** "66.9% of all products sampled by Pricesearcher have a GTIN barcode number". The sample was "over 10 million SKUs from thousands of retailers", UK-centric. "Additional Product information was not provided in 40.2% of product feeds", and the main brand term was missing from 47% of titles. Source: [ChannelX, 2018-03-06](https://channelx.world/2018/03/is-your-product-feed-as-good-as-you-thought-it-was/).
- **Data inconsistency (search summary):** an ETH Zürich study of 10 online sources covering more than 82,000 GTINs found inconsistent information for nearly half of the products ([Karpischek et al. 2011](https://www.vde-verlag.de/proceedings-en/453354008.html)). A 2014 follow-up estimated about 2% of product names are wrong ([Electronic Markets 2014](https://link.springer.com/article/10.1007/s12525-013-0136-4)).

### Inferences
- **JSON-LD will rarely supply GTINs.** Fewer than 1 in 10 Product entities have one, in Romania as elsewhere. GTINs have to come from affiliate feeds (eMAG requires EANs from its sellers), from Icecat, or from page text.
- **For electronics, brand + MPN is the realistic primary key** in on-page data. Flanco, evoMAG, Vexio and forIT expose `mpn` on effectively all products, so the MPN normalisation rules in `matching_history_architecture.md` §1 carry more weight than the GTIN path for crawled shops.
- **Beauty and home shops with GTINs in markup** (Notino, Bonami, iStyle) can anchor GTIN-based matching for those categories.

### Gaps
- **GTIN coverage in Romanian affiliate feeds: NOT PUBLIC** (action under F1).
- **Prevalence of fake or placeholder EANs, and how often retailers issue 594-prefix codes: NOT PUBLIC.** Action: in the first month, measure GTINs shared by unrelated titles, GTINs that fail the check digit, and 594-prefix GTINs per shop.

---

## 7. Tooling and proxies (`scraping_feasibility_recon.md` §4–§5)

### Takeaway
- **Versions and options:** the current versions and Crawlee option names are now verified (Section 3).
- **NetNut seizure confirmed.** The FBI and IRS-CI seized hundreds of NetNut domains on 2026-07-02. NetNut is linked to the Popa botnet of at least 2 million devices, and Google says many residential proxy brands resell it.
- **Romanian residential-IP counts:** only IPRoyal publishes them (vendor claims).
- **Unblocker benchmarks:** no independent benchmark on Romanian targets exists.
- **Bright Data tiers:** the $999 and $1,999 tiers are not on the first-party pricing page.

### Cited Findings
- **Playwright, Puppeteer, undetected-chromedriver and Crawlee docs. Status: CLOSED.** See the Section 3 table. undetected-chromedriver has had no release since 3.5.5 (2024-02-17). Its successor, nodriver, is AGPL and evasion-oriented.
- **Independent unblocker benchmarks against specific anti-bot systems on Romanian targets. Status: PARTIAL / NOT PUBLIC.**
  - Proxyway's 2025 report tested 11 scraping APIs on 15 protected sites, including DataDome and PerimeterX targets. Only four exceeded 80% success. Shein averaged 21.88% (secondary summaries; [Proxyway via Minster Community Post](https://business.minstercommunitypost.com/minstercommunitypost/article/accwirecq-2025-12-10-proxyway-benchmarks-analyzes-the-market-of-web-data-apis-for-ai)).
  - ZenRows publishes its own benchmark; it is a vendor ([ZenRows](https://www.zenrows.com/blog/best-web-scraping-apis-in-2026-benchmarked)).
  - Action: run a 100-URL trial per vendor, only on shops that consented.
- **Zyte tier for specific Romanian domains. Status: NOT PUBLIC.** See A1.
- **Direct tests from Hetzner, OVH or a Romanian residential IP. Status: NOT PUBLIC.** This needs live probes of retailers, which this task's rules forbid. Action: at implementation, from the production IPs, run one polite robots.txt fetch per shop with the PretoscopBot UA, and log the result.
- **Romanian IP counts per vendor. Status: PARTIAL.**
  - IPRoyal city pages (vendor claims, possibly stale) list Bucharest 32,019, Cluj-Napoca 5,516, Iași 4,938, Craiova 4,581, Ploiești 3,570 and Târgoviște 1,351 residential IPs ([IPRoyal Bucharest](https://iproyal.com/proxies-by-location/europe/romania/bucharest/)).
  - IPRoyal's dedicated ISP page lists Romania at 5,348 IPs ([IPRoyal ISP](https://iproyal.com/other-proxies/dedicated-residential-isp-proxies/)).
  - No counts were found for Bright Data, Oxylabs, Decodo or Zyte.
- **NetNut seizure. Status: CLOSED** (corroborated; [KrebsOnSecurity](https://krebsonsecurity.com/2026/07/fbi-seizes-netnut-proxy-platform-popa-botnet/), [BleepingComputer](https://bleepingcomputer.com/news/security/netnut-proxy-network-disrupted-2-million-infected-devices-cut-off)):
  - On 2026-07-02 the FBI and IRS-CI, with Google, Lumen and Shadowserver, seized "hundreds of domains" of NetNut, which is operated by Alarum Technologies (NASDAQ: ALAR).
  - NetNut is linked to the Popa botnet of at least 2 million compromised devices.
  - Google's threat intelligence group: "Google has high confidence that many popular residential proxy brands are in fact whitelabeling the NetNut botnet". It saw 316 threat-actor clusters using suspected NetNut exit nodes in one week of June 2026.
  - A 2026-07-08 update says alarum.io also showed a seizure notice. Alarum said it "will fully cooperate with law enforcement".
- **DOJ page on the 911 S5 botnet. Status: NOT RESEARCHED.** It was not retried, because the NetNut case gives a fresher precedent.
- **Bright Data $999 and $1,999 tiers. Status: CLOSED.** The first-party page lists only Free, pay-as-you-go $1.5/1K, Scale $499 (383K, then $1.3/1K) and Enterprise ([Bright Data Web Unlocker pricing](https://brightdata.com/pricing/web-unlocker)).

### Inferences
- **The NetNut case is a direct supply-chain risk.** A white-label proxy brand can depend on a seized botnet without the customer knowing. If assisted access is used at all, prefer vendors that publish their entity and DPA (Zyte, Oxylabs). Keep residential IPs off unless a consenting shop requires them. Record which vendor and IP type produced each observation.
- **The polite crawler itself needs no proxies.** Stable dedicated IPs are cheap: Hetzner Cloud Primary IPv4 costs €0.50/month, and a dedicated-server /29 costs €13.60/month plus setup. They support reverse DNS and IP-list verification.

### Gaps
- **Romanian pool sizes for the large vendors: NOT PUBLIC.** Action: ask vendors' sales for RO pool sizes in writing before any trial.

---

## 8. Remaining `matching_history_architecture.md` gaps outside the six priorities

| Gap (section in `matching_history_architecture.md`) | Status | Finding / action |
|---|---|---|
| Engineering write-ups from Geizhals, PriceRunner, Skroutz (§1) | NOT PUBLIC | None found. A Skroutz engineering search returned only academic datasets (E9) and patents. Action: none needed; rely on the internal design |
| Romanian product-matching benchmark (§1) | NOT PUBLIC | None exists. Action: build an internal labelled set of at least 2,000 pairs, stratified by category and difficulty, and use the Akritidis Skroutz/PriceRunner sets (E9) for pre-tests |
| Image licensing in Romanian affiliate networks (§2) | NOT RESEARCHED | Belongs with the affiliate/legal cluster. Action: read the 2Performant and Profitshare publisher terms on image use |
| Taxonomy versions after 2021-09-21 (§2) | CLOSED | None. Files are still 2021-09-21, and Google auto-assigns from a "continuously evolving" internal taxonomy (E2) |
| Text of Article 6a (§3) | NOT RESEARCHED | Legal cluster; EUR-Lex blocks automated access. Action: read it in a browser |
| Romania's VAT rate (§3) | CLOSED | 21% from 2025-08-01 (E10) |
| Daily price-change frequency for electronics (§3) | PARTIAL | Cavallo's NBER work: online prices are stickier than scanner/CPI data suggested ([NBER w21490](https://www.nber.org/papers/w21490)). The monthly share of products changing price at multi-channel retailers rose from about 15% (2008–10) to about 27–30% (2014–17), and is higher in electronics (search summary; [NBER digest](https://www.nber.org/digest/jan19/e-commerce-and-pricing-behavior-traditional-retailers)). No electronics-specific daily figure. Action: measure in month 1 |
| TimescaleDB compression, Neon/RDS/Azure (§3) | CLOSED | E6 |
| BNR feed (§3) | CLOSED | E1 |
| Romanian analysers in OpenSearch/Elasticsearch (§4) | PARTIAL | Elasticsearch closed (C14); OpenSearch not checked |
| Typesense licence; Meilisearch RAM/disk; cloud price lists; `localizedAttributes` (§4) | CLOSED / PARTIAL | C8, C16 (rules of thumb), D1–D2 |
| ParadeDB / `pg_search` evaluation (§4) | PARTIAL | v0.26.3, AGPL-3.0 (Section 3). Not benchmarked. Action: evaluate only if Meilisearch is rejected |
| Temporal, Airflow, Prefect, Celery versions and licences; hosted pricing (§5) | CLOSED / NOT RESEARCHED | Section 3; hosted pricing skipped because the tools were rejected |
| Romanian affiliate feed formats (§5) | NOT RESEARCHED | Affiliate cluster |
| Crawlee per-domain option names (§5) | CLOSED | Section 3 |
| Completeness of schema.org Product/Offer on Romanian retailers (§5) | CLOSED | F2 |
| Node LTS, Better Auth, Drizzle 1.0, Next.js after 16.3 (§6) | CLOSED | Section 3 |
| Clerk, OneSignal, Postmark, imgproxy, Grafana, GitHub Actions pricing (§6) | CLOSED | Section 4 |
| Cloudflare HTML caching and plan; sitemap limits (§6) | CLOSED | D13–D15 |
| Hetzner IPv4 add-on; AX41/EX44 stock (§7) | CLOSED / NOT RESEARCHED | D20 |
| Latency to Romanian ISPs (§7) | PARTIAL | D21 (Frankfurt–Bucharest, about 30 ms typical) |
| Prices of Romanian hosting providers (§7) | NOT RESEARCHED | Covered by the bot-legitimacy §5 cluster |
| Cloudflare Pro/Business prices; Meilisearch/Typesense cloud; exchange rate (§7) | CLOSED | D13, D1–D2, D22 |
| Keepa's crowd-sourcing practices (§8) | PARTIAL | Palant's 2021 analysis (search summary): the extension keeps a persistent connection to Keepa's server with a unique user identifier, and "will even use your bandwidth to load various Amazon pages in the background" ([palant.info](https://palant.info/2021/08/02/data-exfiltration-in-keepa-price-tracker/)). No current audit. Action: if Pretoscop's extension reports prices, disclose it in the store listing and make it opt-in |
| Chrome Web Store fee; both background keys; Firefox MV2; Safari (§8) | PARTIAL / CLOSED | D16–D19 |
| Scan of existing Romanian price-history extensions (§8) | NOT RESEARCHED | Action: manual Chrome Web Store search for "istoric preț" |
| Romanian open-source scrapers and other project names (§9) | NOT RESEARCHED | See `gaps_bot_legitimacy_and_precedents.md` §4 |
| PriceBuddy and Discount Bandit licences (§9) | CLOSED | GitHub API: jez500/pricebuddy is **GPL-3.0** (1,451 stars, pushed 2026-10-24). Cybrarist/Discount-Bandit has **no licence detected** (`license: null`; 759 stars, pushed 2026-10-26), so treat it as all rights reserved. [pricebuddy](https://github.com/jez500/pricebuddy), [Discount-Bandit](https://github.com/Cybrarist/Discount-Bandit) |

---

## Summary table of gaps and statuses

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
