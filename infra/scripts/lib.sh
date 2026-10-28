#!/usr/bin/env bash
# Shared helpers for the server scripts (deploy, rollback, restore). Source it after setting
# ENV_NAME (prod|staging):   . "$(dirname "$0")/lib.sh"
# Overrides (CI, local prod-like runs): ENV_FILE (default <checkout>/.env), BACKUP_ENV_FILE
# (default <checkout>/.env.backup), COMPOSE_PROJECT (default pretoscop-<env>), COMPOSE_EXTRA_FILES
# (colon-separated extra compose files).
# shellcheck disable=SC2034  # variables are used by the scripts that source this file

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

die() {
  printf '%s: %s\n' "${SCRIPT_NAME:-pretoscop}" "$*" >&2
  exit 1
}
say() { printf '\033[1;34m[%s %s]\033[0m %s\n' "${SCRIPT_NAME:-pretoscop}" "${ENV_NAME:-}" "$*"; }

[[ "${ENV_NAME:-}" =~ ^(prod|staging)$ ]] || die "environment must be prod or staging"

_env_file="${ENV_FILE:-$ROOT/.env}"
[[ -f "$_env_file" ]] || die "missing ${_env_file} (copy .env.example, fill it in; never commit it)"
ENV_FILE="$(cd "$(dirname "$_env_file")" && pwd)/$(basename "$_env_file")"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$ROOT/.env.backup}"
PROJECT="${COMPOSE_PROJECT:-pretoscop-${ENV_NAME}}"
export ENV_FILE BACKUP_ENV_FILE

COMPOSE_FILES=(-f "$ROOT/infra/docker-compose.prod.yml")
if [[ -n "${COMPOSE_EXTRA_FILES:-}" ]]; then
  IFS=':' read -r -a _extra_files <<<"$COMPOSE_EXTRA_FILES"
  for _f in "${_extra_files[@]}"; do COMPOSE_FILES+=(-f "$_f"); done
fi

compose() { docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" "$@"; }

# Last assignment of a variable in the env file (the file is never evaluated by the shell).
env_value() {
  grep -E "^${1}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

# The release currently deployed (last successful deploy in the history file).
current_tag() {
  local history="${DEPLOY_HISTORY:-$ROOT/.deploy-history}"
  [[ -f "$history" ]] || return 0
  awk -v env="$ENV_NAME" '$2 == env && $4 == "ok" { t = $3 } END { if (t) print t }' "$history"
}
