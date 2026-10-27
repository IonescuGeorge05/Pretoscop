# Gap research: crawler legitimacy, bot allowlisting, scraping precedents and eMAG sizing for Pretoscop (as of 2026-10-27)

> Method note: all pages were fetched on 2026-10-27 unless another date is given. "(search summary)" marks a fact seen only in a search engine's result summary, not on a page I fetched. In this session I made 5 requests to retailer domains: eMAG 3, Altex 1, Flanco 1 (log in section 8). evoMAG data and eMAG's robots.txt come from files saved by the earlier probe (London egress, AS5631), which I read without re-probing. English renderings of Romanian clauses are my own translations. I did not attempt to bypass any challenge.

## 1. Bot verification and allowlisting programs: requirements, categories, application routes, timelines

### Takeaway
The vendors converge on one proof of identity: a dedicated user-agent, plus either cryptographic Web Bot Auth signatures (RFC 9421) or IPs used only by the bot with reverse DNS. Cloudflare is the most formal. It files "price scraping" under its **Data Collection** category and takes applications through the BotBase form, with no published SLA ("a few weeks" in 2022). Akamai, DataDome and Fastly have submission forms. HUMAN and Imperva only expose allow lists that their customers (the retailers) control. Verification proves who the bot is; it does not oblige any retailer to admit it.

### Cited Findings
**Cloudflare Verified Bots / BotBase**
- Requirements on the policy page (last updated Oct 8, 2026):
  - Honest self-identification: the bot "declares who it is deterministically, through a cryptographic Web Bot Auth signature", or through a published IP list with a stable user-agent, or through reverse DNS.
  - Non-abusive behaviour: obey robots.txt and crawl directives, keep "reasonable request rates", and do not evade "site owner preferences".
  - Source: [Cloudflare – Verified bots policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/).
- Categories (same page):
  - Current: Search, Agent, Training, Transact, **Data Collection** ("Price scraping, competitive intelligence gathering, and third-party analytics"), Security Testing, SEO, Ads Verification, Social / Link Preview, Feed Fetching, and Monitoring & Operations. Each bot is also labelled Direct or Intermediary.
  - Legacy categories still usable in WAF rules include **Aggregator** ("Collects content from various online sources and consolidates it in one place").
  - There is no separate price-comparison or shopping category.
  - Source: [Cloudflare policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/).
- Process (same page):
  - Submit the "BotBase submission form" in the dashboard. The bot must be verifiable by Web Bot Auth or IP validation.
  - Statuses are Waiting For Review, Accepted, Rejected and Cancelled. "The dashboard does not show the rejection reason."
  - A service is removed from the allowlist "If any of the requirements to validate are breached". Examples: IPs not used solely by the service, an AI crawler ignoring crawl-delay, undisclosed IP blocks, and traffic that does not match the disclosed purpose.
  - Source: [Cloudflare policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/).
