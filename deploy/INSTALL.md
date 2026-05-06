# Déploiement GMAO sur VPS Hostinger

Guide pas-à-pas pour installer la GMAO ARGOS sur un VPS Hostinger (KVM Cloud Hosting), Ubuntu 22.04 LTS.

> **Pré-requis** :
> - Un VPS Hostinger commandé, avec accès root SSH
> - Un nom de domaine pointé vers l'IP du VPS (ex. `gmao.argos-oi.fr`)
> - Le code du projet (clone Git ou archive)
> - Cible recommandée : KVM 2 vCPU / 8 Go RAM minimum (Puppeteer demande ~1 Go libre)

---

## 1. Préparer le VPS

### 1.1 Connexion SSH
Depuis le panneau Hostinger, récupérez l'IP du VPS et le mot de passe root.
```bash
ssh root@<IP_DU_VPS>
```

### 1.2 Créer un utilisateur applicatif (sécurité)
```bash
adduser --disabled-password --gecos "" gmao
usermod -aG sudo gmao
mkdir -p /home/gmao/.ssh
cp ~/.ssh/authorized_keys /home/gmao/.ssh/    # si vous utilisez une clé SSH
chown -R gmao:gmao /home/gmao/.ssh
chmod 700 /home/gmao/.ssh && chmod 600 /home/gmao/.ssh/authorized_keys
```

### 1.3 Mises à jour & paquets
```bash
apt update && apt upgrade -y
```

---

## 2. Installation automatique (script `setup-vps.sh`)

Le script `deploy/setup-vps.sh` provisionne tout : Node 20, PostgreSQL 16, Nginx, Certbot, dépendances Puppeteer, ufw, fail2ban.

```bash
# Sur le VPS, en root
cd /tmp
wget https://raw.githubusercontent.com/<votre-org>/gmao/main/deploy/setup-vps.sh
chmod +x setup-vps.sh
./setup-vps.sh
```

À la fin, le script affiche les valeurs à reporter dans le `.env`.

> Si vous préférez l'installation manuelle, voyez `setup-vps.sh` qui détaille toutes les étapes.

---

## 3. Déployer le code

### 3.1 Cloner le dépôt
```bash
sudo -iu gmao
cd ~
git clone https://github.com/<votre-org>/gmao.git
cd gmao/backend
```

### 3.2 Configurer `.env`
```bash
cp .env.example .env
nano .env
```

Variables à adapter (les autres restent par défaut) :
```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
DATABASE_URL=postgresql://gmao:VOTRE_MOT_DE_PASSE@localhost:5432/gmao_argos?schema=public
JWT_SECRET=GENERER_AVEC_OPENSSL_RAND_HEX_64
CORS_ORIGIN=https://gmao.argos-oi.fr
SERVE_FRONTEND=true
FRONTEND_DIR=../
SEED_SUPER_LOGIN=admin
SEED_SUPER_PASSWORD=ChangezMoiUrgemment!
```

Génération d'un secret JWT solide :
```bash
openssl rand -hex 64
```

### 3.3 Installer les dépendances et builder
```bash
cd ~/gmao/backend
npm ci
npx prisma generate
npm run build
```

### 3.4 Migrer la base + seed initial
```bash
# Bascule schema.prisma sur PostgreSQL
npm run use:postgres
# Applique les migrations
npx prisma migrate deploy
# Insère les comptes de démo
npm run db:seed
```

> Le compte admin créé utilise `SEED_SUPER_LOGIN` / `SEED_SUPER_PASSWORD`. Connectez-vous immédiatement et changez le mot de passe.

---

## 4. Service systemd

### 4.1 Installer l'unité
```bash
sudo cp ~/gmao/deploy/gmao-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gmao-backend
sudo systemctl status gmao-backend
```

### 4.2 Logs
```bash
sudo journalctl -u gmao-backend -f
```

---

## 5. Nginx + HTTPS

