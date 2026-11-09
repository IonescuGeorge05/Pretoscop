#!/usr/bin/env bash
# M28 — B2B price intelligence MVP. Runs against this checkout's database; no request goes to
# Stripe (subscriptions run against the local Stripe mock of @pretoscop/payments with M25's made-up
# e2e credentials, webhooks are signed by the test) and no email leaves Mailpit.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"
B2B_FLAGS="'b2b.enabled','b2b.digest.enabled','b2b.billing.enabled'"
trap 'stop_port "$PORT"' EXIT

next_build_running() {
  if is_windows; then
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1 >/dev/null 2>&1
  else
    pgrep -f 'next build' >/dev/null 2>&1
  fi
}

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "the B2B migration (00xx_b2b) on the dev database ($DEV_DB) and an unbroken snapshot chain"
for t in b2b_workspaces b2b_members b2b_invites b2b_skus b2b_api_keys b2b_api_usage b2b_digests b2b_invoices b2b_billing_events b2b_products; do
  [ "$(psql_dev -c "SELECT to_regclass('public.$t') IS NOT NULL")" = t ] || fail "$t missing"
done
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
if (!j.entries.some((e) => /_b2b$/.test(e.tag))) { console.error('no b2b migration in the journal'); process.exit(1); }
" || fail "migration metadata"
ok "tables and the b2b_products view present; journal and snapshots chained"

step "feature flags: created off; off in this database unless someone turned them on"
grep -q "values({ key, enabled: false, description })" packages/db/src/queries/flags.ts || fail "ensureKnownFlags no longer creates flags switched off"
for f in b2b.enabled b2b.digest.enabled b2b.billing.enabled; do grep -q "'$f'" packages/db/src/queries/flags.ts || fail "flag $f not registered"; done
on=$(psql_dev -c "SELECT coalesce(string_agg(key, ', '), '') FROM feature_flags WHERE key IN ($B2B_FLAGS) AND enabled")
if [ -n "$on" ]; then printf 'note: switched on in %s: %s\n' "$DEV_DB" "$on"; fi
ok "new flags are created off"

step "no payment secrets in git; API keys only as hashes"
if git grep -nE '(sk|rk)_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{20,}' -- . ':!pnpm-lock.yaml' >/dev/null; then fail "something that looks like a live Stripe key or webhook secret is committed"; fi
if git grep -nE '^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=[^[:space:]]+$' -- .env.example >/dev/null; then fail ".env.example carries a Stripe secret"; fi
[ "$(psql_dev -c "SELECT count(*) FROM b2b_api_keys WHERE secret_hash !~ '^[0-9a-f]{64}$'")" = 0 ] || fail "an API key is stored other than as a SHA-256 hex digest"
ok "placeholders only"

step "Icecat exclusion and no consumer data at query level; every admin B2B page and action checks the admin itself"
code_only() { sed -E 's#//.*$##' "$@" | tr '\n' ' ' | sed -E 's#/\*([^*]|\*[^/])*\*/##g'; }
for f in packages/db/src/queries/b2b.ts apps/web/src/lib/b2b.ts apps/web/src/lib/b2b-api.ts apps/web/src/lib/b2b-api-format.ts apps/web/src/lib/b2b-table.ts apps/worker/src/b2b/digest.ts $(find apps/web/src/app/b2b apps/web/src/app/api/v1/b2b -name '*.ts*'); do
  if code_only "$f" | grep -qE 'product_specs|product_images|primary_image_id'; then fail "$f reads Icecat tables"; fi
