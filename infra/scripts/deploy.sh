#!/usr/bin/env bash
# Deploys one release to one environment on this server (M18). Run it from the environment's
# checkout, e.g. /srv/pretoscop/prod, as the deploy user (member of the docker group):
#   infra/scripts/deploy.sh prod v2026.11.03-1        (or: make deploy ENVIRONMENT=prod TAG=v2026.11.03-1)
# Steps: preflight → pull images → data services up (kept running: a release never restarts the
# database) → migrations (one-shot, advisory lock) → web-1 then web-2 (each drained from the edge,
# replaced and healthy before the next; Caddy sends traffic to the other meanwhile) → worker → smoke
# check → history line. If a web replica fails its health check, the replicas already switched go
# back to the previous release and the script exits non-zero.
#
# Overrides: see infra/scripts/lib.sh (ENV_FILE, COMPOSE_PROJECT, COMPOSE_EXTRA_FILES), plus
# NO_PULL=1 (use local images), SMOKE_URL (e.g. https://pretoscop.ro/api/health), SMOKE_CURL_OPTS,
# DEPLOY_HEALTH_TIMEOUT, DEPLOY_DRAIN_SECONDS, DEPLOY_SETTLE_SECONDS (seconds), DEPLOY_HISTORY (file),
# RECREATE_DATA_SERVICES=1 (also apply a new database/search image or changed settings for them:
# restarts PostgreSQL; runbooks/deploy.md).
set -Eeuo pipefail

