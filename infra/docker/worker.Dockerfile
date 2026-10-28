# syntax=docker/dockerfile:1.7-labs
# Worker image: recorder, matching, rollups, backups (pg_dump), ops jobs, and the one-shot
# `migrate` service. The same image serves every environment (no build-time configuration).
# Used by the dev `recorder` profile (infra/docker-compose.dev.yml) and by production (M18).
#   docker build -f infra/docker/worker.Dockerfile --build-arg APP_VERSION=v2026.11.03 \
#     -t ghcr.io/<owner>/pretoscop-worker:v2026.11.03 .

ARG NODE_IMAGE=node:24.22.1-trixie-slim

# ---------------------------------------------------------------- dependencies (cached on manifests)
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@10.34.9 && npm cache clean --force
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents apps/*/package.json packages/*/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pretoscop/worker..."

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime

# PostgreSQL 18 client (pg_dump / pg_restore / psql for the nightly logical backup and its restore
# test) from the PGDG repository, plus curl for health checks.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.34.9 && npm cache clean --force

WORKDIR /app
COPY --from=deps /app ./
COPY . .
# The blob store's local root (dev recorder) must be writable by the unprivileged user.
RUN mkdir -p /app/data && chown -R node:node /app/data

ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.title="pretoscop-worker" org.opencontainers.image.version="${APP_VERSION}"
USER node
WORKDIR /app/apps/worker
EXPOSE 9464
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD ["curl", "-fsS", "http://127.0.0.1:9464/health"]
# Node is PID 1's only child (compose `init: true` adds tini), so SIGTERM reaches the worker's
# graceful shutdown (pg-boss drains, the request log flushes).
CMD ["node", "--import", "tsx", "src/index.ts"]
