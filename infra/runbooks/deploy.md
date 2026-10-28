# Runbook: deploy and roll back

Releases are git tags (`vYYYY.MM.DD-N`). Every release goes to staging first; production gets the
same tag after a look at staging. Images: `ghcr.io/OWNER/pretoscop-web:<tag>-<env>` (built per
environment, because prerendered pages carry PUBLIC_BASE_URL and SITE_INDEXABLE),
`pretoscop-worker:<tag>` (same image everywhere), `pretoscop-postgres:18`.

## Normal path (GitHub Actions)

1. `git tag v2026.11.10-1 && git push origin v2026.11.10-1` (from `main`, CI green).
2. Workflow **deploy** builds and pushes the four images, then deploys staging over SSH
   (`infra/scripts/deploy.sh staging <tag>`).
3. Open `https://staging.pretoscop.ro` (Cloudflare Access login), click through a product page,
   `/admin`, a search.
4. In GitHub → Actions → the run → **Review deployments** → approve `production`. The job runs
   `infra/scripts/deploy.sh prod <tag>` and checks `https://pretoscop.ro/api/health` reports the tag.

## By hand (on the server, as `deploy`)

```bash
cd /srv/pretoscop/prod
git fetch --tags && git checkout --detach v2026.11.10-1   # compose files and scripts of that release
infra/scripts/deploy.sh prod v2026.11.10-1               # or: make deploy ENVIRONMENT=prod TAG=v2026.11.10-1
```

What `deploy.sh` does, in order (stops at the first failure, old release keeps serving):
preflight (env file matches the environment, staging cannot crawl, archive_mode needs backups,
compose config valid) → pull images → PostgreSQL, its backup sidecar and Meilisearch up **but never
restarted** (see "Database image" below) → **migrations once** (one-shot
`migrate` service, advisory lock) → `web-1` recreated and healthy → `web-2` recreated and healthy
(Caddy routes to the healthy one meanwhile: no downtime) → worker → optional Alloy → smoke check
(`SMOKE_URL`) → line in `.deploy-history`. If a web replica does not become healthy, the replicas
already switched go back to the previous release automatically.

Watch: `infra/scripts/compose.sh prod ps` and `infra/scripts/compose.sh prod logs -f --tail 100 web-1 worker`
(`compose.sh` is `docker compose` for one environment with its deployed release tag; plain
`docker compose` refuses to run without `IMAGE_TAG`).

Compose rules kept in every file and override (they decide whether a deploy can hurt the database):
`init: true` on every long-running service, exec-form health checks with 10 s timeouts (a shell-form
check that times out can leave an orphan that PostgreSQL, as PID 1, takes for a crashed backend and
restarts every connection: `incident.md` §5).

## Roll back

```bash
cd /srv/pretoscop/prod
infra/scripts/rollback.sh prod              # previous successful release from .deploy-history
infra/scripts/rollback.sh prod v2026.11.08-2  # or a specific one
```

The same rolling procedure, with the older images. **Migrations are never undone**, so every release
must run on the schema of the next one: add columns/tables in one release, start using them in the
next, drop old ones two releases later (expand → migrate → contract). A migration that cannot follow
this rule needs a maintenance window: announce, `deploy.sh`, verify, and accept that rollback means
a restore (`infra/runbooks/restore.md`).

## Edge stack (Caddy)

Changes to `infra/caddy/Caddyfile` or the certificate: in `/srv/pretoscop/prod`,
`docker compose -p pretoscop-edge -f infra/docker-compose.edge.yml --env-file .env up -d` (recreates
Caddy only when its definition changed) or `... exec caddy caddy reload --config /etc/caddy/Caddyfile`
(no dropped connections). App deploys never touch the edge stack.

## Database image and database settings

A release never restarts PostgreSQL, its `pgbackrest` sidecar or Meilisearch. Every tag rebuilds
`pretoscop-postgres:18` (PostgreSQL minor versions, pgBackRest, the sidecar script), and changes to
`PG_*`, `BACKUP_*`, `.env.backup` or `MEILI_MASTER_KEY` also need those containers recreated, so
`deploy.sh` prints a `NOTE: postgres has a new image or new settings` line and leaves them running.
Apply them in a quiet hour (seconds of downtime for web and worker; they reconnect), after a backup:

```bash
cd /srv/pretoscop/prod
C="infra/scripts/compose.sh prod"   # docker compose for prod, with the deployed release
$C exec pgbackrest pgbackrest-sidecar backup diff
RECREATE_DATA_SERVICES=1 infra/scripts/deploy.sh prod <current tag>
$C exec pgbackrest pgbackrest-sidecar check        # WAL archiving works with the new container
```

Staging first. Major versions (18 → 19) are a separate project: `pg_upgrade` or dump/restore,
tested on staging.
