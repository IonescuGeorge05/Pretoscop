# Dossier: Fastly verified bots — setup C2

**Why**: Hornbach, Dedeman and Leroy Merlin are on Fastly. Fastly's Next-Gen WAF has a "Verified Bots"
signal that validates self-identified bots; bots enter its categories through a community submission.

## Where

The submission form linked from https://community.fastly.com/t/about-the-verified-bots-category/2864
(docs: https://docs.fastly.com/products/bot-management). Fastly asks for a **business email address**
(use `bot@pretoscop.ro` or a founder's `@pretoscop.ro` address, not a personal mailbox). "Submissions will
be reviewed by Fastly and considered for inclusion in the product." No timeline.

## What to enter

| Field | Value |
|---|---|
| Bot | PretoscopBot, https://pretoscop.ro/bot |
| User-Agent | `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)` (and `PretoscopBot-Feed/1.0`) |
| Verification | IP list `https://pretoscop.ro/bot/ips.json`; reverse DNS `crawl-N.bot.pretoscop.ro` (forward-confirmed); Web Bot Auth key directory `https://pretoscop.ro/.well-known/http-message-signatures-directory` (ask whether Fastly verifies signatures — open item B8) |
| Category suggestion | price comparison / data collection |
| Behaviour | ≤ 1 request / 5 s / site, one connection, robots.txt and Crawl-delay obeyed, stop on 403/429/challenge |
| Operator and contact | <legal name>, CUI, Romania; bot@pretoscop.ro |

## After

Record the answer here and in `BOT_PROGRAMS` (`fastly`). Fastly shops can also allow us with a rule on our
IPs + User-Agent today (template `antibot-rule-v1`). Unknowns: whether Fastly checks Web Bot Auth, its
category list and timeline (docs/13 B8).
