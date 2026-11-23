#!/usr/bin/env bash
# Restore an encrypted backup made by backup.sh.
#
#   infra/restore.sh latest  postgresql://user:pass@host/db_destino --yes
#   infra/restore.sh backups/2026/11/sei-20261123T063000Z.dump.enc  postgresql://... --yes
#
# Needs BACKUP_PASSPHRASE and the S3_* variables. The target database must already exist; its
# objects are replaced (--clean). Without --yes it only downloads and checks the file.
set -euo pipefail

KEY="${1:?Uso: restore.sh <latest|clave> <url-de-destino> [--yes]}"
TARGET="${2:?Falta la URL de la base de destino}"
CONFIRM="${3:-}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
BUCKET="${BACKUP_BUCKET:-sei-backups}"
PY="${BACKUP_PYTHON:-python}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$KEY" == "latest" ]]; then
  KEY="$("$PY" -m app.scripts.objects latest "$BUCKET" "backups/")"
fi
echo "→ Descargando s3://$BUCKET/$KEY"
"$PY" -m app.scripts.objects get "$BUCKET" "$KEY" "$TMP/sei.dump.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in "$TMP/sei.dump.enc" -out "$TMP/sei.dump"
pg_restore --list "$TMP/sei.dump" > /dev/null  # validates the archive
echo "→ Backup válido ($(pg_restore --list "$TMP/sei.dump" | grep -c 'TABLE DATA') tablas con datos)"

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "Para restaurar en $TARGET agregá --yes (reemplaza los datos existentes)."
  exit 0
fi
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$TARGET" "$TMP/sei.dump"
echo "✓ Restaurado en la base de destino."