- Signed agents and categories:
  - "As of July 1, 2026, the distinction between a Verified bot and a signed agent is expressed by a new metadata field tracked in BotBase" (the Direct/Intermediary label).
  - The form is at `dash.cloudflare.com/?to=/:account/application-security/botbase/form`.
  - Cloudflare may reassign a category if "the bot's public documentation and observed behavior differ".
  - Source: [Cloudflare – signed agents](https://developers.cloudflare.com/bots/concepts/bot/signed-agents/).
- BotBase is "Cloudflare's directory of all known bots, including verified bots and agents". It "is available to Enterprise Bot Management customers" (last updated Oct 8, 2026) — [Cloudflare – BotBase](https://developers.cloudflare.com/bots/botbase/).
- Web Bot Auth implementation (last updated Oct 8, 2026):
  - Generate an Ed25519 key and convert it to JWK.
  - Host a key directory at `/.well-known/http-message-signatures-directory` over HTTPS. The directory response must itself be signed, with tag `http-message-signatures-directory`.
  - Every request carries `Signature-Input` (with `tag="web-bot-auth"`, `keyid`, `created`, `expires`), `Signature`, and `Signature-Agent`. `Signature-Agent` is a quoted https URI pointing to the directory, and it must be among the signed components.
  - Sign at least `@authority`. On expiry: "A minute is often sufficient."
  - Registration is required: "You need to register your bot and its key directory to add your bot to the list of verified bots". Path: Manage Account > Configurations > Bot Submission Form, with "Request Signature" as the verification method.
  - Cloudflare's test endpoint returns 401 if "your key is unknown".
  - Libraries: Rust crate `web-bot-auth`, npm package `web-bot-auth`, the `http-signature-directory` CLI and `jwker`.
  - Source: [Cloudflare – Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/).
- IP validation (last updated Apr 15, 2026):
  - Either "A fixed and limited set of IP addresses" published as plain text, JSON or CSV, or domain suffixes with "PTR records set correctly".
  - "IP addresses used solely by the bot owner".
  - Generic UAs (python-requests, Go-http-client, node-fetch, Dart) "will be rejected".
  - Source: [Cloudflare – IP validation](https://developers.cloudflare.com/bots/reference/bot-verification/ip-validation/).
- Timing and criteria (Cloudflare blog, 16 Mar 2022, page modified 15 Jul 2026):
  - "We usually approve Verified Bot requests within a few weeks", after quality testing.
  - "Anyone can submit a bot, but we prefer that bot operators complete the form".
  - Criteria for bots that are not large global services: "Serve the broader Internet", "Objectively demonstrate good behavior", "Comply with Internet standards like robots.txt".
  - The machine-learning validation route needs "thousands of requests".
  - Source: [Cloudflare blog – Announcing Friendly Bots](https://blog.cloudflare.com/friendly-bots/).
- An older policy page said the dashboard route is fastest and the legacy form can take "up to several weeks" (search summary; that URL returned 404 on 2026-10-27) — [old Cloudflare policy URL](https://developers.cloudflare.com/bots/reference/verified-bots-policy/). One community thread reports an applicant waiting several weeks with no acknowledgement (search summary, anecdotal) — [Cloudflare Community](https://community.cloudflare.com/t/verified-bots-application-updates/930240).

**Akamai**
- The registration page says verification "helps ensure your traffic is recognized and routed correctly through the Akamai Bot Directory", and "Unidentified or spoofable automation is treated as untrusted by default". The form asks you to "declare your agent identity, provide your User-Agent string and public key". It is addressed to builders of "a legitimate bot or AI agent for search, retrieval, analysis, or assistance", with no eligibility rules or timeline stated — [Akamai – Verify your bot or AI agent](https://www.akamai.com/lp/bot-agent-registration).
- Akamai blog, 10 Nov 2025:
  - "Web Bot Auth is already supported by Akamai's bot & abuse solutions."
  - The edge "retrieves the bot's signature directory, validates the signature using RFC 9421 rules" and "classifies the request as validated-bot traffic in our bot directory".
  - Customers can "allow or mitigate with challenge, delay, or block actions".
  - Source: [Akamai blog](https://www.akamai.com/blog/security/2025/nov/redefine-trust-web-bot-authentication).
- Bot Manager lets customers create their own category "for any bots that you or your partners create". The directory is quoted as ">1,400 known bots in 17 categories" (brief) or ">1,300 … signatures in 15 … categories" (press release). A vendor guide describes defining such a custom bot by IP ranges and setting it to Allow or Monitor. All of this is from search summaries — [Akamai Bot Manager](https://www.akamai.com/products/bot-manager), [product brief](https://www.akamai.com/site/en/documents/brief/2021/bot-manager-product-brief.pdf), [press release](https://www.akamai.com/newsroom/press-release/akamai-revolutionizes-bot-management), [Speed Kit guide](https://www.speedkit.com/docs/akamai-bot-manager).
- Akamai's own category list ("Akamai-categorized bots") redirected to a login page — [techdocs](https://techdocs.akamai.com/bot-manager/docs/akamai-categorized-bots).

**DataDome** (Leroy Merlin's vendor)
- Requirements (page updated 2026-06-16): "Use a dedicated *UserAgent*", set up one authentication method, and submit the verification form.
- Methods:
  - Web Bot Auth (RFC 9421), through a separate form.
  - Two-way RDNS/DNS.
  - A static IP list.
  - A dynamic IP file (CSV, JSON or plaintext).
  - A private AS: "the AS must be a private corporater AS, not a common host AS (AWS, GCP, Hetzner)".
- Unauthenticated bots and AI agents are categorised as "Threat Detection" and "blocked by default".
- Sources: [DataDome – Bot Authentication](https://docs.datadome.co/docs/bot-authentication). Both forms returned 403 to my fetcher: [bot verification](https://datadome.co/resources/bot-and-ai-agent-verification/), [AI agent / Web Bot Auth verification](https://datadome.co/resources/ai-agent-verification/).
- DataDome runs an "E-commerce & Price Scrapers" bot category naming Prisync, Price2Spy and Competera (search summary; page 403) — [DataDome category](https://datadome.co/botcategory/e-commerce-price-scrapers/).

**HUMAN Security**
- HUMAN "maintains a list of known bots and crawlers". Customers set Allow, Deny or No policy per bot under Product Settings > Security Policy > Known bots & Crawlers.
- Allow rules based on the "User Agent header only" are flagged as abusable; HUMAN recommends adding an IP condition.
- The page gives no way for operators to request inclusion — [HUMAN docs](https://docs.humansecurity.com/v1/docs/known-bots-and-crawlers).

**Imperva**
- Each site has preconfigured Good Bots and Bad Bots lists, and customers can remove good bots (the Terraform provider's `canceled_good_bots`). I found no public operator submission route (search summary) — [Pulumi Incapsula bots configuration](https://www.pulumi.com/registry/packages/incapsula/api-docs/botsconfiguration), [Imperva community](https://community.imperva.com/blogs/ankit-sharma/2023/07/17/how-to-block-good-bots-traffic).

**Fastly** (Hornbach, Dedeman and Leroy Merlin are on Fastly)
- Verified bots are a Next-Gen WAF signal that "will help validate self-identified bots". "Organizations wishing to have their bots included in one of the Verified Bot categories can submit details about the bot using our submission form" at `community.fastly.com/t/about-the-verified-bots-category/2864`.
- "Use your business email address". "Submissions will be reviewed by Fastly and considered for inclusion in the product."
- Page last updated 2026-10-13 — [Fastly Bot Management docs](https://docs.fastly.com/products/bot-management).

**IAB/ABC International Spiders & Bots List**
- "List modifications may be recommended by any entity including non-IAB members."
- Requested evidence: submitter email, "The complete user-agent string", "Any IP addresses associated", "A sample of log file large enough to demonstrate the activity pattern", evidence of "existence, source and owner", "A written description of arguments", and "Evidence supporting the categorization … (commercial vs. personal)".
- Source: [IAB – Submit newly discovered spiders and bots](https://www.iab.com/submit-newly-discovered-spiders-and-bots/).
- The page's obfuscated contact decodes to **spiders.bots@auditedmedia.com**. IAB's 2016 and 2019 best-practice PDFs cite the same AAM address (search summary) — [IAB 2019 best practices PDF](https://www.iab.com/wp-content/uploads/2019/06/IAB_SpidersBots_Best_Practices_2019.pdf).

**Standardisation**
- The IETF Web Bot Auth working group (webbotauth) is active with an approved charter. Its scope is "methods for cryptographically authenticating automated clients". Milestones: 2026-04-30 for standards-track specs to the IESG, and 2026-08-31 for an operational BCP — [IETF datatracker](https://datatracker.ietf.org/wg/webbotauth/about/).
- Current individual drafts include `draft-meunier-web-bot-auth-architecture-05` (Mar 2026) and `draft-meunier-webbotauth-httpsig-protocol-00` (Jun 2026) (search summary) — [architecture-05](https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture-05), [httpsig-protocol-00](https://www.ietf.org/archive/id/draft-meunier-webbotauth-httpsig-protocol-00.html).

### Inferences
- **Category honesty.** Pretoscop fits Cloudflare's "Data Collection" category (and the legacy "Aggregator"). Declaring anything else risks reassignment or removal, since Cloudflare compares public documentation with observed behaviour. Site owners can block a whole category, so Cloudflare verification alone will not open Flanco, PC Garage, Vexio, iStyle, Notino, Dr.Max, Noriel, Cărturești or Decathlon. It turns "unknown bot" into "known Data Collection bot", which the retailer then decides on.
- **Best single investment: Web Bot Auth plus dedicated static IPs with forward-confirmed reverse DNS and a published IP JSON.**
  - Signatures are now accepted by Cloudflare, Akamai and DataDome.
  - IP and rDNS proofs cover Cloudflare's IP validation, DataDome's static-IP and rDNS methods, Fastly (method unconfirmed) and any retailer writing a custom rule.
  - DataDome's exclusion of hosting ASNs applies only to the ASN method. Static IPs at a host like Hetzner should still qualify through the IP-list or rDNS methods, since the page lists those without host restrictions (inference).
- **Do not rely on Cloudflare's machine-learning route.** It needs "thousands of requests", which a blocked newcomer cannot generate. Use signature or IP validation instead.
- **Practical sequence (estimate):**
  - Week 0–1: build the identity. This means the legal entity named on the bot page, the bot page and a contact mailbox, 1–3 dedicated IPs with PTR plus forward DNS, `ips.json`, the key directory, request signing, and robots/rate-limit compliance with logging.
  - Week 1: file the Cloudflare BotBase form (Data Collection; Request Signature or IP validation), the Akamai registration form, the DataDome form, Fastly's community form, and the IAB/ABC email.
  - Expect "a few weeks" at Cloudflare (2022 statement; no current SLA). Other vendors give no timeline.
  - In parallel, ask each blocked retailer for a custom allow rule or a feed. Their bot vendor is their tool, not ours.
- **Cloudflare account type.** The Web Bot Auth page's dashboard path and the 2022 "Anyone can submit" statement suggest a normal (free) Cloudflare account can file. The BotBase directory view itself is Enterprise-only, so check this when signing up.
- **HUMAN and Imperva.** I found no operator route. The only path is the retailer adding Pretoscop to its own allow list.
- **Verification does not override contracts.** eMAG's T&C clause 4.2(j) prohibits robots for data extraction (section 3), so even a verified PretoscopBot needs eMAG's permission for systematic extraction.

### Gaps
- Cloudflare's current review SLA, whether free accounts can submit, and whether any price-comparison bot is currently verified. I did not check the Radar verified-bots directory ([radar.cloudflare.com/verified-bots](https://radar.cloudflare.com/verified-bots)).
- Akamai's eligibility criteria, timeline and category list (techdocs is behind a login), and whether its form accepts non-AI price-comparison bots.
- DataDome's form fields and timeline, and its default action for "E-commerce & Price Scrapers" (both pages returned 403).
- Whether Fastly verifies Web Bot Auth signatures, and Fastly's category list.
- HUMAN's and Imperva's operator processes: none found.
- IAB list licensing, cost and update cadence (not on the page), and whether inclusion feeds analytics bot-filtering.

## 2. Precedents: comparison-engine crawler pages, and a recommended PretoscopBot page and user-agent

### Takeaway
Only Google documents a shopping crawler to the standard Pretoscop needs. Storebot-Google has a product token, full UA strings, a robots.txt obedience statement, published IP JSON and reverse-DNS hostnames. Klarna (PriceRunner's owner) documents a `KlarnaBot-…` family, but the page has moved. I found no official crawler pages for idealo, Heureka/Compari, Skroutz, Geizhals, Kelkoo or PriceRunner; those engines rely mostly on merchant feeds, and third-party catalogues list only UA tokens for idealo and Skroutz. That gap is an opening for Pretoscop: publishing IPs, rDNS, signatures, rate limits and an opt-out SLA would make it more transparent than the incumbents.

### Cited Findings
- **Google Storebot-Google** (page last updated 2026-10-15):
  - Token: "Storebot-Google".
  - Desktop UA: "Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Safari/537.36".
  - Mobile UA: "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36".
  - Rules addressed to it "affect all surfaces of Google Shopping". Common crawlers "always obey robots.txt rules when crawling automatically".
  - IPs are published in `common-crawlers.json`. Reverse DNS is `crawl-***-***-***-***.googlebot.com` or `geo-crawl-***-***-***-***.geo.googlebot.com`.
  - Source: [Google – common crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers).
- **Google Merchant Center:**
  - StoreBot "crawls through certain types of pages, including, but not limited to, product details pages, cart pages, and checkout pages".
  - It gathers prices, shipping, availability, coupon validity and payment methods to "verify information you share through Merchant Center".
  - "Allowing the crawler access to your pages is highly encouraged". Structured data takes precedence over what the crawler extracts.
  - Source: [Google Merchant Center help](https://support.google.com/merchants/answer/13294660).
- **Klarna / PriceRunner:**
  - "Klarna uses short custom user-agent strings to identify its bots. These start with the string KlarnaBot and are descriptive", for example "KlarnaBot-PriceWatcher/1.0".
  - The UA alone is not proof of identity.
  - Merchants control it through robots.txt, "most commonly by explicitly allowing access ('whitelisting') to product pages … and blocking parts of their sites to reduce the load".
  - All of this is from a search summary. On 2026-10-27 the URL returned a 308 redirect to `/klarna-bot/klarna-bot/overview/`, which returned 404 — [Klarna Docs – KlarnaBot FAQ](https://docs.klarna.com/klarna-bot).
  - No published KlarnaBot IP ranges were found (search summary).
- **idealo:** no official page was found.
  - A bot catalogue lists four variants (pricevalidator, badgechecker, inventoryanalyser, inventory-image-downloader) that "verify partner shop prices, check badge integration, analyse inventory, and download product images". It also states that "Idealo publishes nothing Centinel can check a source against" — [Centinel Analytica – idealo](https://docs.centinelanalytica.com/crawlers/idealo).
  - Another directory lists the pattern `idealo-bot` (search summary) — [botcrawl](https://botcrawl.com/bots/coostibot/).
- **Skroutz:** the community UA list has "SkroutzBot v1.0" and "Skroutz ImageBot v1", both added 2026/04/17 — [monperrus/crawler-user-agents](https://github.com/monperrus/crawler-user-agents) (raw JSON fetched). Third-party trackers disagree on what SkroutzBot does (feed/image/sample-page fetcher versus link-preview bot) and on whether it obeys robots.txt. No official Skroutz documentation was found (search summary) — [knownagents](https://knownagents.com/agents/skroutzbot), [Centinel – SkroutzBot](https://docs.centinelanalytica.com/crawlers/skroutzbot).
- **Heureka / Compari:** no downloader UA or IP page was found (search summary). Heureka's plugin page lists info@heureka.cz — [Heureka WordPress plugin](https://wordpress.org/plugins/heureka/). Compari merchants host XML/CSV feeds and register the URL (see affiliate_networks_and_feeds.md). Mergado, the CEE feed tool, publishes the IPs it downloads feeds from (search summary) — [Mergado help](https://help.mergado.com/en/security-and-technical-requirements/what-ip-addresses-does-mergado-use/). The community list includes "MergadoBot (+http://mergado.cz)" — [crawler-user-agents](https://github.com/monperrus/crawler-user-agents).
- **PriceRunner:** no PricerunnerBot UA was found. Its official WordPress feed plugin sends "information about where to find your feed to Pricerunner" (search summary) — [WordPress plugin](https://ka.wordpress.org/plugins/official-pricerunner-product-feed/).
- **Geizhals and Kelkoo:** no crawler documentation was found (search summaries). heise's Preisvergleich merchant pages direct enquiries to geizhals.de — [heise Preisvergleich](https://preisvergleich.heise.de/merchants/schulstart-de).
- **Other price-bot precedents** in the community list (1,504 entries; grep on 2026-10-27; it has no idealo, Heureka, PriceRunner, Geizhals, Kelkoo, Compari or ShopMania entries):
  - "Mozilla/5.0 (compatible; PricedroneShoppingBot/1.0; +http://pricedrone.com/robot/)", a UK comparator. On 2026-10-27 its robot page returned a 301 redirect to `nuffstores.com/robot/`, which returned 404.
  - "Mozilla/5.0 (compatible; StatistikAustria/1.0; +http://www.statistik.gv.at)", Statistics Austria's price-statistics scraper.
  - Sources: [crawler-user-agents JSON](https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/crawler-user-agents.json), [Statistik Austria – web scraping in price statistics](https://www.statistik.at/ueber-uns/innovationen-und-experimentelle-statistik/einsatz-von-kassenscannerdaten-und-webscraping-in-der-preisstatistik).
- **PayPal Honey product crawler** (last updated Sep 14, 2026): it crawls only recently changed products. Merchants allowlist it either by UA (example "… Safari/537.36 Honey/1.0", customisable) or by a custom header ("X-Merchant-Key = Merchant-Custom-Value") that is "agreed upon and shared with PayPal in advance" — [PayPal Developer](https://developer.paypal.com/limited-release/honey-product-crawler).
- **Common Crawl's CCBot** uses "dedicated IP address ranges with reverse DNS" and publishes them as JSON — [Common Crawl](https://commoncrawl.org/ccbot).

### Inferences
**Recommended user-agents**
- Crawler: `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`.
- Fetcher for merchant-provided feeds: `Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)`.

Why this format:
- It is the `compatible; Name/Version; +URL` pattern used by Googlebot-style crawlers, Pricedrone and Statistik Austria.
- It is non-generic, which Cloudflare's IP validation requires.
- It uses one robots.txt product token, `PretoscopBot`, so retailers need only one group.
- It carries a version number, so changes are visible in retailer logs.
- It avoids generic words like "spider"/"crawler". Elefant has `User-agent: spider` and `User-agent: crawler` disallow groups. RFC 9309 matching is by product token, so these would not hit us, but naive WAF substring rules exist.
- Sub-agents (`-Feed`) follow the `PretoscopBot` group, as Klarna's naming and Storebot's documentation do.

**Draft public bot page** (publish in Romanian and English at https://pretoscop.ro/bot; placeholders in <>):

```markdown
### PretoscopBot — robotul Pretoscop / the Pretoscop crawler
Last updated: <YYYY-MM-DD> · Operator: <Pretoscop SRL>, CUI <…>, <address> · Contact: bot@pretoscop.ro
(we reply within 1 business day; opt-out requests take effect within 24 hours)

#### What PretoscopBot does
PretoscopBot reads publicly displayed prices and stock status of products sold by Romanian online
shops, so pretoscop.ro can show price comparisons and price history and send shoppers to the shop.
Category: price comparison ("Data Collection" in Cloudflare's taxonomy).

#### User-agent strings
- Crawler:      Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)
- Feed fetcher: Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)  (only feeds you give us)
Both obey the robots.txt group "PretoscopBot" (or "*" if there is none).

#### How to check that a request is really from us
- IP addresses: https://pretoscop.ro/bot/ips.json, e.g. {"creationTime":"…","prefixes":[{"ipv4Prefix":"203.0.113.10/32"}]}.
  These IPs are used only by PretoscopBot.
- Reverse DNS: each IP resolves to crawl-N.bot.pretoscop.ro, which resolves back to the same IP.
- Web Bot Auth (RFC 9421): requests carry Signature, Signature-Input (tag="web-bot-auth") and
  Signature-Agent: "https://pretoscop.ro"; keys: https://pretoscop.ro/.well-known/http-message-signatures-directory
- Traffic with our user-agent from any other IP is not ours. Please block it and tell us.

#### Rules PretoscopBot follows
- robots.txt (RFC 9309): read before crawling, cached for at most 24 h; Allow/Disallow and Crawl-delay obeyed;
  if robots.txt returns 5xx or is unreachable, we do not crawl.
- Speed: by default at most 1 request every 5 seconds per site, one connection at a time.
- Back-off: on 429/503 we honour Retry-After (at least 1 hour). On 403, CAPTCHA, JavaScript challenge or
  connection reset we stop crawling the site and contact you. We never solve CAPTCHAs, run challenge
  scripts, rotate IPs, use residential proxies or disguise the user-agent.
- Only public product, category and sitemap pages. No login, cart, checkout, internal search or internal APIs.
- Conditional requests (ETag / If-Modified-Since) and compression, to keep load low.

#### What we store and show
Product name, identifiers (EAN/GTIN, MPN), displayed price and reference price, stock status, shop, URL,
and observation time. We link to your shop for the purchase. We do not collect reviews or personal data,
and we do not republish your images or descriptions without a licence.

#### How to control PretoscopBot
- Block:      User-agent: PretoscopBot  /  Disallow: /
- Slow down:  User-agent: PretoscopBot  /  Crawl-delay: 10
- Prefer a feed? Send us your Google Merchant or Compari XML feed URL. We will stop crawling and fetch
  only the feed with PretoscopBot-Feed (3–4 times a day).
- Allowlisting: Cloudflare (verified-bot status: <pending/accepted>; otherwise a WAF skip rule on our
  IPs + user-agent), Akamai (custom bot category with our IPs, or the Akamai Bot Directory),
  DataDome (Web Bot Auth / IP list), hosting-level filters (e.g. Distinct): email bot@pretoscop.ro.

#### Changelog
- <date>: PretoscopBot/1.0 launched.
```

Why the page contains each element:
- IP JSON and rDNS: Google and Common Crawl precedent; required by Cloudflare and DataDome.
- Web Bot Auth: Cloudflare, Akamai and DataDome.
- Purpose and contact: Cloudflare compares documentation with observed behaviour.
- Crawl-delay obedience: Cloudflare cites ignoring crawl-delay as a removal example.
- Feed alternative: the Compari, PriceRunner and Mergado precedent.
- Merchant-agreed header option: the Honey precedent. It could be offered to Akamai and Fastly shops as an extra allowlisting handle, alongside the IPs.

### Gaps
- No official crawler documentation was found for idealo, Heureka, PriceRunner, Skroutz, Geizhals or Kelkoo. KlarnaBot's details come only from a search summary, because the page has moved.
- I could not determine whether any of these engines are in Cloudflare's, Akamai's or DataDome's verified directories.

## 3. Retailer terms on automated access (eMAG, Altex, Flanco), eMAG's robots.txt, and eMAG partner guidance

### Takeaway
eMAG's terms explicitly forbid "utilizarea oricarui robot, algoritm sau a altor mijloace automatizate … pentru a extrage date din Site" (clause 4.2(j)). They also define "Conținut" to include prices, reserve all rights in it, and allow only personal or non-commercial use (6.1–6.7). Yet eMAG's robots.txt lets unknown bots crawl product and category pages, with no crawl-delay: technically allowed, contractually forbidden. Altex's and Flanco's terms could not be read; Altex timed out and Flanco served a Cloudflare challenge. Indexed snippets show Flanco defines "Conținut" just as broadly.

### Cited Findings
**eMAG — Terms page** ([https://www.emag.ro/help/termeni-si-conditii/](https://www.emag.ro/help/termeni-si-conditii/)): fetched 2026-10-27 15:30:35Z; page title "Termene si conditii"; HTTP `last-modified: Fri, 23 Oct 2026 12:45:35 GMT`. The footer links to `/help/…`, not `/info/…`.

Definitions:
- Operator: "DANTE INTERNATIONAL S.A. … cod unic de inregistrare RO 14399840" — [eMAG T&C](https://www.emag.ro/help/termeni-si-conditii/).
- "Conținut" includes:
  - "toate informatiile de pe Site care pot fi vizitate, vizualizate sau altfel accesate prin utilizarea unui echipament electronic" (all information on the Site that can be visited, viewed or otherwise accessed with an electronic device);
  - "informatii legate de Bunurile si/sau Serviciile si/sau **tarifele** practicate de Vanzator intr-o anumita perioada" (information on goods/services and/or the **prices** charged by the Seller in a given period);
  - the same for "un tert cu care Vanzatorul are incheiate contracte de parteneriat" (a third party with which the Seller has partnership contracts, i.e. marketplace partners).
  - Source: [eMAG T&C §1](https://www.emag.ro/help/termeni-si-conditii/).
- "Utilizator – orice persoana fizica care are varsta peste 18 ani sau persoana juridica inregistrata pe Site, care, prin finalizarea procesului de creare a Contului, si-a dat acordul cu privire la clauzele specifice site-ului" (a User is a registered person who agreed to the site-specific clauses by creating an Account) — [eMAG T&C §1](https://www.emag.ro/help/termeni-si-conditii/).

Clauses on automated access:
- 4.1: "Accesul in vederea utilizarii Site-ului si efectuarii unei Comenzii ii este permis oricarui Utilizator/Cumparator, cat timp utilizeaza Site-ul in conformitate cu prezentul Document si reglementarile aplicabile." (Access is allowed to any User/Buyer as long as they use the Site in accordance with this Document.) — [eMAG T&C §4](https://www.emag.ro/help/termeni-si-conditii/).
- 4.2: "Utilizarea abuziva a Site-ului sau pentru alte scopuri decat cele autorizate expres de eMAG este interzisa … Cu precadere, urmatoarele actiuni sunt interzise:" (Abusive use of the Site, or use for purposes other than those expressly authorised by eMAG, is prohibited … In particular, the following are prohibited:)
  - (g) "utilizarea oricarui tip de instrument software extern care poate perturba operarea normala a Site-ului" (using any external software tool that may disrupt the normal operation of the Site);
  - (i) "cesionarea, copierea, decompilarea sau incercarea de a descoperi codul sursa al Site-ului sau al continutului acestuia" (assigning, copying, decompiling or trying to discover the source code of the Site or its content);
  - **(j) "utilizarea oricarui robot, algoritm sau a altor mijloace automatizate pentru a citi codul sursa sau pentru a extrage date din Site"** (using any robot, algorithm or other automated means to read the source code or to **extract data from the Site**);
  - (k) "… accesand orice servere sau servicii din Site care nu sunt publice, fara autorizare …" (accessing any non-public servers or services of the Site without authorisation);
  - Source: [eMAG T&C §4.2](https://www.emag.ro/help/termeni-si-conditii/).
- 4.3(a): corrective measures include "suspendarea sau inchiderea Contului sau restrictionarea in orice alt mod a accesului la Site" (suspending/closing the Account or otherwise restricting access to the Site). 4.5: "Pentru detectarea incalcarilor, eMAG poate folosi software sau tehnologie automata … decizia … este luata de o persoana" (eMAG may detect breaches with automated technology; a person takes the decision) — [eMAG T&C §4.3–4.5](https://www.emag.ro/help/termeni-si-conditii/).

Clauses on content and reuse:
- 6.1: Content "sunt proprietatea exclusiva a eMAG, acestuia fiindu-i rezervate toate drepturile" (is eMAG's exclusive property, all rights reserved).
- 6.2: the Client/Buyer/User may not engage in "copierea, distribuirea, publicarea, transferul catre terte parti, … utilizarea, legarea la, expunerea, includerea oricarui Continut in orice alt context decat cel original intentionat de eMAG, includerea oricarui Continut in afara Site-ului … decat cu acordul scris expres al eMAG" (copying, distributing, publishing, transferring to third parties, using, linking to, displaying, or including any Content in another context or outside the Site, without eMAG's express written consent).
- 6.4: "… poate copia, transfera si/sau utiliza Continut numai in scopuri personale sau non-comerciale" (may copy/use Content only for personal or non-commercial purposes).
- 6.7: "Este interzisa orice utilizare a Continutului in alte scopuri decat cele permise expres" (any other use of Content is prohibited).
- Source: [eMAG T&C §6](https://www.emag.ro/help/termeni-si-conditii/).

Acceptance:
- 15.6: "Prin crearea Contului si/sau **utilizarea Continutului** si/sau plasarea Comenzilor, Clientul / Utilizatorul/ Cumparatorul accepta in mod expres si fara echivoc Termenele si Conditiile" (by creating an Account and/or **using the Content** and/or ordering, the Client/User/Buyer expressly accepts the T&C) — [eMAG T&C §15](https://www.emag.ro/help/termeni-si-conditii/).

**eMAG — robots.txt** (saved copy from the earlier probe, 2026-10-27 14:49:33Z; not re-fetched; response headers include `vary: User-Agent`) — [https://www.emag.ro/robots.txt](https://www.emag.ro/robots.txt):
```
User-agent: *
Disallow: /user/*            Disallow: /addtocart*        Disallow: /cart/*        Disallow: /checkout
Disallow: /compare/*         Disallow: /cat-*/pid-*/ord-*/p-*                     Allow: */review/*
Disallow: */review/add*      Disallow: /search-tools/*    Disallow: /ajax_live_products
Disallow: /search/listall    Disallow: /search/m.emag.ro  Disallow: /product/      Disallow: /label/*
Disallow: /favorites/ …      Allow: /*/*/*all-products
User-agent: 008          Disallow: /
User-agent: Yandex       Disallow: /
User-agent: Baiduspider  Disallow: /
User-agent: AhrefsBot    Disallow: /
User-agent: Synthesio    Disallow: /
Sitemap: https://www.emag.ro/sitemaps/offers-available-index.xml   (+10 other sitemap indexes)
```
- This is an excerpt: several directives share a row here, and some disallows are omitted (`/proces_comanda`, `/imagini/*`, `/images/*`, `/mesaje/`, `/thank-you$`, `/adauga-intrebare`, `/header-cart`, `/header-wl`, `/widgets/track.json`, `/get_back_to_search_url`, `/box_user_history`, `/configurator_auto/`, `/favorites$`, `/favorites/*`). The original has one directive per line, 11 `Sitemap:` lines, and 1,612 bytes. There is no `Crawl-delay` and no comparator-specific group. Product pages (`/…/pd/<id>/`) and category pages (`/…/c`) fall under `*` and are allowed.

**eMAG — partner guidance**
- eMAG's affiliate program on Profitshare (terms last modified 27/10/2025) excludes sites that "sunt construite sub forma unor comparatoare de preturi, agregatoare de produse" (are built as price comparators or product aggregators). It also excludes those that "preiau automat informatii de pe website-ul eMAG sau din alte website-uri, fara acordul acestora (ex site-uri comparatoare de preturi, plugin-uri de browsere)" (automatically take information from eMAG's site without consent, e.g. comparators, browser plugins). As quoted in affiliate_networks_and_feeds.md from [Profitshare – eMAG program](https://profitshare.ro/affiliate-programs/retail/emag).
- The eMAG Marketplace (seller) API accepts calls "only from IP addresses whitelisted in the seller panel", with rate limits of "12 requests/second for orders, 3/second for everything else". These are third-party notes marked [documented] against eMAG's API reference (`marketplace-api.emag.ro/api-doc`) — [christ-rm/emag-trendyol-oblio-api-notes](https://github.com/christ-rm/emag-trendyol-oblio-api-notes/blob/HEAD/docs/emag.md).
- I found no public eMAG page with crawler or bot guidance for partners. I checked only the T&C, robots.txt and the footer links on the saved product page.

**Altex**
- The terms page is at [https://altex.ro/termeni-si-conditii/](https://altex.ro/termeni-si-conditii/) (title "Termeni de utilizare"; mirror [altex.ro/termeni-conditii/pag/](https://altex.ro/termeni-conditii/pag/)). The operator is ALTEX ROMANIA S.R.L., Voluntari, CUI 2864518 (search summary; no automated-access clause appeared in the snippet).
- My single fetch on 2026-10-27 timed out after 60 s with no response. The earlier probe saw HTTP/2 stream resets from Akamai.

**Flanco**
- The main terms page is [https://www.flanco.ro/termene-si-conditii](https://www.flanco.ro/termene-si-conditii). My single request at 15:47:35Z returned `403` with `cf-mitigated: challenge` ("Just a moment…"), and I stopped there.
- Indexed snippets (search summary):
  - "Continut: toate informatiile din Site care pot fi vizualizate sau accesate prin utilizarea unui echipament electronic" (Content: all information on the Site that can be viewed or accessed with an electronic device);
  - "Prezentii Termeni si conditii pot fi oricand actualizati" (these T&C may be updated at any time).
- The blog's terms: "Flanco oferă vizitatorilor blogului un acces limitat și în interes personal la conținutul acestuia" (limited, personal-interest access); copying requires Flanco's express written consent (search summary) — [Flanco blog T&C](https://www.flanco.ro/blog/termeni-si-conditii/).
- Flanco's robots.txt has `Content-Signal: search=yes,ai-train=no` and full disallows for CCBot, GPTBot, ClaudeBot, Amazonbot, Bytespider, Applebot-Extended, Google-Extended and meta-externalagent. There is no comparator group (earlier probe, 14:49Z) — [https://www.flanco.ro/robots.txt](https://www.flanco.ro/robots.txt).

### Inferences
- **eMAG is the clearest contractual risk.** Clause 4.2(j) names robots and data extraction outright, the "Conținut" definition expressly covers prices, and 6.2/6.4 bar commercial reuse without written consent. Politeness and robots.txt compliance do not cure this.
- **Whether the clause binds a crawler is a legal question.** "Utilizator" is defined as an account holder, but the 4.2 list is phrased generally, and 15.6 claims acceptance by "utilizarea Continutului" (browsewrap). For the EU angle see legal_and_regulatory.md (Ryanair C-30/14 and database-right analysis).
- **Practical stance for eMAG:**
  - Seek written permission, a data feed or a partnership.
  - Until then, minimise extraction: link out, show only facts (price, availability) with attribution, and do not copy images or descriptions.
  - Never use internal or non-public endpoints. Clause 4.2(k) covers "servere sau servicii din Site care nu sunt publice".
  - A browser-extension design is also covered by Profitshare's "plugin-uri de browsere" exclusion for affiliates.
- **eMAG varies responses by UA.** `vary: User-Agent` appears on robots.txt and on the sitemaps (section 7). Re-read robots.txt with the exact production UA before launch.
- **Altex and Flanco:** given that their bot defences block unknown bots outright, assume terms at least as restrictive as eMAG's until read. Request them, and permission, directly.

### Gaps
- I could not retrieve the full text of Altex's and Flanco's terms (blocked or timed out). The Internet Archive was "Temporarily Offline", and later returned 504 and 429, so I found no archived copy.
- I did not check whether eMAG publishes an English version of its T&C. All translations above are mine.
- I found no eMAG crawler/bot guidance for partners. I did not search eMAG's Marketplace documentation portal.

## 4. Open-source scrapers for Romanian shops (GitHub, npm, PyPI)

### Takeaway
GitHub has dozens of small eMAG scrapers, nearly all with 0–7 stars. The newest ones map the blocking landscape well:
- eMAG listing and product HTML works with plain HTTP (`.card-item`, `.card-v2-title`, `product-new-price`, `data-offer-id`, JSON-LD).
- PC Garage and Flanco are scraped with stealth headless browsers because of Cloudflare JS challenges.
- Altex's Akamai front stalls plain TLS clients, and one repo calls Altex's internal API `fenrir.altex.ro` instead.

Several repos rely on evasion (playwright-stealth, undetected-chromedriver, TLS impersonation, scraping-proxy APIs), which Pretoscop must not copy. Apart from one n8n node, there is no reusable PyPI or npm package for Romanian shops.

### Cited Findings
- GitHub repository search totals (unauthenticated API, sorted by `updated`, 2026-10-27):
  - "emag scraper" 34; "altex scraper" 3; "emag price history" 5; "emag api" 30; "istoric preturi" 1; "emag price tracker" 17; "emag crawler" 9; "pcgarage" 18.
  - The ninth query ("emag.ro") hit the unauthenticated rate limit.
  - Example query: [api.github.com/search/repositories?q=emag+scraper&sort=updated](https://api.github.com/search/repositories?q=emag+scraper&sort=updated).
- Top 10 by relevance and recency. Method: source archives downloaded from codeload.github.com and grepped, not executed; star counts and push dates from the API.

| # | Repo | Lang | ★ | Last push | Shops | What it parses / how | Blocking-related notes |
|---|---|---|---|---|---|---|---|
| 1 | [NaviAndrei/bf-price-monitor](https://github.com/NaviAndrei/bf-price-monitor) | Python | 0 | 2026-10-27 | eMAG, PC Garage, Flanco (Altex stubbed) | eMAG: plain `requests` on search listings (`.card-item`, `.card-v2-title`); "Price layer order: JSON-LD, then semantic attributes, then CSS"; Flanco 30-day reference price `.pretVechi .pricePrp .price` | PC Garage/Flanco: "Playwright + playwright-stealth (Cloudflare JS challenge blocks plain `requests`)"; Altex "stalls the TLS handshake for a plain `requests` client", and `curl_cffi` chrome120 impersonation "does clear that stall" but the listing is client-rendered; runs on a self-hosted runner "because GitHub's shared IP range gets blocked by these sites' bot detection"; obeys robots.txt with a 4–9 s random delay; retries 403/429 at 5/10/20 s |
| 2 | [TiberiuSzabo/Price-monitor-spring](https://github.com/TiberiuSzabo/Price-monitor-spring) | Java (Spring Boot, jsoup) | 0 | 2026-10-26 | eMAG only ("Only `emag.ro` URLs are accepted") | jsoup on `script[type=application/ld+json]`; listings via `card-v2-title`; `product-new-price` | — |
| 3 | [MerlaSilviuAlexandru/Price-tracker](https://github.com/MerlaSilviuAlexandru/Price-tracker) | Python | 0 | 2026-10-25 | eMAG | Playwright page scraping; description: "Checking prices on emag & notify" | — |
| 4 | [ungureanubogdan11/Price_Tracker](https://github.com/ungureanubogdan11/Price_Tracker) | Python | 0 | 2026-10-06 | eMAG (LEGO sets) | BeautifulSoup reads `[data-offer-id]`, then calls the internal `https://sapi.emag.ro/voucher-campaign/product-page/{offer_id}?source_id…` | Routes requests through a third-party scraping proxy (`make_proxy_url(…, render=True)`) with a spoofed macOS Chrome UA; handles 403 |
| 5 | [Cresteanu/emag-scraper](https://github.com/Cresteanu/emag-scraper) | JavaScript | 0 | 2026-08-04 | eMAG search | Playwright + cheerio; `product-new-price` | — |
| 6 | [AlinCqe/eMAG-scraper](https://github.com/AlinCqe/eMAG-scraper) | Python | 1 | 2026-07-02 | eMAG | Selenium captures the front-end's "hidden API" calls: `https://sapi.emag.ro/recommendations/by-zone-by-filters?source_id=7&…` and `https://www.emag.ro/search-by-url?source_id=7&templates[]=full&url=/search/…&page[limit]…` | Internal JSON endpoints |
| 7 | [ros-antonio/PriceTracker](https://github.com/ros-antonio/PriceTracker) | Python | 1 | 2026-06-26 | eMAG, Amazon, Altex, PC Garage, CEL | Playwright with `playwright_stealth` (`Stealth().use_sync(…)`), per-store scrapers including `altex` | Stealth evasion (the description says it is used "to bypass …") |
| 8 | [MrLmao07/BridgeAI-Database-Scraper](https://github.com/MrLmao07/BridgeAI-Database-Scraper) | Python | 0 | 2026-04-04 | PC Garage | BeautifulSoup + JSON-LD | `undetected-chromedriver`, "Chrome with CloudFlare bypass"; "Headless mode increases the risk of CloudFlare detection." |
| 9 | [KolevAristocracy/Emag-Scraper](https://github.com/KolevAristocracy/Emag-Scraper) | Python | 0 | 2026-03-15 | eMAG | Playwright; PostgreSQL via SQLAlchemy; `product-new-price` | — |
| 10 | [MarianD2-0/emag-altex-scraper](https://github.com/MarianD2-0/emag-altex-scraper) | Java (jsoup) | 0 | 2025-05-10 | eMAG, Altex | eMAG HTML (`data-offer-id`, `product-new-price`); **Altex internal API** `https://fenrir.altex.ro/catalog/category/telefoane?filter=in-stoc-5182:in-stoc&page=%d&size=100` and `https://fenrir.altex.ro/catalog/product/` | Undocumented internal API |

- Other notable repos:
  - [christ-rm/emag-trendyol-oblio-api-notes](https://github.com/christ-rm/emag-trendyol-oblio-api-notes) (2026-10-18): seller-API notes.
  - [crisstianl/priceaware](https://github.com/crisstianl/priceaware) (★1, 2020): "Price aggregator website for most common online stores in Romania, like Emag, Altex, Evomag and Pcgarage".
  - [marinoffDev/emag-price-scraper](https://github.com/marinoffDev/emag-price-scraper) (★3, 2023): Puppeteer + MongoDB.
  - [Tedyst/Scraper](https://github.com/Tedyst/Scraper) (★5, 2019).
  - [andiraduta/istoric-preturi-ebooks](https://github.com/andiraduta/istoric-preturi-ebooks) (2022): "Scraping-ul este realizat prin intermediul Github Actions, o data pe zi" for Nemira and Libris ebooks, saved as daily CSVs.
  - [roby-rodriguez/emag-score](https://github.com/roby-rodriguez/emag-score) (2016, "product pricing history on emag.ro") and its [Chrome extension](https://github.com/roby-rodriguez/emag-score-chrome-extension) (★2, 2017).
  - [chawel/python-emag](https://github.com/chawel/python-emag) (★7, 2018): Marketplace API client.
  - [MihaiCraciun88/eMag-API-Test-Tool](https://github.com/MihaiCraciun88/eMag-API-Test-Tool) (★3, pushed 2026-04-22).
- npm registry search ("emag", "emag.ro", "altex", "flanco", 2026-10-27):
  - `n8n-nodes-emag` 0.1.0 (2026-06-16), "n8n community node for tracking eMAG product prices". Its package source parses with cheerio and sends a Windows Chrome UA.
  - `@enso-ui/emag` (seller-side integration).
  - `@altex.ai/sdk` (unrelated).
  - "flanco" returned 0 results.
  - Sources: [npm search](https://registry.npmjs.org/-/v1/search?text=emag&size=25), [n8n-nodes-emag](https://www.npmjs.com/package/n8n-nodes-emag).
- PyPI:
  - The search page (`pypi.org/search/?q=emag`) served a Fastly "Client Challenge" to curl; I did not try to get past it.
  - The JSON API showed no packages named emag, python-emag, emag-api, emag-marketplace, pyemag, emag-scraper, emag-sdk or romanian-shops.
  - The `altex` package is an unrelated Altair charting wrapper — [pypi.org/project/altex](https://pypi.org/project/altex/).

### Inferences
- **eMAG is scraped widely at hobby scale with plain HTTP**, consistent with our probe (eMAG served our honest UA). This says nothing about tolerance at 4M+ products a day (section 7), and clause 4.2(j) still applies.
- **The internal endpoints these repos expose** (`sapi.emag.ro/…`, `www.emag.ro/search-by-url`, `fenrir.altex.ro/catalog/…`) would be far cheaper per price than HTML. They are exactly the "servere sau servicii … care nu sunt publice" that eMAG's 4.2(k) forbids, and they are undocumented, unstable and unlicensed. Exclude them from Pretoscop's design unless a retailer licenses API access.
- **The PC Garage, Flanco and Altex workarounds** (stealth browsers, TLS impersonation, scraping-proxy APIs) are circumvention. They are incompatible with Pretoscop's no-evasion policy and with the Criminal Code art. 360 risk flagged in legal_and_regulatory.md.
- **No reusable library exists.** Pretoscop should build its own extractors: JSON-LD first, then per-site selectors, with selector-drift alerts (bf-price-monitor's "SCRAPER BREAKDOWN"/dead-man design is a useful pattern).

### Gaps
- Repo licences, code quality and whether the scrapers still work today were not checked.
- No repo documents eMAG's rate-limit thresholds.
- GitHub code search (which needs authentication) was not run, so endpoint usage in unlisted repos is unknown.
- PyPI keyword search was blocked by the Fastly challenge, so a full PyPI survey is incomplete.

## 5. Datacenter-IP blocking evidence and Romanian hosting / static-IP options

### Takeaway
I found no public forum, Reddit or GitHub-issue report naming eMAG, Altex or Flanco as blocking Hetzner, OVH or DigitalOcean IPs. The strongest evidence is a 2026 GitHub project that monitors eMAG, Flanco and PC Garage from a self-hosted home runner "because GitHub's shared IP range gets blocked by these sites' bot detection". Romanian-located VPSs are cheap: about $3–6 a month in aggregator listings, and $5.94 a month at ishosting's Bucharest site (M247 data centres). Hetzner has no Romanian location. A Digi business line with a fixed IP was advertised at 53 lei a month in 2024. A dedicated Romanian IP is practical, but by the vendors' own documentation, verifiable identity (dedicated IPs plus rDNS or Web Bot Auth) matters more than geography.

### Cited Findings
- **bf-price-monitor** (Python, pushed 2026-10-27): "`.github/workflows/monitor.yml` runs on a Windows machine registered as a self-hosted runner, not GitHub's shared runners — this was a deliberate choice, because GitHub's shared IP range gets blocked by these sites' bot detection" — [README](https://github.com/NaviAndrei/bf-price-monitor).
- The same README says Altex "is fronted by Akamai and stalls the TLS handshake for a plain `requests` client", and that `curl_cffi` with `impersonate="chrome120"` (tested 2026-09-07) "does clear that stall". It also says PC Garage needs Playwright because the "Cloudflare JS challenge blocks plain `requests`" — [README](https://github.com/NaviAndrei/bf-price-monitor).
- **Earlier probe** (London, AS5631, honest UA, 2026-10-27):
  - eMAG served 200 via CloudFront.
  - Altex/Media Galaxy reset HTTP/2 streams at the connection level.
  - Flanco served `cf-mitigated: challenge` on non-cached pages.
  - CCBot, which runs on dedicated IP ranges with reverse DNS, received mostly 200s from Akamai shops.
  - Sources: scraping_feasibility_recon.md; [CCBot](https://commoncrawl.org/ccbot).
- **DataDome's ASN-based bot authentication** rejects "a common host AS (AWS, GCP, Hetzner)" — [DataDome](https://docs.datadome.co/docs/bot-authentication).
- **Hetzner Cloud locations:** Falkenstein (fsn1), Nuremberg (nbg1), Helsinki (hel1), Ashburn (ash), Hillsboro (hil) and Singapore (sin). Dedicated servers are only in Nuremberg, Falkenstein and Helsinki. There is no Romanian location — [Hetzner docs](https://docs.hetzner.com/cloud/general/locations/).
- **ishosting VPS Romania**, "Bucharest, M247 DC1&DC2" (USD per month; IPv4 "Optional"):
  - Lite: 1 GB RAM / 20 GB NVMe / 2 TB, $5.94.
  - Start: 2 vCPU / 2 GB / 30 GB, $10.19.
  - Medium: 3 vCPU / 4 GB / 40 GB unmetered, $21.24.
  - The page does not say whether the IPs geolocate to Romania — [ishosting](https://ishosting.com/en/vps/ro).
- **Aggregator listings** (ServerHunter; search summary; "in stock since 25 June 2025", so prices may be stale):
  - LumaDock KVM, 1 vCPU / 4 GB / 50 GB NVMe, $3.29 a month, with dedicated IPv4.
  - LifeinCloud KVM in Bucharest, 3 vCPU / 6 GB / 70 GB NVMe, $5.59 a month, with IPv4 and IPv6.
  - Sources: [LumaDock listing](https://www.serverhunter.com/offer/lumadock-kvm-vps-4-ro/), [LifeinCloud listing](https://www.serverhunter.com/offer/lifeincloud-kvm-vps-3vcpu-6gb-ram-70gb-ssd-nvme-unmetered-bw-bucharest-romania/).
- **Zooku.ro** "Balanced" plan: 2 vCPU / 4 GB / 120 GB with a dedicated IP, €12.56 a month (search summary; my fetch returned 403) — [zooku.ro](https://www.zooku.ro/en/hosting/vps/vps.storage).
- **Voxility** sells 10U colocation in Bucharest, but the listed price figure in the summary was implausible and is not used (search summary) — [Voxility](https://www.voxility.com/colocation/prices/10U+Colocation+in+Voxility+IRD+Bucharest).
- **Hostico** (Awesome Projects SRL, active since 2010) sells Cloud VPS; I retrieved no prices (search summary) — [websiteplanet](https://www.websiteplanet.com/web-hosting/hostico).
- **Distinct** (evoMAG's host, Distinct New Media) offers dedicated and virtual servers and colocation from "datacenter-ul nostru"; no prices are listed — [distinct.ro](https://www.distinct.ro/).
- **Digi (RCS&RDS):**
  - "Digi-Start B2B": "53 de lei pe lună", which includes "internet fix ultrarapid și stabil pe fibră optică, cu adresă IP fixă" (article dated 14.08.2024) — [playtech.ro](https://playtech.ro/2024/digi-rcs-rds-romania-lanseaza-noi-abonamente-pentru-afaceri-cat-scoti-din-buzunar-ce-beneficii-incluse-ai/).
  - From 27 May (2026), Digi prices are expressed in euro and billed in lei at the BNR rate (search summary) — [profit.ro](https://profit.ro/povesti-cu-profit/it-c/anunt-digi-schimba-facturile-preturile-vor-fi-exprimate-in-euro-si-facturate-in-lei-la-cursul-bnr-miscare-anuntata-in-premiera-de-profit-ro-mesaj-catre-clienti-22457753).
  - A non-official guide says static IPs are offered "almost exclusively" to business clients (search summary) — [infocontact.ro](https://www.infocontact.ro/cum-obtii-un-ip-fix-de-la-digi/).
- **Generic scraping-vendor content** says anti-bot systems give datacenter ranges lower trust (search summary; marketing sources, low weight) — [ScrapeHero](https://www.scrapehero.com/?p=54679), [scrape.do](https://scrape.do/blog/block-web-scraping.md).

### Inferences
- **Avoid shared-egress platforms** (GitHub Actions, serverless functions, shared cloud NAT). Their IP ranges are reputation-poisoned by other users, which bf-price-monitor's experience and evoMAG's network-level filter (section 6) both illustrate. Run the crawler from 1–3 **dedicated** IPv4s that Pretoscop alone uses, with PTR records (`crawl-N.bot.pretoscop.ro`) and forward DNS, published in `ips.json`. This satisfies Cloudflare's "used solely by the bot owner" rule and gives retailers something to allowlist.
- **Location trade-off.** A Romanian VPS (e.g. Bucharest at ishosting/M247, LumaDock, LifeinCloud) costs about $3–10 a month and may help with geo-filters (CEL.ro timed out from the UK) and with hosting-level filters like Distinct's. An EU host such as Hetzner is fine for Cloudflare and Akamai verification, which depends on proof of identity, not country. Use DataDome's IP-list or Web Bot Auth method, since its ASN method excludes Hetzner.
- **A Digi business fibre line with a fixed IP** (about 53 lei a month in 2024) is a cheap way to get a Romanian ISP address for low-volume crawling from an office. Expect limits: PTR control is often unavailable (so the rDNS method may not work; use the IP list plus Web Bot Auth), the line has a single IP, office uptime, and the ISP's terms on server use need checking. A Romanian VPS or colocated server is the more robust choice.
- **Do not buy residential or mobile proxies** to "look Romanian". That defeats allowlisting and is evasion (see scraping_feasibility_recon.md §5 and the legal notes).

### Gaps
- I ran no direct test from Hetzner, OVH, DigitalOcean or a Romanian IP, and found no Reddit or forum report on eMAG, Altex or Flanco blocking specific ASNs.
- Not checked: whether Bucharest VPS IPs geolocate to Romania in commercial GeoIP databases; whether providers let customers set PTR records; and IP reputation of M247 ranges, which I did not verify this session.
- No current 2026 price for Digi's fixed-IP business offer; no prices from Hostico, Zitec, GTS Telecom or NetSystems.

## 6. evoMAG's CAPTCHA vendor, and whether evoMAG's 2Performant feeds make crawling unnecessary

### Takeaway
evoMAG's CAPTCHA is not a commercial bot-management product. It is the **"DISTINCT TRAFFIC FILTER"** of evoMAG's Romanian hosting provider, Distinct New Media, served from `captcha.distinct.ro`. It combines a SHA-256 proof-of-work browser check with Google reCAPTCHA, says it unblocks automatically "în următoarele zile", and gives **captcha@distinct.ro** as the unblock channel. evoMAG's 2Performant program advertises 15+ product feeds, which 2P pulls 3–4 times a day, and the program page sets no comparator ban. Feed-first ingestion is therefore both feasible and the only compliant route for evoMAG while the filter blocks us, subject to written confirmation and a check of the feed fields.

### Cited Findings
- **Redirect chain** (earlier probe, files read from the scratchpad, not re-probed; 2026-10-27 14:49:33–48Z):
  - `https://www.evomag.ro/robots.txt` returned `302` with `location: http://captcha.distinct.ro/?original_url=aHR0cHM6Ly93d3cuZXZvbWFnLnJvL3JvYm90cy50eHQ=&hint=hash` (the base64 decodes to the robots.txt URL), served by openresty.
  - That returned `301` to the https URL, with header `X-WS: captcha-240`.
  - The final page returned `200` from 185.251.29.240, setting `PHPSESSID` and a `url` cookie.
  - `/sitemap.xml` on the captcha host returned "Can't extract original url".
  - evoMAG resolves to 93.113.199.183/.184, with PTR `93-113-199-184.distinctgroup.net`.
  - Source: [probe URL](https://www.evomag.ro/robots.txt).
- **Captcha page contents** (same saved files):
  - Title "Distinct Captcha"; heading "DISTINCT TRAFFIC FILTER"; status text "Verificăm browser-ul…" (checking your browser).
  - Hidden fields `pow-challenge` (64-hex) and `pow-difficulty` = 5. The JS solver finds a nonce whose SHA-256(challenge+nonce) starts with five zeros ("difficulty 5 typically takes ~1M iterations"), then POSTs to `/check.php`. The page also loads `https://www.google.com/recaptcha/api.js?hl=ro` as a fallback.
  - FAQ, "De ce văd asta?" (Why am I seeing this?): "Sistemul de protecție de la Distinct a detectat trafic anormal de la rețeaua dumneavoastră și are nevoie să se asigure că sunteți un utilizator obișnuit." (Distinct's protection system detected abnormal traffic from your network and needs to make sure you are a regular user.)
  - FAQ, "Cum ajung să fiu deblocat?" (How do I get unblocked?): "Sistemul vă va debloca automat în următoarele zile. Dacă e urgent puteți trimite un email la captcha@distinct.ro cu adresa dumneavoastră IP și motivul pentru care aveți nevoie să fiți deblocați." (The system will unblock you automatically in the coming days. If urgent, email captcha@distinct.ro with your IP address and the reason.)
  - Footer: "© 2026 Distinct New Media".
- **Distinct** is a Romanian hosting company offering dedicated and virtual servers, colocation and SaaS, with "over 300 servers under its management". There is no public product page for the Traffic Filter — [distinct.ro](https://www.distinct.ro/).
- **evoMAG on 2Performant** (from affiliate_networks_and_feeds.md):
  - "Avem peste 15 feed-uri de produse" (we have over 15 product feeds).
  - 1.5% standard commission, 10-day cookie, terms 1.10–31.10.2026.
  - No comparator, PPC or cashback rules on the 2P page.
  - Old Profitshare terms allowed Google Shopping only with prior written consent.
  - Source: [2Performant – evomag.ro](https://2performant.com/affiliate-programs/electronics/evomag-ro/).
- **2P feed spec:** feeds are added by URL and accessed "de 3-4 ori pe zi" (3–4 times a day). 2P's documentation says marketers may use products "în comparatoare de prețuri" (in price comparators) — [2P support – feed spec](https://support.2performant.com/hc/en-us/articles/224718548-Care-sunt-specificatiile-feed-ului-de-produse-si-cum-il-incarc-in-platforma-).

### Inferences
- **Do not solve the challenge.** Proof-of-work plus reCAPTCHA is a deliberate human-verification gate. Solving it programmatically (running the PoW, or using CAPTCHA services) would be circumvention.
- **The block is network reputation, not our behaviour.** It fired on the very first request (robots.txt), and the text speaks of "trafic anormal de la rețeaua dumneavoastră". That points to a filter on the London egress network's reputation. Dedicated, clean Romanian or EU IPs might not be filtered, but the honest route is to email captcha@distinct.ro and evoMAG with PretoscopBot's IPs, UA and bot page. Because the filter sits at the hosting layer, Distinct may also protect other Romanian shops it hosts; this is not verified.
- **Feeds look sufficient for evoMAG's daily price history.** 15+ feeds pulled 3–4 times a day by 2P implies the source is refreshed at least daily (inference). Prerequisites: an approved 2P affiliate account; written confirmation that comparator and price-history use is allowed (the 2P page is silent, unlike Fashion Days, which bans "istoric preturi"); and a check that feeds carry price, old price, availability, EAN/MPN and a product URL. Crawling evoMAG would then only be needed for spot-verifying displayed prices, and only after allowlisting.
- **Feeds do not supply the Omnibus "lowest price in 30 days".** Pretoscop must build its own history from feed snapshots.

### Gaps
- I did not inspect evoMAG's feed field list or refresh time (that needs a 2P affiliate login).
- No written evoMAG position on comparator or price-history use.
- Unknown whether Distinct's filter passes clean Romanian datacenter IPs, Distinct's policy on allowlisting declared bots, and which other shops sit behind it.

## 7. eMAG sitemap sizing (two offer sub-sitemaps sampled)

### Takeaway
eMAG's "offers-available" sitemaps hold exactly **5,000 product URLs per file**. Both the first file (0) and the last (842) were full and shared no URLs, so the **841 files imply about 4.2M available product URLs**. That replaces the earlier 8.4M–42M bound. Every URL has a `<lastmod>`, but all equal the generation date (2026-10-27), so lastmod is no use as a change signal. The responses are `no-store` with no ETag or Last-Modified, so a full pass re-downloads about 5.5 GB uncompressed (0.5–0.9 GB gzipped) in 841 requests.

### Cited Findings
- **Index** `offers-available-index.xml` (earlier probe, 14:59:08Z, 118,033 B): 841 `<sitemap>` entries numbered 0–842, with **110 and 464 missing**; every index-level `<lastmod>` is 2026-10-27 — [index](https://www.emag.ro/sitemaps/offers-available-index.xml).
- **File 0** (fetched 15:30:22Z): 5,000 `<url>`, 5,000 `<loc>` (all `/pd/<id>/` product pages), 5,000 `<lastmod>` (all 2026-10-27), 5,000 `<changefreq>weekly` and 5,000 `<priority>1.0`. It has 16,598 `<image:image>` entries (3.3 per URL), each with `image:loc` on `s13emagst.akamaized.net` and an `image:caption` holding the product title. No hreflang. 1,120,967 B transferred (gzip), 6,790,573 B uncompressed. The first URL is `https://www.emag.ro/toner-hp-negru-c8543x/pd/EH5MBBBBM/` — [file 0](https://www.emag.ro/sitemaps/offers-available-0.xml).
- **File 842** (fetched 15:30:28Z): 5,000 `<url>`, all with lastmod 2026-10-27, and 14,680 `<image:image>` (2.9 per URL). 570,292 B transferred, 6,422,454 B uncompressed. The first URL is `https://www.emag.ro/saboti-barbati-crocs-spuma-navy-46-47-65332-12f2997/pd/DYKRLRMBM/` — [file 842](https://www.emag.ro/sitemaps/offers-available-842.xml).
- **No overlap:** the two files share 0 URLs (5,000 unique each).
- **Response headers:** `content-type: application/xml`, `content-encoding: gzip`, `cache-control: no-cache, no-store, must-revalidate, max-age=0`, `vary: User-Agent`, `x-cache: Miss from cloudfront`, with no ETag or Last-Modified — [file 0](https://www.emag.ro/sitemaps/offers-available-0.xml).
- **Delta indexes** declared in robots.txt but not fetched: `offers-latest-index.xml` (new offers) and `offers-unavailable-index.xml` — [robots.txt](https://www.emag.ro/robots.txt).

### Inferences
- **Size estimate:** 841 × 5,000 = **4,205,000** available product URLs. Strictly that is an upper bound, but both ends of the range were full, so a 5,000-row cap is likely and the true number is probably close.
  - These are product pages, and each `/pd/` page can carry several marketplace offers, so offers exceed 4.2M.
  - The new figure is about half the earlier lower bound (8.4M), which assumed at least 10k URLs per file.
- **A full sitemap sweep** is 841 requests: about 70 minutes at 1 request per 5 s, and 0.5–0.9 GB compressed. That is affordable daily for discovery and delisting: diff today's URL set against yesterday's, then use the `offers-latest` and `offers-unavailable` indexes for faster deltas. Since lastmod is constant, it cannot drive refresh priority.
- **Price-refresh arithmetic:**
  - Product pages: 4.2M at 1 request per 3 s is about 146 days for one pass, so that is not viable.
  - Listing pages (24–71 prices per request, per scraping_feasibility_recon.md): about 59k–175k requests per full pass, or roughly 2–10 days at 1 request per 3–5 s.
  - Daily coverage therefore has to be selective (hot products and promotions), or come via a licensed feed. That matters doubly because clause 4.2(j) forbids extraction anyway.
- **Copying titles from the sitemaps falls under T&C 6.2.** `image:caption` titles would be a convenient discovery and matching corpus (no EAN in the sitemap), but reuse needs care.

### Gaps
- No middle files were sampled, so the 5,000-row cap is inferred from the first and last files only.
- The `offers-latest` and `offers-unavailable` indexes were not sized.
- Unknown whether eMAG ever shrinks or splits files, and how sitemap URLs relate to variant pages.

## 8. Appendix — request log for retailer requests made in this session (2026-10-27, UTC)

### Takeaway
I made 5 requests to retailer domains: eMAG 3, Altex 1, Flanco 1. Same-domain requests were at least 6 s apart, and I made no retry after any block. eMAG exceeded the 2-per-domain guideline by one, because Q3 (terms) and Q7 (two sitemaps) explicitly required those fetches. To stay close to the cap I did not re-fetch eMAG's robots.txt and quoted the 14:49:33Z copy instead. The Altex request went through the WebFetch tool, which sends its own user-agent rather than the PretoscopResearch UA. evoMAG was not contacted.

### Cited Findings
| # | UTC time | Domain | URL | Client / UA | Result | Bytes | Spacing |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-27T15:30:22Z | emag.ro | https://www.emag.ro/sitemaps/offers-available-0.xml | curl, `Mozilla/5.0 (compatible; PretoscopResearch/0.1; +mailto:rotariu.daniel.paul@gmail.com)` | 200 `application/xml`, gzip, CloudFront 3.173.36.122, 0.78 s | 1,120,967 transferred / 6,790,573 decoded | 27 min after the earlier probe's last eMAG request (15:03:00Z) |
| 2 | 2026-10-27T15:30:28Z | emag.ro | https://www.emag.ro/sitemaps/offers-available-842.xml | curl, same UA | 200 `application/xml`, 0.49 s | 570,292 / 6,422,454 | +6 s |
| 3 | 2026-10-27T15:30:35Z | emag.ro | https://www.emag.ro/help/termeni-si-conditii/ | curl, same UA | 200 `text/html`; `cache-control: public, max-age=900`; `last-modified: Fri, 23 Oct 2026 12:45:35 GMT` | 48,962 / 170,221 | +7 s |
| 4 | ≈2026-10-27T15:40–15:45Z (the tool does not log exact times) | altex.ro | https://altex.ro/termeni-si-conditii/ | WebFetch tool (Anthropic fetcher; UA not set by me) | **Timeout after 60 s**, no response | 0 | First Altex request this session (the earlier probe made 2 at 14:49Z, both HTTP/2 resets) |
| 5 | 2026-10-27T15:47:35Z | flanco.ro | https://www.flanco.ro/termene-si-conditii | curl, PretoscopResearch UA | **403**, `cf-mitigated: challenge`, "Just a moment…", `cf-ray: a512d7153c826406-LHR`, Cloudflare 104.20.19.233 | 3,291 | First Flanco request this session (the earlier probe made 2 at 14:49Z); stopped after this |

- Raw headers and bodies are saved in the scratchpad: `…/scratchpad/dl_gaps_emag/` and `…/scratchpad/dl_gaps_flanco/`. The machine-readable log is `…/scratchpad/gaps_requests_log.jsonl`. The parent scratchpad directory is `/private/tmp/claude-501/-Users-rotariudanielpaul-Documents-CodingBusiness-Pretoscop/99deaed1-462b-4d3a-b452-53223b56dce1/scratchpad/`.
- **Read from saved files, no new requests:** evoMAG's robots.txt, captcha and sitemap responses (14:49:33–48Z); eMAG's robots.txt (14:49:33Z), offers index (14:59:08Z) and product page (15:03:00Z).
- **Non-retailer requests:**
  - GitHub REST search: 9 calls (8 returned 200; the ninth returned 403 for the rate limit).
  - codeload.github.com: 16 source archives; raw.githubusercontent.com: 1 (crawler-user-agents JSON).
  - npm registry: 6 searches and 1 tarball.
  - PyPI: 2 search pages (Fastly client challenge, not bypassed) and 9 JSON-API lookups.
  - iab.com: 1 page.
  - web.archive.org CDX: about 7 calls (returned 200, 503 "Temporarily Offline" and 504).
  - archive.org availability API: 8 calls (6 empty, 2 returned 429).
  - docs.klarna.com: 2 status checks (308, then 404).
  - Vendor documentation via WebFetch: Cloudflare, Akamai, DataDome, HUMAN, Fastly, Google, PayPal, IETF, Hetzner, ishosting, Distinct and playtech.ro.

### Inferences
- The retailer footprint of this session is negligible: 3 eMAG requests about 6–7 s apart, and one request each to Altex and Flanco. Both of those were blocked or timed out, and neither was retried.

### Gaps
- The exact timestamp of the Altex WebFetch was not logged, and that tool does not let me set the user-agent.
