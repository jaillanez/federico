#!/usr/bin/env bash
# Local development WITHOUT Docker: Homebrew PostgreSQL + uv (API) + npm (Astro).
#
#   scripts/dev-local.sh up      start Postgres, migrate, run API + Astro (Ctrl-C stops API/Astro)
#   scripts/dev-local.sh db      only start Postgres and apply migrations
#   scripts/dev-local.sh seed    load sample data
#   scripts/dev-local.sh test    run API tests against the sei_test database
#   scripts/dev-local.sh stop    stop the project's Postgres
#   scripts/dev-local.sh env     print the env vars (eval "$(scripts/dev-local.sh env)")
#
# It uses a dedicated cluster in .local/pgdata on port 5433 (TCP only), so it never
# touches any PostgreSQL service you already run on 5432.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$ROOT/.local/pgdata"
PGLOG="$ROOT/.local/postgres.log"
PGPORT="${SEI_PGPORT:-5433}"
OWNER="sei_owner"
API_USER="sei_api"
DB="sei"
API_PORT="${SEI_API_PORT:-8000}"

find_pg_bin() {
  local prefix
  for v in 16 17 18; do
    prefix="$(brew --prefix "postgresql@$v" 2>/dev/null || true)"
    if [[ -n "$prefix" && -x "$prefix/bin/pg_ctl" ]]; then
      echo "$prefix/bin"
      return
    fi
  done
  if command -v postgres >/dev/null; then
    dirname "$(readlink -f "$(command -v postgres)")"
    return
  fi
  echo "No encontré PostgreSQL. Instalalo con: brew install postgresql@16" >&2
  exit 1
}

PGBIN="$(find_pg_bin)"
PSQL=("$PGBIN/psql" -h localhost -p "$PGPORT" -U "$OWNER" -v ON_ERROR_STOP=1 -q)

export_env() {
  export ENVIRONMENT=development
  export DATABASE_URL="postgresql+asyncpg://$API_USER@localhost:$PGPORT/$DB"
  export MIGRATIONS_DATABASE_URL="postgresql+asyncpg://$OWNER@localhost:$PGPORT/$DB"
  export CORS_ORIGINS='["http://localhost:4321"]'
  export SECRET_KEY="dev-secret-change-me"
  export API_INTERNAL_URL="http://localhost:$API_PORT"
  export PUBLIC_SITE_URL="http://localhost:4321"
  export ASTRO_TELEMETRY_DISABLED=1
}

pg_running() {
  "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

ensure_db() {
  mkdir -p "$ROOT/.local"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "→ Creando cluster de PostgreSQL en .local/pgdata (puerto $PGPORT)"
    # Local-only dev cluster: trust auth, listening on localhost only.
    "$PGBIN/initdb" -D "$PGDATA" -U "$OWNER" --auth=trust -E UTF8 --locale=C >/dev/null
  fi
  if ! pg_running; then
    echo "→ Iniciando PostgreSQL ($("$PGBIN/postgres" --version))"
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" -w \
      -o "-p $PGPORT -c listen_addresses=localhost -k ''" start >/dev/null
  fi
  if ! "${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
    "${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB"
    "${PSQL[@]}" -d "$DB" <<SQL
CREATE ROLE $API_USER LOGIN;
GRANT CONNECT ON DATABASE $DB TO $API_USER;
GRANT USAGE ON SCHEMA public TO $API_USER;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $API_USER;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO $API_USER;
SQL
  fi
  echo "→ Aplicando migraciones"
  (cd "$ROOT/api" && uv sync -q && uv run alembic upgrade head 2>&1 | grep -v '^INFO' || true)
}

ensure_web_deps() {
  if [[ ! -d "$ROOT/web/node_modules" ]]; then
    echo "→ Instalando dependencias de la web"
    (cd "$ROOT/web" && npm ci --no-audit --no-fund)
  fi
}

cmd_up() {
  ensure_db
  ensure_web_deps
  echo ""
  echo "  Sitio:    http://localhost:4321"
  echo "  Estilos:  http://localhost:4321/estilos"
  echo "  API:      http://localhost:$API_PORT/api/health   docs: /api/docs"
  echo "  Ctrl-C detiene la API y Astro (PostgreSQL sigue corriendo: make stop-local)"
  echo ""
  local pids=()
  (cd "$ROOT/api" && exec uv run uvicorn app.main:app --port "$API_PORT" --reload) &
  pids+=($!)
  (cd "$ROOT/web" && exec npx astro dev) &
  pids+=($!)
  trap 'cleanup "${pids[@]}"' INT TERM
  wait
}

# Astro 7 keeps its dev server alive after the parent exits, so stop it explicitly.
stop_astro() {
  (cd "$ROOT/web" && npx astro dev stop >/dev/null 2>&1) || true
}

cleanup() {
  kill "$@" 2>/dev/null || true
  stop_astro
  wait
  exit 0
}

cmd_test() {
  ensure_db
  "${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sei_test'" | grep -q 1 \
    || "${PSQL[@]}" -d postgres -c "CREATE DATABASE sei_test"
  (cd "$ROOT/api" && TEST_DATABASE_URL="postgresql+asyncpg://$OWNER@localhost:$PGPORT/sei_test" \
    uv run pytest --cov=app/routers --cov=app/services --cov-fail-under=80 "$@")
}

export_env
case "${1:-up}" in
  up) cmd_up ;;
  db) ensure_db ;;
  seed) ensure_db && (cd "$ROOT/api" && uv run python -m app.scripts.seed) ;;
  create-admin) ensure_db && (cd "$ROOT/api" && uv run python -m app.scripts.create_admin) ;;
  test) shift; cmd_test "$@" ;;
  stop)
    stop_astro
    pg_running && "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop || echo "PostgreSQL no estaba corriendo"
    ;;
  env)
    for v in ENVIRONMENT DATABASE_URL MIGRATIONS_DATABASE_URL CORS_ORIGINS SECRET_KEY API_INTERNAL_URL PUBLIC_SITE_URL; do
      printf "export %s='%s'\n" "$v" "${!v}"
    done
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
