#!/usr/bin/env bash
# M01 — database schema v1 and migrations.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services

step "lint, typecheck, tests (@pretoscop/db: migrations on a throwaway database)"
pnpm turbo run lint typecheck test --filter=@pretoscop/db --filter=@pretoscop/worker --output-logs=errors-only
ok "db package green"

step "migrate + seed the dev database"
pnpm --filter @pretoscop/db migrate
pnpm --filter @pretoscop/db seed

step "checks in psql"
shops="$(psql_dev -c 'select count(*) from shops')"
[[ "$shops" -ge 2 ]] || fail "expected ≥2 shops, found $shops"
ok "shops: $shops"
parts="$(psql_dev -c "select count(*) from pg_inherits i join pg_class p on p.oid=i.inhparent where p.relname='price_events'")"
[[ "$parts" -ge 13 ]] || fail "expected ≥13 price_events partitions, found $parts"
next="$(psql_dev -c "select 'price_events_' || to_char(date_trunc('month', now()) + interval '1 month', 'YYYY_MM')")"
psql_dev -c "select to_regclass('public.$next') is not null" | grep -q t || fail "missing partition $next"
ok "price_events has $parts monthly partitions, next month ($next) exists"
psql_dev -c "select relkind from pg_class where relname='price_events'" | grep -q p || fail "price_events is not partitioned"
ok "price_events is a partitioned table"

echo
echo "OK"
