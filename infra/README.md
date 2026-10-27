# infra/ — environments, deployment, backups, monitoring

| Path | What |
|---|---|
| `docker-compose.dev.yml` | Local development services (project `pretoscop`): PostgreSQL, Meilisearch, Mailpit, the `recorder` profile |
| `docker-compose.prod.yml` | **Production and staging app stack** (projects `pretoscop-prod`, `pretoscop-staging`): PostgreSQL + `pgbackrest` sidecar, Meilisearch, one-shot `migrate`, `web-1`/`web-2`, `worker`, optional `alloy` |
| `docker-compose.edge.yml` | **Edge stack** (project `pretoscop-edge`): Caddy, TLS, load balancing for both environments |
| `docker-compose.local-s3.yml` | MinIO standing in for R2, for local prod-like rehearsals (`make verify M=18`) |
| `docker/{web,worker,postgres}.Dockerfile` | Release images: Next.js standalone (per environment), worker (shared), PostgreSQL 18 + pgvector + pgBackRest |
| `postgres/` | PostgreSQL settings for staging/production; the pgBackRest sidecar script |
| `caddy/Caddyfile` | Edge configuration (sites, TLS modes, trusted proxies, privacy-filtered access log, metrics) |
| `scripts/deploy.sh`, `rollback.sh`, `restore-pitr.sh` | Run on the server (also locally against a test project) |
| `server/bootstrap.sh` | One-time server preparation (Docker, deploy user, SSH, firewall) |
| `env/` | Templates: `backup.env.example` (pgBackRest repository), `staging.env.example` (staging overrides) |
| `monitoring/` | Better Stack / Telegram / Grafana Cloud setup, Alloy config, alert rules, dashboard |
| `cloudflare/README.md` | DNS, TLS, cache rules, WAF, Access |
| `runbooks/` | `server-setup`, `deploy`, `rollback`, `restore`, `incident`, `source-pause`, `takedown`, `secrets-rotate`, `scale-workers`, `meili-rebuild` |
| `launch-checklist.md` | Gate G2, item by item, with how each is checked |

Everyday commands on the server (as `deploy`, in `/srv/pretoscop/prod` or `/srv/pretoscop/staging`):

```bash
make deploy ENVIRONMENT=prod TAG=v2026.11.10-1      # or infra/scripts/deploy.sh prod v2026.11.10-1
make rollback ENVIRONMENT=prod                       # previous release
make prod-ps ENVIRONMENT=prod; make prod-logs S=worker
```

Design decisions: `docs/03-architecture.md` §11 and ADR-016 … ADR-019.
