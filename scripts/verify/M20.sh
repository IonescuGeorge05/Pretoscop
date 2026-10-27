#!/usr/bin/env bash
# M20 — merchant self-serve feed portal. Runs against its own database (pretoscop_m20), never the
# shared dev database: migrations, a worker and an end-to-end flow that approves a test merchant.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

DB_NAME="${M20_DB:-pretoscop_m20}"
export DATABASE_URL="postgres://pretoscop:pretoscop@localhost:5432/${DB_NAME}"
export E2E_PORT="${E2E_PORT:-3310}"
export M20_FEED_PORT="${M20_FEED_PORT:-3399}"
export ADMIN_EMAILS="${ADMIN_EMAILS:-admin@pretoscop.test}"
psql_m20() { $COMPOSE exec -T postgres psql -U pretoscop -d "$DB_NAME" -v ON_ERROR_STOP=1 -At "$@"; }

# Shared services are only started when missing and never recreated: a compose file that differs from
# the running containers' (another branch) must not restart PostgreSQL under the other agents.
step "services (postgres, meilisearch, mailpit): started if missing, never recreated"
for svc in postgres meilisearch mailpit; do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "pretoscop-${svc}-1" 2>/dev/null)" != "healthy" ]]; then
    $COMPOSE up -d --wait --no-recreate "$svc" >/dev/null 2>&1 || fail "could not start ${svc} (is Docker running?)"
  fi
done
ok "services healthy"

step "isolated database ${DB_NAME}: create if missing, migrate, seed, sync the registry"
if ! $COMPOSE exec -T postgres psql -U pretoscop -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  $COMPOSE exec -T postgres createdb -U pretoscop "$DB_NAME"
fi
pnpm --silent --filter @pretoscop/db migrate >/dev/null
pnpm --silent --filter @pretoscop/db seed >/dev/null
pnpm --silent --filter @pretoscop/worker shops:sync >/dev/null
[[ "$(psql_m20 -c "SELECT count(*) FROM information_schema.tables WHERE table_name = 'merchants'")" == "1" ]] || fail "merchants table missing"
ok "${DB_NAME} ready (merchants table present)"

PACKAGES=(--filter=@pretoscop/core --filter=@pretoscop/extractors --filter=@pretoscop/fetch --filter=@pretoscop/db
  --filter=@pretoscop/worker --filter=@pretoscop/config --filter=@pretoscop/web)
step "lint and typecheck (core, extractors, fetch, db, worker, config, web)"
pnpm turbo run lint typecheck "${PACKAGES[@]}" --concurrency=3 --output-logs=errors-only
ok "green"

# Each integration test file creates and migrates a throwaway database on the shared PostgreSQL:
# two packages at a time with two workers each keeps that load moderate.
step "unit + integration tests (same packages; two at a time, two workers each)"
pnpm turbo run test "${PACKAGES[@]}" --concurrency=2 --output-logs=errors-only -- --maxWorkers=2
ok "green"

step "production build (waits while another Next build runs on this machine: 8 GB of RAM)"
for ((i = 0; i < 120; i++)); do pgrep -f 'next build' >/dev/null || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "worker against ${DB_NAME}: every registry source killed; only portal feeds may run"
psql_m20 -c "UPDATE shop_sources SET kill_switch = true WHERE coalesce(config->>'origin', '') <> 'merchant'" >/dev/null
psql_m20 -c "UPDATE feature_flags SET enabled = true WHERE key IN ('crawl.enabled', 'merchants.portal.enabled')" >/dev/null
LOG_DIR="$(mktemp -d)"
WORKER_LOG="$LOG_DIR/worker.log"
(
  cd apps/worker
  export CRAWL_ENABLED=true FETCH_ALLOW_PRIVATE_HOSTS=true METRICS_PORT="${M20_METRICS_PORT:-9465}" \
    WEB_INTERNAL_URL="http://localhost:${E2E_PORT}" LOG_LEVEL=info
  exec ./node_modules/.bin/tsx src/index.ts
) >"$WORKER_LOG" 2>&1 &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true; wait "$WORKER_PID" 2>/dev/null || true' EXIT
wait_for_log "$WORKER_LOG" 'worker started' 90 || { tail -40 "$WORKER_LOG"; fail "worker did not start"; }
ok "worker running (pid $WORKER_PID, log $WORKER_LOG)"

step "Playwright: register → domain → feed check and preview → submit → admin approval → offers on the dashboard"
(cd apps/web && FETCH_ALLOW_PRIVATE_HOSTS=true pnpm exec playwright test e2e/merchant.spec.ts --project=desktop --reporter=line) || {
  tail -60 "$WORKER_LOG"
  fail "merchant e2e failed"
}
ok "e2e green"

echo
echo "OK"
