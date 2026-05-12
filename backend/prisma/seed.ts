// ============================================================
// Seed initial — calque le jeu de démo du prototype localStorage
// Lancement : npm run db:seed (après prisma migrate)
// ============================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ALL_PERMS = ['tickets','planning','clients','sites','products','chantiers','technicians','admins','accidents','derogations','bulletins','stats','exports'];
function defaultPerms(level: 'read'|'write' = 'write') {
  return Object.fromEntries(ALL_PERMS.map(k => [k, level]));
}
async function hash(pw: string) { return bcrypt.hash(pw, 10); }
function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

async function main() {
  console.log('🌱 Seed démarré...');

  // ---------- Clients ----------
  const c1 = await prisma.client.upsert({ where: { code: 'RECIF' }, update: {}, create: {
    code: 'RECIF', name: 'Hôtel Le Récif', contact: 'Marc Lebon',
    email: 'contact@hotel-recif.re', phone: '0262 24 00 00', address: 'St-Gilles-les-Bains',
  }});
  const c2 = await prisma.client.upsert({ where: { code: 'BMNT' }, update: {}, create: {
    code: 'BMNT', name: 'Société Beaumont', contact: 'Sylvie Hoarau',
    email: 's.hoarau@beaumont.re', phone: '0262 41 22 33', address: 'St-Denis',
  }});
  const c3 = await prisma.client.upsert({ where: { code: 'MAIRIE' }, update: {}, create: {
    code: 'MAIRIE', name: 'Mairie de St-Pierre', contact: 'Jean Payet',
    email: 'j.payet@stpierre.re', phone: '0262 35 55 55', address: 'St-Pierre',
  }});
  const c4 = await prisma.client.upsert({ where: { code: 'CORAIL' }, update: {}, create: {
    code: 'CORAIL', name: 'Résidence du Corail', contact: 'Anne Dijoux',
    email: 'a.dijoux@corail.re', phone: '0262 22 11 88', address: 'St-Paul',
  }});

  // ---------- Sites ----------
  const sites = await Promise.all([
    prisma.site.create({ data: { clientId: c1.id, name: 'Hôtel principal',  address: '50 av. de Bourbon, St-Gilles-les-Bains', contact: 'Réception',         contactPhone: '0262 24 00 00', contactEmail: 'reception@hotel-recif.re', lat: -21.0553, lng: 55.2236 } }),
    prisma.site.create({ data: { clientId: c1.id, name: 'Spa & restaurant', address: '52 av. de Bourbon, St-Gilles-les-Bains', contact: 'A. Robert',         contactPhone: '0262 24 00 12', contactEmail: 'spa@hotel-recif.re',       lat: -21.0560, lng: 55.2240 } }),
    prisma.site.create({ data: { clientId: c2.id, name: 'Siège',            address: '12 rue Juliette Dodu, St-Denis',         contact: 'Accueil',           contactPhone: '0262 41 22 33', contactEmail: 'accueil@beaumont.re',      lat: -20.8907, lng: 55.4551 } }),
    prisma.site.create({ data: { clientId: c3.id, name: 'Hôtel de Ville',   address: 'Place de la Mairie, St-Pierre',          contact: 'Service technique', contactPhone: '0262 35 55 60', contactEmail: 'st@stpierre.re',           lat: -21.3393, lng: 55.4781 } }),
    prisma.site.create({ data: { clientId: c3.id, name: 'Centre culturel',  address: 'Rue des Bons-Enfants, St-Pierre',        contact: 'P. Grondin',        contactPhone: '0262 35 55 70', contactEmail: 'cc@stpierre.re',           lat: -21.3380, lng: 55.4790 } }),
    prisma.site.create({ data: { clientId: c4.id, name: 'Résidence A',      address: 'Allée des Filaos, St-Paul',              contact: 'Gardien',           contactPhone: '0262 22 11 88', contactEmail: 'gardien@corail.re',        lat: -21.0098, lng: 55.2706 } }),
  ]);

  // ---------- Admins ----------
  const SEED_LOGIN = process.env.SEED_SUPER_LOGIN || 'admin';
  const SEED_PASSWORD = process.env.SEED_SUPER_PASSWORD || 'admin';
  const SEED_NAME = process.env.SEED_SUPER_NAME || 'Super Administrateur';

  await prisma.user.upsert({
    where: { login: SEED_LOGIN }, update: {},
    create: {
      kind: 'admin', login: SEED_LOGIN, password: await hash(SEED_PASSWORD),
      name: SEED_NAME, superAdmin: true,
      permissions: JSON.stringify(defaultPerms('write')),
    },
  });
  await prisma.user.upsert({
    where: { login: 'consult' }, update: {},
    create: {
      kind: 'admin', login: 'consult', password: await hash('consult'),
      name: 'Consultation', superAdmin: false,
      permissions: JSON.stringify({ ...defaultPerms('read'), admins: 'none', exports: 'none', notifications: 'none' }),
    },
  });

  // ---------- Techniciens (kind = 'tech') ----------
  const techs = await Promise.all([
    prisma.user.upsert({ where: { login: 'phoarau' }, update: {}, create: { kind: 'tech', login: 'phoarau', password: await hash('pierre'),  name: 'Pierre Hoarau',    email: 'p.hoarau@argos.re',  phone: '0692 11 22 33', specialty: 'Climatisation', color: '#1f769e' } }),
    prisma.user.upsert({ where: { login: 'ygrondin' }, update: {}, create: { kind: 'tech', login: 'ygrondin', password: await hash('yann'),    name: 'Yann Grondin',     email: 'y.grondin@argos.re', phone: '0692 22 33 44', specialty: 'Plomberie',     color: '#2e9e5b' } }),
    prisma.user.upsert({ where: { login: 'lpayet' },   update: {}, create: { kind: 'tech', login: 'lpayet',   password: await hash('laurent'), name: 'Laurent Payet',    email: 'l.payet@argos.re',   phone: '0692 33 44 55', specialty: 'Électricité',   color: '#d97a00' } }),
    prisma.user.upsert({ where: { login: 'srobert' },  update: {}, create: { kind: 'tech', login: 'srobert',  password: await hash('seb'),     name: 'Sébastien Robert', email: 's.robert@argos.re',  phone: '0692 44 55 66', specialty: 'Multi-tech',    color: '#7c3aed' } }),
  ]);

  // ---------- Comptes clients (un par client) ----------
  await Promise.all([
    prisma.user.upsert({ where: { login: 'recif' },    update: {}, create: { kind: 'client', login: 'recif',    password: await hash('recif'),    name: 'Hôtel Le Récif',     clientId: c1.id } }),
    prisma.user.upsert({ where: { login: 'beaumont' }, update: {}, create: { kind: 'client', login: 'beaumont', password: await hash('beaumont'), name: 'Société Beaumont',   clientId: c2.id } }),
    prisma.user.upsert({ where: { login: 'stpierre' }, update: {}, create: { kind: 'client', login: 'stpierre', password: await hash('stpierre'), name: 'Mairie St-Pierre',   clientId: c3.id } }),
    prisma.user.upsert({ where: { login: 'corail' },   update: {}, create: { kind: 'client', login: 'corail',   password: await hash('corail'),   name: 'Résidence Corail',   clientId: c4.id } }),
  ]);

  // ---------- Produits ----------
  await Promise.all([
    prisma.product.create({ data: { clientId: c1.id, siteId: sites[0].id, reference: 'CLIM-DAIKIN-9K',  name: 'Climatiseur Daikin 9000 BTU',  description: 'Split mural inverter — chambres' } }),
    prisma.product.create({ data: { clientId: c1.id, siteId: sites[1].id, reference: 'CLIM-DAIKIN-12K', name: 'Climatiseur Daikin 12000 BTU', description: 'Split mural inverter — cuisine' } }),
    prisma.product.create({ data: { clientId: c2.id, siteId: sites[2].id, reference: 'CHAUFFE-EAU-200', name: 'Chauffe-eau solaire 200L',     description: 'Modèle vertical' } }),
    prisma.product.create({ data: { clientId: c1.id, siteId: sites[1].id, reference: 'POMPE-CIRC',      name: 'Pompe de circulation spa',     description: "Pour réseau d'eau chaude" } }),
    prisma.product.create({ data: { clientId: c3.id, siteId: sites[3].id, reference: 'CTRL-ACCES',      name: 'Contrôleur accès porte DGS',   description: 'Lecteur badges + serrure' } }),
    prisma.product.create({ data: { clientId: c2.id, siteId: sites[2].id, reference: 'VRV-SYSTEME',     name: 'Système VRV multi-split',      description: 'Centrale + unités intérieures' } }),
  ]);

  // ---------- Compteurs ----------
  const year = new Date().getFullYear();
  for (const key of ['ticket', 'accident', 'derogation', 'chantier', 'bulletin']) {
    await prisma.sequence.upsert({
      where: { key }, update: {}, create: { key, year, value: 0 },
    });
  }

  // ---------- Quelques tickets de démo ----------
  const t1 = await prisma.ticket.create({
    data: {
      number: 'INT-2026-0001',
      clientId: c1.id, siteId: sites[0].id,
      title: 'Climatiseur chambre 204 ne refroidit plus',
      description: 'La chambre fait remonter une température de 28°C, le climatiseur tourne mais ne refroidit plus.',
      priority: 'haute', status: 'en_cours',
      scheduledAt: offsetDate(0), scheduledEnd: offsetDate(1),
      hours: 1.5, tripCount: 1,
    },
  });
  await prisma.ticketTechnician.create({ data: { ticketId: t1.id, technicianId: techs[0].id } });
  await prisma.ticketComment.create({ data: { ticketId: t1.id, authorName: 'Pierre Hoarau', role: 'tech', text: 'Diagnostic effectué, manque de gaz suspecté.' } });

  // bump séquence ticket à 1
  await prisma.sequence.update({ where: { key: 'ticket' }, data: { value: 1 } });

  // ---------- Bulletin de démo ----------
  await prisma.bulletin.create({
    data: {
      number: 'NZI-2026-0001',
      title: 'Port des EPI sur tous les chantiers',
      bulletinDate: offsetDate(-2),
      info: "Rappel : le port des équipements de protection individuelle (casque, chaussures de sécurité, gants) est obligatoire dès l'arrivée sur chantier.",
    },
  });
  await prisma.sequence.update({ where: { key: 'bulletin' }, data: { value: 1 } });

  console.log('✅ Seed terminé.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
