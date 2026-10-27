#!/usr/bin/env bash
# M19 — accounts and price alerts.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "migration 0014 (alerts, alert_sends, consent_records, email_suppressions) on the dev database"
[ "$(psql_dev -c "SELECT to_regclass('public.alerts') IS NOT NULL AND to_regclass('public.alert_sends') IS NOT NULL AND to_regclass('public.consent_records') IS NOT NULL AND to_regclass('public.email_suppressions') IS NOT NULL")" = t ] || fail "alert tables missing"
ok "tables present"

step "lint, typecheck, unit + integration tests (core rules, notify templates, db queries, worker delivery, web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/notify --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web --filter=@pretoscop/config --concurrency=3 --output-logs=errors-only
ok "green"

step "simulation CLI refuses bad input (it never writes price history)"
if pnpm --silent alerts:simulate 0 0 >/dev/null 2>&1; then fail "alerts:simulate accepted product 0"; fi
ok "usage enforced"

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e: consent, double opt-in, drop email with List-Unsubscribe, dedupe, unsubscribe, one-click POST, account export/delete, no-JS form"
# Own fixture only (E2E_SHARED_FIXTURE=0): never recreates the product another run is testing.
(cd apps/web && E2E_SHARED_FIXTURE=0 E2E_PORT="$PORT" pnpm exec playwright test e2e/alerts.spec.ts --project=desktop --workers=1 --reporter=line)
ok "e2e green"

step "no test data left behind"
left=$(psql_dev -c "SELECT (SELECT count(*) FROM users WHERE email LIKE 'alerte-e2e-%') + (SELECT count(*) FROM offers WHERE external_id LIKE 'e2e-fixture-alerts-%')")
[ "$left" = 0 ] || fail "the alert e2e left $left rows"
ok "clean"

echo
echo "OK"
