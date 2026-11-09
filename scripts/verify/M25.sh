#!/usr/bin/env bash
# M25 — promoted placements and merchant billing; optional ad slot. Everything runs against local
# stand-ins: a Stripe mock (`@pretoscop/payments/testing`) started by the e2e, test-mode keys made up
# for the run. No request goes to Stripe or Google.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"
PROMOTED_FLAGS="'promoted.enabled','ads.slots.enabled'"
# Playwright starts (and stops) its own web server and the spec its Stripe mock (PORT + 1).
trap 'stop_port "$PORT"; stop_port "$((PORT + 1))"' EXIT

# True while another `next build` runs on this machine (one production build at a time: RAM).
next_build_running() {
  if is_windows; then
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1 >/dev/null 2>&1
  else
    pgrep -f 'next build' >/dev/null 2>&1
  fi
}

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "the promoted migration (00xx_promoted) on the dev database ($DEV_DB) and an unbroken snapshot chain"
[ "$(psql_dev -c "SELECT to_regclass('public.placements') IS NOT NULL AND to_regclass('public.placement_floors') IS NOT NULL AND to_regclass('public.merchant_wallets') IS NOT NULL AND to_regclass('public.wallet_ledger') IS NOT NULL AND to_regclass('public.wallet_topups') IS NOT NULL AND to_regclass('public.promoted_clicks') IS NOT NULL")" = t ] || fail "promoted tables missing"
[ "$(psql_dev -c "SELECT count(*) FROM pg_constraint WHERE conname IN ('merchant_wallets_balance_ck','wallet_ledger_sign_ck','promoted_clicks_status_ck','wallet_topups_amount_ck')")" = 4 ] || fail "money CHECK constraints missing"
[ "$(psql_dev -c "SELECT count(*) FROM pg_indexes WHERE indexname IN ('promoted_clicks_once_uq','wallet_ledger_ref_uq','wallet_topups_external_uq','placements_live_uq')")" = 4 ] || fail "uniqueness guards missing"
node -e "
const fs = require('fs');
const dir = 'packages/db/migrations/meta';
const j = JSON.parse(fs.readFileSync(dir + '/_journal.json', 'utf8'));
let prev = null, when = 0;
for (const e of j.entries) {
  const snap = JSON.parse(fs.readFileSync(dir + '/' + e.tag.slice(0, 4) + '_snapshot.json', 'utf8'));
  if (prev !== null && snap.prevId !== prev) { console.error('snapshot chain broken at ' + e.tag); process.exit(1); }
  if (e.when <= when) { console.error('journal timestamps not increasing at ' + e.tag); process.exit(1); }
  prev = snap.id; when = e.when;
}
if (!j.entries.some((e) => /_promoted$/.test(e.tag))) { console.error('no promoted migration in the journal'); process.exit(1); }
" || fail "migration metadata"
ok "tables, CHECKs and unique guards present; journal and snapshots chained"

step "feature flags: created off, and off in this database unless someone turned them on"
grep -q "values({ key, enabled: false, description })" packages/db/src/queries/flags.ts || fail "ensureKnownFlags no longer creates flags switched off"
grep -q "'ads.slots.enabled'" packages/db/src/queries/flags.ts || fail "ads.slots.enabled is not a known flag"
on=$(psql_dev -c "SELECT coalesce(string_agg(key, ', '), '') FROM feature_flags WHERE key IN ($PROMOTED_FLAGS) AND enabled")
if [ -n "$on" ]; then printf 'note: switched on in %s: %s\n' "$DEV_DB" "$on"; fi
ok "new flags are created off"

step "no Stripe or AdSense credentials in git"
if git grep -nE '(sk|rk)_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{24,}' -- . ':!pnpm-lock.yaml' >/dev/null; then fail "something that looks like a live Stripe key or a real webhook secret is committed"; fi
if git grep -nE '^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_ADSENSE_CLIENT)=[^[:space:]]+$' -- . >/dev/null; then fail "a Stripe key, webhook secret or AdSense id has a value in a tracked file"; fi
ok "placeholders only"

step "the ranking is not touched: the product loader's ORDER BY and rank are unchanged, and nothing promoted is imported by it"
grep -q "mapped.sort((a, b) => rank(a) - rank(b) || Number(a.total) - Number(b.total) || b.lastCheckedAt.localeCompare(a.lastCheckedAt));" apps/web/src/lib/product.ts || fail "the published ranking line changed"
if grep -qi "promot" apps/web/src/lib/product.ts apps/web/src/components/product/offers-table.tsx; then fail "the offers loader or table references promotion"; fi
ok "ranking code untouched"

step "lint, typecheck, unit + integration tests (core auction and billing rules; db billing under concurrency, wallets, statement; payments against the Stripe mock; config; worker jobs; web CSP)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/db --filter=@pretoscop/payments --filter=@pretoscop/config --filter=@pretoscop/worker --filter=@pretoscop/web --concurrency=2 --output-logs=errors-only
ok "green"

step "production build without an AdSense id (waits while another Next build runs on this machine)"
# Prerendered pages embed PUBLIC_BASE_URL: build with the URL the e2e server runs on. The ad id is
# unset on purpose: this build's CSP must not let any ad origin in (the e2e checks the header).
export PUBLIC_BASE_URL="http://localhost:${PORT}"
unset NEXT_PUBLIC_ADSENSE_CLIENT NEXT_PUBLIC_ADSENSE_SLOT
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e: terms → Stripe Checkout top-up (VAT) → signed webhook credits once → campaign → labelled slot, list unchanged → billed once per session → cap stops display → bots/prefetch/no referer never billed → merchant and admin numbers, refund, CSV; ad slot absent without the build id"
flags_on() { psql_dev -c "SELECT coalesce(string_agg(key, ',' ORDER BY key), '') FROM feature_flags WHERE key IN ($PROMOTED_FLAGS) AND enabled"; }
flags_before=$(flags_on)
(cd apps/web && pnpm exec playwright test e2e/promoted.spec.ts --project=desktop --workers=1 --reporter=line)
ok "promoted flow green"

step "regression e2e: product page and click-out (M13), affiliate links (M24), legal and trust pages (M17), SEO and the product-page JS budget (M16)"
# One worker: affiliate.spec switches forit's program and the flag on for a while, which product.spec must not see.
(cd apps/web && pnpm exec playwright test e2e/product.spec.ts e2e/affiliate.spec.ts e2e/legal.spec.ts e2e/seo.spec.ts --project=desktop --workers=1 --reporter=line)
(cd apps/web && pnpm exec playwright test e2e/seo.spec.ts --project=mobile --workers=1 --reporter=line -g "performance budget")
ok "regressions green"

step "nothing left behind"
[ "$(flags_on)" = "$flags_before" ] || fail "promoted flags changed by the run: before '$flags_before', after '$(flags_on)'"
[ "$(psql_dev -c "SELECT count(*) FROM merchants m JOIN users u ON u.id = m.user_id WHERE u.email LIKE 'promovare-e2e-%'")" = 0 ] || fail "e2e merchant left in the database"
[ "$(psql_dev -c "SELECT count(*) FROM offers WHERE external_id LIKE 'e2e-fixture-promovare-%'")" = 0 ] || fail "e2e offers left in the database"
ok "fixtures removed, flags as before"

echo
echo "OK"
