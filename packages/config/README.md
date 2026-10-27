# @pretoscop/config

Environment, logging and (from M04) the shop registry.

Contract:
- `@pretoscop/config/env`: `getEnv()` returns the zod-validated environment (`Env`); every variable
  is documented in the root `.env.example`. `loadRootEnvFile()` loads the repository-root `.env`.
- `@pretoscop/config/logger`: `createLogger(name)` returns a pino JSON logger. Source jobs bind
  `source_id`, `run_id` and `shop` on a child logger.

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
