# Runbook: takedown and objection requests

Covers: a shop objects to being crawled or shown; a rights holder objects to content (an image, a
description); a person asks for their data (GDPR); a DSA notice through `/contact`. Respond within
**one business day** (`docs/12-blocked-shops-strategy.md` §0, condition 4; `docs/07-legal-compliance-checklist.md`).

## 1. A shop asks us to stop crawling or using its prices

Follow `infra/runbooks/source-pause.md` → "A shop asks us to stop (written objection)": kill
switches within the hour, reply, YAML `status: paused`, decision logged. For a shop on the assisted
channel, also `infra/runbooks/assisted-access.md` → "Objection". Display: if the request covers
showing its prices, hide the shop (`status: paused` hides its offers from public pages, M13) and
purge the edge cache (§4).

## 2. Content objections (images, texts, trademarks)

- We only show licensed images (feeds, Icecat) or placeholders (ADR-008). If a rights holder
  objects anyway: remove the `product_images` row and the object in R2 (`images/...`), purge the
  cache, reply with what was removed.
- Product titles and specs are facts; still, remove disputed marketing text and reply.

## 3. Personal data requests (GDPR: access, deletion)

Personal data we hold: alert subscribers' emails (M19), admin accounts, merchant contacts (M20),
hashed click/event logs (no raw IPs). Export or delete per `docs/legal/` (M17) and the admin tool
(M19); reply within 30 days at the latest, one business day for acknowledgement.

## 4. Purge the Cloudflare cache after removing something

Cloudflare dashboard → Caching → Configuration → Custom purge → URL (`https://pretoscop.ro/p/<slug>`)
or Purge everything (rarely needed). The origin's own cache is cleared by the worker's revalidation
or by a deploy.

## 5. Record

Every request: date, who, what was asked, what was done, when replied → `docs/progress.md`
(decisions log) and, for shops, `legal.terms_note` in the shop's YAML.