### 5.1 Installer la config
```bash
sudo cp ~/gmao/deploy/nginx-gmao.conf /etc/nginx/sites-available/gmao
sudo nano /etc/nginx/sites-available/gmao   # remplacer gmao.argos-oi.fr par votre domaine
sudo ln -sf /etc/nginx/sites-available/gmao /etc/nginx/sites-enabled/gmao
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 5.2 Certificat SSL Let's Encrypt
```bash
sudo certbot --nginx -d gmao.argos-oi.fr --redirect --agree-tos -m admin@argos-oi.fr -n
```

Certbot ajoute le renouvellement automatique (`/etc/cron.d/certbot`).

---

## 6. Sauvegardes automatiques

```bash
sudo cp ~/gmao/deploy/backup.sh /usr/local/bin/gmao-backup.sh
sudo chmod +x /usr/local/bin/gmao-backup.sh
sudo mkdir -p /var/backups/gmao
# Cron quotidien à 03:15
sudo bash -c 'echo "15 3 * * * root /usr/local/bin/gmao-backup.sh >> /var/log/gmao-backup.log 2>&1" > /etc/cron.d/gmao-backup'
```

Les dumps Postgres + le dossier `uploads/` sont sauvegardés dans `/var/backups/gmao/` avec rétention 30 jours.

> **Reco** : copier les sauvegardes vers un stockage externe (rsync vers un autre VPS, ou rclone vers Backblaze B2).

---

## 7. Mise à jour du code (workflow)

```bash
sudo -iu gmao
cd ~/gmao
git pull
cd backend
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy   # si nouvelle migration
exit
sudo systemctl restart gmao-backend
```

---

## 8. Vérification

```bash
# Health check
curl -s https://gmao.argos-oi.fr/api/health
# → {"status":"ok","time":"..."}

# Login admin
curl -X POST https://gmao.argos-oi.fr/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"ChangezMoiUrgemment!"}'
```

Frontend accessible sur <https://gmao.argos-oi.fr>.

---

## 9. Sécurité (à faire après le 1er déploiement)

- [ ] **Changer le mot de passe admin** depuis le back-office (Référentiels → Administrateurs)
- [ ] **Désactiver le login SSH par mot de passe root** :
  ```bash
  sudo nano /etc/ssh/sshd_config
  # PermitRootLogin no
  # PasswordAuthentication no
  sudo systemctl restart ssh
  ```
- [ ] **Vérifier le firewall** (le script setup en active déjà) :
  ```bash
  sudo ufw status
  # Doit montrer : 22/tcp, 80/tcp, 443/tcp ALLOW
  ```
- [ ] **Vérifier fail2ban** (anti brute-force SSH) :
  ```bash
  sudo systemctl status fail2ban
  ```
- [ ] **Tester une restoration de backup** : quelle confiance avez-vous dans une sauvegarde non testée ?

---

## 10. Dépannage

### `gmao-backend` ne démarre pas
```bash
sudo journalctl -u gmao-backend -n 100 --no-pager
```
Causes fréquentes :
- `JWT_SECRET` manquant en `.env`
- `DATABASE_URL` incorrect (mot de passe Postgres)
- Le build n'a pas été fait (`npm run build`)
- Permissions `/home/gmao/gmao` (le service tourne en user `gmao`)

### Erreurs Puppeteer (`Failed to launch chromium`)
Le script `setup-vps.sh` installe les dépendances système nécessaires. Si vous avez fait l'install manuelle :
```bash
sudo apt install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 \
  libcairo2 libasound2 libgtk-3-0 fonts-liberation
```

### Nginx 502 Bad Gateway
Le backend ne tourne pas sur 4000. Vérifier `systemctl status gmao-backend` puis `ss -ltn | grep 4000`.

### Postgres `password authentication failed`
Vérifier que le mot de passe dans `DATABASE_URL` correspond bien à celui défini dans `setup-vps.sh`. Pour réinitialiser :
```bash
sudo -u postgres psql -c "ALTER USER gmao WITH PASSWORD 'NouveauMotDePasse';"
```
Puis mettre à jour `.env` et redémarrer.
