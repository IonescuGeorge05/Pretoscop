# Runbook: incident response (site down, worker down, server trouble)

For two founders: whoever is paged first takes it and says so in the Telegram ops group; the other
stays off unless asked. Write one line per action in the group as you go: it becomes the incident
note. Aim: site back first, cause later.

## 0. Shortcuts

```bash
ssh deploy@<server>; cd /srv/pretoscop/prod
C="docker compose -p pretoscop-prod -f infra/docker-compose.prod.yml --env-file .env"
E="docker compose -p pretoscop-edge -f infra/docker-compose.edge.yml --env-file .env"
$C ps; $E ps                                   # what is up, healthy, restarting
$C logs --tail 200 web-1 web-2 worker postgres # last lines of each
df -h /; free -g; uptime                        # disk, memory, load
```

## 1. "Site" monitor down (Better Stack)

| Check | Meaning → action |
|---|---|
| Cloudflare status page / dashboard shows errors 52x | 521/522: origin unreachable → server or Caddy down (below). 502: Caddy up, web down. 525/526: certificate (origin cert expired or `CADDY_TLS` wrong) |
| `$E ps` caddy not running | `$E up -d`; `$E logs caddy` |
| `$C ps` web-1/web-2 unhealthy or restarting | `$C logs web-1`; database reachable? (`/api/health` returns 503 when not). Recent deploy → `infra/scripts/rollback.sh prod` |
| postgres not healthy | `$C logs postgres`: disk full (§3), crash loop after an image change (roll back the image tag), recovery in progress (wait) |
| postgres log says `untracked child process (PID …) exited with exit code 2` then `terminating any other active server processes` | a process re-parented to the postmaster died (in dev on 2026-10-27: a timed-out shell-form health check while PostgreSQL ran as PID 1). Every long-running service in our compose files runs under an init process (`init: true`) with exec-form health checks and 10 s timeouts; if a server-local override removed either, restore it |
| server not reachable at all | Hetzner Robot → reset; if the hardware is gone: `restore.md` → "The server is lost" |

## 2. "Worker alive" heartbeat missing, or data alerts

- `$C ps worker`: restarting → `$C logs --tail 300 worker` (startup migrations, env validation:
  "Invalid environment" names the variable).
- Running but no heartbeat: pg-boss stuck or database slow. `$C restart worker` (jobs are idempotent
  and retried). Check `/admin` → Cozi (queues).
- Source alerts (stale, failing, rejects): `infra/runbooks/source-pause.md`. Blocks are not
  incidents; never retry harder.
- Assisted-access alerts (spend, success rate): `infra/runbooks/assisted-access.md` (M05B).

## 3. Disk almost full

```bash
docker system df; sudo du -xh --max-depth=2 /var/lib/docker | sort -h | tail
$C exec postgres psql -U pretoscop -d pretoscop -c "select pg_size_pretty(pg_database_size('pretoscop'))"
$C exec postgres du -sh /var/lib/postgresql/18/docker/pg_wal   # large → WAL archiving is failing (restore.md)
```

Safe to delete: old images (`docker image prune -a` keeps the running ones), build cache
(`docker builder prune`), `request_log` older than 30 days (the daily job does it). Never delete
files inside the PostgreSQL volume by hand.

## 4. Bad data on the site (wrong prices)

1. Kill the source (`/admin/surse` → Oprește) or the whole shop; the offers keep their history.
2. If prices were recorded wrongly: anomaly quarantine (`/admin/carantina`) holds the suspicious
   ones; for a whole bad run, ask the implementer for a replay (`pnpm --filter @pretoscop/worker replay`).
3. A shop or a person objects to what we show or collect: `infra/runbooks/takedown.md`.

## 5. Container rules that prevent self-inflicted restarts

- Every long-running service has `init: true` (tini is PID 1 and reaps orphans; the service is never
  PID 1), and every health check is exec form (`['CMD', 'pg_isready', …]`, never `CMD-SHELL`) with a
  timeout of 10 s. Keep both in any override file (`COMPOSE_EXTRA_FILES`) or new service.
- Memory limits (`*_MEMORY_LIMIT`) keep one container from starving PostgreSQL; PostgreSQL itself has
  no limit.

## 6. After the incident

A short note (what, when, impact, cause, fix, follow-up) appended to `docs/progress.md` under the
current module or the decisions log. Anything that needed a human and could have been automatic
becomes a task.
