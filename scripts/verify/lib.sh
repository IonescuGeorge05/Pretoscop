#!/usr/bin/env bash
# Helpers shared by scripts/verify/MXX.sh. Source it: `. scripts/verify/lib.sh`.

COMPOSE="docker compose -f infra/docker-compose.dev.yml -p pretoscop"

# The dev database of this checkout, read like the apps read it (environment first, then .env), so
# a worktree can verify against its own copy (e.g. DATABASE_URL=…/pretoscop_m27).
_dev_db_url="${DATABASE_URL:-$(sed -nE 's#^DATABASE_URL=(.*)$#\1#p' .env 2>/dev/null | tail -1)}"
DEV_DB="${DEV_DB:-$(printf '%s' "$_dev_db_url" | sed -nE 's#^[a-z]+://[^/]*/([A-Za-z0-9_]+).*#\1#p')}"
DEV_DB="${DEV_DB:-pretoscop}"

# Port for the web server that verify scripts and Playwright start; a worktree can set its own in
# .env (E2E_PORT=…) so parallel checkouts never share one.
E2E_PORT="${E2E_PORT:-$(sed -nE 's#^E2E_PORT=([0-9]+).*$#\1#p' .env 2>/dev/null | tail -1)}"
if [ -n "$E2E_PORT" ]; then export E2E_PORT; else unset E2E_PORT; fi

step() { printf '\n\033[1;34m-- %s\033[0m\n' "$*"; }
ok() { printf '\033[32mOK\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31mFAIL\033[0m %s\n' "$*" >&2
  exit 1
}

ensure_services() {
  step "services (postgres, meilisearch, mailpit)"
  # --no-recreate: start what is missing, never recreate running services (a branch with an older
  # compose file would otherwise restart the shared PostgreSQL for every other process).
  $COMPOSE up -d --wait --no-recreate postgres meilisearch mailpit >/dev/null 2>&1 || fail "docker compose up failed (is Docker running?)"
  ok "services healthy"
}

# Runs psql inside the postgres container against the dev database.
psql_dev() {
  $COMPOSE exec -T postgres psql -U pretoscop -d "$DEV_DB" -v ON_ERROR_STOP=1 -At "$@"
}

is_windows() {
  case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) return 0 ;; *) return 1 ;; esac
}

# True when something listens on the TCP port.
port_in_use() {
  if is_windows; then
    netstat -ano | awk -v p=":$1" '$1 == "TCP" && $4 == "LISTENING" && substr($2, length($2) - length(p) + 1) == p { f = 1 } END { exit !f }'
  else
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

# Stops whatever listens on the TCP port (e.g. a `next start` a script left behind). Git Bash cannot
# signal native Windows processes, so there the PID comes from netstat and taskkill ends its tree.
stop_port() {
  local pids pid
  if is_windows; then
    pids="$(netstat -ano | awk -v p=":$1" '$1 == "TCP" && $4 == "LISTENING" && substr($2, length($2) - length(p) + 1) == p { print $5 }' | sort -u)"
    for pid in $pids; do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  else
    pids="$(lsof -t -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
  fi
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
