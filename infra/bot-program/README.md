# Bot legitimacy programme (M21)

How PretoscopBot proves who it is, and how the founders get it recognised by the anti-bot services and
the shops that use them. Strategy and evidence: `docs/12-blocked-shops-strategy.md` (layer 1 and 2) and
`docs/research/notes/gaps_bot_legitimacy_and_precedents.md` §1–2. Nothing here evades detection: every
step makes the crawler easier to identify, never harder.

## What is built (code)

| Piece | Where | State |
|---|---|---|
| Identity: `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)` and `PretoscopBot-Feed/1.0` | `packages/fetch/src/identity.ts` | live since M02 |
| Bot page with purpose, UAs, rules, IPs, reverse DNS, Web Bot Auth, anti-bot services, changelog | `apps/web/src/app/(site)/bot/page.tsx`, `apps/web/src/lib/bot-policy.ts` | live; IP list empty until A4 |
| `/bot/ips.json` (googlebot.json `prefixes` format plus the M17 fields) | `apps/web/src/app/bot/ips.json/route.ts` | from `BOT_EGRESS_IPS` |
| Web Bot Auth request signing (RFC 9421, Ed25519; draft-ietf-webbotauth-httpsig-protocol-00) | `packages/fetch/src/signing.ts`, hook in `fetcher.ts` | off (`WEB_BOT_AUTH=false`) |
| Key directory `/.well-known/http-message-signatures-directory` (Content-Digest + possession proof) | `apps/web/src/app/.well-known/…/route.ts` | 404 until `WEB_BOT_AUTH_PRIVATE_KEY` is set |
| Identity self-check (FCrDNS, ips.json, directory signature) | `pnpm --filter @pretoscop/worker bot:check` | ready |
| Re-probe from a vantage point (≤ 3 polite requests, 5 s apart, audited) | `pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "…"` | off (flag `shops.probe.enabled`; needs `CRAWL_ENABLED`) |
| Outreach tracker (business channels only; audited; erasable) and the assisted-access exit table | `/admin/contactari` (table `outreach`) | ready |
| Weekly extractor canary | worker job `extractors.canary`, flag `extractors.canary.enabled` | off |

## Order of operations (founders)

1. **A4 — fixed egress IPs.** Order the extra IPv4 (and the IPv6 /64) used only by the crawler; set the
   PTR records and the forward records as in [reverse-dns.md](reverse-dns.md). Put the addresses in
   `BOT_EGRESS_IPS` (web and worker), add a changelog entry in `apps/web/src/lib/bot-policy.ts`, deploy,
   then run `bot:check` until every line is `OK`.
2. **Web Bot Auth key.** Generate it, put it in the environment of the web app and the worker, check the
   directory, then turn signing on: [web-bot-auth.md](web-bot-auth.md).
3. **C2 — applications** (one afternoon, after 1 and 2): [Cloudflare](cloudflare-verified-bots.md),
   [Akamai](akamai-bot-directory.md), [DataDome](datadome.md), [Fastly](fastly.md). The IAB/ABC Spiders &
   Bots list is skipped (USD 5–15k a year). Record each submission date and answer in the table below and
   in `BOT_PROGRAMS` (`bot-policy.ts`, shown on `/bot`), with a changelog entry when a status changes.
4. **C3 — retailer outreach.** Use [outreach-templates.md](outreach-templates.md); log every message in
   `/admin/contactari`. A verified bot is still only a *known* bot: each shop decides whether to let it in.
5. **Re-probe before calling a shop blocked**: switch `shops.probe.enabled` on in `/admin/flaguri`, run
   `shops:probe <slug> --vantage "…"` from the production IP and from a Romanian IP (with `DATABASE_URL` pointing at
   production, so pauses are shared), `--write` to record both outcomes in `packages/config/shops/<slug>.yaml`,
   then switch the flag off again. Shops that asked us to stop or said no (paused or removed, every source
   kill-switched, latest outreach declined) and feed-only shops are refused. Once `BOT_EGRESS_IPS` is
   published, probe only from one of those addresses (the bot page says other addresses are not ours) and
   confirm it with `--from-published-ip`.

## Application status (update by hand)

| Programme | Submitted | Method | Answer | Next step |
|---|---|---|---|---|
| Cloudflare Verified Bots (BotBase form) | — | Request Signature (Web Bot Auth), IP list as fallback | — | after A4 + key |
| Akamai bot / agent registration | — | User-Agent + public key | — | after the key |
| DataDome bot verification | — | Web Bot Auth form; static IP list + two-way rDNS | — | after A4 + key |
| Fastly verified bots (community form) | — | description + IPs | — | after A4 |

## Things that must stay true (or the verifications are withdrawn)

- The published IPs are used **only** by PretoscopBot (never by the web app, mail, backups, CI or a
  founder's browser). A new egress IP is published *before* traffic leaves from it.
- The bot page matches observed behaviour: 5 s per host, one connection, robots.txt and Crawl-delay obeyed,
  stop on 403/429/challenge. Cloudflare removes bots whose documentation and behaviour differ.
- The User-Agent never changes without a changelog entry; generic UAs are never used.
- The private key never leaves the server environment; a leaked key is rotated the same day
  ([web-bot-auth.md](web-bot-auth.md#rotation)).
- The assisted channel (M05B) is a separate, vendor-operated channel: it is **not** PretoscopBot and is
  never described as such on `/bot` or in any application.
