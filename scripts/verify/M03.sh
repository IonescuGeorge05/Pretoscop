#!/usr/bin/env bash
# M03 — extractors: structured data and feed mappers (no network, no database).
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

step "lint, typecheck, tests (@pretoscop/extractors)"
pnpm turbo run lint typecheck test --filter=@pretoscop/extractors --output-logs=errors-only
ok "extractors green (fixtures, snapshots, 100k-row streaming test)"

step "demo: eMAG listing fixture"
out="$(pnpm --silent --filter @pretoscop/extractors demo fixtures/emag/listing_2026-10-27.html)"
echo "$out" | head -6
echo "$out" | grep -q "emag-listing: 60 offers" || fail "expected 60 offers from the eMAG listing"
ok "60 offers with prices"

step "demo: eMAG product fixture (all sellers)"
out="$(pnpm --silent --filter @pretoscop/extractors demo fixtures/emag/product_2026-10-27.html)"
echo "$out" | grep -q "emag-product: 9 offers" || fail "expected 9 seller offers"
ok "9 seller offers"

echo
echo "OK"
