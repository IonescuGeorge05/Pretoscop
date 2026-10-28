#!/usr/bin/env bash
# M23 — event reports: pure analysis with known answers, deterministic generator reconciled with
# SQL, public pages that publish only approved reports, and a run on the Phase-0 data.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint, typecheck, tests (report, db, worker incl. the generator test, web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/report --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web --output-logs=errors-only
ok "green (known answers; byte-identical output across runs; numbers reconcile with direct SQL)"

step "production build and Playwright (report pages)"
(cd apps/web && pnpm exec next build >/dev/null)
(cd apps/web && pnpm exec playwright test e2e/reports.spec.ts --reporter=line)
ok "pages green"

step "generator on the Phase-0 data (yesterday and today; nothing is published)"
FROM=$(node -e "const d=new Date(Date.now()-86400000);console.log(d.toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'}))")
TO=$(node -e "console.log(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'}))")
pnpm --silent --filter @pretoscop/worker report --from "$FROM" --to "$TO" --id phase0-check --title "Verificare M23 (date Phase 0)" --out data/reports | tail -3
ok "report in data/reports/phase0-check (unapproved)"

echo
echo "OK"
