#!/usr/bin/env bash
# Rolls an environment back to the previous successful release (or to the tag given), using the
# same rolling procedure as a deploy. Database migrations are forward-only and never undone: a
# release must keep working with the schema of the next one (expand/contract, runbooks/deploy.md).
#   infra/scripts/rollback.sh prod              → previous successful tag from .deploy-history
#   infra/scripts/rollback.sh prod v2026.11.01-2
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${1:-}"
TARGET="${2:-}"
HISTORY="${DEPLOY_HISTORY:-$ROOT/.deploy-history}"

[[ "$ENV_NAME" =~ ^(prod|staging)$ ]] || {
  echo "usage: rollback.sh <prod|staging> [tag]" >&2
  exit 1
}

if [[ -z "$TARGET" ]]; then
  [[ -f "$HISTORY" ]] || {
    echo "rollback: no ${HISTORY}; pass the tag explicitly" >&2
    exit 1
  }
  # Successful releases of this environment, newest last; the current one is the last line.
  current="$(awk -v env="$ENV_NAME" '$2 == env && $4 == "ok" { t = $3 } END { print t }' "$HISTORY")"
  TARGET="$(awk -v env="$ENV_NAME" -v cur="$current" '$2 == env && $4 == "ok" && $3 != cur { t = $3 } END { print t }' "$HISTORY")"
  [[ -n "$TARGET" ]] || {
    echo "rollback: no earlier successful release of ${ENV_NAME} in ${HISTORY}" >&2
    exit 1
  }
  echo "rollback: ${ENV_NAME} ${current:-?} → ${TARGET}"
fi

exec "$ROOT/infra/scripts/deploy.sh" "$ENV_NAME" "$TARGET"
