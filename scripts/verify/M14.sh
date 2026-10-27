#!/usr/bin/env bash
# M14 — search, category, brand and shop pages.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3210}"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null
curl -sf http://localhost:7700/health | grep -q available || fail "Meilisearch is not healthy on :7700"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port $PORT is busy: stop the server there (Playwright would reuse it without the e2e search index)"
fi

step "lint, typecheck, unit + integration tests (search, core, web, worker)"
# SEARCH_INTEGRATION=1: the Meilisearch relevance and sync tests must run, not skip.
SEARCH_INTEGRATION=1 pnpm turbo run lint typecheck test --concurrency=2 \
  --filter=@pretoscop/search --filter=@pretoscop/core --filter=@pretoscop/web --filter=@pretoscop/worker --output-logs=errors-only
ok "green: acceptance queries (televizor samsung 55, frigider, ps5, laptop asus 16gb, diacritics, \"televzor\"), facets, sync"

step "dev search index rebuilt from the dev database (read-only on the database)"
OUT=$(pnpm --silent --filter @pretoscop/worker search:rebuild | tail -1)
echo "$OUT"
DOCS=$(node -e "console.log(JSON.parse(process.argv[1]).documents)" "$OUT")
[ "$DOCS" -gt 0 ] || fail "the dev index has no documents"
ok "$DOCS products indexed"

step "the founder queries on the real catalogue"
for q in "televizor samsung 55" "iphone 17 pro 256" "ps5" "frigider side by side" "tigaie"; do
  pnpm --silent --filter @pretoscop/worker search query "$q" | head -4
done

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build (browse pages are ISR, rendered on first request: no database or index needed at build)"

step "Playwright e2e (mobile + desktop): autocomplete, results, facets, no-JS, category/brand/shop pages, suggest API"
(cd apps/web && E2E_PORT="$PORT" pnpm exec playwright test e2e/search.spec.ts --reporter=line)
ok "e2e green (fixture rows and the e2e_ indexes removed in teardown)"

echo
echo "OK"
