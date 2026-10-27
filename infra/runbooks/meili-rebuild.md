# Runbook: rebuild the Meilisearch index

Meilisearch holds no primary data: everything in it is rebuilt from PostgreSQL (`docs/03` §6.6,
M14). Rebuild after a Meilisearch upgrade, a settings change, a corrupted volume, or when search
results disagree with the product pages.

```bash
cd /srv/pretoscop/prod
C="docker compose -p pretoscop-prod -f infra/docker-compose.prod.yml --env-file .env"
$C exec meilisearch curl -fsS http://localhost:7700/health          # {"status":"available"}
$C exec worker node --import tsx src/cli/search-reindex.ts --full   # M14's full rebuild (name per M14's README)
```

If the volume is broken or the version jump needs a fresh store:

```bash
$C stop meilisearch
docker volume rm pretoscop-prod_meilidata
$C up -d --wait meilisearch
$C exec worker node --import tsx src/cli/search-reindex.ts --full
```

Search is degraded (empty results) until the rebuild finishes; product pages, history and
click-outs keep working because they read PostgreSQL. Upgrade Meilisearch by changing the image tag
in `infra/docker-compose.prod.yml` (pinned, `getmeili/meilisearch:v1.56.0`), on staging first; read
the release notes for dump/upgrade requirements between versions.

The exact CLI of the rebuild belongs to M14 (search); check `packages/search/README.md` once M14 is
merged and update the command above if it differs.
