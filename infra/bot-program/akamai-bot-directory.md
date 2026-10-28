# Dossier: Akamai bot and agent registration — setup C2

**Why**: shops on Akamai Bot Manager treat unidentified automation as untrusted by default. Akamai's edge
validates Web Bot Auth signatures (RFC 9421) against the signature directory and classifies the request
as validated-bot traffic; the shop then allows, delays, challenges or blocks the category. Akamai
customers can also define a custom bot category for partners (by IPs and User-Agent).

## Before submitting

- [ ] Key directory live and `bot:check` OK (the form asks for the public key).
- [ ] `/bot` live with operator details and contact.

## Where

https://www.akamai.com/lp/bot-agent-registration ("Verify your bot or AI agent"). No published eligibility
rules or timeline; the page addresses bots "for search, retrieval, analysis, or assistance" — present
PretoscopBot as price-comparison data collection (analysis), honestly.

## What to enter

| Field | Value |
|---|---|
| Agent / bot name | PretoscopBot |
| Company | <legal name>, CUI <…>, Romania; https://pretoscop.ro |
| User-Agent | `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)` (and the `-Feed` variant) |
| Public key | the JWK from the directory, `{"kty":"OKP","crv":"Ed25519","x":"…"}`; directory URL `https://pretoscop.ro/.well-known/http-message-signatures-directory`; keyid `<thumbprint>` |
| Purpose | Price comparison: public product/category/sitemap pages, ≤ 1 request / 5 s / site, robots.txt obeyed, stops on 403/429/challenge |
| IP addresses | `https://pretoscop.ro/bot/ips.json` (reverse DNS `crawl-N.bot.pretoscop.ro`) |
| Contact | bot@pretoscop.ro |

## For the shops (template `antibot-rule-v1`)

Ask the shop's Akamai administrator to allow the validated bot, or to add a custom bot category with our
IPs + User-Agent set to Allow (or Monitor). Log the request in `/admin/contactari`.

Unknowns (research gaps): Akamai's criteria, timeline and categories (techdocs behind a login). Record the
answer in `README.md` and in `BOT_PROGRAMS`.
