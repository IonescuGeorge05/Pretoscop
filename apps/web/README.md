# @pretoscop/web

Next.js 16 (App Router): public site, admin, API routes and click-out. Romanian UI.

- `pnpm --filter @pretoscop/web dev` → http://localhost:3000 (reads the repository-root `.env`).
- `pnpm --filter @pretoscop/web test` (Vitest), `e2e` (Playwright, mobile + desktop; needs `next build` first), `lhci` (Lighthouse CI).

## Design rules (M12)

- **Tokens** live in `src/app/globals.css` (`@theme`): teal brand scale (`brand-50…900`), ink/muted/line/surface
  neutrals, and verdict colours `good`, `usual`, `high` (+ `*-bg`). Green/amber/red mean price verdicts and nothing else.
- **Fonts**: system stack only (no web-font download; Romanian diacritics are native). This keeps mobile LCP under 2.5 s.
- **Strings**: `src/messages/ro.json` via `t(key)`; comma-below ș ț only (an e2e test fails on cedilla forms).
- **Formatting**: `src/lib/format.ts` — `formatLei(bani)` → `1.234,56 lei`, `formatLeiShort`, `formatLeiNumeric('3170.99')`,
  `formatDate` (`27 oct. 2026`), `formatDateTime` (`27 oct. 2026, 14:05`, Europe/Bucharest), `formatRelative`
  (`acum 3 ore`, `ieri`), `plural(n, 'magazin', 'magazine')` (`25 de magazine`). Money never goes through floats
  except for display.
- **Images**: `<ProductImage storageKey alt size>` shows our own licensed copy (`images/…` in the blob store; R2 via
  `NEXT_PUBLIC_MEDIA_BASE_URL` in production, `/media/…` in dev) or a neutral placeholder. Never a shop image (ADR-008).
- **Analytics**: `track(name, props)` (client) → `POST /api/events` → `events` table. No cookies, no raw IP: the
  session is sha256(daily rotating salt, IP, UA). Payloads over 4 KB → 413; invalid names → 400; 120 events/min per session.
- **Consent**: `ConsentBanner` with equal Accept/Reject (same style, same size), choice in localStorage
  (`pretoscop.consent`, versioned). Plausible (`NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` + `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`,
  inlined at build) loads only after Accept; nothing third-party loads before a choice (e2e network assertion).
  `useConsent()` exposes the choice.
- **Static vs dynamic**: pages prerendered at build read env at build time; use `NEXT_PUBLIC_*` for client values.
- **Security headers** in `next.config.ts` (nosniff, referrer policy, frame options, permissions policy). CSP is not set yet (M16/M18).
- **Accessibility**: jsx-a11y recommended rules are errors; skip link; landmarks; visible focus ring.

## Legal and trust pages (M17)

- **Pages**: `/despre`, `/cum-functioneaza`, `/cum-castigam-bani`, `/metodologie`, `/bot`, `/pentru-magazine`, `/termeni`,
  `/confidentialitate`, `/cookies`, `/accesibilitate` in `src/app/(site)/`; `/contact` in `src/app/(forms)/`, a route group
  that re-exports the site layout **without** `loading.tsx`: dynamic pages under a loading boundary are streamed into a
  hidden container that only JavaScript reveals, and the contact form must work without JavaScript. Put future forms
  that must work without JavaScript there too.
- **Writing a page**: `LegalPage` (`src/components/legal/legal-page.tsx`) takes `doc` (version and date from
  `legalDocuments` in `@pretoscop/config/legal-texts`), an optional `intro` and `sections` (`{ id, title, content }`; four or
  more get a table of contents). Content is plain JSX inside `Prose`; use `DataTable`, `InfoCard`, `Callout` and
  `CodeBlock` from `prose.tsx`. Bump `version` and `updatedAt` in `legalDocuments` for every substantive change; pages
  of kind `legal` show "Document provizoriu, în curs de revizuire juridică" until `reviewed: true` (after setup B5).
  Long-form text lives in the page files, not in `ro.json`.
- **Wording rules**: say only what is true today; plans are phrased as plans (company in formation, no revenue yet, no
  promoted placements, crawler IPs published at launch). `/bot` describes PretoscopBot only; `/metodologie` keeps the
  sentence about the third-party data-collection service.
- **Coverage statement** on `/cum-functioneaza` (ISR, hourly): `countCoveredShops()` and `listNotYetIncludedShops()` in
  `src/lib/coverage.ts` (active shops with an active tier 1–2 offer checked in the last 48 h; shops with status `blocked`).
  A database that is down or slow at build time renders a neutral sentence instead of failing the build.
