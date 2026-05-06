# GMAO ARGOS — Backend Node.js

Backend HTTP/JSON pour la GMAO ARGOS OCEAN INDIEN.
- **Runtime** : Node.js 20+
- **Framework** : Fastify 5
- **ORM** : Prisma 5
- **Base** : SQLite (dev) ou PostgreSQL (prod)
- **Auth** : JWT (access + refresh) + bcrypt
- **Validation** : Zod
- **Sert aussi** le frontend statique (proto) sur le même port

---

## 🚀 Démarrage rapide (SQLite, zero config)

Pré-requis : Node.js ≥ 20 (`node --version`).

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:migrate    # crée la base SQLite + migrations
npm run db:seed           # comptes de démo + données seed
npm run dev               # http://localhost:4000
```

Ouvrez ensuite <http://localhost:4000>. Le backend sert :
- l'API REST sur `/api/*`
- le frontend prototype sur `/` (depuis `../`)

---

## 🐘 Passage à PostgreSQL

### Option A — Docker Compose (recommandé)
```bash
cd backend
cp .env.example .env
# (le compose injecte les bons env vars, pas besoin d'éditer .env pour Docker)
docker compose up --build
```
Postgres + backend démarrent ensemble. Migration et seed sont exécutés automatiquement au premier boot via le `CMD` du Dockerfile.

### Option B — Postgres existant (local ou managé)
```bash
# Bascule du provider Prisma vers PostgreSQL
npm run use:postgres
# Mettre à jour DATABASE_URL en .env :
#   DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"
npm run prisma:migrate
npm run db:seed
npm run dev
```
Pour revenir à SQLite : `npm run use:sqlite` (bascule le `provider` dans `schema.prisma`).

---

## 📂 Architecture

```
backend/
├── package.json
├── tsconfig.json
├── .env.example          # à copier en .env
├── Dockerfile            # image production
├── docker-compose.yml    # backend + postgres pour le dev local
├── prisma/
│   ├── schema.prisma     # schéma BDD (SQLite par défaut)
│   └── seed.ts           # seed initial (comptes + démo)
├── scripts/
│   └── switch-db.js      # bascule SQLite ↔ Postgres
├── src/
│   ├── server.ts         # entrypoint Fastify
│   ├── config.ts         # variables d'environnement
│   ├── lib/
│   │   ├── hash.ts       # bcrypt
│   │   ├── numbering.ts  # séquences INT-2026-XXXX, etc.
│   │   └── permissions.ts
│   ├── plugins/
│   │   └── auth.ts       # JWT + middlewares (requireAuth, requireKind, requireAdminCan)
│   └── routes/
│       ├── auth.ts          # /api/auth (login, refresh, me, logout)
│       ├── tickets.ts       # /api/tickets (CRUD + comments + signature)
│       ├── referentials.ts  # /api/clients, /sites, /products, /technicians, /admins
│       ├── chantiers.ts     # /api/chantiers
│       ├── safety.ts        # /api/accidents, /derogations, /bulletins
│       ├── stats.ts         # /api/stats
│       └── exports.ts       # /api/exports/*.csv
└── uploads/              # fichiers uploadés (gitignored)
```

---

## 🔐 Comptes de démo (créés par le seed)

| Rôle | Login | Mot de passe |
|---|---|---|
| Super-admin | `admin` | `admin` |
| Admin lecture | `consult` | `consult` |
| Tech Pierre | `phoarau` | `pierre` |
| Tech Yann | `ygrondin` | `yann` |
| Tech Laurent | `lpayet` | `laurent` |
| Tech Sébastien | `srobert` | `seb` |
| Client Le Récif | `recif` | `recif` |
| Client Beaumont | `beaumont` | `beaumont` |
| Client Mairie | `stpierre` | `stpierre` |
| Client Corail | `corail` | `corail` |

⚠️ **À changer dès le premier déploiement en production** — soit via les variables `SEED_SUPER_*` du `.env`, soit via le back-office après le premier login.

---

## 🌐 API — endpoints principaux

Auth obligatoire (`Authorization: Bearer <token>`) sur tout sauf `/api/auth/login` et `/api/health`.

### Auth
| Méthode | Chemin | Description |
|---|---|---|
| POST | `/api/auth/login` | Login. Body `{ login, password, kind? }` → `{ token, refreshToken, user }` |
| POST | `/api/auth/refresh` | Rafraîchit le token court |
| GET  | `/api/auth/me` | Profil de l'utilisateur courant |
| POST | `/api/auth/logout` | (côté client : oublier le token) |

### Tickets
| Méthode | Chemin | Description |
|---|---|---|
| GET    | `/api/tickets?status=…&clientId=…&technicianId=…&from=…&to=…&search=…` | Liste filtrée + scopée |
| GET    | `/api/tickets/:id` | Détail (techs, comments, signatures) |
| POST   | `/api/tickets` | Création |
| PATCH  | `/api/tickets/:id` | Mise à jour (multi-tech, dates, statut, etc.) |
| DELETE | `/api/tickets/:id` | Suppression (admin) |
| POST   | `/api/tickets/:id/comments` | Ajout commentaire |
| POST   | `/api/tickets/:id/signature` | Body `{ kind: 'client'\|'tech', dataUrl, signerName? }` |

### Référentiels (admin)
- `/api/clients`, `/api/sites`, `/api/products`, `/api/technicians`, `/api/admins`
- CRUD standard. Le scope tech/client est géré côté lecture pour `sites` / `products`.

### Sécurité
- `/api/accidents` (créa tech, suivi QSE admin)
- `/api/derogations` (créa tech, validation admin, signatures)
- `/api/bulletins` (créa admin, lecture marquée auto pour tech)

### Stats / Exports
- `GET /api/stats/tickets?status=…&from=…&to=…` → KPI + séries
- `GET /api/exports/tickets.csv?from=…&to=…`
- `GET /api/exports/hours.csv?from=…&to=…`
- `GET /api/exports/clients.csv?from=…&to=…`

### Health
- `GET /api/health` — non authentifié, renvoie `{status:'ok'}`

---

## ⚙️ Scripts npm

| Script | Action |
|---|---|
| `npm run dev` | Lance le serveur en watch (tsx) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Lance le serveur compilé |
| `npm run prisma:generate` | Régénère le client Prisma |
| `npm run prisma:migrate` | Crée/applique une migration en dev |
| `npm run prisma:deploy` | Applique les migrations en prod |
| `npm run prisma:studio` | UI graphique Prisma |
| `npm run db:seed` | Insère les comptes et données de démo |
| `npm run db:reset` | Reset complet de la base (dev) |
| `npm run db:setup` | `migrate` + `seed` en une commande |
| `npm run use:sqlite` | Bascule `schema.prisma` sur SQLite |
| `npm run use:postgres` | Bascule `schema.prisma` sur PostgreSQL |

---

## 🚢 Déploiement production

### Avec Docker
```bash
# build + déploie
docker compose up -d --build

# logs
docker compose logs -f backend

# arrêt
docker compose down
```

### Sans Docker (ex. systemd sur VPS)
1. `npm ci --omit=dev` puis `npm run build`
2. Configurer `.env` avec `NODE_ENV=production`, `JWT_SECRET` aléatoire (`openssl rand -hex 64`), `DATABASE_URL` Postgres
3. `npm run prisma:deploy` (applique les migrations)
4. `npm run db:seed` (une seule fois pour créer le super-admin)
5. Lancer `node dist/server.js` derrière un reverse proxy (Nginx + HTTPS)
6. Service systemd ou pm2 pour redémarrage auto

### Reverse proxy Nginx (exemple)
```nginx
server {
    listen 443 ssl http2;
    server_name gmao.argos-oi.fr;

    ssl_certificate     /etc/letsencrypt/live/gmao.argos-oi.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gmao.argos-oi.fr/privkey.pem;

    client_max_body_size 12M;  # upload photos

    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔧 Configuration (`.env`)

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | URL de connexion Prisma |
| `HOST` | `0.0.0.0` | Bind |
| `PORT` | `4000` | Port HTTP |
| `NODE_ENV` | `development` | `production` désactive le pretty-log |
| `JWT_SECRET` | dev-only | **À changer en prod** : `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | `2h` | Durée du token court |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Durée du refresh |
| `CORS_ORIGIN` | `*` | Origines autorisées (CSV) |
| `UPLOAD_DIR` | `./uploads` | Dossier des fichiers |
| `UPLOAD_MAX_BYTES` | `10485760` | Limite par requête (10 Mo) |
| `SERVE_FRONTEND` | `true` | Sert le proto sur `/` |
| `FRONTEND_DIR` | `../` | Chemin vers le frontend |
| `SEED_SUPER_LOGIN` | `admin` | Login super-admin créé au seed |
| `SEED_SUPER_PASSWORD` | `admin` | Mot de passe super-admin **à changer** |

---

## 🔌 Brancher le frontend prototype au backend

Le frontend actuel utilise `localStorage` via `assets/js/db.js`. Pour passer au backend :

1. Créer un fichier `assets/js/api.js` qui expose les mêmes signatures que `DB.*` mais via `fetch('/api/...')`
2. Stocker le JWT dans `localStorage` (clé `gmao_token`)
3. Remplacer chaque appel `DB.list('tickets')` par `await api.listTickets()`, etc.
4. Auth : remplacer `Auth.loginAdmin()` par `POST /api/auth/login` avec `kind:'admin'`

Phase 2 prévue dans `docs/ARCHITECTURE.md`. Un fichier d'exemple `api.example.js` peut être ajouté au besoin.

---

## 🛠️ Limites connues

- **Photos** : stockées comme URL/path. Le proto envoie encore des data URLs ; à brancher sur `/api/uploads/*` (à implémenter avec `@fastify/multipart` + S3)
- **PDF** : actuellement généré côté client (jsPDF + html2canvas). Phase ultérieure : génération serveur via Puppeteer
- **Notifications** : pas de mail/SMS pour le moment ; à ajouter via Resend ou nodemailer
- **Audit log** : table créée mais pas encore alimentée systématiquement — à câbler dans les handlers

---

## 📚 Voir aussi

- `../docs/ARCHITECTURE.md` — vision globale + roadmap migration prototype → prod
- `../README.md` — documentation du frontend prototype
