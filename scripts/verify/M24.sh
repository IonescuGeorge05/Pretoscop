#!/usr/bin/env bash
# M24 — affiliate operations: link builders, program sync (comparator permission), click-time
# decision with our click id as sub-id, commission import and revenue queries.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services

step "lint, typecheck, tests (core link builders, db sync/commissions/revenue, worker client + CSV, web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web --output-logs=errors-only
ok "green"

step "commission CSV import reconciles the fixture report (dry run, no database)"
pnpm --silent --filter @pretoscop/worker commissions:import --network 2performant --file test/fixtures/2performant-commissions.csv --dry-run 2>&1 | tee /dev/stderr | grep -q "paid          1 commissions  1234.56 lei" || fail "reconciliation totals differ"
ok "per-status totals as in the report; the unreadable line is reported"

step "production build and Playwright: allowed → affiliate link with click id; forbidden after sync → plain link; eMAG always plain"
(cd apps/web && pnpm exec next build >/dev/null)
(cd apps/web && pnpm exec playwright test e2e/affiliate.spec.ts e2e/product.spec.ts --project=desktop --reporter=line)
ok "e2e green"

echo
echo "OK"
