#!/usr/bin/env bash
# M05 — phase-0 price recorder: pipeline tests on fixtures (offers, change-only events, snapshots,
# sitemaps, gates, blocks and alerts), backup to the blob store, a look at the live data, and the
# live comparison against the shop's pages (polite; eMAG through two listing pages only).
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "lint, typecheck, tests (worker incl. recorder pipeline, db, extractors, fetch)"
pnpm turbo run lint typecheck test --filter=@pretoscop/worker --filter=@pretoscop/db --filter=@pretoscop/extractors --filter=@pretoscop/fetch --output-logs=errors-only
ok "green"

step "nightly backup job writes a pg_dump to the blob store"
pnpm --silent --filter @pretoscop/worker exec tsx src/cli/backup.ts | tail -2
ok "backup written"

step "live data in the dev database"
psql_dev -c "select s.slug, count(*) as offers, count(*) filter (where o.last_checked_at > now() - interval '26 hours') as fresh from offers o join shops s on s.id = o.shop_id where o.external_id not like 'e2e-fixture-%' group by 1 order by 2 desc"
psql_dev -c "select count(*) as price_events, count(distinct offer_id) as offers_with_events from price_events"
psql_dev -c "select host, paused_until, pause_reason from fetch_domain_state where paused_until > now()" | sed 's/^/paused: /'
ok "printed"

step "live comparison (polite, ≤ 2 listing pages for eMAG)"
if grep -qE '^CRAWL_ENABLED=(true|1)' .env 2>/dev/null; then
  pnpm --silent --filter @pretoscop/worker compare:live --n 20 --shop emag 2>/dev/null | tail -22 || true
else
  echo "CRAWL_ENABLED is off in .env: live comparison skipped"
fi

echo
echo "OK"
