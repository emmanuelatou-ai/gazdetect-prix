#!/bin/bash
# =============================================================================
# backup.sh — Sauvegarde automatique GazDetect (DB + uploads)
# Usage manuel : bash backup.sh
# Usage auto   : configuré par deploy.sh via cron (quotidien à 2h00)
# =============================================================================

APP_DIR="/var/www/gazdetect"
BACKUP_DIR="/var/www/backups/gazdetect"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=7

DB_FILE="$APP_DIR/backend/gazdetect.db"
UPLOADS_DIR="$APP_DIR/uploads"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Début de la sauvegarde..."

# ── 1. Sauvegarde de la base de données SQLite ─────────────────────────────
if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_DIR/gazdetect_$DATE.db"
  echo "  ✓ DB sauvegardée : $BACKUP_DIR/gazdetect_$DATE.db"
else
  echo "  ⚠️  Fichier DB introuvable : $DB_FILE"
fi

# ── 2. Sauvegarde des fichiers uploadés ────────────────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C "$(dirname $UPLOADS_DIR)" "$(basename $UPLOADS_DIR)" 2>/dev/null
  echo "  ✓ Uploads sauvegardés : $BACKUP_DIR/uploads_$DATE.tar.gz"
else
  echo "  ℹ️  Dossier uploads vide ou inexistant"
fi

# ── 3. Suppression des sauvegardes de plus de $KEEP_DAYS jours ───────────
find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete
echo "  ✓ Anciennes sauvegardes nettoyées (conservation : $KEEP_DAYS jours)"

echo "[$(date)] Sauvegarde terminée. Fichiers dans : $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
