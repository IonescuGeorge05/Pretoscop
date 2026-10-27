#!/usr/bin/env bash
# M00 — repo scaffold and dev environment.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

tmp="$(mktemp -d)"
cleanup() {
  [[ -n "${worker_pid:-}" ]] && kill "$worker_pid" 2>/dev/null || true
  [[ -n "${web_pid:-}" ]] && kill "$web_pid" 2>/dev/null || true
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

step "worker heartbeat"
LOG_PRETTY=false pnpm --filter @pretoscop/worker start >"$tmp/worker.log" 2>&1 &
worker_pid=$!
wait_for_log "$tmp/worker.log" '"msg":"heartbeat"' 60 || {
  cat "$tmp/worker.log"
  fail "worker did not log a heartbeat within 60 s"
}
ok "worker logged a heartbeat"
kill "$worker_pid" 2>/dev/null || true
unset worker_pid

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