SCRIPT_NAME=deploy
ENV_NAME="${1:-}"
TAG="${2:-}"
# shellcheck source=infra/scripts/lib.sh
. "$(dirname "$0")/lib.sh"
[[ "$TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die "usage: deploy.sh <prod|staging> <tag> (invalid tag '${TAG}')"

HISTORY="${DEPLOY_HISTORY:-$ROOT/.deploy-history}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-180}"
export IMAGE_TAG="$TAG" DEPLOY_ENV="$ENV_NAME"

previous_tag() {
  [[ -f "$HISTORY" ]] || return 0
  awk -v env="$ENV_NAME" -v cur="$TAG" '$2 == env && $4 == "ok" && $3 != cur { t = $3 } END { if (t) print t }' "$HISTORY"
}

record() { printf '%s %s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ENV_NAME" "$TAG" "$1" "${SUDO_USER:-${USER:-ci}}" >>"$HISTORY"; }

# ---------------------------------------------------------------- preflight
say "preflight (${TAG})"
command -v docker >/dev/null || die "docker is not installed"
[[ "$(env_value DEPLOY_ENV)" == "" || "$(env_value DEPLOY_ENV)" == "$ENV_NAME" ]] ||
  die "${ENV_FILE} says DEPLOY_ENV=$(env_value DEPLOY_ENV), not ${ENV_NAME}: wrong checkout?"
if [[ "$ENV_NAME" == "staging" && "$(env_value CRAWL_ENABLED)" =~ ^(1|true|yes|on)$ ]]; then
  die "staging must never crawl shops (CRAWL_ENABLED is on in ${ENV_FILE})"
fi
if [[ "$(env_value PG_ARCHIVE_MODE)" == "on" && "$(env_value BACKUPS_ENABLED)" != "true" ]]; then
  die "PG_ARCHIVE_MODE=on needs BACKUPS_ENABLED=true (or WAL piles up in pg_wal)"
fi
compose config --quiet || die "compose configuration is invalid"
PREV="$(previous_tag)"
EDGE_NETWORK="$(env_value EDGE_NETWORK)"
EDGE_NETWORK="${EDGE_NETWORK:-pretoscop-edge}"
docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 || {
  say "creating network ${EDGE_NETWORK} (start the edge stack too: infra/runbooks/deploy.md)"
  docker network create "$EDGE_NETWORK" >/dev/null
}
record started

failed() {
  record failed
  die "$1"
}

# ---------------------------------------------------------------- images
if [[ "${NO_PULL:-0}" != "1" ]]; then
  say "pulling images"
  compose pull --quiet web-1 web-2 worker migrate meilisearch || failed "image pull failed (is the tag pushed? docker login ghcr.io?)"
  compose pull --quiet postgres pgbackrest 2>/dev/null || {
    say "postgres image not in the registry; building it here"
    compose build postgres || failed "postgres image build failed"
  }
fi

# ---------------------------------------------------------------- data services and migrations
# PostgreSQL, its backup sidecar and Meilisearch keep running across releases: a release never
# restarts the database. A new image (every tag rebuilds pretoscop-postgres:18) or a changed setting
# for them is applied only on request, in a quiet minute: RECREATE_DATA_SERVICES=1 (runbooks/deploy.md).
DATA_SERVICES=(postgres pgbackrest meilisearch)

# True when the running container of a service differs from what compose would create now: its
# definition changed (config hash) or its image tag points at a different image.
outdated() {
  local cid want have
  cid="$(compose ps -q "$1" 2>/dev/null | head -n 1)"
  [[ -n "$cid" ]] || return 1
  want="$(compose config --hash "$1" 2>/dev/null | awk '{ print $2 }')"
  have="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.config-hash" }}' "$cid" 2>/dev/null || true)"
  [[ -n "$want" && "$want" != "$have" ]] && return 0
  want="$(docker image inspect -f '{{ .Id }}' "$(docker inspect -f '{{ .Config.Image }}' "$cid")" 2>/dev/null || true)"
  have="$(docker inspect -f '{{ .Image }}' "$cid" 2>/dev/null || true)"
  [[ -n "$want" && "$want" != "$have" ]]
}

if [[ "${RECREATE_DATA_SERVICES:-0}" == "1" ]]; then
  say "database, backups sidecar and search: applying new images and settings (the database restarts)"
  compose up -d --wait --wait-timeout "$HEALTH_TIMEOUT" postgres meilisearch || failed "postgres/meilisearch not healthy"
  compose up -d --no-deps pgbackrest || failed "pgbackrest sidecar did not start"
else
  say "database, backups sidecar and search (kept running)"
  for svc in "${DATA_SERVICES[@]}"; do
    if outdated "$svc"; then
      say "NOTE: ${svc} has a new image or new settings; it keeps running as it is. Apply them in a quiet minute:"
      say "      RECREATE_DATA_SERVICES=1 infra/scripts/deploy.sh ${ENV_NAME} ${TAG}"
    fi
  done
  compose up -d --wait --wait-timeout "$HEALTH_TIMEOUT" --no-recreate postgres meilisearch || failed "postgres/meilisearch not healthy"
  compose up -d --no-deps --no-recreate pgbackrest || failed "pgbackrest sidecar did not start"
fi

say "migrations (previous release: ${PREV:-none})"
# The migrate one-shot is also the first process to validate the new release's environment.
compose run --rm --no-deps migrate || failed "migrations failed or the environment is invalid (see above); nothing else was restarted (the old release still serves)"

# ---------------------------------------------------------------- web replicas, one at a time
# A replica about to be replaced first leaves the edge's rotation: DRAIN_FILE is created in it,
# /api/ready answers 503, Caddy's active check (every 2 s, 2 failures) stops sending it requests and
# the ones in flight finish; only then is it stopped. Only a running replica that compose will
# recreate is drained (a redeploy of the same tag leaves it alone).
DRAIN_SECONDS="${DEPLOY_DRAIN_SECONDS:-8}"
SETTLE_SECONDS="${DEPLOY_SETTLE_SECONDS:-4}"
drain() {
  local cid
  outdated "$1" || return 0
  cid="$(compose ps -q "$1" 2>/dev/null | head -n 1)"
  # shellcheck disable=SC2016 # expanded inside the container
  if docker exec "$cid" sh -c 'touch "$DRAIN_FILE"' >/dev/null 2>&1; then
    say "draining ${1} (${DRAIN_SECONDS} s)"
    sleep "$DRAIN_SECONDS"
  fi
}
# Safety net: a drained replica that compose kept (not recreated) must not stay out of rotation.
undrain_if_kept() {
  local cid
  cid="$(compose ps -q "$1" 2>/dev/null | head -n 1)"
  # shellcheck disable=SC2016 # expanded inside the container
  if [[ -n "$cid" && "$cid" == "$2" ]]; then docker exec "$cid" sh -c 'rm -f "$DRAIN_FILE"' >/dev/null 2>&1 || true; fi
}
switched=()
revert_web() {
  [[ -n "$PREV" ]] || return 0
  local svc before
  for svc in "${switched[@]}"; do
    say "reverting ${svc} to ${PREV}"
    before="$(compose ps -q "$svc" 2>/dev/null | head -n 1)"
    IMAGE_TAG="$PREV" drain "$svc"
    IMAGE_TAG="$PREV" compose up -d --no-deps --wait --wait-timeout "$HEALTH_TIMEOUT" "$svc" ||
      say "revert of ${svc} failed: run infra/scripts/rollback.sh ${ENV_NAME}"
    undrain_if_kept "$svc" "$before"
  done
}
for svc in web-1 web-2; do
  say "switching ${svc}"
  switched+=("$svc")
  before="$(compose ps -q "$svc" 2>/dev/null | head -n 1)"
  drain "$svc"
  if ! compose up -d --no-deps --wait --wait-timeout "$HEALTH_TIMEOUT" "$svc"; then
    compose logs --tail 80 "$svc" >&2 || true
    revert_web
    failed "${svc} did not become healthy on ${TAG}"
  fi
  undrain_if_kept "$svc" "$before"
  # Let the edge's readiness check take the new replica in before the next one drains.
  [[ "$svc" == web-2 ]] || sleep "$SETTLE_SECONDS"
done

# ---------------------------------------------------------------- worker and optional services
say "worker"
compose up -d --no-deps --wait --wait-timeout "$HEALTH_TIMEOUT" worker || {
  compose logs --tail 80 worker >&2 || true
  failed "worker did not become healthy on ${TAG} (web already runs ${TAG}; roll back with infra/scripts/rollback.sh ${ENV_NAME})"
}
if [[ ",$(env_value COMPOSE_PROFILES)," == *",monitoring,"* ]]; then
  compose --profile monitoring up -d --no-deps alloy || say "alloy did not start (monitoring only)"
fi
if [[ ",$(env_value COMPOSE_PROFILES)," == *",analytics,"* ]]; then
  # Plausible and its two databases: kept running like the other data services.
  keep=(--no-recreate)
  [[ "${RECREATE_DATA_SERVICES:-0}" == "1" ]] && keep=()
  compose --profile analytics up -d "${keep[@]}" plausible || say "plausible did not start (analytics only)"
fi

# ---------------------------------------------------------------- smoke check
if [[ -n "${SMOKE_URL:-}" ]]; then
  say "smoke check ${SMOKE_URL}"
  ok=0
  body=""
  for _ in $(seq 1 30); do
    # SMOKE_CURL_OPTS is a list of curl flags (e.g. "-k" against a local CA): split on purpose.
    # shellcheck disable=SC2086
    body="$(curl -fsS -m 10 ${SMOKE_CURL_OPTS:-} "$SMOKE_URL" 2>/dev/null || true)"
    if [[ "$body" == *"\"version\":\"${TAG}\""* ]]; then
      ok=1
      break
    fi
    sleep 2
  done
  ((ok == 1)) || failed "smoke check: ${SMOKE_URL} does not report version ${TAG} (got: ${body:-nothing})"
fi

record ok
# Dangling layers of replaced releases (tagged releases stay for rollbacks).
if [[ "${PRUNE_IMAGES:-1}" == "1" ]]; then docker image prune -f >/dev/null 2>&1 || true; fi
say "done: ${ENV_NAME} runs ${TAG} (previous: ${PREV:-none})"
