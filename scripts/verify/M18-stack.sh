#!/usr/bin/env bash
# M18 — local prod-like dress rehearsal (called by scripts/verify/M18.sh; runs alone too).
# Brings up the edge stack (Caddy, local CA) on :8080/:8443 and the production app stack (project
# pretoscop-m18test: PostgreSQL + pgBackRest sidecar, Meilisearch, migrate, two web replicas,
# worker) with MinIO standing in for R2, then exercises: deploy, health and metrics, base backup
# and WAL archiving, a point-in-time restore after an accidental DELETE, the weekly scratch
# restore test, the logical dump to S3 and its restore test, a second deploy with a zero-downtime
# probe, a rollback, a k6 load test, and an outage as uptime checks would see it. Everything is
# torn down at the end (volumes included). The development stack (project `pretoscop`) is never
# touched; no port of it is used.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

TAG_A="${M18_TAG_A:-m18-a}"
TAG_B="${M18_TAG_B:-m18-b}"
PROJECT=pretoscop-m18test
EDGE_PROJECT=pretoscop-m18test-edge
EDGE_NET=pretoscop-m18test-edge
BASE=https://localhost:8443
WORK="$(mktemp -d)"

export ENV_FILE="$WORK/.env"
export BACKUP_ENV_FILE="$WORK/.env.backup"
export COMPOSE_PROJECT="$PROJECT"
export COMPOSE_EXTRA_FILES="infra/docker-compose.local-s3.yml"
export DEPLOY_HISTORY="$WORK/deploy-history"
export NO_PULL=1 PRUNE_IMAGES=0 DEPLOY_HEALTH_TIMEOUT=240
# For the compose calls made here directly (deploy.sh and rollback.sh set their own tag).
export IMAGE_TAG="$TAG_A" DEPLOY_ENV=prod

app() { docker compose -p "$PROJECT" -f infra/docker-compose.prod.yml -f infra/docker-compose.local-s3.yml --env-file "$ENV_FILE" "$@"; }
edge() { docker compose -p "$EDGE_PROJECT" -f infra/docker-compose.edge.yml --env-file "$ENV_FILE" "$@"; }
psql_app() { app exec -T postgres psql -X -v ON_ERROR_STOP=1 -At -U pretoscop -d pretoscop "$@"; }

