#!/usr/bin/env bash
# Local development WITHOUT Docker: Homebrew PostgreSQL + MinIO + Mailpit, uv (API) and npm (Astro).
#
#   scripts/dev-local.sh up      start services, migrate, run API + Astro (Ctrl-C stops API/Astro)
#   scripts/dev-local.sh db      only start the services and apply migrations
#   scripts/dev-local.sh seed    load sample data
#   scripts/dev-local.sh test    run API tests (sei_test database, test buckets)
#   scripts/dev-local.sh stop    stop the project's PostgreSQL, MinIO and Mailpit
#   scripts/dev-local.sh env     print the env vars (eval "$(scripts/dev-local.sh env)")
#
# Every service is a dedicated instance with its data in .local/ and its own ports, so it never
# touches PostgreSQL, MinIO or Mailpit services you may already run (5432, 9000, 1025/8025):
#   PostgreSQL 5433 · MinIO 9010 (console 9011) · Mailpit SMTP 1125 (web 8125)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/.local"
PGDATA="$LOCAL/pgdata"
PGPORT="${SEI_PGPORT:-5433}"
OWNER="sei_owner"
API_USER="sei_api"
DB="sei"
API_PORT="${SEI_API_PORT:-8000}"
MINIO_PORT=9010
MINIO_CONSOLE_PORT=9011
SMTP_PORT=1125
MAILPIT_PORT=8125
MINIO_USER="sei-minio"
MINIO_PASSWORD="sei-minio-secret"

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
  export S3_ENDPOINT_URL="http://localhost:$MINIO_PORT"
  export S3_ACCESS_KEY="$MINIO_USER"
  export S3_SECRET_KEY="$MINIO_PASSWORD"
  export S3_BUCKET_PUBLIC="sei-public"
  export S3_BUCKET_PRIVATE="sei-private"
  export PUBLIC_MEDIA_URL="http://localhost:$MINIO_PORT/sei-public"
  export MAIL_BACKEND=smtp
  export SMTP_HOST=localhost
  export SMTP_PORT="$SMTP_PORT"
  # Cloudflare's always-pass TEST keys (invisible widget): https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  export TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-1x0000000000000000000000000000000AA}"
  export PUBLIC_TURNSTILE_SITE_KEY="${PUBLIC_TURNSTILE_SITE_KEY:-1x00000000000000000000BB}"
}

need() {
  command -v "$1" >/dev/null || { echo "Falta $1. Instalalo con: brew install $2" >&2; exit 1; }
}

port_open() { nc -z localhost "$1" >/dev/null 2>&1; }

wait_port() {
  for _ in $(seq 1 50); do port_open "$1" && return 0; sleep 0.2; done
  echo "El servicio en el puerto $1 no arrancó; mirá .local/*.log" >&2
  exit 1
}

