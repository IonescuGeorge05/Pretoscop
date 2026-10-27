#!/usr/bin/env bash
# M02 — polite fetch layer and robots.txt.
# Makes NO request to any shop: all HTTP traffic goes to local servers on 127.0.0.1.
# The live check against a real shop is in the founder checklist (M02.checklist.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

tmp="$(mktemp -d)"
cleanup() {
  [[ -n "${server_pid:-}" ]] && kill "$server_pid" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

step "toolchain"
node -e 'const [maj,min]=process.versions.node.split(".").map(Number); if (maj<22||(maj===22&&min<12)) {console.error("Node >= 22.12 required, found "+process.version); process.exit(1)}'
ok "node $(node -v), pnpm $(pnpm -v)"

step "install"
pnpm install --frozen-lockfile >/dev/null
ok "dependencies installed"

step "lint, typecheck, tests (@pretoscop/fetch)"
pnpm turbo run lint typecheck test --filter=@pretoscop/fetch --output-logs=errors-only
ok "lint, typecheck and the fetch test suite pass (robots, block fixtures, throttle, pauses, transport)"

step "never-list guard (CLAUDE.md, architecture §6.2)"
forbidden='puppeteer|playwright-extra|stealth|undetected|fingerprint|header-generator|got-scraping|camoufox|impersonate|curl_cffi|proxy-chain|proxy-agent|socks|2captcha|anticaptcha|anti-captcha|capsolver|capmonster|tough-cookie|user-agents'
if node -e 'const d=require("./packages/fetch/package.json"); console.log(Object.keys({...d.dependencies,...d.devDependencies}).join("\n"))' | grep -Eiq "$forbidden"; then
  fail "packages/fetch depends on a stealth/proxy/CAPTCHA/cookie package"
fi
if grep -RInE "['\"](cookie|referer|sec-ch-ua|sec-fetch-[a-z]+|upgrade-insecure-requests)['\"]\s*:" packages/fetch/src; then
  fail "packages/fetch/src sets a cookie, Referer or browser-only header"
fi
ok "no stealth, proxy, CAPTCHA or cookie libraries; no browser-only headers"

step "identity"
ua="$(cd packages/fetch && pnpm exec tsx -e "import('./src/identity.ts').then((m) => console.log(m.buildUserAgent('page') + '|' + m.buildUserAgent('feed')))")"
[[ "$ua" == "Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)|Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)" ]] ||
  fail "unexpected User-Agent strings: $ua"
ok "${ua%%|*}"
ok "${ua##*|}"

step "demo CLI, two processes, one host (local server, default 5 s interval)"
node scripts/verify/M02-local-server.mjs "$tmp/hits.txt" >"$tmp/port.txt" &
server_pid=$!
for _ in $(seq 1 50); do
  [[ -s "$tmp/port.txt" ]] && break
  sleep 0.1
done
port="$(head -1 "$tmp/port.txt")"
[[ -n "$port" ]] || fail "local test server did not start"
url="http://127.0.0.1:${port}/robots.txt"
pnpm --silent --filter @pretoscop/fetch demo "$url" --state "$tmp/state.json" >"$tmp/run1.txt" || {
  cat "$tmp/run1.txt"
  fail "first demo run failed"
}
pnpm --silent --filter @pretoscop/fetch demo "$url" --state "$tmp/state.json" >"$tmp/run2.txt" || {
  cat "$tmp/run2.txt"
  fail "second demo run failed"
}
grep -q 'PretoscopBot/1.0' "$tmp/run1.txt" || fail "demo did not print the User-Agent"
grep -q 'DISALLOWED  /cart' "$tmp/run1.txt" || fail "demo did not print robots.txt verdicts"
grep -q 'bot/ (generic_fragment)' "$tmp/run1.txt" || fail "demo did not report the ignored generic bot/ group"
gap="$(node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map((l)=>Number(l.split(" ")[0])); console.log(t[1]-t[0])' "$tmp/hits.txt")"
((gap >= 5000)) || fail "the two requests reached the server only ${gap} ms apart"
grep -Eq 'waited [0-9.]+ s for the per-domain slot' "$tmp/run2.txt" ||
  ok "(the second run started more than 5 s after the first, so it did not need to wait)"
ok "second process respected the interval: requests reached the server ${gap} ms apart"
ok "robots.txt verdicts and the ignored generic group (bot/) are printed"

echo
echo "OK"
