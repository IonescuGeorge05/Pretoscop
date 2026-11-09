#!/usr/bin/env bash
# M29 — category expansion (books built, beauty prepared) and CSS readiness.
# No request leaves the machine: parsers, recorder and matcher run on the recorded fixtures.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3290}"
LOG="$(mktemp -t m29-web-XXXXXX.log)"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null
curl -sf http://localhost:7700/health | grep -q available || fail "Meilisearch is not healthy on :7700"
if port_in_use "$PORT"; then
  fail "port $PORT is busy: stop the server there (Playwright would reuse it without the e2e search index)"
fi

step "lint, typecheck, unit + integration tests (verticals, ISBN, books, beauty, taxonomy, matching, parsers, recorder, eval gate)"
pnpm turbo run lint typecheck test --concurrency=2 \
  --filter=@pretoscop/core --filter=@pretoscop/extractors --filter=@pretoscop/config --filter=@pretoscop/db \
  --filter=@pretoscop/llm --filter=@pretoscop/worker --filter=@pretoscop/web --output-logs=errors-only
ok "green (core: books.test, beauty.test, m29-categories, m29-eval; extractors: m29-books; worker: m29-books through source.run and the matcher)"

step "fixtures recorded for M29: no third-party key left in them (public repository)"
M29_FIXTURES=$(ls packages/extractors/fixtures/libris/*_2026-11-09.* packages/extractors/fixtures/elefant/*_2026-11-09.*)
if grep -lE 'AIza[0-9A-Za-z_-]{35}|pk\.eyJ[0-9A-Za-z._-]{20,}|sk_(live|test)_[0-9A-Za-z]{10,}|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{30,}|xox[abpr]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|6L[0-9A-Za-z_-]{38}' $M29_FIXTURES; then
  fail "a fixture above contains a key: redact it with a same-length placeholder and note it in its .meta.json"
fi
ok "$(echo "$M29_FIXTURES" | wc -l | tr -d ' ') files clean (the Libris reCAPTCHA site key is redacted, see the .meta.json files)"

step "registry: every Libris and Elefant source ships disabled"
if grep -nE '^\s+enabled: true' packages/config/shops/libris.yaml packages/config/shops/elefant.yaml; then
  fail "an M29 source is enabled: the lead enables them after watching a run"
fi
ok "$(grep -cE '^\s+enabled: false' packages/config/shops/libris.yaml packages/config/shops/elefant.yaml | paste -sd' ' -) sources disabled (libris, elefant)"

step "matching eval per category (gate: precision >= 98% at the accept threshold, no accepted hard negative)"
pnpm --silent --filter @pretoscop/worker match:eval:categories
ok "gate passed for books and beauty"

step "the recorded catalogue keeps its categories (no launch offer becomes a book or a beauty product)"
pnpm --silent --filter @pretoscop/worker verticals:check
ok "no offer of a launch shop changes vertical"

step "CSS readiness report (read-only on the dev database)"
pnpm --silent --filter @pretoscop/worker css:readiness

step "production build"
if is_windows && powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1; then
  echo "another next build is running on this machine: waiting for it to finish"
  while powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1; do sleep 15; done
fi
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

# seo.spec.ts writes the dev sitemaps with the fixture in them: rebuild them on the way out.
restore_sitemaps() { pnpm --silent --filter @pretoscop/worker sitemap:build >/dev/null 2>&1 || true; }
trap restore_sitemaps EXIT

step "Playwright e2e (mobile + desktop): the new category pages, and the specs sharing the fixture (search, SEO, deals)"
(cd apps/web && E2E_PORT="$PORT" pnpm exec playwright test e2e/categories.spec.ts e2e/search.spec.ts e2e/seo.spec.ts e2e/deals.spec.ts --reporter=line)
ok "e2e green (fixture rows and the e2e search indexes removed in teardown)"

step "the open site (SITE_INDEXABLE=true): category pages are noindex until they have an indexable product (M16)"
if port_in_use "$PORT"; then stop_port "$PORT"; fi
E2E_PREFIX="$(sed -n 's/^MEILI_INDEX_PREFIX=//p' .env 2>/dev/null | head -1 | tr -d "\"'")e2e_"
pnpm --silent --filter @pretoscop/db e2e:fixture create >/dev/null
cleanup() {
  stop_port "$PORT"
  pnpm --silent --filter @pretoscop/db e2e:fixture drop >/dev/null 2>&1 || true
  (cd apps/worker && MEILI_INDEX_PREFIX="$E2E_PREFIX" node --import tsx src/cli/search.ts drop >/dev/null 2>&1) || true
  # Pages cached by the open-site server must not be served to a later closed-site run of this build.
  find apps/web/.next/server/route-cache -type d -name c -path '*/$/c' -prune -exec rm -rf {} + 2>/dev/null || true
  restore_sitemaps
}
trap cleanup EXIT
(cd apps/worker && MEILI_INDEX_PREFIX="$E2E_PREFIX" node --import tsx src/cli/search.ts rebuild >/dev/null)
# The e2e run rendered these category pages with SITE_INDEXABLE=false and Next keeps them (ISR, 1 h):
# drop the cached category pages so this server renders them with the open site's settings.
find apps/web/.next/server/route-cache -type d -name c -path '*/$/c' -prune -exec rm -rf {} + 2>/dev/null || true
(cd apps/web && SITE_INDEXABLE=true MEILI_INDEX_PREFIX="$E2E_PREFIX" PUBLIC_BASE_URL="http://localhost:$PORT" pnpm exec next start --port "$PORT" >"$LOG" 2>&1 &)
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$PORT/robots.txt" && break
  sleep 1
done
curl -sf -o /dev/null "http://localhost:$PORT/robots.txt" || fail "the web server did not start (log: $LOG)"
BASE="http://localhost:$PORT" node --input-type=module -e '
const base = process.env.BASE;
const robots = async (p) => { const html = await (await fetch(base + p)).text(); return [...html.matchAll(/<meta name="robots" content="([^"]+)"/g)].map((m) => m[1])[0]; };
const problems = [];
const check = (ok, what) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`); if (!ok) problems.push(what); };
const kids = await robots("/c/carti/carti-pentru-copii");
check(kids === "index, follow", `/c/carti/carti-pentru-copii (a book with 2 live offers): ${kids}`);
const fiction = await robots("/c/carti/beletristica");
check(fiction === "noindex, follow", `/c/carti/beletristica (only a provisional single-offer book): ${fiction}`);
for (const p of ["/c/frumusete", "/c/frumusete/parfumuri"]) { const r = await robots(p); check(r === "noindex, follow", `${p} (no product): ${r}`); }
if (problems.length) { console.error(`FAIL: ${problems.length} check(s)`); process.exitCode = 1; }
'
ok "index only with an indexable product; empty and provisional-only categories noindex"

echo
echo "OK"
