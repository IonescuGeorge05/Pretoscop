#!/usr/bin/env bash
# Restores an environment's database from the pgBackRest repository (R2), to the latest archived
# WAL or to a point in time, in place (ADR-016; procedure: infra/runbooks/restore.md).
#   infra/scripts/restore-pitr.sh prod --yes                                  → latest
#   infra/scripts/restore-pitr.sh prod --target "2026-11-02 09:55:00+00" --yes → just before an accident
#   infra/scripts/restore-pitr.sh prod --set 20261101-023000F --yes          → one backup, no WAL replay
# What it does: stops web, worker and the backup sidecar, stops PostgreSQL, restores over the data
# volume with --delta (only changed files are fetched), starts PostgreSQL (it replays WAL and
# promotes at the target), checks the database, takes a fresh full backup on the new timeline and
# starts everything again. Writes made after the target are lost: that is the point of a PITR.
set -Eeuo pipefail

SCRIPT_NAME=restore-pitr
ENV_NAME="${1:-}"
shift || true
TARGET=""
SET=""
YES=0
while (($# > 0)); do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --set)
      SET="${2:-}"
      shift 2
      ;;
    --yes) YES=1 && shift ;;
    *)
      echo "usage: restore-pitr.sh <prod|staging> [--target 'YYYY-MM-DD HH:MM:SS+00' | --set <backup label>] --yes" >&2
      exit 2
      ;;
  esac
done
# shellcheck source=infra/scripts/lib.sh
. "$(dirname "$0")/lib.sh"
[[ -z "$TARGET" || -z "$SET" ]] || die "use --target or --set, not both"
[[ "$(env_value BACKUPS_ENABLED)" == "true" ]] || die "BACKUPS_ENABLED is not true in ${ENV_FILE}: no repository to restore from"

TAG="$(current_tag)"
export IMAGE_TAG="${IMAGE_TAG:-${TAG:-unknown}}" DEPLOY_ENV="$ENV_NAME"

if ((YES != 1)); then
  echo "This replaces the ${ENV_NAME} database with the backup (${TARGET:-${SET:-latest}}). Type '${ENV_NAME}' to continue:"
  read -r answer
  [[ "$answer" == "$ENV_NAME" ]] || die "aborted"
fi

restore_args=(--stanza=pretoscop --delta --log-level-console=info)
if [[ -n "$TARGET" ]]; then
  restore_args+=(--type=time "--target=${TARGET}" --target-action=promote)
elif [[ -n "$SET" ]]; then
  restore_args+=(--type=immediate --target-action=promote "--set=${SET}")
fi

say "stopping web, worker and the backup sidecar"
compose stop web-1 web-2 worker pgbackrest
compose --profile monitoring stop alloy >/dev/null 2>&1 || true
say "stopping PostgreSQL"
compose stop postgres

say "restoring (${TARGET:-${SET:-latest}})"
# One-off container from the database image, with the data volume and the repository settings of
# the `pgbackrest` service, running pgBackRest instead of the sidecar loop.
compose run --rm --no-deps --entrypoint pgbackrest pgbackrest "${restore_args[@]}" restore

say "starting PostgreSQL (WAL replay, then promotion)"
compose up -d --wait --wait-timeout 1800 postgres
for _ in $(seq 1 720); do
  in_recovery="$(compose exec -T postgres psql -X -At -U pretoscop -d pretoscop -c 'select pg_is_in_recovery()' 2>/dev/null || true)"
  [[ "$in_recovery" == "f" ]] && break
  sleep 5
done
[[ "${in_recovery:-}" == "f" ]] || die "PostgreSQL is still in recovery after an hour; check: docker compose logs postgres"
say "database is up: $(compose exec -T postgres psql -X -At -U pretoscop -d pretoscop -c "select 'shops=' || count(*) from shops")"

say "fresh full backup on the new timeline"
compose up -d --no-deps pgbackrest
compose exec -T pgbackrest pgbackrest-sidecar backup full || say "the full backup failed: run it again before relying on PITR"

say "starting web and worker (${IMAGE_TAG})"
compose up -d --no-deps --wait --wait-timeout 300 web-1 web-2 worker || die "web/worker did not come back; check the logs"
say "done"
