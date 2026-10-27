#!/usr/bin/env bash
# M07 — matching v1: scorer/router unit tests, matcher integration tests (aliases, merges,
# idempotent re-run, storage conflicts), the labelled eval set and a dry run on real offers.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint, typecheck, unit + integration tests (core, db, worker)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/db --filter=@pretoscop/worker --output-logs=errors-only
ok "green (incl. alias precedence, idempotent re-run, no accept across storage/colour/model/edition)"

step "evaluation on the labelled pairs (packages/core/src/matching-eval/*.json)"
pnpm --silent --filter @pretoscop/worker match:eval || fail "eval thresholds not met"
ok "precision ≥ 98% on real labels, no accept across variants of one model"

step "dry run on real pending offers (writes nothing)"
pnpm --silent --filter @pretoscop/worker match:run --dry-run --limit 15 | tail -16
ok "dry run printed"

echo
echo "OK"
