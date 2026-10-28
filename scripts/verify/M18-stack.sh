#!/usr/bin/env bash
# M18 — local prod-like dress rehearsal (called by scripts/verify/M18.sh; runs alone too).
# Brings up the edge stack (Caddy, local CA) on :8080/:8443 and the production app stack (project
# pretoscop-m18test: PostgreSQL + pgBackRest sidecar, Meilisearch, migrate, two web replicas,
# worker) with MinIO standing in for R2, then exercises: deploy, health and metrics (every metric the
# alert rules and the dashboard use), base backup, WAL archiving and the repository's encryption, a
# point-in-time restore after an accidental DELETE, a disaster recovery into an empty volume, the
# weekly scratch restore test, backup retention, the logical dump to S3 and its restore test, a
# second deploy with a zero-downtime probe while a new database image waits, a rollback, the
# database image applied on request, a k6 load test, and an outage as uptime checks would see it.
# Every restore is checked against the rows and the newest price event recorded before it.
# Everything is torn down at the end (volumes included). The development stack (project
# `pretoscop`) is never touched; no port of it is used.
# Runs on Linux, macOS and Windows (Git Bash with Docker Desktop): host paths handed to Docker are
# converted with cygpath, and container paths in arguments are protected from MSYS path conversion.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

if is_windows; then
  host_path() { cygpath -m "$1"; }
  # Git Bash rewrites arguments that look like Unix paths (/app/..., /CN=...) for native programs.
  nopathconv() { (export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' && "$@"); }
else
  host_path() { printf '%s' "$1"; }
  nopathconv() { "$@"; }
fi

TAG_A="${M18_TAG_A:-m18-a}"
TAG_B="${M18_TAG_B:-m18-b}"
PROJECT=pretoscop-m18test
EDGE_PROJECT=pretoscop-m18test-edge
EDGE_NET=pretoscop-m18test-edge
BASE=https://localhost:8443
# Docker (Docker Desktop on Windows included) must see these paths: keep them in host form.
WORK="$(host_path "$(mktemp -d)")"
REPO="$(host_path "$PWD")"

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
# Prints a value from JSON on stdin: json '.slug' (a JavaScript property path, no jq needed).
json() { node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{let v;try{v=new Function("j","return j"+process.argv[1])(JSON.parse(s))}catch{v=undefined}console.log(v===undefined?"":typeof v==="object"?JSON.stringify(v):v)})' "$1"; }
# The rows that hold the price history and the newest price event: what every restore must bring back.
snapshot() {
  psql_app -c "SELECT format('shops=%s sources=%s offers=%s price_events=%s newest=%s', (SELECT count(*) FROM shops),
    (SELECT count(*) FROM shop_sources), (SELECT count(*) FROM offers), (SELECT count(*) FROM price_events),
    (SELECT offer_id || '@' || to_char(observed_at, 'YYYY-MM-DD HH24:MI:SS.US') || '=' || price FROM price_events
      ORDER BY observed_at DESC, offer_id DESC LIMIT 1))"
}
backups() { app exec -T pgbackrest pgbackrest info --output=json 2>/dev/null | json "[0].backup.filter((b)=>b.type===\"${1:-full}\"||\"${1:-}\"===\"any\").length"; }

PG_NEXT=pretoscop/pretoscop-postgres:18-m18next
cleanup() {
  local rc=$?
  if ((rc != 0)) && [[ "${M18_KEEP_ON_FAILURE:-0}" == "1" ]]; then
    echo "M18 stack kept for inspection (project ${PROJECT}, env ${ENV_FILE}); tear down with:"
    echo "  IMAGE_TAG=${TAG_A} docker compose -p ${PROJECT} -f infra/docker-compose.prod.yml -f infra/docker-compose.local-s3.yml --env-file ${ENV_FILE} down -v"
    echo "  EDGE_NETWORK=${EDGE_NET} docker compose -p ${EDGE_PROJECT} -f infra/docker-compose.edge.yml down -v; docker network rm ${EDGE_NET}"
    return
  fi
  if ((rc != 0)); then
    echo "--- last log lines (pgbackrest, postgres, worker, web-1) ---" >&2
    app logs --tail 25 pgbackrest postgres worker web-1 >&2 2>/dev/null || true
  fi
  rm -f "$WORK/probe.on"
  app --profile analytics down -v --remove-orphans >/dev/null 2>&1 || true
  edge down -v >/dev/null 2>&1 || true
  docker network rm "$EDGE_NET" >/dev/null 2>&1 || true
  for img in "pretoscop/pretoscop-web:${TAG_B}-prod" "pretoscop/pretoscop-worker:${TAG_B}" "$PG_NEXT"; do docker image rm "$img" >/dev/null 2>&1 || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

rand() { openssl rand -hex "${1:-24}"; }

step "TLS certificates for the MinIO stand-in (throwaway CA)"
mkdir -p "$WORK/certs"
(
  cd "$WORK/certs"
  nopathconv openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=pretoscop-m18-test-ca" -keyout ca.key -out ca.crt 2>/dev/null
  nopathconv openssl req -newkey rsa:2048 -nodes -subj "/CN=minio" -keyout private.key -out server.csr 2>/dev/null
  printf 'subjectAltName=DNS:minio,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' >ext.cnf
  openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 2 -extfile ext.cnf -out public.crt 2>/dev/null
  rm -f server.csr ext.cnf ca.srl ca.key
  chmod 644 ./*
)
[[ -s "$WORK/certs/public.crt" && -s "$WORK/certs/private.key" ]] || fail "certificates were not created"
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
ALERTS_SECRET=$(rand)
ZYTE_API_KEY=m18-worker-only-$(rand 8)
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
PLAUSIBLE_DOMAIN=stats.localhost
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

step "deploy.sh refuses unsafe configurations before touching anything"
refuses() {
  local env_name="$1" tag="$2" expect="$3" out
  shift 3
  printf '%s\n' "$@" >"$WORK/unsafe.env"
  if out="$(ENV_FILE="$WORK/unsafe.env" COMPOSE_PROJECT="${PROJECT}-unsafe" DEPLOY_HISTORY="$WORK/unsafe-history" \
    infra/scripts/deploy.sh "$env_name" "$tag" 2>&1)"; then
    fail "deploy.sh ${env_name} accepted: $*"
  fi
  grep -q "$expect" <<<"$out" || fail "deploy.sh ${env_name} refused for another reason: ${out}"
  [[ ! -e "$WORK/unsafe-history" ]] || fail "a refused deploy wrote a history line"
}
refuses staging "$TAG_A" 'staging must never crawl' DEPLOY_ENV=staging CRAWL_ENABLED=true
refuses prod "$TAG_A" 'needs BACKUPS_ENABLED=true' DEPLOY_ENV=prod PG_ARCHIVE_MODE=on BACKUPS_ENABLED=false
refuses staging "$TAG_A" 'wrong checkout' DEPLOY_ENV=prod
refuses prod "x;rm -rf /" 'invalid tag' DEPLOY_ENV=prod
ok "staging that crawls, WAL archiving without backups, the wrong checkout and a bad tag are refused"

step "images (${TAG_A}; ${TAG_B} is the same build under a second tag, to exercise deploy and rollback)"
# Built every run (Docker's layer cache makes an unchanged tree quick), so the rehearsal always tests
# the checked-out code. M18_REUSE_IMAGES=1 keeps images that already exist.
build() {
  local tag="$1" log="$WORK/build-${1//[^a-z0-9]/_}.log"
  shift
  if [[ "${M18_REUSE_IMAGES:-0}" == "1" ]] && docker image inspect "$tag" >/dev/null 2>&1; then return 0; fi
  docker build --progress=plain -t "$tag" "$@" . >"$log" 2>&1 || {
    tail -n 40 "$log" >&2
    fail "docker build of ${tag} failed"
  }
}
build pretoscop/pretoscop-postgres:18 -f infra/docker/postgres.Dockerfile
build "pretoscop/pretoscop-worker:${TAG_A}" -f infra/docker/worker.Dockerfile --build-arg APP_VERSION="$TAG_A"
build "pretoscop/pretoscop-web:${TAG_A}-prod" -f infra/docker/web.Dockerfile --build-arg APP_VERSION="$TAG_A" --build-arg PUBLIC_BASE_URL="$BASE"
docker tag "pretoscop/pretoscop-web:${TAG_A}-prod" "pretoscop/pretoscop-web:${TAG_B}-prod"
docker tag "pretoscop/pretoscop-worker:${TAG_A}" "pretoscop/pretoscop-worker:${TAG_B}"
ok "postgres+pgBackRest, worker and web images built from this checkout"

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

step "edge behaviour: HTTPS, redirect, headers, staging noindex, health; secrets kept from the web replicas"
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
curl -fsSk "$BASE/api/ready" | grep -q '"status":"ready"' || fail "/api/ready (the edge's readiness check) does not answer ready"
[[ -z "$(app exec -T web-1 printenv ZYTE_API_KEY || true)" ]] || fail "the web replicas can read a worker-only secret (ZYTE_API_KEY)"
[[ -n "$(app exec -T worker printenv ZYTE_API_KEY || true)" ]] || fail "the worker lost ZYTE_API_KEY"
ok "HTTPS + 308 + HSTS, staging noindex, /api/health ${TAG_A}; vendor keys reach the worker only"

step "licensed images: a file the worker stores in S3 is served by the web replicas under /media"
# A 1×1 PNG put by the worker's blob store (as Icecat and feed images are) and read back through
# Caddy and a web replica's S3 client; other prefixes (snapshots, backups) are never served.
nopathconv app exec -T worker node --import tsx --input-type=module -e "
  import { createBlobStore } from '@pretoscop/storage';
  import { getEnv } from '@pretoscop/config/env';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const blob = createBlobStore(getEnv());
  await blob.put('images/m18/pixel.png', png, 'image/png');
  await blob.put('backups/m18/secret.png', png, 'image/png');
" || fail "the worker could not write to the blob store"
media="$(curl -fsSk -D "$WORK/media.h" -o "$WORK/pixel.png" -w '%{size_download}' "$BASE/media/images/m18/pixel.png" || true)"
if [[ "$media" != "68" ]] || ! grep -qi '^content-type: image/png' "$WORK/media.h"; then fail "/media did not serve the image from S3 (${media:-no answer})"; fi
hidden="$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/media/backups/m18/secret.png")"
[[ "$hidden" == "404" ]] || fail "/media served a key outside images/ (HTTP ${hidden})"
ok "images/ served from S3 by the web replicas (68 bytes, image/png); backups/ refused (404)"

step "metrics: worker and Caddy expose every series the alert rules and the dashboard use"
metrics="$(app exec -T worker curl -fsS http://127.0.0.1:9464/metrics)"
grep -q "pretoscop_build_info{version=\"${TAG_A}\",app_env=\"prod\"} 1" <<<"$metrics" || fail "worker /metrics lacks build info"
grep -q '^pretoscop_pg_archive_mode_on 1' <<<"$metrics" || fail "worker /metrics: archive_mode should be on"
grep -q 'pretoscop_source_freshness_slo_seconds{' <<<"$metrics" || fail "worker /metrics lacks source freshness"
app exec -T worker curl -fsS http://127.0.0.1:9464/health | grep -q '"db":"ok"' || fail "worker /health not ok"
for _ in 1 2 3; do curl -sk -o /dev/null "$BASE/api/health"; done
caddy_metrics="$(edge exec -T caddy wget -qO- http://127.0.0.1:9180/metrics)"
# The scraper adds `job`, `instance` and `env` to every series; a metric carrying one of them itself
# would have it renamed to exported_* and stop matching the rules.
if grep -E '^[a-z_]+\{[^}]*\b(job|instance|env)="' <<<"$metrics"; then fail "worker metrics use a label the scraper overwrites"; fi
missing=""
mapfile -t used < <(grep -ohE '\b(pretoscop|nodejs|process|caddy)_[a-z0-9_]+' infra/monitoring/alerts.yml infra/monitoring/dashboard.json | sort -u)
for name in "${used[@]}"; do
  base="${name%_bucket}"
  grep -qE "^# TYPE (${name}|${base}) " <<<"${metrics}"$'\n'"${caddy_metrics}" || missing+=" ${name}"
done
[[ -z "$missing" ]] || fail "series used by alerts.yml/dashboard.json but not exported:${missing}"
ok "worker /health and /metrics, Caddy metrics; every series in alerts.yml and dashboard.json exists"

step "pgBackRest: stanza, first full backup, WAL archiving, encrypted repository"
n=0
for _ in $(seq 1 120); do
  n="$(backups full)"
  [[ "${n:-0}" -ge 1 ]] && break
  sleep 3
done
[[ "${n:-0}" -ge 1 ]] || fail "no base backup in the repository after 6 minutes"
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "pgbackrest check (archive_command) failed"
cipher="$(app exec -T pgbackrest pgbackrest info --output=json | json '[0].cipher')"
[[ "$cipher" == "aes-256-cbc" ]] || fail "repository cipher is '${cipher}', expected aes-256-cbc"
# What R2 would store: the repository's files must not be readable without the passphrase.
# shellcheck disable=SC2016 # expanded inside the MinIO container
magic="$(nopathconv app exec -T minio sh -c 'mc --config-dir /tmp/mc alias set l https://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --insecure >/dev/null && mc --config-dir /tmp/mc cat --insecure l/pretoscop-backups/pgbackrest/m18test/backup/pretoscop/backup.info | head -c 8')"
[[ "$magic" == "Salted__" ]] || fail "backup.info in the bucket is not encrypted (starts with '${magic}')"
ok "full backup in the S3 repository, encrypted client-side (aes-256-cbc, objects start with Salted__); WAL archiving checked"

step "test data: the product-page fixture (shops, offers, price history), used by the restores and k6"
fixture="$(nopathconv app exec -T worker node --import tsx /app/packages/db/src/cli/e2e-fixture.ts create | tail -n 1)"
slug="$(json '.slug' <<<"$fixture")"
pid="$(json '.productId' <<<"$fixture")"
[[ -n "$slug" && -n "$pid" ]] || fail "e2e fixture not created: ${fixture}"
before="$(snapshot)"
[[ "$before" =~ price_events=[1-9] ]] || fail "no price events to protect: ${before}"
ok "fixture product ${pid}: ${before}"

step "point-in-time restore after an accidental DELETE"
psql_app -c "CREATE TABLE m18_pitr (id int PRIMARY KEY, note text); INSERT INTO m18_pitr VALUES (1,'a'),(2,'b'),(3,'c');" >/dev/null
psql_app -c "SELECT pg_switch_wal()" >/dev/null
sleep 2
TARGET="$(psql_app -c "SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
sleep 2
psql_app -c "DELETE FROM price_events; DELETE FROM m18_pitr;" >/dev/null
psql_app -c "SELECT pg_switch_wal()" >/dev/null
[[ "$(snapshot)" =~ price_events=0 ]] || fail "the accident did not happen"
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "archive check after the accident failed"
infra/scripts/restore-pitr.sh prod --target "$TARGET" --yes
rows="$(psql_app -c 'SELECT count(*) FROM m18_pitr')"
[[ "$rows" == "3" ]] || fail "PITR to ${TARGET}: expected 3 rows back, found ${rows}"
after="$(snapshot)"
[[ "$after" == "$before" ]] || fail "PITR to ${TARGET} did not bring the price history back: before ${before}, after ${after}"
curl -fsSk "$BASE/api/health" | grep -q '"status":"ok"' || fail "site not healthy after the restore"
ok "restored to ${TARGET}: every deleted price event and row is back (${after}); site healthy; new full backup taken"

step "disaster recovery: the database volume is lost, restore the latest state into an empty volume"
psql_app -c "INSERT INTO m18_pitr VALUES (4, 'written after the PITR')" >/dev/null
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "archive check before the loss failed"
before="$(snapshot)"
app stop web-1 web-2 worker >/dev/null
app rm --stop --force postgres pgbackrest >/dev/null
docker volume rm "${PROJECT}_pgdata" >/dev/null
# infra/runbooks/restore.md, "The server is lost": an empty database first, then the restore.
app up -d --wait postgres >/dev/null
[[ "$(psql_app -c "SELECT to_regclass('public.price_events') IS NULL")" == "t" ]] || fail "the new volume is not empty"
app stop postgres >/dev/null
infra/scripts/restore-pitr.sh prod --yes
after="$(snapshot)"
[[ "$after" == "$before" ]] || fail "disaster recovery lost data: before ${before}, after ${after}"
[[ "$(psql_app -c 'SELECT count(*) FROM m18_pitr')" == "4" ]] || fail "disaster recovery: the last write before the loss is missing"
curl -fsSk "$BASE/api/health" | grep -q '"status":"ok"' || fail "site not healthy after the disaster recovery"
ok "empty volume → latest backup + all archived WAL: ${after}, including the last write"

step "weekly restore test (latest backup + WAL into a scratch directory, counts and newest event compared)"
app exec -T pgbackrest pgbackrest-sidecar restore-test >"$WORK/restore-test.log" 2>&1 || {
  grep -v 'INFO: restore file' "$WORK/restore-test.log" | tail -n 40
  fail "the weekly restore test failed"
}
passed="$(grep -o 'restore test passed.*' "$WORK/restore-test.log")"
n_events="${after#*price_events=}"
n_events="${n_events%% *}"
[[ "$passed" == *"price_events=${n_events}/${n_events} "* ]] || fail "restore test: expected all ${n_events} price events in the copy: ${passed}"
ok "${passed}"

step "scratch route of restore.md: a copy at a point in time, rows read back with pg_dump, no downtime"
SCRATCH_AT="$(psql_app -c "SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null
psql_app -c "INSERT INTO m18_pitr VALUES (5, 'written after the scratch target')" >/dev/null
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null
app exec -T pgbackrest pgbackrest-sidecar restore-scratch "$SCRATCH_AT" >"$WORK/scratch.log" 2>&1 || {
  tail -n 30 "$WORK/scratch.log"
  fail "restore-scratch failed"
}
copy="$(nopathconv app exec -T pgbackrest pg_dump -h /tmp/pgbackrest-scratch.sock -p 5498 -U pretoscop -d pretoscop --data-only -t m18_pitr)"
app exec -T pgbackrest pgbackrest-sidecar scratch-stop >/dev/null
grep -q 'written after the PITR' <<<"$copy" || fail "the scratch copy lacks a row written before ${SCRATCH_AT}"
if grep -q 'written after the scratch target' <<<"$copy"; then fail "the scratch copy has a row written after ${SCRATCH_AT}"; fi
[[ "$(psql_app -c 'SELECT count(*) FROM m18_pitr')" == "5" ]] || fail "the live database was touched by the scratch route"
psql_app -c "DELETE FROM m18_pitr WHERE id = 5" >/dev/null
ok "copy at ${SCRATCH_AT} read with pg_dump (the later row absent); the live database kept serving"

step "retention: a third full backup expires the oldest (PGBACKREST_REPO1_RETENTION_FULL=2)"
app exec -T pgbackrest pgbackrest-sidecar backup full >/dev/null
fulls="$(backups full)"
[[ "$fulls" == "2" ]] || fail "expected 2 full backups after expiry, found ${fulls}"
ok "2 full backups kept, older ones and their WAL expired"

step "nightly logical dump to S3 and its restore test (worker)"
app exec -T worker node --import tsx src/cli/backup.ts | tail -n 1
app exec -T worker node --import tsx src/cli/backup.ts --restore-test | tail -n 1
ok "pg_dump in the S3 bucket; restored into a scratch database and counted"

step "second deploy (${TAG_B}) under a zero-downtime probe, with a new database image waiting; then rollback"
# Every release tag rebuilds pretoscop-postgres:18; a release must never restart the database.
docker build -q --label org.pretoscop.m18-variant=next -f infra/docker/postgres.Dockerfile -t "$PG_NEXT" . >/dev/null
printf 'POSTGRES_IMAGE_TAG=%s\n' "${PG_NEXT##*:}" >>"$ENV_FILE"
pg_before="$(app ps -q postgres)"
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
SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/deploy.sh prod "$TAG_B" | tee "$WORK/deploy-b.log"
rm -f "$WORK/probe.on"
wait "$probe" || true
read -r total bad <"$WORK/probe.out"
echo "probe: ${total} requests during the deploy, ${bad} not 200"
((bad == 0)) || fail "${bad} of ${total} requests failed during the rolling deploy"
grep -q 'NOTE: postgres has a new image or new settings' "$WORK/deploy-b.log" || fail "deploy.sh did not report the waiting database image"
for svc in web-1 web-2; do grep -q "draining ${svc}" "$WORK/deploy-b.log" || fail "deploy.sh did not drain ${svc} before replacing it"; done
[[ "$(app ps -q postgres)" == "$pg_before" ]] || fail "the release restarted PostgreSQL"
SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/rollback.sh prod
curl -fsSk "$BASE/api/health" | grep -q "\"version\":\"${TAG_A}\"" || fail "rollback did not bring ${TAG_A} back"
[[ "$(app ps -q postgres)" == "$pg_before" ]] || fail "the rollback restarted PostgreSQL"
[[ "$(awk '$4 == "ok" { printf "%s ", $3 }' "$DEPLOY_HISTORY")" == "${TAG_A} ${TAG_B} ${TAG_A} " ]] || fail "unexpected deploy history: $(cat "$DEPLOY_HISTORY")"
ok "deploy ${TAG_B} with 0/${total} failed requests and the database untouched; rollback to ${TAG_A}"

step "the waiting database image, applied on request (RECREATE_DATA_SERVICES=1)"
RECREATE_DATA_SERVICES=1 SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/deploy.sh prod "$TAG_A" >/dev/null
[[ "$(app ps -q postgres)" != "$pg_before" ]] || fail "RECREATE_DATA_SERVICES=1 did not recreate PostgreSQL"
[[ "$(docker inspect -f '{{ .Config.Image }}' "$(app ps -q postgres)")" == "$PG_NEXT" ]] || fail "PostgreSQL does not run the new image"
app exec -T pgbackrest pgbackrest-sidecar check >/dev/null || fail "WAL archiving broken after the database image change"
[[ "$(snapshot)" == "$after" ]] || fail "data changed across the database image change"
ok "PostgreSQL and the sidecar on the new image; data and WAL archiving intact"

if [[ "${M18_ANALYTICS:-1}" == "1" ]]; then
  step "analytics profile: Plausible and its databases started by deploy.sh, served by the edge on the stats host"
  {
    echo "COMPOSE_PROFILES=analytics"
    echo "PLAUSIBLE_DB_PASSWORD=$(rand)"
    echo "PLAUSIBLE_SECRET_KEY_BASE=$(rand 48)"
  } >>"$ENV_FILE"
  SMOKE_URL="$BASE/api/health" SMOKE_CURL_OPTS=-k infra/scripts/deploy.sh prod "$TAG_A" >/dev/null
  state=""
  for _ in $(seq 1 60); do
    state="$(docker inspect -f '{{ .State.Health.Status }}' "$(app --profile analytics ps -q plausible)" 2>/dev/null || true)"
    [[ "$state" == "healthy" ]] && break
    sleep 5
  done
  [[ "$state" == "healthy" ]] || fail "Plausible did not become healthy (${state:-not running})"
  code="$(curl -sk -o "$WORK/script.js" -w '%{http_code}' --resolve stats.localhost:8443:127.0.0.1 https://stats.localhost:8443/js/script.js || true)"
  if [[ "$code" != "200" ]] || ! grep -q 'plausible' "$WORK/script.js"; then fail "Plausible script through the edge: HTTP ${code}"; fi
  [[ "$(app ps -q postgres)" != "" ]] || fail "the analytics deploy stopped PostgreSQL"
  ok "Plausible healthy; https://stats.localhost/js/script.js served through Caddy"
fi

step "load test: k6 through Caddy (cached product page, uncached history API)"
caddy_id="$(edge ps -q caddy)"
nopathconv docker run --rm --network "container:${caddy_id}" -v "${REPO}/scripts/perf:/perf:ro" grafana/k6:1.8.2 run --quiet \
  -e BASE=https://localhost:8443 -e SLUG="$slug" -e PRODUCT_ID="$pid" -e INSECURE=1 -e DURATION=15s /perf/prod-smoke.k6.js >"$WORK/k6.log" 2>&1 || {
  cat "$WORK/k6.log"
  fail "k6 thresholds not met"
}
grep -E 'http_req_waiting|http_req_failed|checks|✓|✗' "$WORK/k6.log" | head -n 12
ok "k6 thresholds met (cached p95 < 400 ms, uncached p95 < 1.5 s, errors < 1%)"

step "an outage as the uptime monitor sees it"
app stop web-1 web-2 >/dev/null
down="$(curl -sk -o /dev/null -m 30 -w '%{http_code}' "$BASE/api/health" || echo 000)"
[[ "$down" =~ ^(502|503|504)$ ]] || fail "with both replicas stopped, /api/health answered ${down}"
# `compose start` refuses (they depend on the one-shot migrate); up --no-deps starts them as they are.
app up -d --no-deps web-1 web-2 >/dev/null
for _ in $(seq 1 60); do
  curl -fsSk -o /dev/null "$BASE/api/health" && break
  sleep 2
done
curl -fsSk "$BASE/api/health" | grep -q '"status":"ok"' || fail "site did not come back"
ok "web down → ${down} at the edge (Better Stack alerts on it); back up after start"

echo
echo "M18 stack OK"
