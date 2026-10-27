#!/usr/bin/env bash
# M04 — shop registry and configuration.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services

step "lint, typecheck, tests (@pretoscop/config registry + worker sync)"
pnpm turbo run lint typecheck test --filter=@pretoscop/config --filter=@pretoscop/worker --output-logs=errors-only
ok "registry validation and sync tests green"

step "migrate, then sync twice (second run must change nothing)"
pnpm --silent --filter @pretoscop/db migrate >/dev/null
pnpm --silent --filter @pretoscop/worker shops:sync >/dev/null
second="$(pnpm --silent --filter @pretoscop/worker shops:sync)"
echo "$second" | head -3
echo "$second" | grep -q "0 inserted, 0 updated" || fail "second sync was not a no-op"
ok "sync is idempotent"

step "registry in the database"
psql_dev -c "select slug || ' ' || status || ' ' || access_mode from shops order by 1" | column -c 160
emag_enabled="$(psql_dev -c "select count(*) from shop_sources s join shops p on p.id=s.shop_id where p.slug='emag' and s.enabled")"
ok "eMAG sources enabled in the YAML: $emag_enabled (runtime gate: flag source.emag.enabled)"

echo
echo "OK"
