#!/usr/bin/env bash
# M17 — legal and trust pages, consent, analytics, bot page.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

E2E_PORT="${E2E_PORT:-3310}"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint (incl. jsx-a11y), typecheck, unit + integration tests (@pretoscop/web, @pretoscop/config)"
pnpm turbo run lint typecheck test --filter=@pretoscop/web --filter=@pretoscop/config --output-logs=errors-only
ok "web + config green (legal texts, env, contact validation, coverage query, no cedilla in M17 sources)"

step "legal records and the opt-in Plausible profile"
for f in docs/legal/ropa.md docs/legal/dpa-list.md docs/legal/lia-crawl.md; do
  [[ -s "$f" ]] || fail "missing $f"
done
$COMPOSE --profile analytics config -q || fail "infra/docker-compose.dev.yml (profile analytics) does not parse"
if $COMPOSE config --services | grep -qi plausible; then fail "Plausible must not start without --profile analytics"; fi
ok "ROPA, DPA list and LIA present; Plausible CE profile parses and is opt-in"

step "production build (test Plausible URL so the consent e2e can observe it)"
(cd apps/web && NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=https://plausible.test/js/script.js NEXT_PUBLIC_PLAUSIBLE_DOMAIN=pretoscop.test pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e on :$E2E_PORT (mobile + desktop): pages, footer links, contact channel, consent preferences, bot identity"
(cd apps/web && E2E_PLAUSIBLE=1 E2E_PORT="$E2E_PORT" pnpm exec playwright test e2e/legal.spec.ts --reporter=line)
ok "e2e green"

echo
echo "OK"
