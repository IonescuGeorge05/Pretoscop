#!/usr/bin/env bash
# M05B — assisted-access channel (ADR-015, ADR-022). Makes NO request to any shop or vendor: the
# vendor is a local stand-in on 127.0.0.1. The shared development stack is only read, never
# (re)created; the database is this checkout's (DATABASE_URL in .env, via lib.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3240}"

# Whether another `next build` runs on this machine (8 GB of RAM: one build at a time). Git Bash's
# pgrep cannot see native Windows processes, so there the command lines come from CIM.
next_build_running() {
  if is_windows; then
    local n
    n="$(powershell.exe -NoProfile -NonInteractive -Command "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*next*build*' }).Count" 2>/dev/null | tr -d '\r')"
    [[ -n "$n" && "$n" != "0" ]]
  else
    pgrep -f 'next build' >/dev/null
  fi
}

step "development database ${DEV_DB} for the integration tests and the admin page (checked, not started or recreated)"
$COMPOSE exec -T postgres pg_isready -q -U pretoscop -d "$DEV_DB" || fail "PostgreSQL (project pretoscop) is not answering for ${DEV_DB}: run make services"
pnpm --silent --filter @pretoscop/db migrate >/dev/null
[[ "$(psql_dev -c "SELECT to_regclass('public.access_costs') IS NOT NULL")" == "t" ]] || fail "access_costs table missing in ${DEV_DB}"
ok "${DEV_DB} answers and is migrated (access_costs present)"

PACKAGES=(--filter=@pretoscop/fetch --filter=@pretoscop/config --filter=@pretoscop/worker --filter=@pretoscop/db --filter=@pretoscop/web)
step "lint and typecheck (fetch, config, worker, db, web)"
pnpm turbo run lint typecheck "${PACKAGES[@]}" --concurrency=3 --output-logs=errors-only
ok "green"

# Each integration test file creates and migrates a throwaway database on the shared PostgreSQL:
# two packages at a time with two workers each keeps that load moderate.
step "unit + integration tests (fetch: client, scope, ledger, cap, politeness; config: registry; worker: end to end; db; web)"
pnpm turbo run test "${PACKAGES[@]}" --concurrency=2 --output-logs=errors-only -- --maxWorkers=2
ok "green"

step "shipped off: no shop on the channel, no vendor configured, eMAG never"
if grep -lE '^access_mode:\s*assisted' packages/config/shops/*.yaml; then
  fail "a shop YAML sets access_mode: assisted (needs the founders' A10 prerequisites first; see infra/runbooks/assisted-access.md)"
fi
grep -qE '^ASSISTED_VENDOR=none$' .env.example || fail ".env.example must ship ASSISTED_VENDOR=none"
designated="$(cd packages/config && pnpm exec tsx -e "import('./src/assisted.ts').then((m) => console.log(m.ASSISTED_DESIGNATED_SHOPS.join(',') + '|' + m.isAssistedDesignated('emag')))" | tr -d '\r')"
[[ "$designated" == "altex,mediagalaxy,flanco,pcgarage,cel,evomag,vexio|false" ]] || fail "unexpected designated list: ${designated}"
[[ "$(psql_dev -c "SELECT count(*) FROM shops WHERE access_mode = 'assisted'")" == "0" ]] || fail "a shop in ${DEV_DB} is on access_mode assisted"
[[ "$(psql_dev -c "SELECT coalesce((SELECT enabled FROM feature_flags WHERE key = 'assisted.enabled'), false)")" == "f" ]] || fail "flag assisted.enabled is on in ${DEV_DB}"
ok "no YAML or database shop on access_mode assisted; flag off; ASSISTED_VENDOR=none; designated: ${designated%%|*}; eMAG never"

step "never-list guard for the channel (no stealth, proxies, solvers, impersonation)"
forbidden='puppeteer|playwright-extra|stealth|undetected|fingerprint|header-generator|got-scraping|camoufox|impersonate|curl_cffi|proxy-chain|proxy-agent|socks|2captcha|anticaptcha|anti-captcha|capsolver|capmonster|tough-cookie|user-agents'
if node -e 'const d=require("./packages/fetch/package.json"); console.log(Object.keys({...d.dependencies,...d.devDependencies}).join("\n"))' | grep -Eiq "$forbidden"; then
  fail "packages/fetch depends on a stealth/proxy/CAPTCHA/cookie package"
fi
body="$(cd packages/fetch && pnpm exec tsx -e "import('./src/assisted/zyte.ts').then((m) => console.log(JSON.stringify([m.zyteRequestBody('https://x.test/', { render: false }), m.zyteRequestBody('https://x.test/', { render: true, country: 'RO' })])))" | tr -d '\r')"
[[ "$body" == '[{"url":"https://x.test/","httpResponseBody":true,"httpResponseHeaders":true,"followRedirect":false},{"url":"https://x.test/","browserHtml":true,"geolocation":"RO"}]' ]] ||
  fail "unexpected vendor request bodies: ${body}"
ok "vendor requests carry only url + tier (+ country when configured): ${body}"

step "demo through the channel (local stand-in for the vendor; interval, ledger, cap)"
demo="$(pnpm --silent --filter @pretoscop/fetch assisted:demo | tr -d '\r')"
printf '%s\n' "$demo"
grep -q 'skipped (assisted_unavailable, assisted_cap)' <<<"$demo" || fail "the cap did not stop the third request"
grep -q '"url":"https://magazin-demo.test/robots.txt","httpResponseBody":true' <<<"$demo" || fail "robots.txt was not read through the channel on the HTTP tier"
[[ "$(grep -c '"browserHtml":true' <<<"$demo")" == "2" ]] || fail "expected exactly two browser-tier page requests"
grep -q 'Month to date: 4 cents of a 4-cent cap' <<<"$demo" || fail "the month's spend is not exactly at the cap"
ok "robots.txt first (HTTP tier), 5 s between pages, third page refused at the cap before reaching the vendor, spend never above the cap"

if [[ "${M05B_SKIP_E2E:-0}" == "1" ]]; then
  echo "(M05B_SKIP_E2E=1: admin page e2e skipped)"
else
  step "production build (waits while another Next build runs on this machine: 8 GB of RAM)"
  for ((i = 0; i < 120; i++)); do next_build_running || break; sleep 5; done
  (cd apps/web && pnpm exec next build >/dev/null)
  ok "next build"

  step "the admin page (Playwright, desktop, port ${PORT})"
  if port_in_use "$PORT"; then fail "port ${PORT} is already in use: stop that server or set E2E_PORT"; fi
  # Playwright starts `next start` itself; on Windows the native node process can outlive it.
  trap 'stop_port "$PORT"' EXIT
  # Own data only (E2E_SHARED_FIXTURE=0): this spec needs no product fixture.
  (cd apps/web && E2E_SHARED_FIXTURE=0 E2E_PORT="$PORT" pnpm exec playwright test e2e/assisted.spec.ts --project=desktop --workers=1 --reporter=line)
  ok "/admin/acces-asistat lists the seven designated shops (not eMAG), the cap and the switches; a shop stop is audited; visitors are refused"
fi

echo
echo "OK"
