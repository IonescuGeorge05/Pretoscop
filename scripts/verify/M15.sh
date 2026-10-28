#!/usr/bin/env bash
# M15 — deals page and discount verdict UI.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3210}"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null
curl -sf http://localhost:7700/health | grep -q available || fail "Meilisearch is not healthy on :7700"
if port_in_use "$PORT"; then
  fail "port $PORT is busy: stop the server there (Playwright would reuse it without the e2e search index)"
fi

step "lint, typecheck, unit + integration tests (core badge rules, db getDeals, search documents, web)"
SEARCH_INTEGRATION=1 pnpm turbo run lint typecheck test --concurrency=2 \
  --filter=@pretoscop/core --filter=@pretoscop/db --filter=@pretoscop/search --filter=@pretoscop/web --output-logs=errors-only
ok "green: no badge under 14 days, 3% floor, 30-day reference before the drop, raise-then-cut and partial rebounds ignored, provisional excluded"

step "what /reduceri shows on the dev database (read-only)"
pnpm --silent --filter @pretoscop/worker deals:show | head -14

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build (/reduceri is ISR 15 min, rendered on first request)"

step "Playwright e2e (mobile + desktop): /reduceri, CSS-only filters with and without JavaScript, product-page badge, listings"
(cd apps/web && E2E_PORT="$PORT" pnpm exec playwright test e2e/deals.spec.ts --reporter=line)
ok "e2e green"

echo
echo "OK"
