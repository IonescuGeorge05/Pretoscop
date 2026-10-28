# Monitoring and alerting (M18)

Sized for two founders who sleep: a phone notification when something needs a human, nothing
else. Three layers, from the outside in; the first two are enough on day one, the third adds
history and graphs.

| Layer | Watches | Alerts through | Needs |
|---|---|---|---|
| 1. Outside the server: Better Stack (free: 10 monitors, heartbeats) | the site answers (`/api/health` checks the database too); the worker is alive; backups ran | Better Stack app push / SMS / call to both founders | Better Stack account (B3) |
| 2. Inside the worker: `ops.slo_check` (hourly) and job failures | data SLOs of `docs/03-architecture.md` §9: source freshness, parse-reject rate, offer freshness, review queue, nightly dump, restore test, WAL archiving, disk; two failed runs in a row; held runs; assisted-access spend (M05B) | Telegram (`OPS_ALERT_TELEGRAM_*`) and/or email (`OPS_ALERT_EMAIL`), deduplicated per problem (once a day for most) | a Telegram bot, or Resend |
| 3. Grafana Cloud (free: 10k series, 50 GB logs, 14 days), optional | the same metrics as graphs, web 5xx rate and origin latency from Caddy, logs | Grafana alert rules (`alerts.yml`) to email/Telegram | Grafana Cloud account (B3) |

Errors (Sentry, B3) are deferred: errors are JSON log lines (`level: 50`) visible with
`docker compose logs` and in Grafana Cloud Logs, and the 5xx rate alert covers the web side. Add
`@sentry/nextjs` / `@sentry/node` when the account exists (deviation in the M18 report).

## 1. Better Stack (do this first)

Create these monitors (Uptime → Monitors, and Heartbeats):

| Monitor | Type | Target / period | Escalation |
|---|---|---|---|
| Site | HTTP keyword | `https://pretoscop.ro/api/health`, keyword `"status":"ok"`, every 1 min, from 2 regions | both founders, push + call after 5 min |
| Staging | HTTP keyword | `https://staging.pretoscop.ro/api/health` (add the Cloudflare Access service-token headers `CF-Access-Client-Id` / `CF-Access-Client-Secret`) | email only |
| Worker alive | Heartbeat, period 5 min, grace 10 min | URL → `OPS_HEARTBEAT_URL` | push |
| Nightly dump | Heartbeat, period 1 day, grace 3 h | URL → `DUMP_HEARTBEAT_URL` | push |
| Base backup (pgBackRest) | Heartbeat, period 1 day, grace 3 h | URL → `BACKUP_HEARTBEAT_URL` | push |
| Restore test | Heartbeat, period 7 days, grace 1 day | URL → `RESTORE_TEST_HEARTBEAT_URL` | email |

The worker and the sidecar ping `<url>` on success and `<url>/fail` on failure, so a failure alerts
at once and silence alerts after the grace period. healthchecks.io works the same way.

Test it (the M18 founder check): `infra/scripts/compose.sh prod stop web-1 web-2` for two
minutes and watch the phone; then start them again with `infra/scripts/compose.sh prod up -d --no-deps web-1 web-2`
(`compose start` refuses: the replicas depend on the one-shot `migrate`; `infra/runbooks/incident.md`).

## 2. Telegram for ops alerts

1. BotFather → `/newbot` → token → `OPS_ALERT_TELEGRAM_BOT_TOKEN`.
2. Create a group with both founders and the bot; send a message; read the chat id from
   `https://api.telegram.org/bot<token>/getUpdates` → `OPS_ALERT_TELEGRAM_CHAT_ID` (negative number).
3. Restart the worker, then send a test alert through every configured channel:
   `infra/scripts/compose.sh prod exec worker node --import tsx src/cli/ops-alert-test.ts`.

Email instead of (or as well as) Telegram: `OPS_ALERT_EMAIL=a@…,b@…` with `MAIL_DRIVER=resend`.

## 3. Grafana Cloud (optional)

1. Create a stack; Connections → Hosted Prometheus metrics and Hosted logs: copy the remote-write
   URL and user id of each, and create an access policy token with `metrics:write` and `logs:write`.
2. In the production `.env`: `COMPOSE_PROFILES=monitoring`, `GRAFANA_CLOUD_PROM_URL`,
   `GRAFANA_CLOUD_PROM_USER`, `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`,
   `GRAFANA_CLOUD_API_KEY`; the next deploy starts the `alloy` container (`config.alloy`).
3. Import `dashboard.json` (Dashboards → Import) and `alerts.yml` (Alerting → Alert rules → Import).

Series budget: the worker exports roughly 10 series per source (≈ 60 sources → 600), plus Caddy's
per-host histograms (≈ 300): well inside the free 10k.

## What each signal means

| Metric (worker `:9464/metrics`) | Meaning |
|---|---|
| `pretoscop_source_last_success_age_seconds` vs `pretoscop_source_freshness_slo_seconds` | how stale each source is against its registry SLO |
| `pretoscop_source_consecutive_failures` | failed runs in a row (the recorder alerts at 2) |
| `pretoscop_offers_checked_26h / pretoscop_offers_active` | offer freshness (SLO ≥ 95%) |
| `pretoscop_price_events_24h` | the recorder's pulse: price changes and first sightings per day |
| `pretoscop_queue_jobs{queue,state}` | pg-boss backlog and failures |
| `pretoscop_review_queue_offers` | human matching queue (SLO < 500) |
| `pretoscop_job_last_success_timestamp_seconds{queue}` | last nightly dump, restore test, rollup, partition maintenance |
| `pretoscop_pg_last_archived_timestamp_seconds`, `pretoscop_pg_archive_failures_total` | WAL shipping to the pgBackRest repository (RPO 5 min) |
| `pretoscop_disk_free_bytes / pretoscop_disk_size_bytes` | the server's data filesystem |
| `pretoscop_assisted_*` (M05B) | assisted-access spend against the cap, success rate per shop |

Caddy (`caddy:9180/metrics`, edge network only): `caddy_http_requests_total{host,code}`,
`caddy_http_request_duration_seconds_bucket{host}`. These count origin traffic only; pages served
from Cloudflare's cache never reach the server.

## Logs

Every container logs JSON to Docker's `json-file` driver, rotated at 5 × 20 MB per container
(`x-logging` in the compose files), so the disk never fills with logs. Caddy's access log drops
proxy and identity headers and keeps client IPs truncated to /16 (IPv4) or /32 (IPv6). Reading:
`infra/scripts/compose.sh prod logs -f --tail 200 worker`.
