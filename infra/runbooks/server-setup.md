# Runbook: set up the production server (once)

Target: one Hetzner dedicated server (AX41-class, 64 GB RAM, NVMe, Germany; Ubuntu 24.04 LTS),
Cloudflare in front, staging and production side by side (`docs/03-architecture.md` §11, ADR-019).
Budget about two hours, most of it waiting. Accounts needed first: `docs/09-external-setup-checklist.md`
A1 (domain), A3 (Cloudflare + R2), A4 (Hetzner), A5 (GitHub), B3 (Better Stack).

```
Internet ─▶ Cloudflare (DNS, cache, WAF, Access) ─▶ server :443 (firewall: Cloudflare only)
   └▶ edge stack: Caddy ──▶ prod-web-1/2 ──┐          pretoscop-prod:    postgres + pgbackrest, meilisearch, worker
                       └─▶ staging-web-1/2 ─┘          pretoscop-staging: postgres, meilisearch, worker (never crawls)
   worker ─▶ shops (egress: the server's IPv4, PTR crawl-1.bot.pretoscop.ro) · R2 (snapshots, dumps, WAL)
```

## 1. Server

1. Hetzner Robot: order the server with Ubuntu 24.04; add your SSH key. Set the IPv4's reverse DNS
   to `crawl-1.bot.pretoscop.ro` (Robot → IPs → rDNS) and create the matching A record in
   Cloudflare as **DNS only** (grey cloud): the crawler's identity (`docs/12` layer 1, M21).
2. As root on the server: copy `infra/server/bootstrap.sh` and the deploy user's public key, then
   `bash bootstrap.sh git@github.com:OWNER/pretoscop.git deploy_key.pub`. It installs Docker,
   creates the `deploy` user, locks SSH to keys, and lets only Cloudflare reach ports 80/443.
3. GitHub: add a read-only **deploy key** for the server (`ssh-keygen -t ed25519` as `deploy`,
   public part in repo Settings → Deploy keys) so `/srv/pretoscop/{prod,staging}` can `git fetch`.
4. GHCR: a fine-grained token with `read:packages`, then as `deploy`:
   `echo <token> | docker login ghcr.io -u <github-user> --password-stdin`.

## 2. Secrets (never in git)

As `deploy`, in `/srv/pretoscop/prod`:

```bash
cp .env.example .env && chmod 600 .env
cp infra/env/backup.env.example .env.backup && chmod 600 .env.backup
for k in POSTGRES_PASSWORD MEILI_MASTER_KEY BETTER_AUTH_SECRET REVALIDATE_TOKEN HASH_SALT_SECRET ALERTS_SECRET; do
  printf '%s=%s\n' "$k" "$(openssl rand -hex 32)"; done   # paste into .env
openssl rand -base64 48   # → PGBACKREST_REPO1_CIPHER_PASS in .env.backup (also into both password managers)
```

Fill in `.env`: `APP_ENV=prod`, `DEPLOY_ENV=prod`, `PUBLIC_BASE_URL=https://pretoscop.ro`,
`IMAGE_REGISTRY=ghcr.io/OWNER`, R2 (`BLOB_DRIVER=s3`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
`S3_BUCKET=pretoscop-prod`, keys), Resend (`MAIL_DRIVER=resend`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` for M19 bounces), `ADMIN_EMAILS`,
`OPS_ALERT_*`, the four heartbeat URLs (`infra/monitoring/README.md`), Plausible if wanted
(`COMPOSE_PROFILES=analytics`, `PLAUSIBLE_DB_PASSWORD`, `PLAUSIBLE_SECRET_KEY_BASE`; register the two founders at
`https://stats.pretoscop.ro`, then registration stays invite-only), `CRAWL_ENABLED` (true only when
the recorder moves here; see §5), `BOT_EGRESS_IPS` (M17), and the Deployment section as documented.
`.env.backup`: the `pretoscop-backups` R2 bucket and its own token.

`/srv/pretoscop/staging/.env`: the same file with `infra/env/staging.env.example` applied (own secrets,
`CRAWL_ENABLED=false`, `MAIL_DRIVER=log`, `PG_ARCHIVE_MODE=off`, `BACKUPS_ENABLED=false`).

## 3. TLS and the edge

1. Cloudflare → SSL/TLS → Origin Server → Create certificate (`pretoscop.ro`, `*.pretoscop.ro`,
   15 years). Save as `infra/caddy/certs/origin.pem` and `origin.key` in the prod checkout
   (`chmod 600`; git-ignored). SSL/TLS mode **Full (strict)**.
2. `CADDY_TLS=/etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key` in the prod `.env`.
3. Create the network the three stacks share, then start the edge once:
   `docker network create pretoscop-edge` and
   `docker compose -p pretoscop-edge -f infra/docker-compose.edge.yml --env-file .env up -d`.
4. Cloudflare configuration: `infra/cloudflare/README.md` (DNS, cache rules, WAF, Access).

## 4. First deploy

From GitHub: push a tag `v2026.11.10-1` (workflow `deploy.yml` builds and pushes the images, deploys
staging, then waits for approval to deploy production). By hand on the server:
`cd /srv/pretoscop/staging && infra/scripts/deploy.sh staging v2026.11.10-1`, then the same in
`/srv/pretoscop/prod` with `prod`. Check: `https://pretoscop.ro/api/health` → `"status":"ok"`.

The pgbackrest sidecar creates the stanza and takes the first full backup within minutes:
`infra/scripts/compose.sh prod exec pgbackrest pgbackrest info`.

## 5. Moving the recorder from the laptop (the data must not be lost)

The Phase-0 recorder runs on Daniel's Mac (`make recorder`). To move it without losing a day of history:

1. On the Mac: `make psql` → `update feature_flags set enabled=false where key='crawl.enabled';` (stops
   new runs; wait for running ones in `/admin/rulari`), then a dump:
   `docker compose -f infra/docker-compose.dev.yml -p pretoscop exec -T postgres pg_dump -Fc -U pretoscop pretoscop > pretoscop.dump`.
2. Copy `pretoscop.dump` and `data/blobs/snapshots` to the server (scp/rsync); upload the snapshots
   to R2 (`rclone copy data/blobs/snapshots r2:pretoscop-prod/snapshots`).
3. On the server, with web and worker stopped (`compose stop web-1 web-2 worker`):
   `docker compose ... exec -T postgres pg_restore --clean --if-exists --no-owner -U pretoscop -d pretoscop < pretoscop.dump`,
   then `infra/scripts/deploy.sh prod <tag>` (migrations bring it to the current schema).
4. Set `CRAWL_ENABLED=true` in the prod `.env`, deploy again, and flip `crawl.enabled` on in
   `/admin/flaguri`. Stop the Mac recorder (`make recorder-stop`) **before** this step: two
   recorders would double the request rate on every shop.
5. Take a full backup now: `... exec pgbackrest pgbackrest-sidecar backup full`.
