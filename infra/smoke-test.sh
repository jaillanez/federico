#!/usr/bin/env bash
# Checks run against the production stack started with docker-compose.smoke.yml.
set -euo pipefail
DC=(docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.smoke.yml --env-file infra/.env.smoke)
BASE=https://localhost
fail() { echo "✗ $*"; exit 1; }
ok() { echo "✓ $*"; }

echo "→ Esperando el primer build del sitio"
for _ in $(seq 1 90); do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/") || true
  [[ "$code" == "200" ]] && break
  sleep 3
done
[[ "$code" == "200" ]] || { "${DC[@]}" logs web-build | tail -40; fail "la home no responde ($code)"; }
ok "home 200"

headers=$(curl -skI "$BASE/")
for h in strict-transport-security content-security-policy x-content-type-options referrer-policy permissions-policy x-frame-options; do
  grep -qi "^$h:" <<<"$headers" || fail "falta el encabezado $h"
done
grep -qi "^server:" <<<"$headers" && fail "el encabezado Server no debería exponerse"
ok "encabezados de seguridad"
curl -sk "$BASE/" | grep -q 'http-equiv="content-security-policy"' || fail "falta la CSP con hashes de Astro"
ok "CSP con hashes"

for p in /obras /consultoria-solar /diagnostico /articulos /admin; do
  [[ "$(curl -sk -o /dev/null -w "%{http_code}" "$BASE$p")" == "200" ]] || fail "$p no responde 200"
done
ok "páginas principales 200"
[[ "$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/no-existe")" == "404" ]] || fail "404 incorrecto"
curl -sk "$BASE/no-existe" | grep -q "No encontramos esta página" || fail "no se sirve la página 404"
ok "404 personalizada"
[[ "$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/obras/")" == "301" ]] || fail "la barra final no redirige"
curl -skI "$BASE/admin" | grep -qi "cache-control: no-store" || fail "/admin debería ser no-store"
ok "redirecciones y caché"
curl -sk "$BASE/api/health" | grep -q '"database":"ok"' || fail "api/health"
curl -sk -o /dev/null -w "%{http_code}" "$BASE/api/docs" | grep -q 404 || fail "/api/docs no debería existir en producción"
ok "API sana y sin docs públicas"

# A real lead through Caddy: upload to the private bucket + emails to Mailpit.
printf '%%PDF-1.7\n%%%%EOF\n' > /tmp/factura.pdf
res=$(curl -sk -X POST "$BASE/api/leads" -H "Origin: $BASE" \
  -F origen=diagnostico -F contacto_nombre="Prueba CI" -F email=ci@example.com -F whatsapp="264 555 1234" \
  -F provincia="San Juan" -F objetivos=evaluar_solar -F consentimiento=true \
  -F cf-turnstile-response=XXXX.DUMMY.TOKEN -F factura=@/tmp/factura.pdf)
grep -q '"id"' <<<"$res" || fail "no se pudo crear la consulta: $res"
for _ in $(seq 1 20); do
  n=$(curl -s http://127.0.0.1:8025/api/v1/messages | grep -o '"total":[0-9]*' | cut -d: -f2)
  [[ "${n:-0}" -ge 2 ]] && break
  sleep 1
done
[[ "${n:-0}" -ge 2 ]] || fail "no llegaron los 2 correos (llegaron ${n:-0})"
ok "consulta con archivo y correos"

# Backup → restore into a brand-new database → compare.
"${DC[@]}" exec -T scheduler /app/infra/backup.sh
"${DC[@]}" exec -T db psql -U sei_owner -d postgres -qc "CREATE DATABASE sei_restore"
"${DC[@]}" exec -T scheduler /app/infra/restore.sh latest postgresql://sei_owner:smoke-owner@db:5432/sei_restore --yes
a=$("${DC[@]}" exec -T db psql -U sei_owner -d sei -tAc "select count(*) from leads")
b=$("${DC[@]}" exec -T db psql -U sei_owner -d sei_restore -tAc "select count(*) from leads")
[[ "$a" == "$b" && "$a" -ge 1 ]] || fail "restauración: original=$a restaurado=$b"
ok "backup cifrado y restauración en una base nueva ($b consultas)"
echo "Todo OK"
