# Architecture cible — GMAO ARGOS OCEAN INDIEN

Document de référence pour le portage du prototype navigateur vers une vraie application web multi-utilisateurs.

> **Statut** : prototype côté navigateur (localStorage). Document de cadrage pour le passage en production.

---

## 1. Vue d'ensemble

### État actuel (prototype)
- 100 % côté navigateur — `localStorage` comme source de vérité
- Auth en clair (mots de passe en plaintext dans la base)
- Aucune notion de concurrence — un seul utilisateur à la fois sur un même navigateur
- Pas de réseau, pas d'API, pas de persistence serveur
- Génération PDF côté client (jsPDF + html2canvas)
- Cartographie via OpenStreetMap (Leaflet, tuiles publiques)

### Cible (production)
- Backend HTTP (REST/JSON) + base de données relationnelle
- Auth sécurisée (mots de passe hashés, tokens JWT)
- Multi-utilisateurs concurrents
- Stockage fichiers (photos, signatures) sur S3-compatible ou disque
- Génération PDF côté serveur (cohérence et sécurité)
- HTTPS systématique, sauvegardes BDD quotidiennes

---

## 2. Stack technique recommandée

### Option A — Stack JavaScript (recommandée)
| Couche | Technologie | Raison |
|---|---|---|
| Frontend | Le code actuel + migration vers **Vite + TypeScript** | Réutilisation maximale du code prototype |
| Backend | **Node.js 20 + Fastify** | Léger, performant, écosystème JS partagé |
| ORM | **Prisma** | Types générés automatiquement, migrations versionnées |
| BDD | **PostgreSQL 15+** | Robuste, gratuit, cloud-friendly |
| Auth | JWT + refresh tokens, bcrypt | Standard de fait |
| Storage | **S3 compat (Scaleway / Backblaze)** ou disque local | Photos & signatures hors BDD |
| PDF | **Puppeteer** ou **PDFKit** côté serveur | Le HTML existant peut être réutilisé |
| Email | **Resend** ou **SMTP** OVH | Notifications |
| Hébergement | **Scaleway / OVH / un VPS** + Docker | Souverain (RGPD) |

### Option B — Stack PHP (si l'équipe ARGOS est PHP)
- Laravel 11 + MySQL/MariaDB + Sanctum (auth) + Spatie/permissions
- Frontend identique, appels fetch vers `/api/*`
- Avantage : hébergement mutualisé OVH possible

**Recommandation** : Option A si on a la main sur le serveur, Option B si l'on doit héberger sur un mutualisé OVH classique.

---

## 3. Schéma de base de données (DDL PostgreSQL)