- **Ranking contract**: `/cum-functioneaza` promises the default order total price ascending, then in stock first, then
  most recently checked; stale offers stay in place, greyed, without the "cel mai mic preț" badge; marketplace offers
  ranked the same way but outside the default "cel mai mic preț" chart series. The product page (M13) must implement
  exactly this, or the page must change with it.
- **Contact channel**: `POST /api/contact` (JSON from the enhanced form, or a plain form post answered with a 303 to
  `/contact?trimis=PS-…`): validation in `src/lib/contact.ts` (shared with the form), 16 KB cap, `Sec-Fetch-Site:
  cross-site` refused, honeypot field `website`, 5 requests per hour per daily-salted session hash, a `contact_requests`
  row, a team email to `MAIL_REPLY_TO` with the kind in the subject, and a confirmation of receipt to the sender for
  shop objections and illegal-content notices (DSA art. 16(4)). `?subiect=<kind>` preselects the kind.
- **Bot identity**: `src/lib/bot-policy.ts` holds the UA strings (from `BOT_INFO_URL`), the politeness numbers shown on
  `/bot` (keep them equal to `packages/fetch`) and `BOT_CHANGELOG`; `GET /bot/ips.json` serves the UAs and the
  `BOT_EGRESS_IPS` addresses at request time, dated by the newest changelog entry.
- **Consent texts**: the banner reads `analyticsConsent.v1` from `@pretoscop/config/legal-texts`; `resetConsent()` clears
  the choice and re-opens the banner (reloading the page when Plausible is already running); `/cookies` has the
  "Schimbă preferințele" control.

## Plausible (self-hosted, after consent)

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | `https://stats.pretoscop.ro/js/script.js` (production), `http://localhost:8100/js/script.js` (dev) | Build-time: inlined into the client bundle, so rebuild after a change. Use the classic `script.js` snippet (still supported by Plausible CE v3); the newer `pa-….js` snippet needs a `plausible.init()` call the loader does not make. Empty = analytics off. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `pretoscop.ro` (dev: `localhost`) | The site name registered in the Plausible dashboard (`data-domain`). |

Local instance: `docker compose -f infra/docker-compose.dev.yml -p pretoscop --profile analytics up -d` starts Plausible
CE v3.2.1 with ClickHouse and its own Postgres on http://localhost:8100 (about 2 GB of RAM; not started by `make dev`).
Register the first account, add the site, then build the web app with the two variables above. When a Content Security
Policy is added (M16/M18), allow the Plausible origin in `script-src` and `connect-src`.

## Price alerts and accounts (M19)

Behind the flag `alerts.email.enabled` (off by default); with it off the product page keeps the
"În curând" box and `POST /api/alerts` answers 503.

| Route | What it does |
|---|---|
| product page, "Alertă de preț" | `components/alerts/alert-form.tsx`: below a target or any drop of at least 1%, optionally any variant, the unticked consent box with `alertConsent` (current version from `@pretoscop/config/legal-texts`); a plain HTML form without JavaScript |
| `POST /api/alerts` | validates (`lib/alert-form.ts`, shared with the form), refuses cross-site posts, bodies > 8 KB (by Content-Length before reading, and the read stops at the limit) and the honeypot; 10 requests/hour per daily-salted IP hash (never the User-Agent); at most 3 confirmation emails per address per day, never to an address suppressed after a complaint or bounce; same answer whether or not the address has an account; logged in with the same verified address → active at once (`confirm_method = 'session'`) |
| `/alerte/confirmare?a=&t=` + `POST /api/alerts/confirm` | double opt-in: the page only shows the alert and the consent text; the button confirms (mail scanners open links) |
| `/alerte/dezabonare?a=&t=` / `?u=&t=` + `POST /api/alerts/unsubscribe` | one button, no login; the same URL takes the RFC 8058 one-click POST (`List-Unsubscribe=One-Click`) from mailbox providers; a GET never unsubscribes |
| `/alerte` | magic-link login (server action, works without JavaScript); list, edit, confirm, delete, stop all; `GET /api/account/export` (JSON, with the address's suppression entry); delete the account |
| login emails (every path) | `lib/login-limits.ts`, applied in Better Auth's `sendMagicLink` (the /alerte, admin and merchant forms and `POST /api/auth/sign-in/magic-link` all end there; Better Auth's own limiter is off without IP tracking): at most 5 per address per hour (database counter under a daily-salted hash of the address, reset by a successful login) and 20 per daily-salted IP hash per 15 minutes; over a limit nothing is sent and the answer is unchanged |
| `/alerte/rezultat`, `/alerte/pastreaza` | the no-JavaScript result of the form; "keep my account" from the 24-month notice |
| `POST /api/webhooks/resend` | Svix-signed (RESEND_WEBHOOK_SECRET, required with APP_ENV=prod and MAIL_DRIVER=resend): complaints and permanent bounces stop the address's email alerts and suppress its hash; bodies over 256 KB refused before reading |
| `/admin/alerte`, `GET /api/admin/users/{id}/export` | volumes, failures, and data-subject requests (export, delete; audited without the address) |

