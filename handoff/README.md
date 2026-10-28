# handoff/

A snapshot of the old development machine's local files (28 Oct 2026), so a new machine can
continue from git alone. The full procedure is in `docs/HANDOFF.md`. The repository is public, so
nothing here carries login data.

| Path | Restore with |
|---|---|
| `dev.env` | `cp handoff/dev.env .env`. Dev defaults only; replace the secrets before any public deployment |
| `data/` | `mkdir -p data && cp -R handoff/data/. data/`. Run snapshots, reports, probe notes; the full backups are not included |
| `db/pretoscop-dev-2026-10-28.public.sql.gz` | After `make services`: `gunzip -c handoff/db/pretoscop-dev-2026-10-28.public.sql.gz \| docker compose -f infra/docker-compose.dev.yml -p pretoscop exec -T postgres psql -q -v ON_ERROR_STOP=1 -U pretoscop -d pretoscop` |

The database dump holds shops, offers, products, matches and the price history recorded since
27 Oct 2026. These tables have their structure but no rows: `users`, `sessions`, `accounts`,
`verifications`, `audit_log`, `clicks`, `contact_requests`, `events`, `consent_records`,
`email_suppressions`, `alerts`, `alert_sends`. The pg-boss queue schema is not included; the
worker recreates it on start.

This folder is a one-off snapshot. The live `.env` and `data/` stay git-ignored (CLAUDE.md:
no secrets in git), so do not commit them directly.
