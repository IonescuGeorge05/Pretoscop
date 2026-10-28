#!/usr/bin/env bash
# M11 — Icecat enrichment. No request reaches Icecat (no account exists yet): the client runs
# against a local stand-in with synthetic data, on throwaway databases and temporary blob folders.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

step "toolchain and install"
node -e 'const [maj,min]=process.versions.node.split(".").map(Number); if (maj<22||(maj===22&&min<12)) {console.error("Node >= 22.12 required, found "+process.version); process.exit(1)}'
pnpm install --frozen-lockfile >/dev/null
ok "node $(node -v), pnpm $(pnpm -v)"

step "PostgreSQL for the throwaway test databases (started only if it is not already up)"
if node -e 'const s=require("net").connect(5432,"127.0.0.1");s.on("connect",()=>process.exit(0));s.on("error",()=>process.exit(1));setTimeout(()=>process.exit(1),2000)'; then
  ok "postgres reachable on :5432 (left as it is)"
else
  ensure_services
fi

step "lint, typecheck, tests (icecat, db, config, worker incl. the end-to-end sync, web unit tests)"
pnpm turbo run lint typecheck test --filter=@pretoscop/icecat --filter=@pretoscop/db --filter=@pretoscop/config --filter=@pretoscop/worker --filter=@pretoscop/web --output-logs=errors-only
ok "green"

step "licence guards in code: Icecat data never leaves product_specs / product_images"
if grep -nE "INSERT INTO (product_gtins|brands|offers)|UPDATE products SET (title|mpn|brand_id|attributes)" packages/db/src/queries/icecat.ts; then
  fail "Icecat queries write outside product_specs / product_images"
fi
grep -q "'icecat.enabled'" packages/db/src/queries/flags.ts || fail "flag icecat.enabled is not a known flag"
grep -q "isFlagEnabled(db, 'icecat.enabled')" apps/worker/src/jobs/icecat.ts || fail "icecat.sync is not gated by its flag"
grep -q "IcecatCredit" "apps/web/src/app/(site)/p/[slug]/page.tsx" || fail "the product page does not credit Icecat"
ok "isolated, flag-gated (default off), credited on the product page"

step "lookup demo, offline (pnpm icecat:lookup 5397184119709 --mock)"
pnpm --silent icecat:lookup 5397184119709 --mock >"$tmp/lookup.log" 2>&1 || { cat "$tmp/lookup.log"; fail "lookup demo failed"; }
sed -n '1,12p' "$tmp/lookup.log" | sed 's/^/   /' | cut -c1-170
grep -q 'PretoscopBot\|\[feed\]' "$tmp/lookup.log" || fail "lookup did not go through the polite fetcher"
grep -q 'features (8)' "$tmp/lookup.log" || fail "lookup demo: expected 8 features"
grep -q 'Specs Icecat' "$tmp/lookup.log" || fail "lookup demo: attribution missing"
ok "datasheet mapped: features, images to copy, attribution"

step "a live lookup without an account is refused before any request"
set +e
ICECAT_USERNAME= pnpm --silent icecat:lookup 8806095530000 >"$tmp/live.log" 2>&1
code=$?
set -e
sed 's/^/   /' "$tmp/live.log"
[[ $code -eq 3 ]] && grep -q 'ICECAT_USERNAME is not set' "$tmp/live.log" || fail "expected a refusal without ICECAT_USERNAME (exit $code)"
ok "no account, no request"

step "end to end offline: throwaway database + temporary blob store (pnpm --filter @pretoscop/worker icecat:demo)"
pnpm --silent --filter @pretoscop/worker icecat:demo >"$tmp/demo.log" 2>&1 || { cat "$tmp/demo.log"; fail "icecat demo failed"; }
sed 's/^/   /' "$tmp/demo.log" | cut -c1-170
grep -q 'found 3, not in Icecat 1, restricted 1, Full Icecat only 1' "$tmp/demo.log" || fail "unexpected lookup results"
grep -q 'images copied 5' "$tmp/demo.log" || fail "images were not copied"
ok "specs stored with attribution, images copied with 120/400/800 px derivatives, misses remembered"

echo
echo "OK"
