#!/usr/bin/env bash
# M21 — bot legitimacy: Web Bot Auth signing (off by default) and the key directory, the final /bot
# page, the extractor canary, the identity self-check, the re-probe tool and the outreach tracker.
# Uses this checkout's database and E2E port (.env, read by lib.sh; M21_DB=<name> for a separate
# one) and never sends a request to a shop: CRAWL_ENABLED stays false, the canary and probe tests
# run against undici's MockAgent, and the probe CLI is only run to show that it refuses.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

if [ -n "${M21_DB:-}" ]; then
  DEV_DB="$M21_DB"
  export DATABASE_URL="postgres://pretoscop:pretoscop@localhost:5432/${M21_DB}"
fi
export E2E_PORT="${E2E_PORT:-3310}"
export CRAWL_ENABLED=false
export ADMIN_EMAILS="${ADMIN_EMAILS:-admin@pretoscop.test}"
# The public RFC 9421 Appendix B.1.4 test key (getEnv() refuses it in staging and production).
RFC9421_TEST_SEED='n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU'

# True while another `next build` runs on this machine (one production build at a time: RAM).
next_build_running() {
  if is_windows; then
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1 >/dev/null 2>&1
  else
    pgrep -f 'next build' >/dev/null 2>&1
  fi
}

ensure_services

step "database ${DEV_DB}: migrations (a new database is also seeded and synced with the registry)"
if ! $COMPOSE exec -T postgres psql -U pretoscop -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '${DEV_DB}'" | grep -q 1; then
  $COMPOSE exec -T postgres createdb -U pretoscop "$DEV_DB"
  pnpm --silent --filter @pretoscop/db migrate >/dev/null
  pnpm --silent --filter @pretoscop/db seed >/dev/null
  pnpm --silent --filter @pretoscop/worker shops:sync >/dev/null
else
  pnpm --silent --filter @pretoscop/db migrate >/dev/null
fi
[ "$(psql_dev -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('extractor_canaries', 'outreach')")" = 2 ] ||
  fail "extractor_canaries / outreach missing"
FLAGS="$(psql_dev -c "SELECT key || '=' || enabled FROM feature_flags WHERE key IN ('extractors.canary.enabled', 'shops.probe.enabled') ORDER BY key" | tr '\n' ' ')"
ok "${DEV_DB} migrated; flags in this database: ${FLAGS:-none yet (both default to off)}"

PACKAGES=(--filter=@pretoscop/fetch --filter=@pretoscop/config --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web)
step "lint and typecheck (fetch, config, db, worker, web)"
pnpm turbo run lint typecheck "${PACKAGES[@]}" --concurrency=3 --output-logs=errors-only
ok "green"

step "unit + integration tests: RFC 9421 B.2.6 and the Web Bot Auth draft vectors (E.2.1-E.2.3), canary and probe through the real fetcher (two packages at a time, two workers each)"
pnpm turbo run test "${PACKAGES[@]}" --concurrency=2 --output-logs=errors-only -- --maxWorkers=2
ok "green"

step "signing stays off by default; the keygen prints a well-formed key (secret never shown); no key in git"
grep -q '^WEB_BOT_AUTH=false$' .env.example || fail ".env.example must keep WEB_BOT_AUTH=false"
grep -q '^WEB_BOT_AUTH_PRIVATE_KEY=$' .env.example || fail ".env.example must not carry a key"
KEYGEN="$(pnpm --silent --filter @pretoscop/fetch bot-auth:keygen)"
grep -Eq '^WEB_BOT_AUTH_PRIVATE_KEY=[A-Za-z0-9_-]{43}$' <<<"$KEYGEN" || fail "keygen did not print a base64url seed"
grep -Eq '^keyid: [A-Za-z0-9_-]{43}$' <<<"$KEYGEN" || fail "keygen did not print the keyid"
grep -Eq '^jwk:   \{"kty":"OKP","crv":"Ed25519","x":"[A-Za-z0-9_-]{43}"\}$' <<<"$KEYGEN" || fail "keygen did not print the public JWK"
unset KEYGEN
if git grep -nE "WEB_BOT_AUTH_PRIVATE_KEY=[A-Za-z0-9_-]{43}|BEGIN (ED25519 )?PRIVATE KEY" -- ':!scripts/verify/M21.sh' ':!packages/fetch/test' ':!**/*.md' >/dev/null; then
  fail "a private key is committed"
