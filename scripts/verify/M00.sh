#!/usr/bin/env bash
# M00 — repo scaffold and dev environment.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

# The heartbeat check runs its worker on a throwaway database (the worker migrates it from empty),
# with its own search prefix, blob folder and metrics port, crawling and alert channels off: where
# another worker already serves the dev database (the recorder), that worker would take the
# heartbeat job, and a second worker must never share the recorder's queue.
M00_DB="${M00_DB:-pretoscop_m00}"
M00_METRICS_PORT="${M00_METRICS_PORT:-9467}"
M00_BLOBS="data/verify-m00"

tmp="$(mktemp -d)"
drop_m00() {
  MEILI_INDEX_PREFIX="${M00_DB}_" pnpm --silent --filter @pretoscop/worker search drop >/dev/null 2>&1 || true
  $COMPOSE exec -T postgres psql -U pretoscop -d postgres -q -c "DROP DATABASE IF EXISTS ${M00_DB} WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$M00_BLOBS"
}
stop_worker() {
  kill "$worker_pid" 2>/dev/null || true
  # On Windows the native node process outlives the killed Git Bash job: end it by its port.
  stop_port "$M00_METRICS_PORT"
  unset worker_pid
}
cleanup() {
  if [[ -n "${worker_pid:-}" ]]; then stop_worker; fi
  if [[ -n "${m00_db:-}" ]]; then drop_m00; fi
  if [[ -n "${web_pid:-}" ]]; then
    kill "$web_pid" 2>/dev/null || true
    stop_port 3999
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

step "toolchain"
node -e 'const [maj,min]=process.versions.node.split(".").map(Number); if (maj<22||(maj===22&&min<12)) {console.error("Node >= 22.12 required, found "+process.version); process.exit(1)}'
pnpm --version >/dev/null || fail "pnpm missing (npm i -g pnpm@10)"
ok "node $(node -v), pnpm $(pnpm -v)"

step "install"
pnpm install --frozen-lockfile >/dev/null
ok "dependencies installed"

ensure_services

step "lint, typecheck, tests"
pnpm turbo run lint typecheck test --output-logs=errors-only
ok "lint, typecheck and tests pass"

step "worker heartbeat (own database ${M00_DB}, crawling off)"
m00_db=1
drop_m00
$COMPOSE exec -T postgres createdb -U pretoscop "$M00_DB"
DATABASE_URL="postgres://pretoscop:pretoscop@localhost:5432/${M00_DB}" CRAWL_ENABLED=false \
  METRICS_PORT="$M00_METRICS_PORT" MEILI_INDEX_PREFIX="${M00_DB}_" BLOB_FS_ROOT="./${M00_BLOBS}" \
  TELEGRAM_BOT_TOKEN='' OPS_ALERT_TELEGRAM_BOT_TOKEN='' OPS_ALERT_EMAIL='' OPS_HEARTBEAT_URL='' \
  LOG_PRETTY=false pnpm --filter @pretoscop/worker start >"$tmp/worker.log" 2>&1 &
worker_pid=$!
wait_for_log "$tmp/worker.log" '"msg":"heartbeat"' 90 || {
  cat "$tmp/worker.log"
  fail "worker did not log a heartbeat within 90 s"
}
ok "worker migrated an empty database, synced the registry and logged a heartbeat"
stop_worker
drop_m00
unset m00_db

step "web shell (build + start on :3999)"
pnpm --filter @pretoscop/web build >"$tmp/web-build.log" 2>&1 || {
  tail -40 "$tmp/web-build.log"
  fail "next build failed"
}
(cd apps/web && pnpm exec next start --port 3999 >"$tmp/web.log" 2>&1) &
web_pid=$!
for _ in $(seq 1 30); do
  curl -fsS http://localhost:3999 >"$tmp/home.html" 2>/dev/null && break
  sleep 1
done
grep -q 'Pretoscop' "$tmp/home.html" || fail "home page did not render"
ok "placeholder page renders"

step "mailpit"
curl -fsS http://localhost:8025/api/v1/info >/dev/null || fail "Mailpit UI not reachable"
ok "Mailpit reachable on http://localhost:8025"

echo
echo "OK"
