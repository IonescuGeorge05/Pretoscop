#!/usr/bin/env bash
# M22 — LLM-assisted matching: the Anthropic client (price table, monthly cap, batches, prompts, data
# guard) against a local mock of the API, the gray-zone policy and the eval harness, the llm_usage
# ledger and LLM decisions, the llm.match pipeline end to end, the eval in mock mode, a dry run and a
# write-free mock preview on this checkout's real review queue, and the admin spend panel and undo
# (Playwright). No request ever reaches Anthropic: there is no key (setup A9), the tests and the
# --mock runs use a local stand-in, and --dry-run sends nothing.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

export E2E_PORT="${E2E_PORT:-3470}"
export CRAWL_ENABLED=false
export ADMIN_EMAILS="${ADMIN_EMAILS:-admin@pretoscop.test}"
# Never the real API from this check, whatever the shell or .env carries.
export ANTHROPIC_API_KEY= ANTHROPIC_BASE_URL=

next_build_running() {
  if is_windows; then
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify/next-build-running.ps1 >/dev/null 2>&1
  else
    pgrep -f 'next build' >/dev/null 2>&1
  fi
}

ensure_services

step "database ${DEV_DB}: migrations (0019_llm_usage)"
pnpm --silent --filter @pretoscop/db migrate >/dev/null
[ "$(psql_dev -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('llm_usage', 'llm_results')")" = 2 ] ||
  fail "llm_usage / llm_results missing"
FLAG="$(psql_dev -c "SELECT enabled FROM feature_flags WHERE key = 'llm.matching.enabled'")"
[ "$FLAG" != "t" ] || fail "llm.matching.enabled is ON in ${DEV_DB}: it must stay off until A9 and a passing eval"
ok "${DEV_DB} migrated; llm.matching.enabled is ${FLAG:-absent (off)}"

PACKAGES=(--filter=@pretoscop/llm --filter=@pretoscop/core --filter=@pretoscop/config --filter=@pretoscop/db --filter=@pretoscop/worker --filter=@pretoscop/web)
step "lint and typecheck (llm, core, config, db, worker, web)"
pnpm turbo run lint typecheck "${PACKAGES[@]}" --concurrency=3 --output-logs=errors-only
ok "green"

step "unit + integration tests (mock API, test databases)"
pnpm turbo run test "${PACKAGES[@]}" --concurrency=2 --output-logs=errors-only -- --maxWorkers=2
ok "green"

step "the contract's checks, by name: cap stops calls at 100 %, recorded-shape responses, no Icecat data or seller names sent"
(cd packages/llm && pnpm exec vitest run --reporter=verbose -t "cap|documented|Icecat|seller|retries|batch price|canceled" 2>&1 | grep -E '✓|×|Tests ' | sed 's/^/   /')
(cd apps/worker && pnpm exec vitest run test/llm.test.ts --reporter=verbose 2>&1 | grep -E '✓|×|Tests ' | sed 's/^/   /')
(cd packages/db && pnpm exec vitest run test/llm.test.ts --reporter=verbose -t "cap|seller|human|reject" 2>&1 | grep -E '✓|×|Tests ' | sed 's/^/   /')
ok "named checks green"

step "M07 eval on the extended set (≥ 500 labelled pairs) still passes"
EVAL="$(pnpm --silent --filter @pretoscop/worker match:eval)"
PAIRS="$(sed -nE 's/^all +([0-9]+) pairs.*/\1/p' <<<"$EVAL" | head -1)"
[ "${PAIRS:-0}" -ge 500 ] || fail "eval set has ${PAIRS:-0} pairs (< 500)"
grep -q '^PASS' <<<"$EVAL" || fail "M07 eval failed"
ok "${PAIRS} pairs, PASS"