```sql
-- ===========================================================
-- Référentiels
-- ===========================================================

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('admin', 'tech', 'client')),
  login       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,                  -- bcrypt
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  super_admin BOOLEAN NOT NULL DEFAULT FALSE, -- admin only
  permissions JSONB,                          -- admin only : { tickets:'write', ... }
  -- spécifique tech
  specialty   TEXT,
  color       TEXT,
  -- spécifique client (lié à un client_id ci-dessous)
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- méta
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_kind_idx ON users(kind);

CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  contact    TEXT,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  contact       TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  lat           NUMERIC(9, 6),
  lng           NUMERIC(9, 6),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sites_client_idx ON sites(client_id);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES sites(id)   ON DELETE CASCADE,
  reference   TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================
-- Tickets
-- ===========================================================

CREATE TABLE tickets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number                   TEXT UNIQUE NOT NULL,            -- INT-2026-0001
  client_id                UUID NOT NULL REFERENCES clients(id),
  site_id                  UUID NOT NULL REFERENCES sites(id),
  product_id               UUID REFERENCES products(id),
  title                    TEXT NOT NULL,
  description              TEXT,
  intervention_description TEXT,
  priority                 TEXT NOT NULL CHECK (priority IN ('basse','normale','haute','urgente')),
  status                   TEXT NOT NULL CHECK (status IN ('nouveau','planifie','en_cours','resolu','cloture')),
  scheduled_at             TIMESTAMPTZ,
  scheduled_end            TIMESTAMPTZ,
  hours                    NUMERIC(6,2) NOT NULL DEFAULT 0,
  trip_count               INT NOT NULL DEFAULT 0,
  signature                TEXT,                            -- URL S3 ou data URL
  signature_date           TIMESTAMPTZ,
  signer_name              TEXT,
  tech_signature           TEXT,
  tech_signature_date      TIMESTAMPTZ,
  created_by               UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ
);
CREATE INDEX tickets_client_idx     ON tickets(client_id);
CREATE INDEX tickets_status_idx     ON tickets(status);
CREATE INDEX tickets_scheduled_idx  ON tickets(scheduled_at);

CREATE TABLE ticket_technicians (
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, technician_id)
);
CREATE INDEX ticket_technicians_tech_idx ON ticket_technicians(technician_id);

CREATE TABLE ticket_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id),
  author     TEXT NOT NULL,                    -- nom dénormalisé pour archive
  role       TEXT NOT NULL CHECK (role IN ('admin','tech','client')),
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_comments_ticket_idx ON ticket_comments(ticket_id);

-- ===========================================================
-- Chantiers
-- ===========================================================

CREATE TABLE chantiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        TEXT UNIQUE NOT NULL,
  client_id     UUID NOT NULL REFERENCES clients(id),
  site_id       UUID NOT NULL REFERENCES sites(id),
  name          TEXT NOT NULL,
  num_affaire   TEXT,
  description   TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  lat           NUMERIC(9, 6),
  lng           NUMERIC(9, 6),
  tasks         TEXT,
  scheduled_at  TIMESTAMPTZ,
  duration      INT NOT NULL DEFAULT 1,        -- en jours
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chantier_technicians (
  chantier_id   UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  PRIMARY KEY (chantier_id, technician_id)
);

CREATE TABLE chantier_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  author      TEXT NOT NULL,
  role        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================
-- Sécurité : presque-accidents, dérogations, bulletins
-- ===========================================================

CREATE TABLE accidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number              TEXT UNIQUE NOT NULL,    -- ACC-2026-0001
  client_id           UUID NOT NULL REFERENCES clients(id),
  site_id             UUID NOT NULL REFERENCES sites(id),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  risk_nature         TEXT NOT NULL,
  recommendations     TEXT,                    -- préco du tech
  qse_recommendations TEXT,                    -- préco QSE (admin)
  status              TEXT NOT NULL CHECK (status IN ('en_cours', 'traite')),
  created_by          UUID REFERENCES users(id),
  created_by_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accident_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id UUID NOT NULL REFERENCES accidents(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,           -- URL S3
  position    INT NOT NULL DEFAULT 0
);

CREATE TABLE derogations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number               TEXT UNIQUE NOT NULL,   -- DER-2026-0001
  client_id            UUID NOT NULL REFERENCES clients(id),
  site_id              UUID NOT NULL REFERENCES sites(id),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL,
  date_start           DATE NOT NULL,
  date_end             DATE NOT NULL,
  risk_analysis        TEXT NOT NULL,
  preventive_measures  TEXT,                   -- QSE
  tech_recommendations TEXT,                   -- tech
  tech_signature       TEXT,
  tech_signature_date  TIMESTAMPTZ,
  resp_signature       TEXT,
  resp_signature_date  TIMESTAMPTZ,
  status               TEXT NOT NULL CHECK (status IN ('en_cours', 'valide')),
  created_by           UUID REFERENCES users(id),
  created_by_name      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE derogation_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  derogation_id UUID NOT NULL REFERENCES derogations(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  position      INT NOT NULL DEFAULT 0
);

CREATE TABLE bulletins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number      TEXT UNIQUE NOT NULL,            -- NZI-2026-0001
  title       TEXT NOT NULL,
  bulletin_date DATE,
  info        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bulletin_reads (
  bulletin_id   UUID NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  read_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bulletin_id, technician_id)
);

CREATE TABLE bulletin_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id UUID NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  author      TEXT NOT NULL,
  role        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================
-- Audit trail (RGPD)
-- ===========================================================

CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id),
  user_kind    TEXT,
  action       TEXT NOT NULL,        -- 'login', 'create_ticket', 'update_ticket', etc.
  entity_type  TEXT,                 -- 'ticket', 'chantier', etc.
  entity_id    UUID,
  payload      JSONB,                -- diff before/after (sans données sensibles)
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_idx   ON audit_log(user_id);
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX audit_log_date_idx   ON audit_log(created_at);
```

