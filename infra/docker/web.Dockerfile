# syntax=docker/dockerfile:1.7-labs
# Web image (Next.js standalone output). Built once per environment, because pages prerendered at
# build time bake in PUBLIC_BASE_URL, SITE_INDEXABLE and the NEXT_PUBLIC_* values (M12 rule):
#   docker build -f infra/docker/web.Dockerfile --build-arg PUBLIC_BASE_URL=https://pretoscop.ro \
#     --build-arg APP_VERSION=v2026.11.03 -t ghcr.io/<owner>/pretoscop-web:v2026.11.03-prod .
# No secret is ever passed at build time; runtime configuration comes from the server's .env.

ARG NODE_IMAGE=node:24.22.1-trixie-slim

# ---------------------------------------------------------------- dependencies (cached on manifests)
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.9 && npm cache clean --force
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents apps/*/package.json packages/*/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pretoscop/web..."

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
# Build-time configuration (baked into prerendered pages and the client bundle). Defaults are the
# safe ones: not indexable, no analytics.
ARG PUBLIC_BASE_URL=https://pretoscop.ro
ARG SITE_INDEXABLE=false
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
ARG NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=
ARG NEXT_PUBLIC_MEDIA_BASE_URL=
ARG APP_VERSION=dev
ENV PUBLIC_BASE_URL=${PUBLIC_BASE_URL} \
    SITE_INDEXABLE=${SITE_INDEXABLE} \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN=${NEXT_PUBLIC_PLAUSIBLE_DOMAIN} \
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=${NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL} \
    NEXT_PUBLIC_MEDIA_BASE_URL=${NEXT_PUBLIC_MEDIA_BASE_URL} \
    NEXT_DEPLOYMENT_ID=${APP_VERSION} \
    APP_VERSION=${APP_VERSION}
RUN pnpm --filter @pretoscop/web build \
 && test -f apps/web/.next/standalone/apps/web/server.js

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
LABEL org.opencontainers.image.title="pretoscop-web" org.opencontainers.image.version="${APP_VERSION}"
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