done
if code_only packages/db/src/queries/b2b.ts | grep -qE '\b(clicks|alerts|alert_sends|consent_records|push_subscriptions|telegram_links)\b|FROM products\b|JOIN products\b'; then fail "b2b queries read consumer tables or bypass the b2b_products view"; fi
for f in $(find "apps/web/src/app/admin/(panel)/b2b" -name 'page.tsx' -o -name 'route.ts'); do grep -q 'await requireAdmin()' "$f" || fail "$f does not call requireAdmin()"; done
node -e "
const s = require('fs').readFileSync('apps/web/src/app/admin/b2b-actions.ts', 'utf8');
const fns = [...s.matchAll(/export async function (\w+)[^{]*\{([\s\S]*?)\n\}/g)];
if (fns.length < 6) { console.error('expected the admin B2B actions'); process.exit(1); }
for (const [, name, body] of fns) if (!/await requireAdmin\(\)/.test(body.split('\n').slice(0, 3).join('\n'))) { console.error(name + ' does not start with requireAdmin()'); process.exit(1); }
" || fail "admin actions"
node -e "
const s = require('fs').readFileSync('apps/web/src/app/b2b/actions.ts', 'utf8');
const fns = [...s.matchAll(/export async function (\w+)[^{]*\{([\s\S]*?)\n\}/g)];
for (const [, name, body] of fns) if (!/requireB2b(Workspace|Data)\(/.test(body.split('\n').slice(0, 3).join('\n'))) { console.error(name + ' does not start with the tenant gate'); process.exit(1); }
" || fail "workspace actions"
ok "B2B code reads the catalogue through b2b_products only; admin pages and actions call requireAdmin(); workspace actions run the tenant gate"

step "lint, typecheck, unit + integration tests (core rules and CSV, config, db: tenancy, quotas under concurrency, Icecat exclusion, billing events; payments: subscription checkout, portal and events against the Stripe mock; worker digest; web: table/CSV, API contract, OpenAPI file, billing mapping)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --filter=@pretoscop/config --filter=@pretoscop/db --filter=@pretoscop/payments --filter=@pretoscop/worker --filter=@pretoscop/web --concurrency=1 --output-logs=errors-only
ok "green"

step "the digest CLI refuses to send while its flag is off"
if [ "$(psql_dev -c "SELECT coalesce((SELECT enabled FROM feature_flags WHERE key = 'b2b.digest.enabled'), false)")" = f ]; then
  set +e
  pnpm --silent --filter @pretoscop/worker b2b:digest >/dev/null 2>&1
  code=$?
  set -e
  [ "$code" = 2 ] || fail "b2b:digest ran with b2b.digest.enabled off (exit $code)"
  ok "b2b:digest exits 2 while b2b.digest.enabled is off"
else
  printf 'note: b2b.digest.enabled is on in %s; CLI refusal not checked
' "$DEV_DB"
fi

step "production build (waits while another Next build runs on this machine)"
export PUBLIC_BASE_URL="http://localhost:${PORT}"
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e: provisioning, magic-link login, terms, import, positions, CSV = table, SKU page, tenant isolation, API contract and quota, revocation, service switch; subscription checkout (Stripe mock) and signed webhooks on the shared /api/webhooks/stripe"
flags_on() { psql_dev -c "SELECT coalesce(string_agg(key, ',' ORDER BY key), '') FROM feature_flags WHERE key IN ($B2B_FLAGS) AND enabled"; }
flags_before=$(flags_on)
stop_port "$PORT"
# Made-up B2B prices for the e2e server (the Stripe key, webhook secret and mock URL come from
# playwright.config.ts, shared with M25's e2e; no Stripe account is involved).
export B2B_STRIPE_PRICE_STARTER=price_e2estarter B2B_STRIPE_PRICE_PRO=price_e2epro
(cd apps/web && E2E_SHARED_FIXTURE=0 E2E_PORT="$PORT" pnpm exec playwright test e2e/b2b.spec.ts --project=desktop --workers=1 --reporter=line)
ok "e2e green"

step "no test data left behind, flags as they were"
left=$(psql_dev -c "SELECT (SELECT count(*) FROM b2b_workspaces WHERE name LIKE 'E2E B2B%') + (SELECT count(*) FROM users WHERE email LIKE '%@firma-b2b-e2e.ro') + (SELECT count(*) FROM shops WHERE slug LIKE 'e2e-b2b-%') + (SELECT count(*) FROM products WHERE slug LIKE 'e2e-b2b-%')")
[ "$left" = 0 ] || fail "the e2e left $left rows"
flags_after=$(flags_on)
[ "$flags_before" = "$flags_after" ] || fail "flags switched on before [$flags_before] and after [$flags_after] differ"
ok "clean"

echo
echo "OK"
