# @pretoscop/notify

Alert notifications (M19 email, M27 Web Push and Telegram): signed links, the stable email
pseudonym, the Romanian message templates and the channel clients. Server-only (uses
`node:crypto`). Used by `apps/web` (double opt-in email, unsubscribe pages, push subscriptions
and the test notification) and `apps/worker` (alert delivery, retention notices, the bot).

## Contract

- `alertLinks(ALERTS_SECRET, PUBLIC_BASE_URL)` builds every link an alert email carries:
  `confirm(alertId)` → `/alerte/confirmare?a=&t=`, `unsubscribeAlert(alertId)` and
  `unsubscribeAll(userId)` → `/alerte/dezabonare?…`, `oneClick(userId)` → `POST /api/alerts/unsubscribe`
  (RFC 8058 target of `List-Unsubscribe`), `keepAccount(userId)` → `/alerte/pastreaza?…`,
  `product(slug)`, `out(offerId)` → `/out/{offerId}?p=alert`.
- `signLink` / `verifyLink(secret, purpose, id, token)`: 16-byte HMAC-SHA256 tokens (22 base64url
  characters) bound to the purpose (`confirm`, `unsub-alert`, `unsub-user`, `keep`) and the id.
  Stateless: unsubscribe links keep working while the alert or account exists; a confirmation
  link dies with its pending alert (7 days).
- `emailHash(secret, email)`: HMAC-SHA256 of the normalized address. The suppression list and the
  consent ledger use it; it must stay stable for years (unlike the daily-salted IP hash).
- Templates return `{ subject, text, html, headers? }`:
  `confirmationEmail` (double opt-in: product, condition, link, the exact consent text and its
  version, "ignore if not you"), `alertDigestEmail` (one email per user per evaluation; every
  item shows total, price + delivery, shop, the reason with its numbers, Pretoscop's last check
  time, `/out` link, history link and its own stop link; footer with why, manage, unsubscribe all,
  sender identity and address; `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`),
  `retentionNoticeEmail` (24 months inactive: deletion date and a keep link).

## Rules

- No images, remote resources or tracking pixels; links are plain (the `/out` click log is the same
  daily-salted, cookie-free log as on the site).
- Every interpolated value is HTML-escaped; Romanian with comma-below diacritics; money as
  `1.234,56 lei`, times in Europe/Bucharest.
- Rotating `ALERTS_SECRET` breaks every link already sent and every stored address hash: only after
  a leak, and then expect earlier unsubscribers to be unknown to the suppression list.

## Web Push and Telegram (M27)

- `createPushSender({ publicKey, privateKey, subject, allowLocalEndpoints? })`: RFC 8291 aes128gcm
  encryption and the RFC 8292 VAPID JWT by `web-push`, sent with `fetch` (no redirects, 10 s
  timeout). `send` → `{ ok }` or `{ ok: false, gone }` (404/410, malformed keys, or an endpoint we
  refuse: delete the subscription). Payload `{ title, body, url, tag }` ≤ 3 KB.
- `pushEndpointProblem` / `parsePushSubscription`: an endpoint is accepted only as https on the
  default port, without credentials, on a known push service (`PUSH_SERVICE_HOSTS`: FCM, Mozilla
  autopush, Apple, WNS); local http only with `allowLocal` (dev/test). Keys: a 65-byte P-256 point
  and a 16-byte secret, base64url. `pushTopic(idempotencyKey)`: the Topic header (32 characters).
- `createTelegramClient({ token, apiBase? })`: Bot API over `fetch`; `sendMessage` (HTML parse
  mode, no link previews, inline buttons) spaced 40 ms overall and 1 s per chat; a 429 holds every
  send for `retry_after`; a slot more than 30 s away fails at once with a local 429;
  `TelegramApiError.blocked` for a blocked bot or a gone chat; the token never appears in errors.
  `tgEscape` escapes `& < > "`.
- Formats (`channel-messages.ts`, snapshot-tested): `telegramAlertMessage` (the email's facts:
  total, shop, delivery, the reason with its numbers, Pretoscop's check time, `/out` link, history
  link, affiliate note when relevant; "Vezi oferta" and "Oprește alerta" buttons),
  `pushAlertPayload` (one alert opens the product, several open /alerte; the tag replaces older
  notifications of the same alert), `dealsPostText` (the daily verified-drops post, links to
  Pretoscop's pages only).
- `@pretoscop/notify/testing`: a fake browser (key pair), an independent aes128gcm decryptor and
  VAPID verifier, a mock push service and a mock Bot API (`startMockTelegram`) for tests.
- `pnpm --filter @pretoscop/notify vapid:keys` prints a new key pair for the server `.env` (never
  in git); changing the pair invalidates every browser subscription.
