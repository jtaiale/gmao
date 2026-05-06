# Déploiement GMAO ARGOS

Ce dossier contient les artefacts pour mettre la GMAO en production sur un VPS Hostinger (KVM Ubuntu 22.04).

| Fichier | Rôle |
|---|---|
| `INSTALL.md` | Guide complet pas-à-pas (lecture obligatoire) |
| `setup-vps.sh` | Script de provisioning (Node, Postgres, Nginx, Certbot, ufw, fail2ban, deps Puppeteer) |
| `gmao-backend.service` | Unit systemd qui lance le backend en continu |
| `nginx-gmao.conf` | Reverse proxy Nginx + en-têtes sécurité + CSP |
| `backup.sh` | Sauvegarde quotidienne pg_dump + uploads, rétention 30 j |
| `env.production.example` | Modèle `.env` pour la prod (copier en `backend/.env`) |

## Démarrage rapide

1. Provisionner : `wget … setup-vps.sh && sudo ./setup-vps.sh`
2. Cloner le repo dans `/home/gmao/gmao` puis builder le backend
3. Copier `gmao-backend.service` → systemd, `nginx-gmao.conf` → `/etc/nginx/sites-available/`, `backup.sh` → `/usr/local/bin/`
4. `certbot --nginx -d gmao.argos-oi.fr`
5. Cron quotidien pour `gmao-backup.sh`

Voir [`INSTALL.md`](INSTALL.md) pour les détails ligne par ligne.

## Architecture déployée

```
                Internet
                    │
                    ▼
          ┌──────────────────┐
          │  Nginx 80/443    │  ← TLS Let's Encrypt
          │  reverse proxy   │
          └────────┬─────────┘
                   │ HTTP 127.0.0.1:4000
                   ▼
          ┌──────────────────┐         ┌────────────────┐
          │ Node.js / Fastify│ ───────▶│ PostgreSQL 16  │
          │  (gmao-backend)  │         │  (gmao_argos)  │
          │  systemd / user  │         └────────────────┘
          │  gmao            │
          │                  │         ┌────────────────┐
          │  Puppeteer       │         │ /var/backups   │
          │  uploads/        │ ──nightly──▶ pg_dump.gz   │
          └──────────────────┘         │ uploads.tar.gz │
                                       └────────────────┘
```

## Ressources VPS recommandées (Hostinger)

| Plan | RAM | vCPU | Disque | Adapté à |
|---|---:|---:|---:|---|
| KVM 1 | 4 Go | 1 | 50 Go | Démo / pré-prod |
| **KVM 2** | **8 Go** | **2** | **100 Go** | **Prod recommandée (Puppeteer, Postgres, ~50 utilisateurs)** |
| KVM 4 | 16 Go | 4 | 200 Go | Plus gros volumes (~500 utilisateurs) |

> Puppeteer est le facteur dimensionnant : il ouvre Chromium pour chaque PDF. Compter 600-800 Mo libres au moment de la génération.
