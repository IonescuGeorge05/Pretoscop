# @pretoscop/notify

Alert notifications (M19): signed links, the stable email pseudonym and the Romanian message
templates. Server-only (uses `node:crypto`). Used by `apps/web` (double opt-in email, unsubscribe
pages) and `apps/worker` (alert delivery, retention notices).

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
