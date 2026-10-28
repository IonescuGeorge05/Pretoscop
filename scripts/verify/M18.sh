#!/usr/bin/env bash
# M18 — production deployment, backups, monitoring, staging.
# Static checks first (tests, compose, shell, workflows, alert rules and their unit tests, proxy
# config, the .env.example contract), then the local prod-like dress rehearsal
# (scripts/verify/M18-stack.sh; skip it with M18_SKIP_STACK=1).
# The shared development stack (compose project `pretoscop`) is only read, never (re)created.
# Runs on Linux, macOS and Windows (Git Bash + Docker Desktop).
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

if is_windows; then
  host_path() { cygpath -m "$1"; }
  nopathconv() { (export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' && "$@"); }
else
  host_path() { printf '%s' "$1"; }
  nopathconv() { "$@"; }
fi
REPO="$(host_path "$PWD")"

step "development database for the integration tests (checked, not started or recreated)"
$COMPOSE exec -T postgres pg_isready -q -U pretoscop -d pretoscop || fail "dev PostgreSQL (project pretoscop) is not answering: run make services"
ok "dev PostgreSQL answers"

step "lint, typecheck, tests (worker ops/metrics/SLO/alerts, migrator lock, storage, config, web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/worker --filter=@pretoscop/db --filter=@pretoscop/storage \
  --filter=@pretoscop/config --filter=@pretoscop/web --output-logs=errors-only --concurrency=2
ok "green"

WORK="$(host_path "$(mktemp -d)")"
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
IMAGE_TAG=verify ENV_FILE="$WORK/prod.env" COMPOSE_PROFILES=monitoring,analytics docker compose -p m18verify-prod -f infra/docker-compose.prod.yml \
  --env-file "$WORK/prod.env" config --quiet || fail "the monitoring and analytics profiles do not render"
IMAGE_TAG=verify ENV_FILE="$WORK/prod.env" docker compose -p m18verify-local -f infra/docker-compose.prod.yml \
  -f infra/docker-compose.local-s3.yml --env-file "$WORK/prod.env" config --quiet || fail "local S3 overlay does not render"
docker compose -p m18verify-edge -f infra/docker-compose.edge.yml --env-file "$WORK/prod.env" config --quiet || fail "edge compose does not render"
staging_cfg="$(IMAGE_TAG=verify ENV_FILE="$WORK/staging.env" docker compose -p m18verify-staging -f infra/docker-compose.prod.yml \
  --env-file "$WORK/staging.env" config)"
grep -q 'archive_mode=off' <<<"$staging_cfg" || fail "staging must run with archive_mode=off"
prod_cfg="$(IMAGE_TAG=verify ENV_FILE="$WORK/prod.env" COMPOSE_PROFILES=monitoring,analytics docker compose -p m18verify-prod -f infra/docker-compose.prod.yml \
  --env-file "$WORK/prod.env" config --format json)"
# Every long-running service under an init process with an exec-form health check or none (incident.md §5).
# shellcheck disable=SC2016 # JavaScript, not shell
node -e '
  const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const bad = [];
  for (const [name, s] of Object.entries(c.services)) {
    if (s.restart === "no") continue;
    if (s.init !== true) bad.push(`${name}: no init`);
    if (s.healthcheck && s.healthcheck.test && s.healthcheck.test[0] !== "CMD") bad.push(`${name}: health check not exec form`);
  }
  for (const n of ["web-1", "web-2"]) {
    const e = c.services[n].environment;
    for (const k of ["ZYTE_API_KEY", "ANTHROPIC_API_KEY", "OPS_ALERT_TELEGRAM_BOT_TOKEN"]) if (e[k] !== "") bad.push(`${n}: ${k} not blanked`);
  }
  if (bad.length) { console.error(bad.join("\n")); process.exit(1); }' <<<"$prod_cfg" || fail "production services: init, health checks or web secrets wrong"
if grep -nE "CMD-SHELL" infra/docker-compose.prod.yml infra/docker-compose.edge.yml infra/docker-compose.local-s3.yml; then
  fail "shell-form health checks in the production compose files (use exec form, see incident.md §5)"
fi
ok "prod, staging (archive off), monitoring and analytics profiles, edge and local-S3 configurations valid; init + exec-form checks; web replicas without worker secrets"

step ".env.example documents every variable the app schema and the production compose files read"
# shellcheck disable=SC2016 # JavaScript, not shell
node -e '
  const fs = require("fs");
  const example = fs.readFileSync(".env.example", "utf8");
  const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const schema = fs.readFileSync("packages/config/src/env.ts", "utf8");
  const fromSchema = [...schema.matchAll(/^    ([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
  const compose = ["infra/docker-compose.prod.yml", "infra/docker-compose.edge.yml"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const fromCompose = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]);
  // Set by the scripts or only meaningful for local rehearsals / overrides, documented where they are used.
  const internal = new Set(["ENV_FILE", "BACKUP_ENV_FILE", "PGBACKREST_SIDECAR_MODE", "CADDY_METRICS_TARGET", "PROD_UPSTREAMS",
    "STAGING_UPSTREAMS", "PLAUSIBLE_UPSTREAM", "TRUSTED_PROXIES", "EDGE_HTTP_PORT", "EDGE_HTTPS_PORT", "CADDY_HTTP_PORT", "CADDY_HTTPS_PORT"]);
  const missing = [...new Set([...fromSchema, ...fromCompose])].filter((k) => !documented.has(k) && !internal.has(k));
  if (missing.length) { console.error("missing in .env.example: " + missing.join(", ")); process.exit(1); }
  console.log(`${fromSchema.length} schema variables and ${new Set(fromCompose).size} compose variables documented`);' ||
  fail ".env.example is incomplete (interface contract of M18)"
ok ".env.example complete"

step "shellcheck, actionlint, promtool (rules + unit tests), caddy validate, alloy fmt (pinned tool images)"
nopathconv docker run --rm -v "${REPO}:/mnt:ro" -w /mnt koalaman/shellcheck-alpine:v0.11.0 shellcheck -x \
  infra/scripts/deploy.sh infra/scripts/rollback.sh infra/scripts/restore-pitr.sh infra/scripts/compose.sh infra/scripts/lib.sh \
  infra/postgres/pgbackrest-sidecar.sh infra/server/bootstrap.sh scripts/verify/M18.sh scripts/verify/M18-stack.sh
nopathconv docker run --rm -v "${REPO}:/repo:ro" -w /repo rhysd/actionlint:1.7.7 -no-color .github/workflows/deploy.yml .github/workflows/ci.yml
nopathconv docker run --rm -v "${REPO}/infra/monitoring:/rules:ro" --entrypoint promtool prom/prometheus:v3.7.3 check rules /rules/alerts.yml >/dev/null
nopathconv docker run --rm -v "${REPO}/infra/monitoring:/rules:ro" --entrypoint promtool prom/prometheus:v3.7.3 test rules /rules/alerts.test.yml >"$WORK/promtool.log" 2>&1 || {
  cat "$WORK/promtool.log"
  fail "alert rule unit tests failed (infra/monitoring/alerts.test.yml)"
}
nopathconv docker run --rm -v "${REPO}/infra/caddy:/etc/caddy:ro" caddy:2.11.7-alpine caddy validate --config /etc/caddy/Caddyfile >"$WORK/caddy.log" 2>&1 || {
  cat "$WORK/caddy.log"
  fail "Caddyfile does not validate"
}
nopathconv docker run --rm -v "${REPO}/infra/monitoring:/cfg:ro" grafana/alloy:v1.21.2 fmt /cfg/config.alloy >/dev/null 2>&1 || fail "config.alloy does not parse"
node -e 'JSON.parse(require("fs").readFileSync("infra/monitoring/dashboard.json","utf8"))' || fail "dashboard.json is not JSON"
ok "scripts, workflows, alert rules (and their unit tests), Caddyfile, Alloy config and dashboard valid"

if [[ "${M18_SKIP_STACK:-0}" == "1" ]]; then
  echo "(M18_SKIP_STACK=1: local prod-like run skipped)"
else
  step "local prod-like run (edge + app stack + MinIO; about 15 minutes)"
  bash scripts/verify/M18-stack.sh
fi

echo
echo "OK"
