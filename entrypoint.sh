#!/usr/bin/env bash
# One-command bootstrap for a fresh clone: checks Docker, prepares .env,
# brings up Postgres, applies migrations, then starts the backend and
# frontend — everything this project needs to run locally lives in
# containers (see README.md's "Rodando localmente"), so this script never
# assumes Go or Node are installed on the host, only Docker.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE="docker compose"
GOOSE="go run github.com/pressly/goose/v3/cmd/goose@v3.28.0"
DB_URL="postgres://palimpsesto:palimpsesto@db:5432/palimpsesto?sslmode=disable"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()   { printf '\033[1;31mErro:\033[0m %s\n' "$1" >&2; exit 1; }

require_docker() {
	command -v docker >/dev/null 2>&1 || die "Docker não encontrado. Instale o Docker (e o Docker Desktop, se estiver no Windows/WSL2) antes de continuar: https://docs.docker.com/get-docker/"
	docker compose version >/dev/null 2>&1 || die "'docker compose' não encontrado. Atualize o Docker para uma versão com o plugin Compose v2 embutido."
	docker info >/dev/null 2>&1 || die "O daemon do Docker não está rodando. Abra o Docker Desktop (ou inicie o serviço docker) e tente de novo."
	[ -f docker-compose.yml ] || die "docker-compose.yml não encontrado — rode este script a partir da raiz do repositório clonado."
}

prepare_env_file() {
	if [ -f .env ]; then
		info ".env já existe, mantendo como está."
		return
	fi
	[ -f .env.example ] || die ".env.example não encontrado — rode este script a partir da raiz do repositório."
	cp .env.example .env
	info "Criado .env a partir de .env.example (valores de desenvolvimento, ajuste se precisar)."
}

wait_for_db() {
	info "Subindo o Postgres e aguardando ficar saudável..."
	$COMPOSE up -d db

	local waited=0
	local timeout=60
	until [ "$($COMPOSE ps -q db | xargs -r docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do
		if [ "$waited" -ge "$timeout" ]; then
			die "Postgres não ficou saudável em ${timeout}s. Rode '$COMPOSE logs db' para investigar."
		fi
		sleep 1
		waited=$((waited + 1))
	done
	info "Postgres pronto em localhost:5432."
}

apply_migrations() {
	info "Aplicando migrations..."
	$COMPOSE run --rm server $GOOSE -dir migrations postgres "$DB_URL" up
}

start_app() {
	info "Subindo backend (:8080) e frontend (:5173)..."
	$COMPOSE up -d --build server web
}

main() {
	require_docker
	prepare_env_file
	wait_for_db
	apply_migrations
	start_app

	echo
	info "Pronto. Serviços rodando:"
	echo "   Frontend:  http://localhost:5173"
	echo "   Backend:   http://localhost:8080/healthz"
	echo
	echo "Comandos úteis:"
	echo "   make logs          # segue os logs de todos os serviços"
	echo "   make logs s=server # só o backend"
	echo "   make down          # para tudo (mantém os dados)"
	echo

	if grep -qi microsoft /proc/version 2>/dev/null; then
		warn "WSL2 detectado: se o Docker Desktop não estiver aberto com a integração WSL ativa (Settings → Resources → WSL Integration), os comandos acima falham."
	fi
}

main "$@"