pg_running() {
  "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

ensure_postgres() {
  mkdir -p "$LOCAL"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "→ Creando cluster de PostgreSQL en .local/pgdata (puerto $PGPORT)"
    # Local-only dev cluster: trust auth, listening on localhost only.
    "$PGBIN/initdb" -D "$PGDATA" -U "$OWNER" --auth=trust -E UTF8 --locale=C >/dev/null
  fi
  if ! pg_running; then
    echo "→ Iniciando PostgreSQL ($("$PGBIN/postgres" --version))"
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOCAL/postgres.log" -w \
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
}

ensure_minio() {
  need minio minio/stable/minio
  if ! port_open "$MINIO_PORT"; then
    echo "→ Iniciando MinIO (puerto $MINIO_PORT, consola $MINIO_CONSOLE_PORT)"
    mkdir -p "$LOCAL/minio"
    MINIO_ROOT_USER="$MINIO_USER" MINIO_ROOT_PASSWORD="$MINIO_PASSWORD" MINIO_BROWSER_REDIRECT=false \
      nohup minio server "$LOCAL/minio" --address "127.0.0.1:$MINIO_PORT" \
      --console-address "127.0.0.1:$MINIO_CONSOLE_PORT" >"$LOCAL/minio.log" 2>&1 &
    echo $! >"$LOCAL/minio.pid"
    wait_port "$MINIO_PORT"
  fi
  (cd "$ROOT/api" && uv run python -m app.scripts.init_storage >/dev/null)
}

ensure_mailpit() {
  need mailpit mailpit
  if ! port_open "$SMTP_PORT"; then
    echo "→ Iniciando Mailpit (SMTP $SMTP_PORT, web $MAILPIT_PORT)"
    nohup mailpit --smtp "127.0.0.1:$SMTP_PORT" --listen "127.0.0.1:$MAILPIT_PORT" \
      --database "$LOCAL/mailpit.db" >"$LOCAL/mailpit.log" 2>&1 &
    echo $! >"$LOCAL/mailpit.pid"
    wait_port "$SMTP_PORT"
  fi
}

ensure_services() {
  ensure_postgres
  (cd "$ROOT/api" && uv sync -q)
  ensure_minio
  ensure_mailpit
  echo "→ Aplicando migraciones"
  (cd "$ROOT/api" && uv run alembic upgrade head 2>&1 | grep -v '^INFO' || true)
}

ensure_web_deps() {
  if [[ ! -d "$ROOT/web/node_modules" ]]; then
    echo "→ Instalando dependencias de la web"
    (cd "$ROOT/web" && npm ci --no-audit --no-fund)
  fi
}

cmd_up() {
  ensure_services
  ensure_web_deps
  echo ""
  echo "  Sitio:    http://localhost:4321          Estilos: http://localhost:4321/estilos"
  echo "  API:      http://localhost:$API_PORT/api/docs"
  echo "  Mailpit:  http://localhost:$MAILPIT_PORT          MinIO: http://localhost:$MINIO_CONSOLE_PORT ($MINIO_USER / $MINIO_PASSWORD)"
  echo "  Ctrl-C detiene la API y Astro (los servicios siguen: make stop-local)"
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

stop_pidfile() {
  local file="$LOCAL/$1.pid"
  if [[ -f "$file" ]]; then
    kill "$(cat "$file")" 2>/dev/null && echo "$1 detenido" || true
    rm -f "$file"
  fi
}

cmd_test() {
  ensure_services
  "${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sei_test'" | grep -q 1 \
    || "${PSQL[@]}" -d postgres -c "CREATE DATABASE sei_test"
  (cd "$ROOT/api" && TEST_DATABASE_URL="postgresql+asyncpg://$OWNER@localhost:$PGPORT/sei_test" \
    uv run pytest --cov=app/routers --cov=app/services --cov-fail-under=80 "$@")
}

export_env
case "${1:-up}" in
  up) cmd_up ;;
  db) ensure_services ;;
  seed) ensure_services && (cd "$ROOT/api" && uv run python -m app.scripts.seed) ;;
  create-admin) ensure_services && (cd "$ROOT/api" && uv run python -m app.scripts.create_admin) ;;
  test) shift; cmd_test "$@" ;;
  stop)
    stop_astro
    stop_pidfile minio
    stop_pidfile mailpit
    pg_running && "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop || echo "PostgreSQL no estaba corriendo"
    ;;
  env)
    for v in ENVIRONMENT DATABASE_URL MIGRATIONS_DATABASE_URL CORS_ORIGINS SECRET_KEY API_INTERNAL_URL \
      PUBLIC_SITE_URL S3_ENDPOINT_URL S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET_PUBLIC S3_BUCKET_PRIVATE \
      PUBLIC_MEDIA_URL MAIL_BACKEND SMTP_HOST SMTP_PORT TURNSTILE_SECRET_KEY PUBLIC_TURNSTILE_SITE_KEY; do
      printf "export %s='%s'\n" "$v" "${!v}"
    done
    ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
