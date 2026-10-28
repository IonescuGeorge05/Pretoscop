# PostgreSQL 18 (+ pgvector, as in development) with pgBackRest for continuous WAL archiving and
# base backups to S3-compatible storage (Cloudflare R2 in production; ADR-017). The same image
# runs the database and the `pgbackrest` sidecar (scheduled backups, weekly restore test).
#   docker build -f infra/docker/postgres.Dockerfile -t ghcr.io/<owner>/pretoscop-postgres:18 .
FROM pgvector/pgvector:0.8.7-pg18-trixie

# pgBackRest from the PGDG repository already configured in the base image; jq parses
# `pgbackrest info --output=json`; curl sends heartbeats and Telegram alerts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends pgbackrest jq curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pgbackrest version

COPY infra/postgres/postgresql.conf /etc/postgresql/postgresql.conf
COPY --chmod=0755 infra/postgres/pgbackrest-sidecar.sh /usr/local/bin/pgbackrest-sidecar
