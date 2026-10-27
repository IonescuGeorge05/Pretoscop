#!/usr/bin/env bash
# M09 — admin v1: magic-link login, sources, runs, flags, review queue, products (edit, GTIN,
# merge/undo, split, hide), offers (unlink, blacklist), quarantine, audit.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint (jsx-a11y), typecheck, unit + integration tests (web, db incl. admin queries)"
pnpm turbo run lint typecheck test --filter=@pretoscop/web --filter=@pretoscop/db --output-logs=errors-only
ok "green"

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright (desktop): Mailpit magic-link login, kill switch + flags audited, review accept, merge + undo, no-session redirect"
(cd apps/web && pnpm exec playwright test e2e/admin.spec.ts --project=desktop --reporter=line)
ok "admin e2e green"

step "every admin mutation is audited"
for a in source.kill flag.set review.accept product.merge product.unmerge; do
  n=$(psql_dev -c "select count(*) from audit_log where action = '$a'")
  [ "$n" -gt 0 ] || fail "no audit row for $a"
done
ok "audit rows present for kill switch, flags, review accept, merge and undo"

echo
echo "OK"
