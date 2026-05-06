#!/usr/bin/env bash
# ============================================================
# Provisioning VPS Hostinger pour la GMAO ARGOS
# Cible : Ubuntu 22.04 LTS, exécution en root
# ============================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo)." >&2
  exit 1
fi

echo "==============================================================="
echo " GMAO ARGOS — Provisioning VPS Hostinger (Ubuntu 22.04)"
echo "==============================================================="

# ---- Variables modifiables ----
GMAO_USER="${GMAO_USER:-gmao}"
PG_USER="${PG_USER:-gmao}"
PG_DB="${PG_DB:-gmao_argos}"
PG_PASSWORD="${PG_PASSWORD:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 64)}"
NODE_MAJOR=20

# ---- Mises à jour ----
echo "[1/9] Mises à jour système..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -yq

# ---- Outils de base ----
echo "[2/9] Outils de base..."
apt-get install -yq \
  curl wget gnupg ca-certificates lsb-release \
  build-essential git unzip openssl ufw fail2ban \
  cron logrotate

# ---- Node.js LTS ----
echo "[3/9] Installation Node.js ${NODE_MAJOR} LTS..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2-3)" != "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -yq nodejs
fi
echo "  Node $(node -v), npm $(npm -v)"

# ---- PostgreSQL 16 ----
echo "[4/9] Installation PostgreSQL 16..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - 2>/dev/null || \
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt-get update -qq
apt-get install -yq postgresql-16 postgresql-contrib-16
systemctl enable --now postgresql

# Création de l'utilisateur et de la base si nécessaire
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASSWORD}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${PG_USER}" "${PG_DB}"

# ---- Dépendances Puppeteer / Chromium ----
echo "[5/9] Dépendances système Puppeteer..."
# Paquets stables (mêmes noms sur 22.04 et 24.04)
apt-get install -yq \
  libnss3 libnspr4 libxss1 \
  libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libxkbcommon0 libcairo2 \
  fonts-liberation fonts-noto-color-emoji
# Paquets renommés *t64 sur Ubuntu 24.04 (transition 64-bit time_t)
# On essaie d'abord la nouvelle version, fallback sur l'ancien nom pour 22.04.
for pkg in libasound2 libcups2 libgtk-3-0 libatk1.0-0 libatk-bridge2.0-0 libpango-1.0-0; do
  apt-get install -yq "${pkg}t64" 2>/dev/null \
    || apt-get install -yq "${pkg}"  2>/dev/null \
    || echo "  warn: impossible d'installer $pkg / ${pkg}t64"
done

# ---- Nginx + Certbot ----
echo "[6/9] Nginx + Certbot..."
apt-get install -yq nginx certbot python3-certbot-nginx
systemctl enable --now nginx

# ---- Firewall ----
echo "[7/9] Configuration UFW..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# fail2ban (jail SSH par défaut)
systemctl enable --now fail2ban

# ---- Utilisateur applicatif ----
echo "[8/9] Utilisateur applicatif '${GMAO_USER}'..."
if ! id "${GMAO_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${GMAO_USER}"
  usermod -aG sudo "${GMAO_USER}"
fi
mkdir -p /var/backups/gmao
chown -R "${GMAO_USER}:${GMAO_USER}" /var/backups/gmao

# ---- Récap ----
echo "[9/9] Provisioning terminé."
echo
echo "==============================================================="
echo " VALEURS À REPORTER DANS backend/.env :"
echo "==============================================================="
echo "DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@localhost:5432/${PG_DB}?schema=public"
echo "JWT_SECRET=${JWT_SECRET}"
echo
echo "Utilisateur applicatif : ${GMAO_USER}"
echo "Postgres user / db     : ${PG_USER} / ${PG_DB}"
echo
echo "Étapes suivantes :"
echo "  sudo -iu ${GMAO_USER}"
echo "  git clone <repo> ~/gmao && cd ~/gmao/backend"
echo "  cp .env.example .env  # puis y reporter les valeurs ci-dessus"
echo "  npm ci && npm run use:postgres && npx prisma migrate deploy && npm run db:seed && npm run build"
echo "  exit"
echo "  sudo cp ~/gmao/deploy/gmao-backend.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload && sudo systemctl enable --now gmao-backend"
echo "  sudo cp ~/gmao/deploy/nginx-gmao.conf /etc/nginx/sites-available/gmao"
echo "  sudo ln -sf /etc/nginx/sites-available/gmao /etc/nginx/sites-enabled/gmao"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  sudo certbot --nginx -d gmao.argos-oi.fr"
echo "==============================================================="
