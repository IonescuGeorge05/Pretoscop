#!/usr/bin/env bash
# M16 — SEO: structured data, robots.txt, sitemaps, server-rendered 404s, performance budget.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3210}"
LOG="$(mktemp -t m16-web-XXXXXX.log)"

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null
curl -sf http://localhost:7700/health | grep -q available || fail "Meilisearch is not healthy on :7700"
if port_in_use "$PORT"; then
  fail "port $PORT is busy: stop the server there (Playwright would reuse it without the e2e search index)"
fi

step "lint, typecheck, unit + integration tests (index policy, sitemap XML, JSON-LD of 10 fixtures, robots.txt, pages.xml, sitemap.build)"
pnpm turbo run lint typecheck test --concurrency=2 \
  --filter=@pretoscop/core --filter=@pretoscop/web --filter=@pretoscop/worker --filter=@pretoscop/icecat --output-logs=errors-only
ok "green: robots.txt decisions checked with our RFC 9309 parser (closed prototype and open site, Icecat's AI crawlers refused), sitemaps list only indexable products"

step "production build"
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

# The e2e run writes the dev sitemaps with the fixture in them: rebuild them on the way out, whatever happens.
restore_sitemaps() { pnpm --silent --filter @pretoscop/worker sitemap:build >/dev/null 2>&1 || true; }
trap restore_sitemaps EXIT

step "Playwright e2e (mobile + desktop): JSON-LD, closed robots.txt, sitemaps, server-rendered 404s, performance budget"
(cd apps/web && E2E_PORT="$PORT" pnpm exec playwright test e2e/seo.spec.ts --reporter=line)
ok "e2e green (fixture rows and the e2e search indexes removed in teardown)"

step "the open site (SITE_INDEXABLE=true): a second server start against a fresh fixture"
# Playwright stops its server, but never start a second one on a port that still answers.
if port_in_use "$PORT"; then stop_port "$PORT"; fi
FIXTURE=$(pnpm --silent --filter @pretoscop/db e2e:fixture create | tail -1)
cleanup() {
  stop_port "$PORT"
  pnpm --silent --filter @pretoscop/db e2e:fixture drop >/dev/null 2>&1 || true
  restore_sitemaps
}
trap cleanup EXIT
(cd apps/web && SITE_INDEXABLE=true PUBLIC_BASE_URL="http://localhost:$PORT" pnpm exec next start --port "$PORT" >"$LOG" 2>&1 &)
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$PORT/robots.txt" && break
  sleep 1
done
curl -sf -o /dev/null "http://localhost:$PORT/robots.txt" || fail "the web server did not start (log: $LOG)"
FIXTURE="$FIXTURE" BASE="http://localhost:$PORT" node --input-type=module -e '
const f = JSON.parse(process.env.FIXTURE);
const base = process.env.BASE;
const get = async (p) => { const r = await fetch(base + p, { redirect: "manual" }); return { status: r.status, text: await r.text() }; };
const robotsMeta = (html) => [...html.matchAll(/<meta name="robots" content="([^"]+)"/g)].map((m) => m[1]);
const problems = [];
const check = (ok, what) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`); if (!ok) problems.push(what); };

const robots = (await get("/robots.txt")).text;
check(/User-agent: \*\nDisallow: \/out\/\nDisallow: \/admin\nDisallow: \/api\/\nAllow: \//.test(robots), "robots.txt: search engines everywhere except /out/, /admin, /api/");
for (const ua of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot", "Meta-ExternalFetcher", "Omgili"]) check(robots.includes(`User-agent: ${ua}\n`), `robots.txt refuses ${ua}`);
check(robots.includes(`Sitemap: ${base}/sitemap.xml`), "robots.txt points at the sitemap index");

const tv = await get(`/p/${f.search.tv.slug}`);
check(robotsMeta(tv.text).includes("index, follow"), "a product with two live offers is indexable (index, follow)");
check(tv.text.includes(`<link rel="canonical" href="${base}/p/${f.search.tv.slug}"/>`), "its canonical URL is absolute");
const phone = await get(`/p/${f.search.phone.slug}`);
check(robotsMeta(phone.text).includes("noindex, follow"), "a single-offer product without 14 days of history is noindex, follow");
const provisional = await get(`/p/${f.slug}`);
check(robotsMeta(provisional.text).includes("noindex, follow"), "a provisional product is noindex, follow");
const search = await get("/cauta?q=televizor");
check(robotsMeta(search.text).includes("noindex, follow"), "search results are noindex, follow");
const missing = await get("/p/produs-care-nu-exista-999999999");
check(missing.status === 404 && robotsMeta(missing.text).some((m) => m.startsWith("noindex")) && !missing.text.includes("__next_error__"), "a missing product: 404, noindex, server-rendered");
const index = await get("/sitemap.xml");
check(index.status === 200 && index.text.includes(`<loc>${base}/sitemaps/pages.xml</loc>`), "sitemap index served");
if (problems.length) { console.error(`${problems.length} problem(s)`); process.exit(1); }
'
ok "open-site robots, meta robots and canonical as the index policy says"
stop_port "$PORT"
pnpm --silent --filter @pretoscop/db e2e:fixture drop >/dev/null
trap - EXIT

step "dev sitemaps rebuilt from the dev database (without the fixture)"
OUT=$(pnpm --silent --filter @pretoscop/worker sitemap:build | tail -1)
node -e 'const m = JSON.parse(process.argv[1]); console.log(m.files.map((f) => `${f.name}: ${f.urls} URLs`).join("\n")); console.log(`written to ${m.manifest}`);' "$OUT"
ok "sitemaps (only indexable product pages; the web app adds pages.xml)"

echo
echo "OK"
