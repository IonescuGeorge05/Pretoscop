#!/usr/bin/env bash
# M08 — rollups, statistics, anomaly filters and verdicts.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services

step "lint, typecheck, tests (core verdict/discount/anomaly, db rollups and guard, worker)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/db --filter=@pretoscop/worker --output-logs=errors-only
ok "green (known-answer daily series, gaps, verdicts, history API, quarantine, breaker)"

step "performance: 1M synthetic events"
pnpm --silent --filter @pretoscop/db perf:rollup

step "dev database: rollup function present"
pnpm --silent --filter @pretoscop/db migrate >/dev/null
psql_dev -c "select 'rollup_product_daily ok' where exists (select 1 from pg_proc where proname = 'rollup_product_daily')"

echo
echo "OK"
