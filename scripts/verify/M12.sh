#!/usr/bin/env bash
# M12 — web foundation.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint (incl. jsx-a11y), typecheck, unit tests (@pretoscop/web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/web --output-logs=errors-only
ok "web green"

step "production build (test Plausible URL so the consent e2e can observe it)"
(cd apps/web && NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=https://plausible.test/js/script.js NEXT_PUBLIC_PLAUSIBLE_DOMAIN=pretoscop.test pnpm exec next build >/dev/null)
ok "next build"

# This module's spec only: every later module's verify runs its own specs, some of which need a
# setup of their own (the M20 worker, an unshared fixture) or must not run beside each other.
step "Playwright e2e (mobile + desktop): shell, consent network assertions, 404, event API limits"
(cd apps/web && E2E_PLAUSIBLE=1 pnpm exec playwright test e2e/shell.spec.ts --reporter=line)
ok "e2e green"

echo
echo "OK"
