#!/usr/bin/env bash
# Daily encrypted PostgreSQL backup to R2 (S3-compatible), keeping 30 days.
#
#   BACKUP_DATABASE_URL  libpq URL of the database (owner user), e.g. postgresql://sei_owner:...@db/sei
#   BACKUP_PASSPHRASE    encryption passphrase (store it OUTSIDE the server too: without it, backups
#                        cannot be restored)
#   BACKUP_BUCKET        private bucket for backups (default: sei-backups)
#   BACKUP_RETENTION_DAYS  default 30
#   S3_* variables       same as the API (R2 endpoint and keys)
#
# Format: pg_dump custom format (already compressed) → openssl AES-256-CBC with PBKDF2.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Falta BACKUP_DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
BUCKET="${BACKUP_BUCKET:-sei-backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
PY="${BACKUP_PYTHON:-python}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="backups/$(date -u +%Y/%m)/sei-$STAMP.dump.enc"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pg_dump --format=custom --compress=9 --no-owner --no-privileges "$BACKUP_DATABASE_URL" > "$TMP/sei.dump"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
  -in "$TMP/sei.dump" -out "$TMP/sei.dump.enc"
"$PY" -m app.scripts.objects put "$BUCKET" "$KEY" "$TMP/sei.dump.enc"
echo "Backup subido: s3://$BUCKET/$KEY ($(wc -c < "$TMP/sei.dump.enc" | tr -d ' ') bytes)"
"$PY" -m app.scripts.objects prune "$BUCKET" "backups/" "$RETENTION"
