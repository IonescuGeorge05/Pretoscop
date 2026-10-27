#!/usr/bin/env bash
# Helpers shared by scripts/verify/MXX.sh. Source it: `. scripts/verify/lib.sh`.

COMPOSE="docker compose -f infra/docker-compose.dev.yml -p pretoscop"

step() { printf '\n\033[1;34m-- %s\033[0m\n' "$*"; }
ok() { printf '\033[32mOK\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31mFAIL\033[0m %s\n' "$*" >&2
  exit 1
}

ensure_services() {
  step "services (postgres, meilisearch, mailpit)"
  $COMPOSE up -d --wait --no-recreate postgres meilisearch mailpit >/dev/null 2>&1 || fail "docker compose up failed (is Docker running?)"
  ok "services healthy"
}

# Runs psql inside the postgres container against the dev database.
psql_dev() {
  $COMPOSE exec -T postgres psql -U pretoscop -d pretoscop -v ON_ERROR_STOP=1 -At "$@"
}

# Waits until a file contains a pattern or times out: wait_for_log FILE PATTERN SECONDS
wait_for_log() {
  local file="$1" pattern="$2" secs="$3"
  for ((i = 0; i < secs; i++)); do
    if grep -q "$pattern" "$file" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
