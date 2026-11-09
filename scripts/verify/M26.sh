#!/usr/bin/env bash
# M26 — browser extension (MV3) and GET /api/ext/lookup. No request goes to a shop: the detectors run
# on recorded eMAG pages and synthetic pages of the other shops, and the e2e serves those pages to a
# Chromium with the extension loaded through routing that aborts every other request.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"
FLAG="extension.lookup.enabled"
# Playwright starts (and stops) its own web server; anything left on the port is stopped on exit.
trap 'stop_port "$PORT"' EXIT

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

step "the lookup flag: known, created off, and its state in this database ($DEV_DB)"
grep -q "'$FLAG'" packages/db/src/queries/flags.ts || fail "$FLAG is not in KNOWN_FLAGS"
grep -q "values({ key, enabled: false, description })" packages/db/src/queries/flags.ts || fail "ensureKnownFlags no longer creates flags switched off"
flag_state() { psql_dev -c "SELECT coalesce((SELECT enabled::text || ' ' || config::text FROM feature_flags WHERE key = '$FLAG'), 'absent')"; }
flag_before=$(flag_state)
printf 'flag %s: %s\n' "$FLAG" "$flag_before"
ok "off unless a founder turns it on"

step "CORS * on the lookup route only; no HTML from page or API data in the extension; no permissions"
# Besides the lookup API, only the public bot-identity documents of M17/M21 (/bot/ips.json and the
# Web Bot Auth key directory) are readable cross-origin; no other API route is.
cors=$(grep -rli --include=*.ts --include=*.tsx --include=*.mjs "access-control-allow-origin" apps/web/src apps/web/next.config.ts \
  | grep -v -e '__tests__' -e '^apps/web/src/lib/ext-lookup.ts$' -e '^apps/web/src/app/bot/ips.json/route.ts$' -e '^apps/web/src/lib/web-bot-auth.ts$' || true)
[ -z "$cors" ] || fail "Access-Control-Allow-Origin set outside the lookup route: $cors"
grep -q "CORS_HEADERS" apps/web/src/app/api/ext/lookup/route.ts || fail "the lookup route does not send its CORS headers"
if grep -rnE "\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(" apps/extension/src >/dev/null; then fail "HTML parsing or eval in apps/extension/src"; fi
node -e "
const m = require('./apps/extension/manifest.json');
for (const k of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions', 'web_accessible_resources', 'externally_connectable']) if (k in m) { console.error('manifest has ' + k); process.exit(1); }
if (!m.background.service_worker || !Array.isArray(m.background.scripts)) { console.error('background needs service_worker and scripts'); process.exit(1); }
" || fail "manifest"
ok "CORS in src/lib/ext-lookup.ts only; textContent only; no permissions; one manifest for Chrome and Firefox"

step "lint, typecheck, unit + integration tests (extension detectors on fixtures, service, build; db lookup resolution; web lookup API)"
pnpm turbo run lint typecheck test --concurrency=2 --output-logs=errors-only \
  --filter=@pretoscop/extension --filter=@pretoscop/db --filter=@pretoscop/core --filter=@pretoscop/config --filter=@pretoscop/web
ok "green"

step "extension build (production: API and links → https://pretoscop.ro)"
pnpm --silent --filter @pretoscop/extension build
for t in chrome firefox; do
  for f in manifest.json background.js content.js icons/icon-128.png; do [ -f "apps/extension/dist/$t/$f" ] || fail "dist/$t/$f missing"; done
done
grep -q '"https://pretoscop.ro"' apps/extension/dist/chrome/background.js || fail "production build does not point at https://pretoscop.ro"
grep -q '"gecko"' apps/extension/dist/firefox/manifest.json || fail "firefox manifest without browser_specific_settings.gecko"
ok "dist/chrome and dist/firefox"

step "release gate: share of our eMAG offers the lookup resolves (read-only, $DEV_DB)"
pnpm --silent --filter @pretoscop/db ext:resolution emag altex

step "production build (waits while another Next build runs on this machine)"
# Prerendered pages embed PUBLIC_BASE_URL: build with the URL the e2e server runs on.
export PUBLIC_BASE_URL="http://localhost:${PORT}"
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e: the built extension in Chromium on a recorded eMAG page and a synthetic Altex page (panel, badges, 'Istoric insuficient', keyboard, no shop link changed, listings send nothing, flag off), API (CORS on this route only, no cookies, CSP, per-shop switch, rate limit)"
stop_port "$PORT"
(cd apps/web && E2E_SHARED_FIXTURE=0 E2E_PORT="$PORT" pnpm exec playwright test e2e/extension.spec.ts --project=desktop --workers=1 --reporter=line)
ok "e2e green"

step "no test data left behind, flag as it was"
left=$(psql_dev -c "SELECT (SELECT count(*) FROM offers WHERE external_id LIKE 'e2e-fixture-ext-%') + (SELECT count(*) FROM products WHERE slug LIKE 'tmp-e2e-ext-%' OR (title LIKE '%Testoscop Ext%' AND title LIKE '%(produs de test E2E)'))")
[ "$left" = 0 ] || fail "the e2e left $left rows"
flag_after=$(flag_state)
[ "$flag_before" = "$flag_after" ] || fail "flag before [$flag_before] and after [$flag_after] differ"
ok "clean"

echo
echo "OK"
