#!/usr/bin/env bash
# ============================================================
# Sauvegarde quotidienne GMAO ARGOS
# - dump Postgres compressé
# - archive du dossier uploads
# - rétention 30 jours
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gmao}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PG_USER="${PG_USER:-gmao}"
PG_DB="${PG_DB:-gmao_argos}"
UPLOADS_DIR="${UPLOADS_DIR:-/home/gmao/gmao/backend/uploads}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)

# 1) Dump Postgres
DUMP_FILE="$BACKUP_DIR/gmao_${STAMP}.sql.gz"
echo "[$(date)] dump postgres -> $DUMP_FILE"
sudo -u postgres pg_dump --clean --if-exists --no-owner --no-privileges "$PG_DB" \
  | gzip -9 > "$DUMP_FILE"

# 2) Archive uploads
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  UP_FILE="$BACKUP_DIR/uploads_${STAMP}.tar.gz"
  echo "[$(date)] archive uploads -> $UP_FILE"
  tar -czf "$UP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
fi

# 3) Rétention : supprimer les fichiers de plus de N jours
echo "[$(date)] purge des sauvegardes > ${RETENTION_DAYS} jours"
find "$BACKUP_DIR" -type f -name 'gmao_*.sql.gz'    -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -type f -name 'uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete

# 4) Récap
echo "[$(date)] backup terminé"
ls -lh "$BACKUP_DIR" | tail -10
