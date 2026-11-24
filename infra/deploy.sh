#!/usr/bin/env bash
# Deploy on the server (single command): `make deploy` or `infra/deploy.sh <git-sha>`.
# Expects the repo at /opt/sei (or the current directory) and secrets in .env.prod.
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-origin/main}"
[[ -f .env.prod ]] || { echo "Falta .env.prod (ver infra/.env.prod.example)"; exit 1; }
DC=(docker compose -f infra/docker-compose.prod.yml)
# Shared server with its own front proxy on 80/443 (see infra/docker-compose.edge.yml).
if grep -q '^SEI_EDGE=1' .env.prod; then DC+=(-f infra/docker-compose.edge.yml); fi
DC+=(--env-file .env.prod)
git fetch --quiet origin
git checkout --quiet --detach "$REF"
echo "→ Desplegando $(git rev-parse --short HEAD)"
"${DC[@]}" build --pull
"${DC[@]}" up -d --wait --wait-timeout 600 --remove-orphans
"${DC[@]}" ps
# The site is rebuilt by web-build on start; ask for one more in case content changed meanwhile.
# The token travels in the container's own environment, never in a command line.
"${DC[@]}" exec -T web-build sh -c \
  'wget -qO- --header "Authorization: Bearer $REBUILD_WEBHOOK_TOKEN" --post-data "" http://localhost:4322/__rebuild' \
  > /dev/null || true
docker image prune -f > /dev/null
echo "✓ Deploy terminado"
