# Runbook: rotate secrets

Secrets live only in `/srv/pretoscop/{prod,staging}/.env` and `prod/.env.backup` (mode 600, owner
`deploy`), copies in both founders' password managers, and GitHub Actions secrets for deployment.
Never in git, never in chat. Rotate after a leak or a departure, and yearly anyway.

| Secret | Where | Rotate how | Effect |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | `.env` | new `openssl rand -hex 32`, deploy | admins sign in again |
| `REVALIDATE_TOKEN` | `.env` | new value, deploy (web and worker restart together) | none |
| `HASH_SALT_SECRET` | `.env` | new value, deploy | click/event hashes stop linking across the change (by design they rotate daily anyway) |
| `ALERTS_SECRET` (M19) | `.env` | **only after a leak**: new value, deploy | every confirmation and unsubscribe link already sent stops working, and the stored address hashes (suppression list, consent ledger) no longer match: re-key them first or accept that suppressed addresses could be emailed again |
| `RESEND_WEBHOOK_SECRET` (M19) | `.env` | Resend → Webhooks → roll the signing secret, update, deploy | bounce/complaint events between the two steps are refused (Resend retries them) |
| `POSTGRES_PASSWORD` | `.env` | `$C exec postgres psql -U pretoscop -d pretoscop -c "ALTER ROLE pretoscop PASSWORD '<new>'"`, then update `.env`, deploy (web and worker get the new `DATABASE_URL`; the `NOTE: postgres has … new settings` line is expected and harmless) | brief reconnects |
| `MEILI_MASTER_KEY` | `.env` | update `.env`, `$C up -d --wait meilisearch`, deploy | search index keys change; reindex not needed |
| R2 keys (`S3_*`) | `.env` | Cloudflare → R2 → API tokens: create new, update `.env`, deploy, delete old | none |
| pgBackRest R2 key (`PGBACKREST_REPO1_S3_KEY*`) | `.env.backup` | new token for the backups bucket, update, `$C up -d postgres pgbackrest` (database restarts briefly) | none |
| `PGBACKREST_REPO1_CIPHER_PASS` | `.env.backup` | cannot be changed for an existing repository: create a new repository path (`PGBACKREST_REPO1_PATH=/pgbackrest/prod-2`), new passphrase, `stanza-create`, full backup; keep the old repo until its backups expire | none |
| `RESEND_API_KEY`, `ZYTE_API_KEY`, `ANTHROPIC_API_KEY`, network credentials | `.env` | create new in the vendor dashboard, update, deploy, revoke old | none |
| `OPS_ALERT_TELEGRAM_BOT_TOKEN` | `.env` | BotFather `/revoke`, update, deploy | none |
| Cloudflare origin certificate | `infra/caddy/certs/` | new certificate in Cloudflare, replace files, `$E exec caddy caddy reload --config /etc/caddy/Caddyfile` | none |
| GitHub `DEPLOY_SSH_KEY` (the CI key), GHCR token | GitHub secrets / server | new key pair, update `authorized_keys` and the secret, remove old | none |

`$C` and `$E`: see `infra/runbooks/incident.md` §0. After rotating, run `infra/scripts/deploy.sh <env>
<current tag>` so every container reads the new values; confirm `/api/health` and one admin login.
