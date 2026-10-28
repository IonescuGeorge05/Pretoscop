# Dossier: DataDome bot verification — setup C2

**Why**: DataDome (Leroy Merlin's vendor, among others) blocks unauthenticated bots by default
("Threat Detection"). An authenticated bot gets a category the shop can allow — then **each DataDome shop
must still allow it** (for a comparator, the "Comparators" or "E-commerce & Price Scrapers" category, or a
custom exception). DataDome documents five authentication methods; we can offer three.

## Methods we can offer

| DataDome method | Ours |
|---|---|
| Web Bot Auth (RFC 9421), separate form | yes — key directory `https://pretoscop.ro/.well-known/http-message-signatures-directory` |
| Two-way RDNS/DNS | yes after A4 — suffix `bot.pretoscop.ro` |
| Static IP list | yes after A4 — `BOT_EGRESS_IPS`, published in `/bot/ips.json` |
| Dynamic IP file (CSV/JSON/plaintext) | `https://pretoscop.ro/bot/ips.json` (JSON) |
| Private AS | no (Hetzner is a hosting AS, which DataDome excludes for this method only) |

Requirement on every method: a dedicated User-Agent — ours is
`Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`.

## Where

- Bot verification form: https://datadome.co/resources/bot-and-ai-agent-verification/
- Web Bot Auth / AI agent verification form: https://datadome.co/resources/ai-agent-verification/
- Docs: https://docs.datadome.co/docs/bot-authentication

(Both forms answered 403 to our research fetcher; open them in a normal browser.) Submit the Web Bot Auth
form first, the IP/rDNS form as well once A4 is done.

## What to enter

Name PretoscopBot; company <legal name>, CUI, Romania; website and documentation https://pretoscop.ro/bot;
contact bot@pretoscop.ro; purpose: price comparison of Romanian online shops (public pages only, ≤ 1
request / 5 s / site, robots.txt obeyed, stops on 403/429/challenge); suggested category: comparator /
price comparison (DataDome lists Prisync, Price2Spy and Competera under "E-commerce & Price Scrapers").

## After

Record the answer here and in `BOT_PROGRAMS` (`datadome`). For each DataDome shop (Leroy Merlin first), send
template `antibot-rule-v1` asking to allow the category or add an exception; log it in `/admin/contactari`.
Unknowns: the form fields, the timeline and the default action for the price-scraper category.
