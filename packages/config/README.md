# @pretoscop/config

Environment, logging and (from M04) the shop registry.

Contract:
- `@pretoscop/config/env`: `getEnv()` returns the zod-validated environment (`Env`); every variable
  is documented in the root `.env.example`. `loadRootEnvFile()` loads the repository-root `.env`.
- `@pretoscop/config/logger`: `createLogger(name)` returns a pino JSON logger. Source jobs bind
  `source_id`, `run_id` and `shop` on a child logger.
- `BOT_EGRESS_IPS` (M17): comma-separated IPv4/IPv6 addresses or CIDR prefixes of the crawler's
  fixed egress, parsed to `string[]`; an invalid entry fails `getEnv()` with the offending value
  (`isIpOrCidr()` is exported). Published on `/bot` and `/bot/ips.json`.
- `FETCH_ALLOW_PRIVATE_HOSTS` (M20): lets the worker's fetcher connect to private, loopback and link-local addresses
  (local fixture servers, e2e). Default off; `getEnv()` refuses it in staging and production.
- `WEB_BOT_AUTH` / `WEB_BOT_AUTH_PRIVATE_KEY` (M21): request signing on/off (default off) and the Ed25519 key (base64url
  seed or PKCS#8 PEM; a secret, environment only). `getEnv()` refuses signing without a key and a malformed key without
  echoing it, and refuses the public RFC 9421 test key in staging and production. See `infra/bot-program/web-bot-auth.md`.
- `FETCH_PRIVATE_ALLOWLIST` (M20): comma-separated `ip:port` pairs (IP literals) the worker may reach although they
  are private, while the guard stays on for everything else (`make verify M=20` opens only its fixture feed server, so
  the e2e also proves that any other private address is refused). Empty by default; refused in staging and production.

## Legal and consent texts (M17)

`@pretoscop/config/legal-texts` (also re-exported from the root) is pure data, safe in client
components:

- `legalTexts.alertConsent.v1` (price-alert checkbox for M19: explicit consent for the chosen
  product, double opt-in, unsubscribe in every email, link to `/confidentialitate#alerte`) and
  `legalTexts.analyticsConsent.v1` (the consent banner). `currentVersion` names the version shown
  today; `currentConsentText(name)` returns it; `consentTextByKey('alertConsent.v1')` resolves a
  stored key. Store the key with every consent (`alerts.consent_text_version`).
- A published text is never edited: add `v2`, move `currentVersion`, keep `v1` for the evidence.
  `reviewed` turns true only after the lawyer review (setup B5).
- `legalDocuments`: version, date and kind (`legal` or `trust`) of each public page;
  `legalContacts` (privacy@, bot@) and `supervisoryAuthority` (ANSPDCP).
- Tests: `test/legal-texts.test.ts` (versions present, keys consistent, required content, no
  cedilla diacritics).

## Shop registry (M04)

`packages/config/shops/<slug>.yaml`, one file per shop, validated by `src/shops/schema.ts` (zod).
`@pretoscop/config/shops` exports `loadShops()`, `parseShopYaml()`, `getDomainPolicy(host)`,
`shopForHost()`, `renderShopsTable()`. Invalid files fail with `file: path: message` lines, all at once.

Rules enforced by the schema: politeness floor (`min_interval_ms` ≥ 1000, default 5000;
`max_concurrency` must be 1); cron schedules valid in Europe/Bucharest; source keys
`<shop>:<kind>[:<name>]`, unique, never renamed; sources default to `enabled: false`; an enabled
source requires `status: active` and an `access_mode` other than `off`; `access_mode: assisted`
requires `legal.basis_ref` (ADR-015). Tests also require every `parser_key` to exist in
`@pretoscop/extractors`.

Ownership: the YAML owns configuration; the database owns runtime switches. `make shops:sync`
(`pnpm --filter @pretoscop/worker shops:sync`) is idempotent, never turns a `kill_switch` off
(a YAML `kill_switch: true` forces it on), never changes feature flags (it only creates missing ones,
off), disables sources removed from the YAML instead of deleting them, and writes an `audit_log`
row when anything changed. Changes to `access_mode` or `legal` go through the YAML (reviewed in git).

`pnpm --filter @pretoscop/config shops:table` regenerates the "Registry snapshot" table at the end
of `docs/06-retailer-targets.md`.

Source conventions (M10): one `listing` source per category (`<shop>:listing:<category>`) with
`config.max_pages` (pagination bound), `config.label`, `config.tier`, staggered off-peak schedules
and `freshness_slo_hours`; tests keep the sum of `max_pages` under the shop's `max_pages_per_day`.
A `sitemap` source names its product-page parser in `config.productParser` (validated too).
`shipping` amounts come only from the shop's own delivery page, cited with URL and date in
`shipping.notes`; when the page states no price the amounts stay empty (`verified` stays false until
a founder checks them).

What may run against a shop (all must hold): env `CRAWL_ENABLED=true`, flag `crawl.enabled`, for
eMAG the flag `source.emag.enabled` (ADR-013), shop `status: active`, `access_mode` not `off`,
source `enabled` and not `kill_switch`.