step "LLM eval harness, mock mode (pipeline check, NOT a measurement), identifiers masked"
MOCKEVAL="$(pnpm --silent --filter @pretoscop/worker match:eval:llm --mock --mask)"
sed -n '/^## All labelled/,/^## Verdict/p' <<<"$MOCKEVAL" | sed 's/^/   /'
grep -q 'MOCK (not a measurement)' <<<"$MOCKEVAL" || fail "mock banner missing"
grep -q 'cost per 1,000 pairs (ledger)' <<<"$MOCKEVAL" || fail "no ledger cost per 1,000 pairs"
grep -q 'cost per 1,000 pairs (price table' <<<"$MOCKEVAL" || fail "no price-table cost per 1,000 pairs"
grep -qE 'go to the LLM \(scope gray\): ([5-9][0-9]|[1-9][0-9]{2,}) with real labels' <<<"$MOCKEVAL" || fail "fewer than 50 real-labelled pairs reach the LLM with --mask"
ok "harness reports precision/recall per threshold and the cost per 1,000 pairs; real precision pending a run with a key (A9)"

step "real review queue of ${DEV_DB}: dry run (nothing sent) and a write-free mock preview"
USAGE_BEFORE="$(psql_dev -c "SELECT count(*) FROM llm_usage")"
QUEUE_BEFORE="$(psql_dev -c "SELECT count(*) FROM offers WHERE match_status = 'pending' AND matched_at IS NOT NULL AND active AND NOT blacklisted")"
pnpm --silent --filter @pretoscop/worker llm:match --dry-run --limit 20 | tail -5 | sed 's/^/   /'
pnpm --silent --filter @pretoscop/worker llm:match --mock --limit 20 | tail -4 | sed 's/^/   /'
pnpm --silent --filter @pretoscop/worker llm:spend | sed 's/^/   /'
[ "$(psql_dev -c "SELECT count(*) FROM llm_usage")" = "$USAGE_BEFORE" ] || fail "a dry run or mock preview wrote to llm_usage"
[ "$(psql_dev -c "SELECT count(*) FROM offers WHERE match_status = 'pending' AND matched_at IS NOT NULL AND active AND NOT blacklisted")" = "$QUEUE_BEFORE" ] ||
  fail "a dry run or mock preview changed the review queue"
set +e
REAL="$(pnpm --silent --filter @pretoscop/worker llm:match --limit 1 2>&1)"
REAL_EXIT=$?
set -e
[ "$REAL_EXIT" = 2 ] && grep -q 'ANTHROPIC_API_KEY is not set' <<<"$REAL" || fail "a real pass without a key must refuse (exit 2), got $REAL_EXIT: $REAL"
ok "queue ${QUEUE_BEFORE} unchanged, ledger unchanged; a real pass refuses without a key"

export PUBLIC_BASE_URL="http://localhost:${E2E_PORT}"
step "production build (waits while another Next build runs on this machine)"
for ((i = 0; i < 180; i++)); do next_build_running || break; sleep 5; done
(cd apps/web && pnpm exec next build >/dev/null)
ok "next build"

step "web app on :${E2E_PORT}; Playwright: LLM spend card, LLM decisions and undo, review queue (one worker: shared admin fixture)"
LOG_DIR="$(mktemp -d)"
stop_port "$E2E_PORT"
(cd apps/web && exec pnpm exec next start --port "$E2E_PORT") >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
# stop_port as well: on Windows the native node process outlives the killed Git Bash subshell.
trap 'kill "$WEB_PID" 2>/dev/null || true; stop_port "$E2E_PORT"' EXIT
for ((i = 0; i < 90; i++)); do curl -sf "http://localhost:${E2E_PORT}/" >/dev/null && break; sleep 1; done
(cd apps/web && pnpm exec playwright test e2e/llm.spec.ts e2e/admin.spec.ts --project=desktop --workers=1 --reporter=line) || {
  tail -40 "$LOG_DIR/web.log"
  fail "e2e failed"
}
ok "e2e green"

step "no test data left behind"
left="$(psql_dev -c "SELECT (SELECT count(*) FROM offers WHERE external_id LIKE 'e2e-fixture-%') + (SELECT count(*) FROM llm_usage WHERE subject->>'e2e' = 'true')")"
[ "$left" = 0 ] || fail "the e2e left $left fixture row(s)"
ok "clean"

echo
echo "OK"
