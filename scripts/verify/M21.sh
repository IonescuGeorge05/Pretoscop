#!/usr/bin/env bash
# M21 — bot legitimacy: Web Bot Auth signing and key directory, final /bot page, extractor canary,
# identity self-check, re-probe tool, outreach tracker. Runs against its own database
# (pretoscop_m21), never the shared dev database, and never sends a request to a shop.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

DB_NAME="${M21_DB:-pretoscop_m21}"
export DATABASE_URL="postgres://pretoscop:pretoscop@localhost:5432/${DB_NAME}"
export E2E_PORT="${E2E_PORT:-3310}"
export ADMIN_EMAILS="${ADMIN_EMAILS:-admin@pretoscop.test}"
# The public RFC 9421 Appendix B.1.4 test key (getEnv() refuses it in staging and production).
RFC9421_TEST_SEED='n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU'
psql_m21() { $COMPOSE exec -T postgres psql -U pretoscop -d "$DB_NAME" -v ON_ERROR_STOP=1 -At "$@"; }

# Shared services are only started when missing and never recreated (see M20.sh).
step "services (postgres, meilisearch, mailpit): started if missing, never recreated"
for svc in postgres meilisearch mailpit; do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "pretoscop-${svc}-1" 2>/dev/null)" != "healthy" ]]; then
    $COMPOSE up -d --wait --no-recreate "$svc" >/dev/null 2>&1 || fail "could not start ${svc} (is Docker running?)"
  fi
done
ok "services healthy"

step "isolated database ${DB_NAME}: create if missing, migrate, seed, sync the registry"
if ! $COMPOSE exec -T postgres psql -U pretoscop -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  $COMPOSE exec -T postgres createdb -U pretoscop "$DB_NAME"
fi
pnpm --silent --filter @pretoscop/db migrate >/dev/null
pnpm --silent --filter @pretoscop/db seed >/dev/null
pnpm --silent --filter @pretoscop/worker shops:sync >/dev/null
[[ "$(psql_m21 -c "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('extractor_canaries', 'outreach', 'merchants')")" == "3" ]] ||
  fail "extractor_canaries / outreach / merchants missing"
[[ "$(psql_m21 -c "SELECT enabled FROM feature_flags WHERE key = 'extractors.canary.enabled'")" == "f" ]] || fail "canary flag missing or on"
ok "${DB_NAME} ready (canary flag present and off)"

PACKAGES=(--filter=@pretoscop/fetch --filter=@pretoscop/config --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web)
step "lint and typecheck (fetch, config, db, worker, web)"
pnpm turbo run lint typecheck "${PACKAGES[@]}" --concurrency=3 --output-logs=errors-only
ok "green"

step "unit + integration tests, incl. RFC 9421 B.2.6 and the web-bot-auth draft vector (two packages at a time, two workers each)"
pnpm turbo run test "${PACKAGES[@]}" --concurrency=2 --output-logs=errors-only -- --maxWorkers=2
ok "green"

step "signing stays off by default; the keygen prints a well-formed key (secret masked here)"
grep -q '^WEB_BOT_AUTH=false$' .env.example || fail ".env.example must keep WEB_BOT_AUTH=false"
grep -q '^WEB_BOT_AUTH_PRIVATE_KEY=$' .env.example || fail ".env.example must not carry a key"
KEYGEN="$(pnpm --silent --filter @pretoscop/fetch bot-auth:keygen)"
grep -Eq '^WEB_BOT_AUTH_PRIVATE_KEY=[A-Za-z0-9_-]{43}$' <<<"$KEYGEN" || fail "keygen did not print a base64url seed"
grep -Eq '^keyid: [A-Za-z0-9_-]{43}$' <<<"$KEYGEN" || fail "keygen did not print the keyid"
grep -Eq '^jwk:   \{"kty":"OKP","crv":"Ed25519","x":"[A-Za-z0-9_-]{43}"\}$' <<<"$KEYGEN" || fail "keygen did not print the public JWK"
! git grep -nE "WEB_BOT_AUTH_PRIVATE_KEY=[A-Za-z0-9_-]{43}" -- ':!scripts/verify/M21.sh' >/dev/null || fail "a Web Bot Auth key is committed"
unset KEYGEN
ok "keygen fine, no key in git"

# The web app runs with the public test key, the bot info URL on the e2e port (so the directory is
# signed for localhost:${E2E_PORT}) and one documentation address as the published egress IP.
export WEB_BOT_AUTH=false WEB_BOT_AUTH_PRIVATE_KEY="$RFC9421_TEST_SEED" BOT_INFO_URL="http://localhost:${E2E_PORT}/bot" BOT_EGRESS_IPS="203.0.113.10"
export PUBLIC_BASE_URL="http://localhost:${E2E_PORT}"

step "production build (waits while another Next build runs on this machine: 8 GB of RAM)"
for ((i = 0; i < 120; i++)); do pgrep -f 'next build' >/dev/null || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "web app on :${E2E_PORT}; identity self-check against it (DNS skipped: the IP is a documentation address)"
LOG_DIR="$(mktemp -d)"
(cd apps/web && exec pnpm exec next start --port "$E2E_PORT") >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
trap 'kill "$WEB_PID" 2>/dev/null || true; pkill -f "next start --port ${E2E_PORT}" 2>/dev/null || true' EXIT
for ((i = 0; i < 60; i++)); do curl -sf "http://localhost:${E2E_PORT}/bot/ips.json" >/dev/null && break; sleep 1; done
CHECK="$(pnpm --silent --filter @pretoscop/worker bot:check --site "http://localhost:${E2E_PORT}" --skip-dns || true)"
echo "$CHECK" | sed 's/^/   /'
grep -q '^OK   /bot/ips.json: 1 address(es) published' <<<"$CHECK" || fail "bot:check: ips.json"
grep -q '^OK   /.well-known/http-message-signatures-directory: 1 key(s), signed by poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U' <<<"$CHECK" ||
  fail "bot:check: key directory"
ok "ips.json and the signed key directory check out"

step "Playwright: key directory, ips.json, /bot sections, outreach tracker"
(cd apps/web && pnpm exec playwright test e2e/bot-legitimacy.spec.ts --project=desktop --reporter=line) || {
  tail -40 "$LOG_DIR/web.log"
  fail "bot legitimacy e2e failed"
}
ok "e2e green"

echo
echo "OK"
