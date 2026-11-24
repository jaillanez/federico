#!/usr/bin/env bash
# Register this site in a SHARED front proxy (the Caddy that owns 80/443 on the server), the same
# way the other apps on the 173.212.195.122 VPS do it. Touches nothing else:
#   1. finds the single container that mounts $EDGE_CADDYFILE and its IP on the edge network
#   2. writes EDGE_PROXY_IP to .env.prod (only that proxy may set the visitor's IP)
#   3. appends one site block (once), validates and reloads; on any error restores the backup
#
#   infra/edge-register.sh servielect.173-212-195-122.sslip.io [otro.dominio ...]
set -euo pipefail
cd "$(dirname "$0")/.."
EDGE_CADDYFILE="${EDGE_CADDYFILE:-/opt/suite-turnos/infra/caddy/Caddyfile}"
EDGE_NETWORK="${EDGE_NETWORK:-suite-turnos_edge}"
[[ $# -ge 1 ]] || { echo "Uso: edge-register.sh <dominio> [dominio...]"; exit 1; }
DOMAINS="$*"
FIRST="$1"

docker network inspect "$EDGE_NETWORK" >/dev/null || { echo "No existe la red $EDGE_NETWORK"; exit 1; }
[[ -f "$EDGE_CADDYFILE" ]] || { echo "No existe $EDGE_CADDYFILE"; exit 1; }

# The front proxy: the only container that mounts that Caddyfile.
EDGE="" EDGE_PATH=""
for c in $(docker ps --format '{{.Names}}'); do
  while read -r src dst; do
    [[ "$src" == "$EDGE_CADDYFILE" ]] && { [[ -z "$EDGE" ]] || { echo "Más de un proxy usa $EDGE_CADDYFILE"; exit 1; }; EDGE="$c"; EDGE_PATH="$dst"; }
  done < <(docker inspect -f '{{range .Mounts}}{{.Source}} {{.Destination}}{{println}}{{end}}' "$c")
done
[[ -n "$EDGE" ]] || { echo "No encontré el contenedor que usa $EDGE_CADDYFILE"; exit 1; }
EDGE_IP=$(docker inspect -f "{{with index .NetworkSettings.Networks \"$EDGE_NETWORK\"}}{{.IPAddress}}{{end}}" "$EDGE")
[[ -n "$EDGE_IP" ]] || { echo "$EDGE no está en $EDGE_NETWORK"; exit 1; }
sed -i '/^EDGE_PROXY_IP=/d' .env.prod && echo "EDGE_PROXY_IP=$EDGE_IP" >> .env.prod
echo "Proxy de entrada: $EDGE ($EDGE_IP)"

if grep -q "^$FIRST" "$EDGE_CADDYFILE"; then
  echo "El proxy de entrada ya conoce $FIRST: no se toca."
  exit 0
fi
backup="$EDGE_CADDYFILE.antes-de-sei-$(date +%Y%m%d%H%M%S)"
cp -p "$EDGE_CADDYFILE" "$backup"
{
  echo ""
  echo "# S.E.I. Servicio Eléctrico Integral (servielect) — proyecto aparte en /opt/sei; lo agrega infra/edge-register.sh."
  echo "${DOMAINS// /, } {"
  printf '\tencode zstd gzip\n\treverse_proxy sei-gateway:80\n}\n'
} >> "$EDGE_CADDYFILE"
if docker exec "$EDGE" caddy validate --config "$EDGE_PATH" --adapter caddyfile >/dev/null 2>&1 \
   && docker exec "$EDGE" caddy reload --config "$EDGE_PATH" --adapter caddyfile; then
  echo "✓ Proxy de entrada actualizado (copia previa: $backup)"
else
  echo "✗ La configuración nueva no validó: restauro la copia y no cambio nada."
  cat "$backup" > "$EDGE_CADDYFILE"
  docker exec "$EDGE" caddy reload --config "$EDGE_PATH" --adapter caddyfile || true
  exit 1
fi
