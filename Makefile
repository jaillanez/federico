# S.E.I. web: development commands. Only Docker is required.
COMPOSE := docker compose --env-file .env -f infra/docker-compose.yml
API := $(COMPOSE) exec api

.PHONY: help dev down logs migrate seed create-admin test lint

help: ## Show available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  make %-14s %s\n",$$1,$$2}'

.env:
	cp .env.example .env

dev: .env ## Start everything (db, minio, mailpit, api, web, caddy) at http://localhost:8080
	$(COMPOSE) up -d --build --wait
	@echo ""
	@echo "  Sitio:    http://localhost:8080   (Astro directo: http://localhost:4321)"
	@echo "  API docs: http://localhost:8080/api/docs"
	@echo "  Estilos:  http://localhost:8080/estilos"
	@echo "  MinIO:    http://localhost:9001   Mailpit: http://localhost:8025"

down: ## Stop all containers (keeps data; add -v manually to wipe volumes)
	$(COMPOSE) down

logs: ## Follow logs
	$(COMPOSE) logs -f --tail=100

migrate: ## Apply database migrations
	$(API) alembic upgrade head

seed: ## Load sample data (5 categories, 5 sectors, 6 projects, 2 articles, dev admin)
	$(API) python -m app.scripts.seed

create-admin: ## Create a panel user interactively
	$(API) python -m app.scripts.create_admin

test: ## Run API tests against a separate sei_test database
	$(COMPOSE) exec -T db sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB -tc "SELECT 1 FROM pg_database WHERE datname = '"'"'sei_test'"'"'" | grep -q 1 || createdb -U $$POSTGRES_USER sei_test'
	$(API) sh -c 'TEST_S3_ENDPOINT=http://minio:9000 TEST_DATABASE_URL=$${MIGRATIONS_DATABASE_URL%/*}/sei_test pytest --cov=app/routers --cov=app/services --cov-fail-under=80'

# --- Without Docker (Homebrew PostgreSQL + uv + npm) ---
.PHONY: dev-local seed-local test-local create-admin-local stop-local purge-leads

dev-local: ## [sin Docker] Postgres local (5433) + API + Astro en http://localhost:4321
	scripts/dev-local.sh up

seed-local: ## [sin Docker] Load sample data
	scripts/dev-local.sh seed

test-local: ## [sin Docker] Run API tests
	scripts/dev-local.sh test

purge-leads: ## Delete leads past the retention period (Ley 25.326); schedule it daily
	$(API) python -m app.scripts.purge_leads

create-admin-local: ## [sin Docker] Create a panel user
	scripts/dev-local.sh create-admin

stop-local: ## [sin Docker] Stop the project's PostgreSQL
	scripts/dev-local.sh stop

lint: ## Lint and type-check API and web
	$(API) sh -c 'ruff check . && ruff format --check . && mypy app tests'
	$(COMPOSE) exec web sh -c 'npm run lint && npm run check'