cleanup() {
  local rc=$?
  if ((rc != 0)) && [[ "${M18_KEEP_ON_FAILURE:-0}" == "1" ]]; then
    echo "M18 stack kept for inspection (project ${PROJECT}, env ${ENV_FILE}); tear down with:"
    echo "  IMAGE_TAG=${TAG_A} docker compose -p ${PROJECT} -f infra/docker-compose.prod.yml -f infra/docker-compose.local-s3.yml --env-file ${ENV_FILE} down -v"
    echo "  EDGE_NETWORK=${EDGE_NET} docker compose -p ${EDGE_PROJECT} -f infra/docker-compose.edge.yml down -v; docker network rm ${EDGE_NET}"
    return
  fi
  rm -f "$WORK/probe.on"
  app down -v --remove-orphans >/dev/null 2>&1 || true
  edge down -v >/dev/null 2>&1 || true
  docker network rm "$EDGE_NET" >/dev/null 2>&1 || true
  for img in pretoscop-web:"$TAG_B"-prod pretoscop-worker:"$TAG_B"; do docker image rm "pretoscop/${img}" >/dev/null 2>&1 || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

rand() { openssl rand -hex "${1:-24}"; }

step "TLS certificates for the MinIO stand-in (throwaway CA)"
mkdir -p "$WORK/certs"
(
  cd "$WORK/certs"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=pretoscop-m18-test-ca" -keyout ca.key -out ca.crt 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -subj "/CN=minio" -keyout private.key -out server.csr 2>/dev/null
  printf 'subjectAltName=DNS:minio,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' >ext.cnf
  openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 2 -extfile ext.cnf -out public.crt 2>/dev/null
  rm -f server.csr ext.cnf ca.srl ca.key
  chmod 644 ./*
)
ok "CA and server certificate for minio"

S3_KEY=m18test
S3_SECRET="$(rand 20)"
cat >"$ENV_FILE" <<EOF
APP_ENV=prod
DEPLOY_ENV=prod
LOG_LEVEL=info
IMAGE_REGISTRY=pretoscop
POSTGRES_PASSWORD=$(rand)
MEILI_MASTER_KEY=$(rand)
BETTER_AUTH_SECRET=$(rand)
REVALIDATE_TOKEN=$(rand)
HASH_SALT_SECRET=$(rand)
PUBLIC_BASE_URL=${BASE}
SITE_INDEXABLE=false
CRAWL_ENABLED=false
MAIL_DRIVER=log
BLOB_DRIVER=s3
S3_ENDPOINT=https://minio:9000
S3_REGION=us-east-1
S3_BUCKET=pretoscop-blobs
S3_ACCESS_KEY_ID=${S3_KEY}
S3_SECRET_ACCESS_KEY=${S3_SECRET}
BACKUPS_ENABLED=true
PG_ARCHIVE_MODE=on
PG_SHARED_BUFFERS=128MB
PG_EFFECTIVE_CACHE_SIZE=512MB
PG_WORK_MEM=8MB
PG_MAINTENANCE_WORK_MEM=64MB
PG_SHM_SIZE=256m
WEB_MEMORY_LIMIT=512m
WORKER_MEMORY_LIMIT=768m
MEILI_MEMORY_LIMIT=512m
EDGE_NETWORK=${EDGE_NET}
SITE_DOMAIN=localhost
STAGING_DOMAIN=staging.localhost
CADDY_TLS=internal
TRUSTED_PROXIES=private_ranges
EDGE_HTTP_PORT=8080
EDGE_HTTPS_PORT=8443
CADDY_HTTP_PORT=8080
CADDY_HTTPS_PORT=8443
LOCAL_S3_CERTS_DIR=${WORK}/certs
EOF
cat >"$BACKUP_ENV_FILE" <<EOF
PGBACKREST_REPO1_TYPE=s3
PGBACKREST_REPO1_PATH=/pgbackrest/m18test
PGBACKREST_REPO1_S3_BUCKET=pretoscop-backups
PGBACKREST_REPO1_S3_ENDPOINT=minio
PGBACKREST_REPO1_STORAGE_PORT=9000
PGBACKREST_REPO1_S3_REGION=us-east-1
PGBACKREST_REPO1_S3_KEY=${S3_KEY}
PGBACKREST_REPO1_S3_KEY_SECRET=${S3_SECRET}
PGBACKREST_REPO1_S3_URI_STYLE=path
PGBACKREST_REPO1_RETENTION_FULL=2
PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc
PGBACKREST_REPO1_CIPHER_PASS=$(rand 32)
PGBACKREST_COMPRESS_TYPE=zst
PGBACKREST_START_FAST=y
PGBACKREST_PROCESS_MAX=2
EOF

step "images (${TAG_A}; ${TAG_B} is the same build under a second tag, to exercise deploy and rollback)"
have() { docker image inspect "$1" >/dev/null 2>&1; }
if [[ "${M18_REBUILD:-0}" == "1" ]] || ! have "pretoscop/pretoscop-postgres:18"; then
  docker build -q -f infra/docker/postgres.Dockerfile -t pretoscop/pretoscop-postgres:18 . >/dev/null
fi
if [[ "${M18_REBUILD:-0}" == "1" ]] || ! have "pretoscop/pretoscop-worker:${TAG_A}"; then
  docker build -q -f infra/docker/worker.Dockerfile --build-arg APP_VERSION="$TAG_A" -t "pretoscop/pretoscop-worker:${TAG_A}" . >/dev/null
fi
if [[ "${M18_REBUILD:-0}" == "1" ]] || ! have "pretoscop/pretoscop-web:${TAG_A}-prod"; then
  docker build -q -f infra/docker/web.Dockerfile --build-arg APP_VERSION="$TAG_A" --build-arg PUBLIC_BASE_URL="$BASE" \
    -t "pretoscop/pretoscop-web:${TAG_A}-prod" . >/dev/null
fi
docker tag "pretoscop/pretoscop-web:${TAG_A}-prod" "pretoscop/pretoscop-web:${TAG_B}-prod"
docker tag "pretoscop/pretoscop-worker:${TAG_A}" "pretoscop/pretoscop-worker:${TAG_B}"
ok "postgres+pgBackRest, worker and web images present"

step "edge stack (Caddy with its local CA) on :8080 and :8443"
docker network create "$EDGE_NET" >/dev/null
edge up -d --wait >/dev/null
ok "caddy up"

step "MinIO standing in for R2"
app up -d --wait minio >/dev/null
app --profile setup run --rm minio-buckets >/dev/null
ok "minio up (TLS, buckets pretoscop-blobs and pretoscop-backups)"

step "deploy ${TAG_A}"
SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/deploy.sh prod "$TAG_A"
ok "deployed ${TAG_A}"

step "edge behaviour: HTTPS, redirect, headers, staging noindex, health, metrics"
home="$(curl -fsSk "$BASE/")"
[[ "$home" == *Pretoscop* ]] || fail "home page through Caddy does not render"
redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:8080/p/x)"
# Locally Caddy leaves the non-standard port out of its redirect; in production it is 80 → 443.
[[ "$redirect" =~ ^308\ https://localhost(:8443)?/p/x$ ]] || fail "http → https redirect wrong: ${redirect}"
headers="$(curl -sSk -D - -o /dev/null "$BASE/")"
grep -qi '^strict-transport-security: max-age=31536000' <<<"$headers" || fail "HSTS header missing"
grep -qi '^server:' <<<"$headers" && fail "Server header leaks"
grep -qi '^x-content-type-options: nosniff' <<<"$headers" || fail "security headers from next.config missing"
staging="$(curl -sSk -D - -o /dev/null --resolve staging.localhost:8443:127.0.0.1 https://staging.localhost:8443/ || true)"
grep -qi '^x-robots-tag: noindex, nofollow' <<<"$staging" || fail "staging host is not marked noindex"
health="$(curl -fsSk "$BASE/api/health")"
[[ "$health" == *'"status":"ok"'* && "$health" == *"\"version\":\"${TAG_A}\""* ]] || fail "unexpected /api/health: ${health}"
metrics="$(app exec -T worker curl -fsS http://127.0.0.1:9464/metrics)"
grep -q "pretoscop_build_info{version=\"${TAG_A}\",app_env=\"prod\"} 1" <<<"$metrics" || fail "worker /metrics lacks build info"
grep -q '^pretoscop_pg_archive_mode_on 1' <<<"$metrics" || fail "worker /metrics: archive_mode should be on"
grep -q 'pretoscop_source_freshness_slo_seconds{' <<<"$metrics" || fail "worker /metrics lacks source freshness"
app exec -T worker curl -fsS http://127.0.0.1:9464/health | grep -q '"db":"ok"' || fail "worker /health not ok"
edge exec -T caddy wget -qO- http://127.0.0.1:9180/metrics | grep -q 'caddy_http_requests_total' || fail "caddy metrics missing"
ok "HTTPS + 308 + HSTS, staging noindex, /api/health ${TAG_A}, worker and Caddy metrics"

step "pgBackRest: stanza, first full backup, WAL archiving"
for _ in $(seq 1 120); do
  n="$(app exec -T pgbackrest pgbackrest info --output=json 2>/dev/null | jq '[.[0].backup[]?] | length' 2>/dev/null || echo 0)"
  [[ "$n" -ge 1 ]] && break
  sleep 3
done
[[ "${n:-0}" -ge 1 ]] || {
  app logs --tail 60 pgbackrest
  fail "no base backup in the repository after 6 minutes"
}
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "pgbackrest check (archive_command) failed"
ok "full backup in the S3 repository (encrypted), WAL archiving checked"

step "point-in-time restore after an accidental DELETE"
psql_app -c "CREATE TABLE m18_pitr (id int PRIMARY KEY, note text); INSERT INTO m18_pitr VALUES (1,'a'),(2,'b'),(3,'c');" >/dev/null
psql_app -c "SELECT pg_switch_wal()" >/dev/null
sleep 2
TARGET="$(psql_app -c "SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
sleep 2
psql_app -c "DELETE FROM m18_pitr" >/dev/null
psql_app -c "SELECT pg_switch_wal()" >/dev/null
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "archive check after the accident failed"
infra/scripts/restore-pitr.sh prod --target "$TARGET" --yes
rows="$(psql_app -c 'SELECT count(*) FROM m18_pitr')"
[[ "$rows" == "3" ]] || fail "PITR to ${TARGET}: expected 3 rows back, found ${rows}"
curl -fsSk "$BASE/api/health" | grep -q '"status":"ok"' || fail "site not healthy after the restore"
ok "restored to ${TARGET}: the 3 deleted rows are back; site healthy; new full backup taken"

step "weekly restore test (latest backup + WAL into a scratch directory)"
app exec -T pgbackrest pgbackrest-sidecar restore-test | tail -n 3
ok "restore test passed"

step "nightly logical dump to S3 and its restore test (worker)"
app exec -T worker node --import tsx src/cli/backup.ts | tail -n 1
app exec -T worker node --import tsx src/cli/backup.ts --restore-test | tail -n 1
ok "pg_dump in the S3 bucket; restored into a scratch database and counted"

step "second deploy (${TAG_B}) under a zero-downtime probe, then rollback"
touch "$WORK/probe.on"
(
  total=0 bad=0
  while [[ -f "$WORK/probe.on" ]]; do
    code="$(curl -sk -o /dev/null -m 5 -w '%{http_code}' "$BASE/api/health" || echo 000)"
    total=$((total + 1))
    [[ "$code" == "200" ]] || bad=$((bad + 1))
    sleep 0.2
  done
  echo "$total $bad" >"$WORK/probe.out"
) &
probe=$!
SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/deploy.sh prod "$TAG_B"
rm -f "$WORK/probe.on"
wait "$probe" || true
read -r total bad <"$WORK/probe.out"
echo "probe: ${total} requests during the deploy, ${bad} not 200"
((bad == 0)) || fail "${bad} of ${total} requests failed during the rolling deploy"
SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/rollback.sh prod
curl -fsSk "$BASE/api/health" | grep -q "\"version\":\"${TAG_A}\"" || fail "rollback did not bring ${TAG_A} back"
[[ "$(awk '$4 == "ok" { printf "%s ", $3 }' "$DEPLOY_HISTORY")" == "${TAG_A} ${TAG_B} ${TAG_A} " ]] || fail "unexpected deploy history: $(cat "$DEPLOY_HISTORY")"
ok "deploy ${TAG_B} with 0/${total} failed requests; rollback to ${TAG_A}"

step "load test: k6 through Caddy (cached product page, uncached history API)"
fixture="$(app exec -T worker node --import tsx /app/packages/db/src/cli/e2e-fixture.ts create | tail -n 1)"
slug="$(jq -r .slug <<<"$fixture")"
pid="$(jq -r .productId <<<"$fixture")"
caddy_id="$(edge ps -q caddy)"
docker run --rm --network "container:${caddy_id}" -v "$PWD/scripts/perf:/perf:ro" grafana/k6:1.8.2 run --quiet \
  -e BASE=https://localhost:8443 -e SLUG="$slug" -e PRODUCT_ID="$pid" -e INSECURE=1 -e DURATION=15s /perf/prod-smoke.k6.js 2>&1 |
  grep -E 'http_req_waiting|http_req_failed|checks|✓|✗' | head -n 12
ok "k6 thresholds met (cached p95 < 400 ms, uncached p95 < 1.5 s, errors < 1%)"

step "an outage as the uptime monitor sees it"
app stop web-1 web-2 >/dev/null
down="$(curl -sk -o /dev/null -m 30 -w '%{http_code}' "$BASE/api/health" || echo 000)"
[[ "$down" =~ ^(502|503|504)$ ]] || fail "with both replicas stopped, /api/health answered ${down}"
app start web-1 web-2 >/dev/null
for _ in $(seq 1 60); do
  curl -fsSk -o /dev/null "$BASE/api/health" && break
  sleep 2
done
curl -fsSk "$BASE/api/health" | grep -q '"status":"ok"' || fail "site did not come back"
ok "web down → ${down} at the edge (Better Stack alerts on it); back up after start"

echo
echo "M18 stack OK"