fi
ok "keygen fine, no key in git (the RFC 9421 test key appears only in tests)"

step "shops:probe refuses without CRAWL_ENABLED and sends nothing (the only way verify runs it)"
set +e
PROBE="$(CRAWL_ENABLED=false pnpm --silent --filter @pretoscop/worker shops:probe pcgarage --vantage "make verify M=21 (refusal check)" 2>&1)"
PROBE_EXIT=$?
set -e
echo "$PROBE" | sed 's/^/   /'
[ "$PROBE_EXIT" = 2 ] || fail "shops:probe exited $PROBE_EXIT (want 2: refused)"
grep -q 'refused, nothing sent: env CRAWL_ENABLED is false' <<<"$PROBE" || fail "shops:probe did not refuse"
ok "refused, exit 2"

export PUBLIC_BASE_URL="http://localhost:${E2E_PORT}"

step "production build (waits while another Next build runs on this machine)"
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

# Only now, so the e2e proves /bot reads them at request time: the public test key (directory
# published, signing still off), the bot info URL on the e2e port (the directory is signed for
# localhost:${E2E_PORT}) and one documentation address (RFC 5737) as the published egress IP.
export WEB_BOT_AUTH=false WEB_BOT_AUTH_PRIVATE_KEY="$RFC9421_TEST_SEED" BOT_INFO_URL="http://localhost:${E2E_PORT}/bot" BOT_EGRESS_IPS="203.0.113.10"

step "web app on :${E2E_PORT}; identity self-check against it (DNS skipped: the IP is a documentation address)"
LOG_DIR="$(mktemp -d)"
stop_port "$E2E_PORT"
(cd apps/web && exec pnpm exec next start --port "$E2E_PORT") >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
# stop_port as well: on Windows the native node process outlives the killed Git Bash subshell.
trap 'kill "$WEB_PID" 2>/dev/null || true; stop_port "$E2E_PORT"' EXIT
for ((i = 0; i < 90; i++)); do curl -sf "http://localhost:${E2E_PORT}/bot/ips.json" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:${E2E_PORT}/bot/ips.json" >/dev/null || {
  tail -40 "$LOG_DIR/web.log"
  fail "next start did not come up on :${E2E_PORT}"
}
CHECK="$(pnpm --silent --filter @pretoscop/worker bot:check --site "http://localhost:${E2E_PORT}" --skip-dns || true)"
echo "$CHECK" | sed 's/^/   /'
grep -q '^OK   /bot/ips.json: 1 address(es) published' <<<"$CHECK" || fail "bot:check: ips.json"
grep -q '^OK   /.well-known/http-message-signatures-directory: 1 key(s), signed by poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U' <<<"$CHECK" ||
  fail "bot:check: key directory"
grep -q 'WEB_BOT_AUTH is off: crawler requests are not signed.' <<<"$CHECK" || fail "bot:check: signing should be off"
ok "ips.json and the signed key directory check out; signing off"

step "Playwright: key directory, ips.json, /bot sections, outreach tracker (one worker: it writes to the database)"
(cd apps/web && E2E_SHARED_FIXTURE=0 pnpm exec playwright test e2e/bot-legitimacy.spec.ts --project=desktop --workers=1 --reporter=line) || {
  tail -40 "$LOG_DIR/web.log"
  fail "bot legitimacy e2e failed"
}
ok "e2e green"

step "no test data left behind"
left="$(psql_dev -c "SELECT count(*) FROM shops WHERE slug LIKE 'e2e-fixture-%'")"
[ "$left" = 0 ] || fail "the outreach e2e left $left fixture shop(s)"
ok "clean"

echo
echo "OK"
