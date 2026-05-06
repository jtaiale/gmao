# GMAO — ARGOS OCEAN INDIEN

Plateforme de Gestion de Maintenance Assistée par Ordinateur (GMAO) pour ARGOS OCEAN INDIEN.

> **État actuel** : prototype navigateur (HTML/CSS/JS pur, données dans `localStorage`).
> Pour la production, voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Démarrage rapide

### Option 1 — Ouvrir directement dans Chrome / Edge / Firefox
Double-cliquer sur `index.html`.

### Option 2 — Serveur local PowerShell (recommandé)
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```
puis ouvrir <http://localhost:5173>.

---

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Admin (super) | `admin` | `admin` |
| Admin (lecture) | `consult` | `consult` |
| Tech – Pierre | `phoarau` | `pierre` |
| Tech – Yann | `ygrondin` | `yann` |
| Tech – Laurent | `lpayet` | `laurent` |
| Tech – Sébastien | `srobert` | `seb` |
| Client – Hôtel Le Récif | `recif` | `recif` |
| Client – Société Beaumont | `beaumont` | `beaumont` |
| Client – Mairie St-Pierre | `stpierre` | `stpierre` |
| Client – Résidence du Corail | `corail` | `corail` |

⚠️ **Mots de passe en clair** : c'est volontaire pour le proto. En production ce sera bcrypt + JWT.

---

## Fonctionnalités

### Côté admin
- Tableau de bord, KPI temps réel
- Gestion tickets : multi-techniciens, intervalle de dates, signatures, PDF
- Planning hebdomadaire graphique (tickets + chantiers)
- Référentiels : clients, sites (avec coords GPS), produits, techniciens, administrateurs (matrice de droits)
- Module Sécurité : presque-accidents, dérogations, bulletins NOUT ZINFOS (avec suivi de lecture)
- Chantiers : multi-techs, durée, carte
- Statistiques filtrables (statut/priorité/client/site/tech/dates)
- Extractions CSV par intervalle de dates

### Côté technicien
- Tableau de bord personnel
- Planning graphique (ses tickets + chantiers affectés)
- Création / édition de ticket (limité à ses interventions)
- Signature client (avec nom/prénom du signataire) + signature technicien
- Déclaration de presque-accident (photos)
- Demande de dérogation (signatures, validation responsable)
- Lecture des bulletins NOUT ZINFOS (suivi automatique)

### Côté client
- Création de demande d'intervention
- Suivi de ses tickets (lecture seule + commentaires)
- Statistiques personnelles
- Téléchargement PDF

---

## Architecture du code

```
GMAO/
├── index.html                 — Point d'entrée frontend (proto)
├── serve.ps1                  — Serveur HTTP statique PowerShell (dev)
├── assets/
│   ├── css/style.css          — Charte ARGOS, responsive mobile
│   ├── img/logo.svg           — Logo (remplacer par logo.png pour ARGOS officiel)
│   └── js/
│       ├── db.js              — Couche données (localStorage, mode proto)
│       ├── api.js             — Client HTTP du backend (mode prod)
│       ├── auth.js            — Sessions et permissions (proto)
│       ├── utils.js           — Modal, toast, signature pad, PDF client, photo upload
│       ├── admin.js           — Vues back-office
│       ├── tech.js            — Portail technicien
│       ├── client.js          — Portail client
│       ├── safety.js          — Presque-accidents + dérogations
│       ├── chantier.js        — Module chantiers
│       ├── bulletins.js       — Bulletins NOUT ZINFOS
│       └── app.js             — Routeur + login + shell
├── backend/                   — Backend Node.js + Fastify + Prisma (voir backend/README.md)
│   ├── prisma/                — Schéma BDD (SQLite/Postgres) + seed
│   ├── src/                   — Routes API, plugins, libs (auth, PDF Puppeteer, S3)
│   ├── tests/                 — Tests vitest + supertest
│   └── docker-compose.yml     — Postgres + backend en un 'docker compose up'
├── deploy/                    — Artefacts pour déploiement VPS Hostinger
│   ├── INSTALL.md             — Guide pas-à-pas
│   ├── setup-vps.sh           — Provisioning Ubuntu 22.04
│   ├── gmao-backend.service   — Unit systemd
│   ├── nginx-gmao.conf        — Reverse proxy + SSL
│   ├── backup.sh              — Sauvegarde quotidienne
│   └── env.production.example — Template .env prod
└── docs/
    └── ARCHITECTURE.md        — Architecture cible (DDL, endpoints, roadmap)
```

### Stack actuelle
- HTML / CSS / JavaScript vanilla
- Chart.js (graphiques)
- jsPDF + html2canvas (export PDF avec carte)
- Leaflet + OpenStreetMap (cartes)
- Stockage localStorage (clé `gmao_argos_db_v9`)

### Stack cible (voir `docs/ARCHITECTURE.md`)
- Frontend : Vite + TypeScript + le code actuel
- Backend : Node.js + Fastify + Prisma + PostgreSQL
- Stockage fichiers : S3-compatible
- PDF : Puppeteer côté serveur

---

## Commandes utiles (proto)

| Action | Méthode |
|---|---|
| Réinitialiser les données | Menu admin → Extractions → « Réinitialiser les données » |
| Voir le quota localStorage | DevTools → Application → Storage |
| Forcer le re-seed | DevTools : `localStorage.clear()` puis `location.reload()` |

---

## Limites connues du prototype

- Mono-poste, mono-utilisateur (pas de synchro)
- Mots de passe en clair
- Quota localStorage ~5 Mo (plafond logiciel à 4 Mo)
- Photos en base64 (lourd) — sera remplacé par S3 en prod
- Pas de notifications email
- Pas de tests automatisés

Voir `docs/ARCHITECTURE.md` section « Risques connus » pour le détail et les mitigations.

---

## Charte graphique

- Couleur principale : `#1f769e`
- Police : Georgia (titres) / Segoe UI (interface)
- Logo : `assets/img/logo.svg` — pour utiliser le logo officiel ARGOS, déposer le fichier sous `assets/img/logo.png` (chargement automatique avec fallback SVG)

---

## Licence

Propriété ARGOS OCEAN INDIEN. Usage interne.
