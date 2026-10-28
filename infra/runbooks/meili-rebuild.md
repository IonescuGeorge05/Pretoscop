# Runbook: rebuild the Meilisearch index

Meilisearch holds no primary data: everything in it is rebuilt from PostgreSQL (`docs/03` §6.6,
M14). Rebuild after a Meilisearch upgrade, a settings change, a corrupted volume, or when search
results disagree with the product pages.

```bash
cd /srv/pretoscop/prod
C="infra/scripts/compose.sh prod"   # docker compose for prod, with the deployed release
$C exec meilisearch curl -fsS http://localhost:7700/health          # {"status":"available"}
$C exec worker node --import tsx src/cli/search.ts rebuild --popularity   # M14: blue/green full rebuild
$C exec worker node --import tsx src/cli/search.ts status                 # document count, index sizes
```

If the volume is broken or the version jump needs a fresh store:

```bash
$C rm --stop --force meilisearch          # the volume cannot be removed while a container uses it
docker volume rm pretoscop-prod_meilidata
$C up -d --wait meilisearch
$C exec worker node --import tsx src/cli/search.ts rebuild --popularity
```

Search is degraded (empty results) until the rebuild finishes; product pages, history and
click-outs keep working because they read PostgreSQL. Upgrade Meilisearch by changing the image tag
in `infra/docker-compose.prod.yml` (pinned, `getmeili/meilisearch:v1.56.0`), on staging first, and
deploying with `RECREATE_DATA_SERVICES=1` (a normal deploy keeps the running container; `deploy.md`);
read the release notes for dump/upgrade requirements between versions.

The commands are M14's search CLI (`apps/worker/src/cli/search.ts`, on `mod/M14-search` until it is
merged; `packages/search/README.md`). The nightly `search.index` job does the same rebuild.
