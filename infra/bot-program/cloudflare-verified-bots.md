# Dossier: Cloudflare Verified Bots (BotBase) — setup C2

**Why**: Flanco, PC Garage, Vexio, iStyle, Notino, Dr.Max, Noriel, Cărturești and Decathlon sit behind
Cloudflare. Verification turns PretoscopBot from "unknown bot" into a known **Data Collection** bot; each
shop then decides (a shop can block a whole category). Precedent: the Romanian one-person PretAlertBot is
verified with Web Bot Auth at 8–12 s per shop. Evidence: research note §1, `docs/12` layer 2.

## Before submitting (all must be true)

- [ ] `/bot` is live on https://pretoscop.ro/bot with the operator's legal name, CUI, address and the
      contact `bot@pretoscop.ro` (answered within one business day).
- [ ] Either the key directory is live and `bot:check` says `OK … signed by <keyid>` (preferred), or the
      fixed IPs are published in `/bot/ips.json` with forward-confirmed reverse DNS (A4).
- [ ] robots.txt, Crawl-delay and the 5 s spacing are obeyed (they are, by code) and the request log shows
      it (admin → Rulări).
- [ ] The UA is not generic (it is not: `PretoscopBot/1.0`).

## Where

Cloudflare dashboard, any account (a free one is expected to work; check when signing in — the BotBase
*directory view* is Enterprise-only, the *form* is not): **Manage Account → Configurations → Bot Submission
Form**, or `dash.cloudflare.com/?to=/:account/application-security/botbase/form`.

## What to enter

| Field | Value |
|---|---|
| Bot name | PretoscopBot |
| Operator | <legal name>, CUI <…>, <address>, Romania |
| Website / documentation | https://pretoscop.ro/bot |
| Contact | bot@pretoscop.ro |
| User-Agent | `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`; feed fetcher `Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)` |
| Category | **Data Collection** ("price scraping, competitive intelligence gathering, and third-party analytics"). Do not choose Search or Aggregator: Cloudflare reassigns or removes bots whose documentation and behaviour differ. |
| Direct / Intermediary | Direct (our own crawler, no user in the loop) |
| Verification method | **Request Signature** (Web Bot Auth); key directory `https://pretoscop.ro/.well-known/http-message-signatures-directory`. Fallback: IP list `https://pretoscop.ro/bot/ips.json` + reverse DNS suffix `bot.pretoscop.ro`. |
| Robots.txt | Obeys the `PretoscopBot` group (else `*`), Allow/Disallow and Crawl-delay; no crawling when robots.txt is unreachable |
| Request rate | At most one request every 5 s per site, one connection; daily page budget per shop; bulk collection 02:00–07:00 Bucharest |
| Purpose (free text) | "Price comparison for Romanian online shops. PretoscopBot reads publicly displayed prices, stock and delivery costs of product, category and sitemap pages, so pretoscop.ro can rank offers by total price and show price history. It never logs in, never uses carts, internal search or internal APIs, and stops on 403, 429 or any challenge. Shops can opt out by robots.txt or email, or send a product feed instead." |

## After submitting

- Statuses: Waiting For Review → Accepted / Rejected / Cancelled. The dashboard does not show the
  rejection reason; ask on the Cloudflare community forum, fix, resubmit. 2022 guidance: "a few weeks".
- On acceptance: update `BOT_PROGRAMS` (`cloudflare` → `acceptat`) and add a changelog entry; tell the
  Cloudflare shops in `/admin/contactari` (template `antibot-rule-v1`).
- Keep it: the IPs stay ours only, the page stays true, Crawl-delay is always obeyed.
