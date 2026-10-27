#!/usr/bin/env bash
# M13 — product page, history API, click-out, cache invalidation.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"
BASE="http://localhost:$PORT"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint, typecheck, unit tests (web, db, worker)"
pnpm turbo run lint typecheck test --filter=@pretoscop/web --filter=@pretoscop/db --filter=@pretoscop/worker --output-logs=errors-only
ok "green"

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e (mobile + desktop): ranking by total, filters, summary order, 301, click-out, history API"
(cd apps/web && pnpm exec playwright test e2e/product.spec.ts --reporter=line)
ok "e2e green"

step "cache invalidation and cached TTFB (throwaway fixture product)"
FIXTURE=$(cd packages/db && pnpm exec tsx src/cli/e2e-fixture.ts create | tail -1)
SLUG=$(node -e "console.log(JSON.parse(process.argv[1]).slug)" "$FIXTURE")
PID=$(node -e "console.log(JSON.parse(process.argv[1]).productId)" "$FIXTURE")
LOG=$(mktemp)
(cd apps/web && PUBLIC_BASE_URL="$BASE" pnpm exec next start --port "$PORT" >"$LOG" 2>&1) &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  pkill -f "next start --port $PORT" 2>/dev/null || true
  (cd packages/db && pnpm exec tsx src/cli/e2e-fixture.ts drop >/dev/null) || true
}
trap cleanup EXIT
wait_for_log "$LOG" "Ready" 60 || fail "next start did not come up"

curl -s "$BASE/p/$SLUG" | grep -q '2.168,99' || fail "fixture page does not show the best total 2.168,99 lei"
TOKEN=$(grep -E '^REVALIDATE_TOKEN=' .env 2>/dev/null | cut -d= -f2- || true)
TOKEN="${TOKEN:-dev-only-insecure-secret-change-me}"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/revalidate" -H 'content-type: application/json' -d "{\"tags\":[\"product:$PID\"]}")
[ "$code" = 403 ] || fail "revalidate without token returned $code (want 403)"
# A price change that skips the worker: the cached page keeps the old price until the tag is revalidated.
psql_dev -c "UPDATE offers SET price = 2099.00, total_price = 2118.99 WHERE external_id = 'e2e-fixture-emag-mp'" >/dev/null
curl -s "$BASE/p/$SLUG" | grep -q '2.168,99' || fail "page was not served from the cache"
curl -s -X POST "$BASE/api/revalidate" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"tags\":[\"product:$PID\"]}" | grep -q '"revalidated":1' || fail "revalidate with token failed"
curl -s "$BASE/p/$SLUG" | grep -q '2.118,99' || fail "page still shows the old price after revalidation"
ok "cached page refreshed by tag product:$PID right after POST /api/revalidate"

RESULT=$(node scripts/perf/ttfb.mjs "$BASE/p/$SLUG" 200 8)
echo "$RESULT"
P95=$(node -e "console.log(JSON.parse(process.argv[1]).p95_ms)" "$RESULT")
node -e "process.exit(Number(process.argv[1]) < 400 ? 0 : 1)" "$P95" || fail "cached TTFB p95 ${P95} ms ≥ 400 ms"
ok "cached TTFB p95 ${P95} ms < 400 ms"

echo
echo "OK"
