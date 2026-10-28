#!/usr/bin/env bash
# M27 — Telegram bot and web push. Everything runs against local stand-ins: a mock of the Telegram
# Bot API and a mock push service (both inside the tests), test VAPID keys made at test time. No
# request goes to Telegram or to a browser vendor's push service.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

PORT="${E2E_PORT:-3200}"
CHANNEL_FLAGS="'alerts.push.enabled','alerts.telegram.enabled','telegram.deals.enabled'"
# Playwright starts (and stops) its own web server; anything left on the port is stopped on exit.
trap 'stop_port "$PORT"' EXIT

# True while another `next build` runs on this machine (one production build at a time: RAM).
next_build_running() {
  if is_windows; then
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1 >/dev/null 2>&1
  else
    pgrep -f 'next build' >/dev/null 2>&1
  fi
}

ensure_services
pnpm --silent --filter @pretoscop/db migrate >/dev/null

step "the channels migration (00xx_channels) on the dev database ($DEV_DB) and an unbroken snapshot chain"
[ "$(psql_dev -c "SELECT to_regclass('public.push_subscriptions') IS NOT NULL AND to_regclass('public.telegram_links') IS NOT NULL AND to_regclass('public.telegram_link_tokens') IS NOT NULL AND to_regclass('public.channel_deliveries') IS NOT NULL AND to_regclass('public.channel_posts') IS NOT NULL")" = t ] || fail "channel tables missing"
node -e "
const fs = require('fs');
const dir = 'packages/db/migrations/meta';
const j = JSON.parse(fs.readFileSync(dir + '/_journal.json', 'utf8'));
let prev = null, when = 0;
for (const e of j.entries) {
  const snap = JSON.parse(fs.readFileSync(dir + '/' + e.tag.slice(0, 4) + '_snapshot.json', 'utf8'));
  if (prev !== null && snap.prevId !== prev) { console.error('snapshot chain broken at ' + e.tag); process.exit(1); }
  if (e.when <= when) { console.error('journal timestamps not increasing at ' + e.tag); process.exit(1); }
  prev = snap.id; when = e.when;
}
if (!j.entries.some((e) => /_channels$/.test(e.tag))) { console.error('no channels migration in the journal'); process.exit(1); }
" || fail "migration metadata"
ok "tables present; journal and snapshots chained"

step "feature flags: off by default, and off in this database unless someone turned them on"
grep -q "values({ key, enabled: false, description })" packages/db/src/queries/flags.ts || fail "ensureKnownFlags no longer creates flags switched off"
on=$(psql_dev -c "SELECT coalesce(string_agg(key, ', '), '') FROM feature_flags WHERE key IN ($CHANNEL_FLAGS) AND enabled")
if [ -n "$on" ]; then printf 'note: switched on in %s: %s\n' "$DEV_DB" "$on"; fi
ok "new flags are created off"

step "no bot token or VAPID private key in git"
if git grep -nE '[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}' -- . ':!pnpm-lock.yaml' >/dev/null; then fail "something that looks like a Telegram bot token is committed"; fi
if git grep -nE '^(VAPID_PRIVATE_KEY|TELEGRAM_BOT_TOKEN)=[^[:space:]]+$' -- . >/dev/null; then fail "a VAPID private key or bot token has a value in a tracked file"; fi
ok "placeholders only"

step "lint, typecheck, unit + integration tests (notify clients, formats and the broadcast snapshot; config; db channel queries; worker bot commands, delivery and polling against the Telegram mock; web)"
pnpm turbo run lint typecheck test --filter=@pretoscop/notify --filter=@pretoscop/config --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web --filter=@pretoscop/core --filter=@pretoscop/mailer --concurrency=1 --output-logs=errors-only
ok "green"

step "CLIs refuse what they cannot do"
set +e
TELEGRAM_BOT_TOKEN= TELEGRAM_BOT_USERNAME= pnpm --silent --filter @pretoscop/worker telegram:poll --once >/dev/null 2>&1
code=$?
pnpm --silent --filter @pretoscop/worker alerts:run --now not-a-time >/dev/null 2>&1
code2=$?
set -e
[ "$code" = 2 ] || fail "telegram:poll ran without a bot token (exit $code)"
[ "$code2" = 2 ] || fail "alerts:run accepted --now not-a-time (exit $code2)"
pnpm --silent --filter @pretoscop/notify vapid:keys | grep -qE '^VAPID_PUBLIC_KEY=[A-Za-z0-9_-]{87}$' || fail "vapid:keys output"
ok "telegram:poll needs a token; alerts:run --now needs a time; vapid:keys prints a pair (not stored)"

step "production build (waits while another Next build runs on this machine)"
# Prerendered pages embed PUBLIC_BASE_URL: build with the URL the e2e server runs on.
export PUBLIC_BASE_URL="http://localhost:${PORT}"
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "Playwright e2e: push (consent, permission, encrypted test notification, alert moved to push and delivered, removal), Telegram (one-time link, /start, /urmareste, alert, /alertele, /oprire, export), flags off, refusals, service worker; then the M19 alert flows (regression)"
# Which of the alert flags are on (the fixtures switch them on and must put them back).
flags_on() { psql_dev -c "SELECT coalesce(string_agg(key, ',' ORDER BY key), '') FROM feature_flags WHERE key IN ($CHANNEL_FLAGS, 'alerts.email.enabled') AND enabled"; }
flags_before=$(flags_on)
stop_port "$PORT"
# Own fixtures only (E2E_SHARED_FIXTURE=0); one worker: both specs switch flags while they run.
(cd apps/web && E2E_SHARED_FIXTURE=0 E2E_PORT="$PORT" pnpm exec playwright test e2e/channels.spec.ts e2e/alerts.spec.ts --project=desktop --workers=1 --reporter=line)
ok "e2e green"

step "no test data left behind, flags as they were"
left=$(psql_dev -c "SELECT (SELECT count(*) FROM users WHERE email LIKE 'canale-e2e-%' OR email LIKE 'alerte-e2e-%') + (SELECT count(*) FROM offers WHERE external_id LIKE 'e2e-fixture-channels-%' OR external_id LIKE 'e2e-fixture-alerts-%')")
[ "$left" = 0 ] || fail "the e2e left $left rows"
flags_after=$(flags_on)
[ "$flags_before" = "$flags_after" ] || fail "flags switched on before [$flags_before] and after [$flags_after] differ"
ok "clean"

echo
echo "OK"
