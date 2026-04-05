#!/bin/bash
# =============================================================================
# deploy.sh — Déploiement GazDetect Prix sur VPS (Ubuntu 22/24)
# Usage : bash deploy.sh
# =============================================================================
set -e

APP_DIR="/var/www/gazdetect"
REPO="https://github.com/emmanuelatou-ai/gazdetect-prix.git"
NODE_VERSION="22"
PORT=5000

echo "=============================="
echo " GazDetect — Déploiement VPS"
echo "=============================="

# ── 1. Mise à jour système ────────────────────────────────────────────────────
echo "[1/8] Mise à jour des paquets..."
apt-get update -qq
apt-get install -y -qq curl git

# ── 2. Installation Node.js 22 ────────────────────────────────────────────────
echo "[2/8] Installation Node.js $NODE_VERSION..."
if ! node -v 2>/dev/null | grep -q "v$NODE_VERSION"; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node.js : $(node -v)"
echo "  npm     : $(npm -v)"

# ── 3. Installation PM2 ───────────────────────────────────────────────────────
echo "[3/8] Installation PM2..."
npm install -g pm2 --quiet

# ── 4. Clonage / mise à jour du repo ─────────────────────────────────────────
echo "[4/8] Récupération du code depuis GitHub..."
if [ -d "$APP_DIR/.git" ]; then
  echo "  Mise à jour du repo existant..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "  Clonage du repo..."
  mkdir -p /var/www
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 5. Fichier .env backend ───────────────────────────────────────────────────
echo "[5/8] Configuration des variables d'environnement..."
ENV_FILE="$APP_DIR/backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  # Génère un JWT_SECRET aléatoire de 64 caractères
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")

  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
JWT_SECRET=$JWT_SECRET
FRONTEND_URL=http://$VPS_IP
DEFAULT_ADMIN_EMAIL=admin@gazdetect.com
DEFAULT_ADMIN_PASSWORD=Admin2024!
DEFAULT_COMMERCIAL_EMAIL=commercial@gazdetect.com
DEFAULT_COMMERCIAL_PASSWORD=Compta2024!
EOF
  echo "  .env créé avec JWT_SECRET aléatoire"
  echo "  ⚠️  Pense à changer les mots de passe par défaut dans $ENV_FILE"
else
  echo "  .env existant conservé"
fi

# ── 6. Installation des dépendances ──────────────────────────────────────────
echo "[6/8] Installation des dépendances..."
cd "$APP_DIR/backend"
npm install --omit=dev --quiet

cd "$APP_DIR/frontend"
npm install --quiet

# ── 7. Build frontend + copie dans backend/public ────────────────────────────
echo "[7/8] Build du frontend React..."
cd "$APP_DIR/frontend"

# Récupère l'IP publique pour l'URL de l'API
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
echo "VITE_API_URL=http://$VPS_IP" > .env.production

npm run build

# Copie le build dans backend/public
rm -rf "$APP_DIR/backend/public"
cp -r "$APP_DIR/frontend/dist" "$APP_DIR/backend/public"
echo "  Frontend buildé et copié dans backend/public/"

# ── 8. Démarrage avec PM2 ─────────────────────────────────────────────────────
echo "[8/8] Démarrage de l'application avec PM2..."
cd "$APP_DIR/backend"

pm2 stop gazdetect 2>/dev/null || true
pm2 delete gazdetect 2>/dev/null || true

pm2 start server.js \
  --name gazdetect \
  --env production \
  --log /var/log/gazdetect.log \
  --time

# Sauvegarde pour redémarrage automatique au reboot
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true

# ── Résumé ────────────────────────────────────────────────────────────────────
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "<IP_VPS>")
echo ""
echo "=============================="
echo " Déploiement terminé !"
echo "=============================="
echo ""
echo " Application : http://$VPS_IP:$PORT"
echo " Logs        : pm2 logs gazdetect"
echo " Statut      : pm2 status"
echo " Restart     : pm2 restart gazdetect"
echo ""
echo " Comptes par défaut :"
echo "   admin@gazdetect.com / Admin2024!"
echo "   commercial@gazdetect.com / Compta2024!"
echo ""
echo " ⚠️  Change les mots de passe après la première connexion !"
echo ""
