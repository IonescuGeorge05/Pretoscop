#!/usr/bin/env bash
# M05B — assisted-access channel (ADR-015). Makes NO request to any shop or vendor: the vendor is a
# local stand-in on 127.0.0.1. The shared development stack is only read, never (re)created.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3240}"

step "development database for the integration tests (checked, not started or recreated)"
$COMPOSE exec -T postgres pg_isready -q -U pretoscop -d pretoscop || fail "dev PostgreSQL (project pretoscop) is not answering: run make services"
ok "dev PostgreSQL answers"

step "lint, typecheck, tests (fetch: client, ledger, cap, politeness; config: registry; worker: end to end; web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/fetch --filter=@pretoscop/config --filter=@pretoscop/worker \
  --filter=@pretoscop/db --filter=@pretoscop/web --output-logs=errors-only
ok "green"

step "shipped off: no shop on the channel, no vendor configured"
if grep -lE '^access_mode:\s*assisted' packages/config/shops/*.yaml; then
  fail "a shop YAML sets access_mode: assisted (needs the founders' A10 prerequisites first; see infra/runbooks/assisted-access.md)"
fi
grep -qE '^ASSISTED_VENDOR=none$' .env.example || fail ".env.example must ship ASSISTED_VENDOR=none"
designated="$(cd packages/config && pnpm exec tsx -e "import('./src/assisted.ts').then((m) => console.log(m.ASSISTED_DESIGNATED_SHOPS.join(',') + '|' + m.isAssistedDesignated('emag')))")"
[[ "$designated" == "altex,mediagalaxy,flanco,pcgarage,cel,evomag,vexio|false" ]] || fail "unexpected designated list: ${designated}"
ok "no YAML uses access_mode: assisted; ASSISTED_VENDOR=none; designated: ${designated%%|*}; eMAG never"

step "never-list guard for the channel (no stealth, proxies, solvers, impersonation)"
forbidden='puppeteer|playwright-extra|stealth|undetected|fingerprint|header-generator|got-scraping|camoufox|impersonate|curl_cffi|proxy-chain|proxy-agent|socks|2captcha|anticaptcha|anti-captcha|capsolver|capmonster|tough-cookie|user-agents'
if node -e 'const d=require("./packages/fetch/package.json"); console.log(Object.keys({...d.dependencies,...d.devDependencies}).join("\n"))' | grep -Eiq "$forbidden"; then
  fail "packages/fetch depends on a stealth/proxy/CAPTCHA/cookie package"
fi
body="$(cd packages/fetch && pnpm exec tsx -e "import('./src/assisted/zyte.ts').then((m) => console.log(JSON.stringify([m.zyteRequestBody('https://x.test/', { render: false }), m.zyteRequestBody('https://x.test/', { render: true, country: 'RO' })])))")"
[[ "$body" == '[{"url":"https://x.test/","httpResponseBody":true,"httpResponseHeaders":true,"followRedirect":false},{"url":"https://x.test/","browserHtml":true,"geolocation":"RO"}]' ]] ||
  fail "unexpected vendor request bodies: ${body}"
ok "vendor requests carry only url + tier (+ country when configured): ${body}"

step "demo through the channel (local stand-in for the vendor; interval, ledger, cap)"
demo="$(pnpm --silent --filter @pretoscop/fetch assisted:demo)"
printf '%s\n' "$demo"
grep -q 'skipped (assisted_unavailable, assisted_cap)' <<<"$demo" || fail "the cap did not stop the third request"
grep -q '"url":"https://magazin-demo.test/robots.txt","httpResponseBody":true' <<<"$demo" || fail "robots.txt was not read through the channel on the HTTP tier"
[[ "$(grep -c '"browserHtml":true' <<<"$demo")" == "2" ]] || fail "expected exactly two browser-tier page requests"
ok "robots.txt first (HTTP tier), 5 s between pages, third page refused at the cap before reaching the vendor"

if [[ "${M05B_SKIP_E2E:-0}" == "1" ]]; then
  echo "(M05B_SKIP_E2E=1: admin page e2e skipped)"
else
  step "production build and the admin page (Playwright, desktop, port ${PORT})"
  (cd apps/web && pnpm exec next build >/dev/null)
  (cd apps/web && E2E_PORT="$PORT" pnpm exec playwright test e2e/assisted.spec.ts --project=desktop --reporter=line)
  ok "/admin/acces-asistat lists the seven designated shops (not eMAG), the cap and the switches; visitors are refused"
fi

echo
echo "OK"