---

## 4. API REST — endpoints

Convention :
- Tout `200 OK` retourne du JSON
- Erreurs : `{ "error": "code", "message": "..." }`
- Pagination : `?page=1&limit=20`, headers `X-Total-Count`, `Link`
- Auth : `Authorization: Bearer <jwt>` sur tout sauf `/auth/login`

### Auth

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Body: `{ login, password, kind }`. Renvoie `{ token, refreshToken, user }` |
| POST | `/auth/refresh` | Body: `{ refreshToken }`. Renvoie un nouveau token court |
| POST | `/auth/logout` | Invalide le refresh token |
| GET  | `/auth/me` | Profil de l'utilisateur courant |

### Tickets

| Méthode | Endpoint | Permissions |
|---|---|---|
| GET    | `/tickets` (filtres: `status`, `clientId`, `siteId`, `priority`, `technicianId`, `from`, `to`) | admin (tous) / tech (les siens) / client (les siens) |
| POST   | `/tickets` | admin / tech / client |
| GET    | `/tickets/:id` | scopé |
| PATCH  | `/tickets/:id` | admin / tech (limité) |
| DELETE | `/tickets/:id` | admin |
| POST   | `/tickets/:id/comments` | tous |
| POST   | `/tickets/:id/signature` | admin / tech (body: `{ kind, dataUrl, signerName? }`) |
| GET    | `/tickets/:id/pdf` | tous (génération serveur) |
| GET    | `/tickets/:id/map.png` | tous (snapshot map serveur via Mapbox/OSM static) |

### Chantiers / Accidents / Dérogations / Bulletins

Pattern identique :
- `GET /chantiers` (admin: tous, tech: ses affectés)
- `POST /chantiers` (admin)
- `PATCH /chantiers/:id` (admin)
- `POST /chantiers/:id/comments` (admin / tech)

Spécifique bulletins :
- `POST /bulletins/:id/read` (tech) — marque comme lu

### Référentiels

`/clients`, `/sites`, `/products`, `/users` (avec `?kind=tech|admin|client`) — CRUD admin.

