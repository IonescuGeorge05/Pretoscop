#!/usr/bin/env bash
# docker compose for one environment's app stack, with the release that is deployed there (M18).
# The compose file needs IMAGE_TAG, which only deploy.sh sets, so a bare `docker compose ... logs`
# fails on the server; the runbooks use this instead:
#   C="infra/scripts/compose.sh prod"; $C ps; $C logs --tail 100 worker; $C exec postgres psql ...
# The tag is the last successful deploy of that environment in .deploy-history; set IMAGE_TAG to
# override it (a new server before its first deploy: infra/runbooks/restore.md).
set -Eeuo pipefail

SCRIPT_NAME=compose
ENV_NAME="${1:-}"
shift || true
# shellcheck source=infra/scripts/lib.sh
. "$(dirname "$0")/lib.sh"

TAG="$(current_tag)"
export IMAGE_TAG="${IMAGE_TAG:-$TAG}" DEPLOY_ENV="$ENV_NAME"
[[ -n "$IMAGE_TAG" ]] || die "no successful deploy of ${ENV_NAME} in .deploy-history: deploy first, or run with IMAGE_TAG=<tag>"
compose "$@"
