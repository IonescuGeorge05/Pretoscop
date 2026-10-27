SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml -p pretoscop

.PHONY: help install services down nuke dev test lint typecheck unit migrate seed verify psql logs

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
