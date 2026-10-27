# Worker image (recorder, jobs). Used by the dev `recorder` profile and, with changes in M18, production.
FROM node:24-bookworm-slim

# PostgreSQL 18 client for backups (pg_dump / pg_restore) from the PGDG repository.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.34.9

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@pretoscop/worker..."

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@pretoscop/worker", "start"]
