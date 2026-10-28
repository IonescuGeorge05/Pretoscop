#!/usr/bin/env bash
# M10 — source adapters batch 1. No request leaves this machine: parsers run on recorded fixtures,
# sources run through the recorder against a fake fetcher on a throwaway database, and the
# fixture recorder is only exercised on a blocked shop (refused before any request).
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

step "lint, typecheck, tests (extractors, config registry, fetch, worker recorder)"
pnpm turbo run lint typecheck test --filter=@pretoscop/extractors --filter=@pretoscop/config --filter=@pretoscop/fetch --filter=@pretoscop/worker --output-logs=errors-only
ok "green"

step "new parsers on recorded fixtures (2026-10-27)"
check_demo() {
  local file="$1" want="$2"
  local line
  pnpm --silent --filter @pretoscop/extractors demo "$file" >"$tmp/demo.log" 2>&1 || {
    cat "$tmp/demo.log"
    fail "$file: demo failed"
  }
  line="$(head -1 "$tmp/demo.log")"
  echo "   $line" | cut -c1-170
  echo "$line" | grep -q ": ${want} offers" || fail "$file: expected ${want} offers"
}
check_demo fixtures/itgalaxy/listing-televizoare_2026-10-27.html 36
check_demo fixtures/forit/listing-televizoare_2026-10-27.html 60
check_demo fixtures/dedeman/listing-frigidere_2026-10-27.html 23
check_demo fixtures/dedeman/listing_2026-10-27.html 72
check_demo fixtures/carrefour/listing-televizoare-smart_2026-10-27.html 24
check_demo fixtures/auchan/listing-televizoare_2026-10-27.html 4
check_demo fixtures/bonami/listing-aparate-de-bucatarie_2026-10-27.html 48
check_demo fixtures/flip/product_2026-10-27.html 1
ok "every adapter parses its fixture"

step "end-to-end through source.run (fake fetcher, throwaway database, real normalizer)"
pnpm --filter @pretoscop/worker exec vitest run test/m10-adapters.test.ts --reporter=verbose >"$tmp/e2e.log" 2>&1 || {
  cat "$tmp/e2e.log"
  fail "adapter integration tests failed"
}
grep -E '✓|×' "$tmp/e2e.log" | sed 's/^ */   /'
ok "listing sources record offers and price events; Auchan's unavailable pages end a run cleanly"

step "registry: sources per shop (enabled / total), worst-case pages per day vs the shop budget"
pnpm --silent --filter @pretoscop/config exec tsx -e '
import { loadShops } from "./src/shops/index";
for (const s of loadShops()) {
  const on = s.sources.filter((x) => x.enabled);
  if (s.sources.length === 0 && s.status !== "active") continue;
  const pages = on.filter((x) => x.kind === "listing").reduce((a, x) => a + Number(x.config.max_pages ?? 0), 0);
  const kinds = [...new Set(on.map((x) => x.kind + ":" + (x.kind === "sitemap" ? String(x.config.productParser) : x.parser_key)))].join(", ") || "-";
  console.log(`   ${s.slug.padEnd(12)} ${s.status.padEnd(8)} ${String(on.length).padStart(2)}/${String(s.sources.length).padEnd(3)} listing pages <= ${String(pages).padStart(4)} / budget ${String(s.crawl_policy.max_pages_per_day ?? "-").padEnd(5)} slo ${s.crawl_policy.freshness_slo_hours}h  ${kinds}`);
}'
ok "registry printed (the database is synced by the worker on start, not by this script)"

step "politeness guard of the fixture recorder (no network: a blocked shop is refused first)"
set +e
pnpm --silent --filter @pretoscop/fetch record evomag robots https://www.evomag.ro/robots.txt >"$tmp/rec.log" 2>&1
code=$?
set -e
sed 's/^/   /' "$tmp/rec.log"
[[ $code -eq 3 ]] && grep -q 'refused' "$tmp/rec.log" || fail "the recorder did not refuse a blocked shop (exit $code)"
ok "blocked shops are refused before any request"

echo
echo "OK"
