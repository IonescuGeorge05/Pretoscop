# Pretoscop

Romanian price comparison with our own observed price history: for any product, every Romanian
online shop selling it, ranked by total price (price + delivery).

- Product, architecture and plans: [`docs/README.md`](docs/README.md)
- Build status and module reports: [`docs/progress.md`](docs/progress.md)
- Rules for implementing agents: [`CLAUDE.md`](CLAUDE.md)

## Requirements

- Node.js ≥ 22.12 (24 LTS recommended, see `.nvmrc`) and pnpm 10 (`npm i -g pnpm@10`)
- Docker (Docker Desktop on macOS) for PostgreSQL 18, Meilisearch and Mailpit
- GNU make

## Setup

```bash
cp .env.example .env      # local defaults; never commit .env
make install              # pnpm install --frozen-lockfile
make dev                  # services + web (http://localhost:3000) + worker in watch mode
```

Mailpit (all local email) is at http://localhost:8025, Meilisearch at http://localhost:7700.

## Everyday commands

| Command | What it does |
|---|---|
| `make dev` | Start services, the web app and the worker in watch mode |
| `make services` / `make down` | Start / stop PostgreSQL, Meilisearch, Mailpit (data is kept) |
| `make test` | Lint, typecheck, unit and integration tests |
| `make migrate` | Apply pending database migrations |
| `make seed` | Load the fixture catalogue for local development |
| `make verify M=05` | Acceptance checks of a module, then its founder checklist |
| `make shops:sync` | Upsert the shop registry YAML into the database |
| `make psql` | psql on the dev database |
| `make help` | Every target |

## Repository layout

```
apps/web          Next.js: public site, admin, API routes, click-out
apps/worker       pg-boss jobs: ingest, crawl, match, rollup, alerts, index, maintenance
packages/db       Drizzle schema, migrations, typed queries
packages/core     Pure domain logic (no I/O)
packages/extractors  Page and feed parsers (no I/O), fixtures
packages/fetch    Polite HTTP client (identified bot, robots.txt, throttling)
packages/config   Environment, logger, shop registry
packages/llm      Anthropic wrapper with budget caps
infra/            Compose files (dev, prod/staging, edge), Dockerfiles, backups, monitoring, runbooks
scripts/verify/   make verify M=XX scripts and founder checklists
```

## Production

One server, two environments (staging and production) and a shared edge proxy, all Docker
Compose; images built by GitHub Actions on a release tag. Start at [`infra/README.md`](infra/README.md).
