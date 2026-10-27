SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml -p pretoscop

.PHONY: help install services down nuke dev test lint typecheck unit migrate seed verify psql logs recorder recorder-logs recorder-stop deploy rollback prod-ps prod-logs images

help: ## list targets
	@grep -E '^[a-zA-Z0-9_\\:-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/^([a-zA-Z0-9_\\:-]*[^\\]):.*## (.*)$$/\1|\2/; s/\\:/:/' | awk -F'|' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## install dependencies (frozen lockfile)
	pnpm install --frozen-lockfile

services: ## start postgres, meilisearch and mailpit and wait until healthy
	$(COMPOSE) up -d --wait

down: ## stop local services (data is kept)
	$(COMPOSE) down

nuke: ## stop local services and DELETE their data volumes
	$(COMPOSE) down -v

dev: services ## services + web (http://localhost:3000) + worker in watch mode
	pnpm dev

test: ## lint, typecheck, unit + integration tests
	pnpm turbo run lint typecheck test

lint: ## lint all packages
	pnpm turbo run lint

typecheck: ## typecheck all packages
	pnpm turbo run typecheck

unit: ## tests only
	pnpm turbo run test

migrate: services ## apply pending database migrations
	pnpm --filter @pretoscop/db migrate

seed: migrate ## fixture catalogue for local development
	pnpm --filter @pretoscop/db seed

verify: ## module acceptance checks, e.g. make verify M=05
	@bash scripts/verify/run.sh "$(M)"

shops\:sync: ## upsert the shop registry (packages/config/shops/*.yaml) into the database
	pnpm --filter @pretoscop/worker shops:sync

psql: ## open psql on the dev database
	$(COMPOSE) exec postgres psql -U pretoscop -d pretoscop

logs: ## follow service logs
	$(COMPOSE) logs -f --tail=100

recorder: ## build and start the long-running recorder container (worker) in the background
	$(COMPOSE) --profile recorder up -d --build worker

recorder-logs: ## follow the recorder's logs
	$(COMPOSE) --profile recorder logs -f --tail=200 worker

recorder-stop: ## stop the recorder container
	$(COMPOSE) --profile recorder stop worker

# --- Production and staging (M18; run on the server, in /srv/pretoscop/<env>) -------------
ENVIRONMENT ?= prod
PROD_COMPOSE = docker compose -p pretoscop-$(ENVIRONMENT) -f infra/docker-compose.prod.yml --env-file .env

deploy: ## deploy a release on this server: make deploy ENVIRONMENT=prod TAG=v2026.11.10-1
	@test -n "$(TAG)" || (echo "usage: make deploy ENVIRONMENT=prod|staging TAG=<release tag>" >&2; exit 2)
	infra/scripts/deploy.sh $(ENVIRONMENT) $(TAG)

rollback: ## roll back to the previous release (or TAG=...): make rollback ENVIRONMENT=prod
	infra/scripts/rollback.sh $(ENVIRONMENT) $(TAG)

prod-ps: ## containers of ENVIRONMENT (default prod) on this server
	$(PROD_COMPOSE) ps

prod-logs: ## follow logs of ENVIRONMENT (default prod): make prod-logs S=worker
	$(PROD_COMPOSE) logs -f --tail=200 $(S)

images: ## build the release images locally: make images TAG=local-1 [PUBLIC_BASE_URL=https://pretoscop.ro]
	@test -n "$(TAG)" || (echo "usage: make images TAG=<tag>" >&2; exit 2)
	docker build -f infra/docker/postgres.Dockerfile -t pretoscop/pretoscop-postgres:18 .
	docker build -f infra/docker/worker.Dockerfile --build-arg APP_VERSION=$(TAG) -t pretoscop/pretoscop-worker:$(TAG) .
	docker build -f infra/docker/web.Dockerfile --build-arg APP_VERSION=$(TAG) --build-arg PUBLIC_BASE_URL=$(or $(PUBLIC_BASE_URL),https://pretoscop.ro) -t pretoscop/pretoscop-web:$(TAG)-$(ENVIRONMENT) .