### Stats / Exports

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/stats/tickets` (mêmes filtres que `/tickets`) | KPIs + séries pour graphiques |
| GET | `/exports/tickets.csv` (filtres incluant `from/to`) | CSV stream |
| GET | `/exports/hours.csv` | CSV stream |
| GET | `/exports/clients.csv` | CSV stream |

### Upload de fichiers

- POST `/uploads/sign` → renvoie une URL pré-signée S3 pour upload direct (le serveur ne fait que signer)
- Le frontend uploade directement dans S3, puis envoie l'URL au backend dans le payload de l'entité

---

## 5. Migration prototype → production : roadmap par phases

### Phase 0 — Fondations (1-2 jours)
- [x] Init Git + push GitHub privé
- [ ] CI minimal : lint + tests sur PR
- [ ] Tests Playwright e2e du golden path (création ticket → signature → PDF)
- [ ] Choix de l'hébergeur final, provisioning Postgres

### Phase 1 — Backend MVP (5-7 jours)
- [ ] Migrations Prisma (DDL ci-dessus)
- [ ] Auth : login admin/tech/client, JWT, refresh, bcrypt
- [ ] Endpoints CRUD : `/clients`, `/sites`, `/products`, `/tickets`
- [ ] Permissions middleware (matrice par menu, vérifiée serveur)
- [ ] Seed des comptes ARGOS + import éventuel des données existantes (script CSV → DB)

### Phase 2 — Migration frontend (3-5 jours)
- [ ] Vite + TypeScript pour le bundling
- [ ] Couche `api.ts` qui remplace `db.js` (mêmes signatures, async)
- [ ] Auth.js → utilise les tokens JWT, refresh automatique
- [ ] Tests visuels sur les écrans clés

### Phase 3 — Modules sécurité (3 jours)
- [ ] Accidents, dérogations, bulletins
- [ ] Upload photos S3 avec URLs pré-signées
- [ ] Notifications email sur événements clés (création accident urgent, validation dérogation)

### Phase 4 — PDF & cartes côté serveur (2 jours)
- [ ] Réutilisation du HTML de fiche ticket → Puppeteer pour PDF
- [ ] Snapshot map via Mapbox Static API ou OSM staticmap (à choisir selon licence)
- [ ] Endpoints `/tickets/:id/pdf` et `/tickets/:id/map.png`

### Phase 5 — Production hardening (2 jours)
- [ ] HTTPS Let's Encrypt
- [ ] Rate limiting (login + API en général)
- [ ] Logs structurés (Pino) + agrégation (loki, papertrail)
- [ ] Backups Postgres quotidiennes (pg_dump → S3)
- [ ] Monitoring uptime (uptimerobot ou betterstack)

### Phase 6 — RGPD (1-2 jours)
- [ ] Mentions légales, politique de confidentialité, page cookies
- [ ] Export utilisateur (droit à la portabilité)
- [ ] Suppression sur demande (anonymisation des audit_log)
- [ ] DPO désigné côté ARGOS

**Total estimé** : ~3 semaines de dev pour 1 développeur expérimenté.

---

## 6. Risques connus à gérer

| Risque | Mitigation |
|---|---|
| Quota localStorage atteint en proto | Plafond 4 Mo + toast (déjà implémenté) ; sera résolu par S3 |
| Concurrence multi-utilisateurs | Inhérente à toute API ; gérer optimistic locking via `updated_at` |
| Photos lourdes côté tech mobile | Compression côté frontend avant upload (`canvas` resize) |
| Déconnexion réseau pendant signature mobile | Stocker en IndexedDB temporairement, retry à la reconnexion |
| Vol de session (token JWT) | TTL court (15 min) + refresh, stockage en cookie httpOnly + secure |
| Perte de données | Sauvegardes BDD quotidiennes + test de restoration mensuel |

---

## 7. Décisions à acter avec ARGOS avant le portage

1. **Hébergement** : Scaleway / OVH / VPS dédié ?
2. **Stack** : Node.js (recommandée) ou PHP/Laravel ?
3. **Stockage fichiers** : S3-compat (préféré) ou disque local ?
4. **Tracking RGPD** : DPO interne ou externalisé ?
5. **Sauvegardes** : fréquence (quotidienne minimum), rétention (30 jours minimum) ?
6. **Domaine** : `gmao.argos-oi.fr` ?
7. **Email transactionnel** : Resend / Mailjet / SMTP OVH ?
8. **Notifications** : email seul (suffisant) ou SMS (cas d'urgence terrain) ?

---

## Annexe — Mapping prototype → production

Les noms de tables / champs peuvent rester proches du proto pour faciliter la migration :

| Proto (JS) | Prod (Postgres) |
|---|---|
| `DB.list('tickets')` | `SELECT * FROM tickets` |
| `t.technicianIds: []` | `ticket_technicians` (jointure) |
| `t.scheduledAt / scheduledEnd` | `tickets.scheduled_at / scheduled_end` |
| `t.signature: dataUrl` | `tickets.signature` (URL S3) |
| `Auth.can(menu, level)` | middleware Express : `requirePermission('tickets', 'write')` |
| `localStorage.setItem` | `prisma.ticket.update(...)` |
