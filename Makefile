.PHONY: up down logs ps db server web test migrate-up migrate-down migrate-create clean prod-up prod-down prod-logs prod-ps migrate-up-prod migrate-down-prod migrate-status-prod

COMPOSE := docker compose
DB_URL := postgres://palimpsesto:palimpsesto@db:5432/palimpsesto?sslmode=disable
GOOSE := go run github.com/pressly/goose/v3/cmd/goose@v3.28.0

# docker-compose.prod.yml's own comment covers what it changes; a real
# deploy needs a filled-in .env.production (copy .env.production.example)
# passed explicitly — unlike .env, compose doesn't pick this name up on
# its own.
PROD_COMPOSE := docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml

## Brings everything up (db, server, web) in the background, building whatever changed.
up:
	$(COMPOSE) up -d --build

## Tears the containers down. Keeps volumes (Postgres data, build caches).
down:
	$(COMPOSE) down

## Tears down containers AND volumes — starts fresh.
clean:
	$(COMPOSE) down -v

## Logs for every service, or just one: make logs s=server
logs:
	$(COMPOSE) logs -f $(s)

ps:
	$(COMPOSE) ps

## Brings up just the database and waits until it's healthy.
db:
	$(COMPOSE) up -d db
	@echo "waiting for Postgres to become healthy..."
	@until [ "$$($(COMPOSE) ps -q db | xargs -r docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do sleep 1; done
	@echo "Postgres ready on localhost:5432"

## Brings up the backend in the foreground (and the database, as a dependency).
server: db
	$(COMPOSE) up --build server

## Brings up the frontend in the foreground (and the backend, as a dependency).
web:
	$(COMPOSE) up --build web

## Runs the backend's tests inside the container.
test:
	$(COMPOSE) run --rm server go test ./...

## Applies pending migrations (inside the backend container).
migrate-up:
	$(COMPOSE) run --rm server $(GOOSE) -dir migrations postgres "$(DB_URL)" up

## Rolls back the last applied migration.
migrate-down:
	$(COMPOSE) run --rm server $(GOOSE) -dir migrations postgres "$(DB_URL)" down

## Creates a new migration: make migrate-create name=something
migrate-create:
	$(COMPOSE) run --rm server $(GOOSE) -dir migrations create $(name) sql

## Brings up the production stack (prod-targeted images, no bind mounts,
## no dev ports published) in the background, building whatever changed.
## Needs .env.production filled in first (copy .env.production.example).
## Doesn't apply migrations on its own — run migrate-up-prod first (or
## after; goose's own migrations are additive and safe to run against an
## already-running server either way, same as in dev).
prod-up:
	$(PROD_COMPOSE) up -d --build

## Tears the production stack down. Keeps volumes (Postgres data).
prod-down:
	$(PROD_COMPOSE) down

## Logs for the production stack, or just one service: make prod-logs s=web
prod-logs:
	$(PROD_COMPOSE) logs -f $(s)

prod-ps:
	$(PROD_COMPOSE) ps

## Applies pending migrations to the production database — builds
## server/Dockerfile's `migrate` stage (Go toolchain + migrations/, no
## application binary; the minimal `prod` stage has no Go toolchain to
## run goose with at all) and runs it against the `db` service over the
## production compose network. `db` doesn't need to be up first — this
## brings it up itself (depends_on in docker-compose.prod.yml) and waits
## for its healthcheck, same as `make db` does for the dev stack.
migrate-up-prod:
	$(PROD_COMPOSE) run --rm --build migrate up

## Rolls back the last migration applied to the production database.
migrate-down-prod:
	$(PROD_COMPOSE) run --rm --build migrate down

## Shows which migrations are applied to the production database.
migrate-status-prod:
	$(PROD_COMPOSE) run --rm --build migrate status