Evidence: `consent_ip_hash`/`confirm_ip_hash` = `hashWithDailySalt('ip', ip)` (the salt of the
UTC day of `consent_at`/`confirmed_at`, derived from HASH_SALT_SECRET), so a claimed IP can be
checked later while the stored value reveals nothing. Links are signed with ALERTS_SECRET
(`@pretoscop/notify`). E2E: `E2E_SHARED_FIXTURE=0 pnpm exec playwright test e2e/alerts.spec.ts --project=desktop --workers=1`.
## Merchant portal (M20)

- **Flag**: `merchants.portal.enabled` (off by default) gates new registrations and submissions; approved feeds keep running
  when it is off.
- **Merchant pages**: `/pentru-magazine/autentificare` (magic link, role `merchant`), `/pentru-magazine/cont` (steps: company
  and CUI with checksum → domain proof → feed URL or upload → price format and delivery → terms and submit; then the pending,
  approved (dashboard), rejected and suspended views), `/pentru-magazine/termeni` (merchant terms, `merchantTerms.v1`).
  Forms are server actions with redirect-after-post, so they work without JavaScript; `AutoRefresh` only reloads while a
  worker check runs.
- **Domain proof** (the abuse guard against listing someone else's feed): an email address on the shop's domain, a DNS TXT
  record `pretoscop-verificare=<token>` on the apex, or the token in `/.well-known/pretoscop-verificare.txt`; an admin can
  also verify manually. Approval requires it, and the worker drops feed offers whose URL is not on that domain.
- **Checks run in the worker** (`merchant.validate`, `merchant.verify_domain`): feed fetches go through `@pretoscop/fetch`
  as `PretoscopBot-Feed` (robots.txt, 5 s spacing, public addresses only). The web app only enqueues and shows results.
- **Upload**: `POST /api/merchant/feed-upload` (multipart, same-site, ≤ `FETCH_MAX_BODY_BYTES`) stores the file in the blob
  store; an approved upload source is observed at upload time and never scheduled.
- **Admin**: `/admin/comercianti` (queue and detail): approve (creates or attaches the shop and the
  `<slug>:feed:merchant` source, every 4 hours), reject / suspend with a statement of reasons (category + facts, emailed;
  P2B art. 4), reinstate, manual domain verification, re-check, run now. Every decision is in `audit_log`.
- **Development only**: with `FETCH_ALLOW_PRIVATE_HOSTS=true` (refused in staging and production) a feed URL may point to a
  local IP and port, which the e2e flow uses.

## Bot legitimacy (M21)

- **`/bot`** (final): how to verify us — the published IPs (`BOT_EGRESS_IPS`), forward-confirmed reverse DNS
  `crawl-N.bot.pretoscop.ro` (`BOT_RDNS_DOMAIN`), Web Bot Auth with its live status (key published / requests signed) —, the
  anti-bot services table (`BOT_PROGRAMS` in `src/lib/bot-policy.ts`: update the status and add a changelog entry when a
  programme answers) and the feed route through the merchant portal.
- **`/bot/ips.json`** adds `creationTime` and `prefixes` (googlebot.json format) to the M17 fields.
- **`/.well-known/http-message-signatures-directory`**: the public Ed25519 JWK, signed for the `Signature-Agent` authority
  (origin of `BOT_INFO_URL`), `Cache-Control: max-age=300`; 404 until `WEB_BOT_AUTH_PRIVATE_KEY` is set
  (`src/lib/web-bot-auth.ts`, signing primitives from `@pretoscop/fetch/signing`).
- **`/admin/contactari`**: retailer outreach tracker (table `outreach`): add a contact, update its status, follow-ups due.
- Runbooks and application dossiers: `infra/bot-program/`.
