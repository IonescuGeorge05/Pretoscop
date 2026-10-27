#!/usr/bin/env bash
# M18 — production deployment, backups, monitoring, staging.
# Static checks first (tests, compose, shell, workflows, alert rules, proxy config), then the local
# prod-like dress rehearsal (scripts/verify/M18-stack.sh; skip it with M18_SKIP_STACK=1).
# The shared development stack (compose project `pretoscop`) is only read, never (re)created.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

step "development database for the integration tests (checked, not started or recreated)"
$COMPOSE exec -T postgres pg_isready -q -U pretoscop -d pretoscop || fail "dev PostgreSQL (project pretoscop) is not answering: run make services"
ok "dev PostgreSQL answers"

step "lint, typecheck, tests (worker ops/metrics/SLO/alerts, migrator lock, storage, config, web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/worker --filter=@pretoscop/db --filter=@pretoscop/storage \
  --filter=@pretoscop/config --filter=@pretoscop/web --output-logs=errors-only
ok "green"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

step "compose files render for production, staging, edge and the local S3 stand-in"
sed -e 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=verify/' -e 's/^MEILI_MASTER_KEY=.*/MEILI_MASTER_KEY=verify/' .env.example >"$WORK/prod.env"
cp "$WORK/prod.env" "$WORK/staging.env"
grep -E '^[A-Z0-9_]+=' infra/env/staging.env.example | sed -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=verify/' -e 's/^MEILI_MASTER_KEY=$/MEILI_MASTER_KEY=verify/' >>"$WORK/staging.env"
printf 'S3_ACCESS_KEY_ID=a\nS3_SECRET_ACCESS_KEY=b\nLOCAL_S3_CERTS_DIR=%s\n' "$WORK" >>"$WORK/prod.env"
for env in prod staging; do
  IMAGE_TAG=verify ENV_FILE="$WORK/${env}.env" docker compose -p "m18verify-${env}" -f infra/docker-compose.prod.yml \
    --env-file "$WORK/${env}.env" config --quiet || fail "docker-compose.prod.yml does not render for ${env}"
done
IMAGE_TAG=verify ENV_FILE="$WORK/prod.env" docker compose -p m18verify-local -f infra/docker-compose.prod.yml \
  -f infra/docker-compose.local-s3.yml --env-file "$WORK/prod.env" config --quiet || fail "local S3 overlay does not render"
docker compose -p m18verify-edge -f infra/docker-compose.edge.yml --env-file "$WORK/prod.env" config --quiet || fail "edge compose does not render"
staging_archive="$(IMAGE_TAG=verify ENV_FILE="$WORK/staging.env" docker compose -p m18verify-staging -f infra/docker-compose.prod.yml \
  --env-file "$WORK/staging.env" config | grep -c 'archive_mode=off' || true)"
[[ "$staging_archive" -ge 1 ]] || fail "staging must run with archive_mode=off"
if grep -nE "CMD-SHELL" infra/docker-compose.prod.yml infra/docker-compose.edge.yml infra/docker-compose.local-s3.yml; then
  fail "shell-form health checks in the production compose files (use exec form, see incident.md §5)"
fi
ok "prod, staging (archive off), edge and local-S3 configurations valid; exec-form health checks only"

step "shellcheck, actionlint, promtool, caddy validate, alloy fmt (pinned tool images)"
docker run --rm -v "$PWD:/mnt:ro" -w /mnt koalaman/shellcheck-alpine:stable shellcheck -x \
  infra/scripts/deploy.sh infra/scripts/rollback.sh infra/scripts/restore-pitr.sh infra/scripts/lib.sh \
  infra/postgres/pgbackrest-sidecar.sh infra/server/bootstrap.sh scripts/verify/M18.sh scripts/verify/M18-stack.sh
docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:1.7.7 -no-color .github/workflows/deploy.yml .github/workflows/ci.yml
docker run --rm -v "$PWD/infra/monitoring:/rules:ro" --entrypoint promtool prom/prometheus:v3.7.3 check rules /rules/alerts.yml >/dev/null
docker run --rm -v "$PWD/infra/caddy:/etc/caddy:ro" caddy:2.11.7-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 ||
  fail "Caddyfile does not validate"
docker run --rm -v "$PWD/infra/monitoring:/cfg:ro" grafana/alloy:v1.21.2 fmt /cfg/config.alloy >/dev/null 2>&1 || fail "config.alloy does not parse"
node -e 'JSON.parse(require("fs").readFileSync("infra/monitoring/dashboard.json","utf8"))' || fail "dashboard.json is not JSON"
ok "scripts, workflows, alert rules, Caddyfile, Alloy config and dashboard valid"

if [[ "${M18_SKIP_STACK:-0}" == "1" ]]; then
  echo "(M18_SKIP_STACK=1: local prod-like run skipped)"
else
  step "local prod-like run (edge + app stack + MinIO; about 10 minutes)"
  bash scripts/verify/M18-stack.sh
fi

echo
echo "OK"
