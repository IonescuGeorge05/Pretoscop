#!/usr/bin/env bash
# pgBackRest sidecar (ADR-017). Runs in the `pgbackrest` service of infra/docker-compose.prod.yml,
# from the same image as the database, as the postgres user, sharing the data volume and the
# server's Unix socket. The database container itself pushes WAL (archive_command); this process:
#   - creates the stanza and checks that WAL archiving works,
#   - takes a full backup right away when the repository has none,
#   - every day at BACKUP_AT (Europe/Bucharest) takes a differential backup, or a full one on
#     BACKUP_FULL_DOW; pgBackRest expires old backups itself (PGBACKREST_REPO1_RETENTION_FULL),
#   - on RESTORE_TEST_DOW, after the backup, restores the latest backup plus all archived WAL into
#     a scratch directory, starts it on a private socket, compares row counts with the live
#     database and deletes it,
#   - pings heartbeat URLs on success (Better Stack / healthchecks.io: a missing ping is an alert)
#     and sends a Telegram alert on failure.
# Configuration is the PGBACKREST_* environment (see .env.example); nothing is written to disk.
#
# Usage: pgbackrest-sidecar [loop | backup [full|diff|incr] | restore-test | check | info |
#                            restore-scratch ['YYYY-MM-DD HH:MM:SS+00'] | scratch-stop]
set -Eeuo pipefail

STANZA="${PGBACKREST_STANZA:-pretoscop}"
SOCKET_DIR="${PGBACKREST_PG1_SOCKET_PATH:-/var/run/postgresql}"
DB_USER="${PGBACKREST_PG1_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${POSTGRES_DB:-pretoscop}"
LOCAL_TZ="${BACKUP_TZ:-Europe/Bucharest}"
BACKUP_AT="${BACKUP_AT:-02:30}"
FULL_DOW="${BACKUP_FULL_DOW:-7}"
RESTORE_TEST_DOW="${RESTORE_TEST_DOW:-7}"
RESTORE_DIR="${RESTORE_TEST_DIR:-/tmp/pgbackrest-restore-test}"
RESTORE_PORT="${RESTORE_TEST_PORT:-5499}"
RESTORE_TIMEOUT_S="${RESTORE_TEST_TIMEOUT_S:-7200}"
ENV_NAME="${APP_ENV:-prod}"

export PGBACKREST_STANZA="$STANZA"
export PGBACKREST_LOG_LEVEL_FILE="${PGBACKREST_LOG_LEVEL_FILE:-off}"
export PGBACKREST_LOG_LEVEL_CONSOLE="${PGBACKREST_LOG_LEVEL_CONSOLE:-info}"

log() { printf '%s pgbackrest-sidecar[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ENV_NAME" "$*"; }

alert() {
  log "ALERT: $*"
  if [[ -n "${OPS_ALERT_TELEGRAM_BOT_TOKEN:-}" && -n "${OPS_ALERT_TELEGRAM_CHAT_ID:-}" ]]; then
    curl -fsS -m 10 -o /dev/null -X POST "https://api.telegram.org/bot${OPS_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${OPS_ALERT_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=⚠️ Pretoscop (${ENV_NAME}): $*" || log "telegram alert failed"
  fi
}

# heartbeat URL [fail]: healthchecks.io and Better Stack heartbeats both accept GET <url> and <url>/fail.
heartbeat() {
  local url="${1:-}" suffix=""
  [[ -n "$url" ]] || return 0
  [[ "${2:-}" == fail ]] && suffix="/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null "${url%/}${suffix}" || log "heartbeat ping failed (${url%%\?*})"
}

wait_for_db() {
  local i
  for ((i = 0; i < 300; i++)); do
    pg_isready -q -h "$SOCKET_DIR" -U "$DB_USER" -d "$DB_NAME" && return 0
    sleep 2
  done
  log "database not ready after 600 s"
  return 1
}

live_sql() { psql -X -q -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -U "$DB_USER" -d "$DB_NAME" -c "$1"; }

ensure_stanza() {
  # Idempotent: succeeds when the stanza already exists and matches this cluster.
  pgbackrest stanza-create
}

check_archiving() {
  # Forces a WAL switch and waits until the segment is in the repository.
  pgbackrest check
}

backup_count() {
  pgbackrest info --output=json 2>/dev/null | jq -r --arg s "$STANZA" '[.[] | select(.name == $s) | .backup[]?] | length' 2>/dev/null || echo 0
}

run_backup() {
  local type="${1:-diff}"
  log "starting ${type} backup"
  if pgbackrest --type="$type" backup; then
    log "${type} backup finished"
    pgbackrest info | sed 's/^/  /'
    heartbeat "${BACKUP_HEARTBEAT_URL:-}"
    return 0
  fi
  alert "pgBackRest ${type} backup failed (stanza ${STANZA}); see: docker compose logs pgbackrest"
  heartbeat "${BACKUP_HEARTBEAT_URL:-}" fail
  return 1
}

stop_scratch() {
  if [[ -f "$RESTORE_DIR/postmaster.pid" ]]; then
    pg_ctl -D "$RESTORE_DIR" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$RESTORE_DIR" "${RESTORE_DIR}.sock"
}

count_tables=(shops shop_sources offers price_events ingest_runs)

restore_test() {
  local started rc=0
  started=$(date +%s)
  log "restore test: latest backup + archived WAL into ${RESTORE_DIR}"
  stop_scratch
  mkdir -p "$RESTORE_DIR" "${RESTORE_DIR}.sock"
  chmod 700 "$RESTORE_DIR"
  # archive-mode=off: the scratch copy must never push WAL into the production repository.
  if ! pgbackrest --pg1-path="$RESTORE_DIR" --archive-mode=off --type=default restore; then
    alert "restore test: pgbackrest restore failed"
    heartbeat "${RESTORE_TEST_HEARTBEAT_URL:-}" fail
    stop_scratch
    return 1
  fi
  if ! pg_ctl -D "$RESTORE_DIR" -w -t 600 -l "${RESTORE_DIR}.sock/server.log" \
      -o "-c config_file=$RESTORE_DIR/postgresql.conf -c port=${RESTORE_PORT} -c listen_addresses='' -c unix_socket_directories=${RESTORE_DIR}.sock -c shared_buffers=128MB -c archive_mode=off -c max_connections=20" start; then
    tail -n 30 "${RESTORE_DIR}.sock/server.log" || true
    alert "restore test: the restored cluster did not start"
    heartbeat "${RESTORE_TEST_HEARTBEAT_URL:-}" fail
    stop_scratch
    return 1
  fi
  # Recovery replays every archived segment, then promotes.
  local waited=0
  until [[ "$(psql -X -At -h "${RESTORE_DIR}.sock" -p "$RESTORE_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select pg_is_in_recovery()' 2>/dev/null)" == "f" ]]; do
    sleep 5
    waited=$((waited + 5))
    if ((waited > RESTORE_TIMEOUT_S)); then
      alert "restore test: recovery did not finish within ${RESTORE_TIMEOUT_S} s"
      heartbeat "${RESTORE_TEST_HEARTBEAT_URL:-}" fail
      stop_scratch
      return 1
    fi
  done
  local t live restored report=""
  for t in "${count_tables[@]}"; do
    live=$(live_sql "select count(*) from ${t}" 2>/dev/null || echo "?")
    restored=$(psql -X -At -h "${RESTORE_DIR}.sock" -p "$RESTORE_PORT" -U "$DB_USER" -d "$DB_NAME" -c "select count(*) from ${t}" 2>/dev/null || echo "?")
    report+="${t}=${restored}/${live} "
    if [[ "$restored" == "?" ]]; then
      rc=1
    elif [[ "$live" != "?" ]] && ((restored * 100 < live * 98)); then
      # The restored copy may only lag the live database by the last few minutes of WAL.
      rc=1
    fi
  done
  if [[ "$(live_sql 'select count(*) > 0 from shops' 2>/dev/null)" == "t" ]] &&
    [[ "$(psql -X -At -h "${RESTORE_DIR}.sock" -p "$RESTORE_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select count(*) > 0 from shops' 2>/dev/null)" != "t" ]]; then
    rc=1
  fi
  stop_scratch
  local secs=$(($(date +%s) - started))
  if ((rc == 0)); then
    log "restore test passed in ${secs} s (restored/live): ${report}"
    heartbeat "${RESTORE_TEST_HEARTBEAT_URL:-}"
  else
    alert "restore test FAILED in ${secs} s (restored/live): ${report}"
    heartbeat "${RESTORE_TEST_HEARTBEAT_URL:-}" fail
  fi
  return "$rc"
}

# A manual scratch copy at a point in time, left running so rows can be copied back with pg_dump
# (infra/runbooks/restore.md, "scratch route"). Separate directory and port from the weekly test.
SCRATCH_DIR="${SCRATCH_DIR:-/tmp/pgbackrest-scratch}"
SCRATCH_PORT="${SCRATCH_PORT:-5498}"

stop_manual_scratch() {
  if [[ -f "$SCRATCH_DIR/postmaster.pid" ]]; then
    pg_ctl -D "$SCRATCH_DIR" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$SCRATCH_DIR" "${SCRATCH_DIR}.sock"
}

restore_scratch() {
  local target="${1:-}"
  local args=("--pg1-path=${SCRATCH_DIR}" --archive-mode=off)
  [[ -n "$target" ]] && args+=(--type=time "--target=${target}" --target-action=promote)
  stop_manual_scratch
  mkdir -p "$SCRATCH_DIR" "${SCRATCH_DIR}.sock"
  chmod 700 "$SCRATCH_DIR"
  log "scratch copy: restoring ${target:-latest} into ${SCRATCH_DIR}"
  pgbackrest "${args[@]}" restore
  pg_ctl -D "$SCRATCH_DIR" -w -t 600 -l "${SCRATCH_DIR}.sock/server.log" \
    -o "-c port=${SCRATCH_PORT} -c listen_addresses='' -c unix_socket_directories=${SCRATCH_DIR}.sock -c shared_buffers=256MB -c archive_mode=off -c max_connections=20" start
  local waited=0
  until [[ "$(psql -X -At -h "${SCRATCH_DIR}.sock" -p "$SCRATCH_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select pg_is_in_recovery()' 2>/dev/null)" == "f" ]]; do
    sleep 5
    waited=$((waited + 5))
    ((waited <= RESTORE_TIMEOUT_S)) || {
      log "scratch copy: recovery did not finish within ${RESTORE_TIMEOUT_S} s"
      return 1
    }
  done
  log "scratch copy (${target:-latest}) is up. Read it with:"
  log "  pg_dump -h ${SCRATCH_DIR}.sock -p ${SCRATCH_PORT} -U ${DB_USER} -d ${DB_NAME} --data-only -t <table>"
  log "Stop it with: pgbackrest-sidecar scratch-stop"
}

next_run_epoch() {
  local today next now
  now=$(date +%s)
  today=$(TZ="$LOCAL_TZ" date -d "today ${BACKUP_AT}" +%s)
  if ((today > now + 30)); then next=$today; else next=$(TZ="$LOCAL_TZ" date -d "tomorrow ${BACKUP_AT}" +%s); fi
  echo "$next"
}

sleeping_pid=""
on_term() {
  log "stopping"
  [[ -n "$sleeping_pid" ]] && kill "$sleeping_pid" 2>/dev/null || true
  stop_scratch
  exit 0
}

idle() {
  # Backups disabled (staging, local runs). archive_mode=on without a repository would make pg_wal
  # grow until the disk is full, so say so loudly.
  wait_for_db
  if [[ "$(live_sql 'show archive_mode' 2>/dev/null)" == "on" ]]; then
    alert "archive_mode is on but BACKUPS_ENABLED is false: WAL will pile up in pg_wal (set PG_ARCHIVE_MODE=off or enable backups)"
  fi
  log "backups disabled (BACKUPS_ENABLED=${BACKUPS_ENABLED:-false}); idling"
  sleep infinity &
  sleeping_pid=$!
  wait "$sleeping_pid" || true
}

loop() {
  trap on_term TERM INT
  if [[ "${BACKUPS_ENABLED:-false}" != "true" ]]; then
    idle
    return 0
  fi
  wait_for_db
  until ensure_stanza; do
    alert "pgBackRest stanza-create failed; retrying in 10 minutes"
    sleep 600 &
    sleeping_pid=$!
    wait "$sleeping_pid" || true
  done
  if ! check_archiving; then
    alert "WAL archiving check failed (pgbackrest check): point-in-time recovery is at risk"
  fi
  if [[ "$(backup_count)" == "0" ]]; then
    run_backup full || true
  fi
  while true; do
    local next dow
    next=$(next_run_epoch)
    log "next backup at $(TZ="$LOCAL_TZ" date -d "@${next}" '+%Y-%m-%d %H:%M %Z')"
    sleep $((next - $(date +%s))) &
    sleeping_pid=$!
    wait "$sleeping_pid" || true
    sleeping_pid=""
    dow=$(TZ="$LOCAL_TZ" date +%u)
    if [[ "$dow" == "$FULL_DOW" ]]; then run_backup full || true; else run_backup diff || true; fi
    if [[ "$dow" == "$RESTORE_TEST_DOW" ]]; then restore_test || true; fi
  done
}

cmd="${1:-loop}"
case "$cmd" in
  loop) loop ;;
  backup)
    wait_for_db
    ensure_stanza
    run_backup "${2:-diff}"
    ;;
  restore-test)
    wait_for_db
    restore_test
    ;;
  check)
    wait_for_db
    ensure_stanza
    check_archiving
    ;;
  restore-scratch)
    wait_for_db
    restore_scratch "${2:-}"
    ;;
  scratch-stop) stop_manual_scratch ;;
  info) pgbackrest info ;;
  *)
    echo "usage: pgbackrest-sidecar [loop | backup [full|diff|incr] | restore-test | restore-scratch ['<time>'] | scratch-stop | check | info]" >&2
    exit 2
    ;;
esac
