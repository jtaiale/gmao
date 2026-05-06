/* ============================================================
   Couche données — stockage localStorage
   ============================================================ */
const DB_KEY = 'gmao_argos_db_v9';

const ACCIDENT_STATUSES = [
  { id: 'en_cours', label: 'En cours' },
  { id: 'traite',   label: 'Traité' },
];

const PERMISSION_MENUS = [
  { key: 'tickets',     label: 'Tickets' },
  { key: 'planning',    label: 'Planning' },
  { key: 'clients',     label: 'Clients' },
  { key: 'sites',       label: 'Sites' },
  { key: 'products',    label: 'Produits' },
  { key: 'chantiers',   label: 'Chantiers' },
  { key: 'technicians', label: 'Techniciens' },
  { key: 'admins',      label: 'Administrateurs' },
  { key: 'accidents',   label: 'Presque accidents' },
  { key: 'derogations', label: 'Dérogations' },
  { key: 'bulletins',   label: 'Bulletin NOUT ZINFOS' },
  { key: 'stats',       label: 'Statistiques' },
  { key: 'exports',     label: 'Extractions' },
];
const PERMISSION_LEVELS = [
  { key: 'none',  label: 'Aucun' },
  { key: 'read',  label: 'Lecture seule' },
  { key: 'write', label: 'Modification' },
];
function defaultAdminPermissions() {
  const p = {};
  PERMISSION_MENUS.forEach(m => { p[m.key] = 'write'; });
  return p;
}

const STATUSES = [
  { id: 'nouveau',   label: 'Nouveau' },
  { id: 'planifie',  label: 'Planifié' },
  { id: 'en_cours',  label: 'En cours' },
  { id: 'resolu',    label: 'Résolu' },
  { id: 'cloture',   label: 'Clôturé' },
];
const PRIORITIES = [
  { id: 'basse',    label: 'Basse' },
  { id: 'normale',  label: 'Normale' },
  { id: 'haute',    label: 'Haute' },
  { id: 'urgente',  label: 'Urgente' },
];
const TECH_COLORS = ['#1f769e', '#2e9e5b', '#d97a00', '#7c3aed', '#c8362d', '#0891b2'];

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('DB load failed', e); }
  return null;
}
function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) {
      if (typeof toast === 'function') {
        toast('Stockage navigateur saturé. Supprimez des photos ou réduisez les commentaires avant de continuer.', 'error', 6000);
      }
    }
    throw e;
  }
}

function seedDB() {
  const clients = [
    { id: 'c1', code: 'RECIF', name: 'Hôtel Le Récif', contact: 'Marc Lebon', email: 'contact@hotel-recif.re', phone: '0262 24 00 00', address: 'St-Gilles-les-Bains', login: 'recif', password: 'recif' },
    { id: 'c2', code: 'BMNT',  name: 'Société Beaumont', contact: 'Sylvie Hoarau', email: 's.hoarau@beaumont.re', phone: '0262 41 22 33', address: 'St-Denis', login: 'beaumont', password: 'beaumont' },
    { id: 'c3', code: 'MAIRIE',name: 'Mairie de St-Pierre', contact: 'Jean Payet', email: 'j.payet@stpierre.re', phone: '0262 35 55 55', address: 'St-Pierre', login: 'stpierre', password: 'stpierre' },
    { id: 'c4', code: 'CORAIL',name: 'Résidence du Corail', contact: 'Anne Dijoux', email: 'a.dijoux@corail.re', phone: '0262 22 11 88', address: 'St-Paul', login: 'corail', password: 'corail' },
  ];
  const sites = [
    { id: 's1', clientId: 'c1', name: 'Hôtel principal',   address: '50 av. de Bourbon, St-Gilles-les-Bains', contact: 'Réception',         contactPhone: '0262 24 00 00', contactEmail: 'reception@hotel-recif.re', lat: -21.0553, lng: 55.2236 },
    { id: 's2', clientId: 'c1', name: 'Spa & restaurant',  address: '52 av. de Bourbon, St-Gilles-les-Bains', contact: 'A. Robert',         contactPhone: '0262 24 00 12', contactEmail: 'spa@hotel-recif.re',       lat: -21.0560, lng: 55.2240 },
    { id: 's3', clientId: 'c2', name: 'Siège',             address: '12 rue Juliette Dodu, St-Denis',         contact: 'Accueil',           contactPhone: '0262 41 22 33', contactEmail: 'accueil@beaumont.re',      lat: -20.8907, lng: 55.4551 },
    { id: 's4', clientId: 'c3', name: 'Hôtel de Ville',    address: 'Place de la Mairie, St-Pierre',          contact: 'Service technique', contactPhone: '0262 35 55 60', contactEmail: 'st@stpierre.re',           lat: -21.3393, lng: 55.4781 },
    { id: 's5', clientId: 'c3', name: 'Centre culturel',   address: 'Rue des Bons-Enfants, St-Pierre',        contact: 'P. Grondin',        contactPhone: '0262 35 55 70', contactEmail: 'cc@stpierre.re',           lat: -21.3380, lng: 55.4790 },
    { id: 's6', clientId: 'c4', name: 'Résidence A',       address: 'Allée des Filaos, St-Paul',              contact: 'Gardien',           contactPhone: '0262 22 11 88', contactEmail: 'gardien@corail.re',        lat: -21.0098, lng: 55.2706 },
  ];
  const products = [
    { id: 'p1', clientId: 'c1', siteId: 's1', reference: 'CLIM-DAIKIN-9K',  name: 'Climatiseur Daikin 9000 BTU',   description: 'Split mural inverter — chambres' },
    { id: 'p2', clientId: 'c1', siteId: 's2', reference: 'CLIM-DAIKIN-12K', name: 'Climatiseur Daikin 12000 BTU',  description: 'Split mural inverter — cuisine' },
    { id: 'p3', clientId: 'c2', siteId: 's3', reference: 'CHAUFFE-EAU-200', name: 'Chauffe-eau solaire 200L',      description: 'Modèle vertical' },
    { id: 'p4', clientId: 'c1', siteId: 's2', reference: 'POMPE-CIRC',      name: 'Pompe de circulation spa',      description: 'Pour réseau d\'eau chaude' },
    { id: 'p5', clientId: 'c3', siteId: 's4', reference: 'CTRL-ACCES',      name: 'Contrôleur accès porte DGS',    description: 'Lecteur badges + serrure' },
    { id: 'p6', clientId: 'c2', siteId: 's3', reference: 'VRV-SYSTEME',     name: 'Système VRV multi-split',       description: 'Centrale + unités intérieures' },
    { id: 'p7', clientId: 'c4', siteId: 's6', reference: 'CLIM-APT-12',     name: 'Climatiseur appt 12',           description: 'Installation à venir' },
  ];
  const technicians = [
    { id: 't1', name: 'Pierre Hoarau',   email: 'p.hoarau@argos.re',   phone: '0692 11 22 33', specialty: 'Climatisation', color: TECH_COLORS[0], login: 'phoarau', password: 'pierre' },
    { id: 't2', name: 'Yann Grondin',    email: 'y.grondin@argos.re',  phone: '0692 22 33 44', specialty: 'Plomberie',     color: TECH_COLORS[1], login: 'ygrondin', password: 'yann' },
    { id: 't3', name: 'Laurent Payet',   email: 'l.payet@argos.re',    phone: '0692 33 44 55', specialty: 'Électricité',   color: TECH_COLORS[2], login: 'lpayet',   password: 'laurent' },
    { id: 't4', name: 'Sébastien Robert',email: 's.robert@argos.re',   phone: '0692 44 55 66', specialty: 'Multi-tech',    color: TECH_COLORS[3], login: 'srobert',  password: 'seb' },
  ];
  const admins = [
    { id: 'a1', login: 'admin', password: 'admin', name: 'Julien Taïale', role: 'admin', superAdmin: true, permissions: defaultAdminPermissions() },
    { id: 'a2', login: 'consult', password: 'consult', name: 'Consultation', role: 'admin', superAdmin: false, permissions: { tickets: 'read', planning: 'read', clients: 'read', sites: 'read', products: 'read', chantiers: 'read', technicians: 'read', admins: 'none', accidents: 'read', derogations: 'read', bulletins: 'read', stats: 'read', exports: 'none' } },
  ];

  const tickets = [
    {
      id: uid('t'), number: 'INT-2026-0001',
      clientId: 'c1', siteId: 's1', productId: 'p1',
      title: 'Climatiseur chambre 204 ne refroidit plus',
      description: 'La chambre 204 fait remonter une température de 28°C, le climatiseur tourne mais ne refroidit plus. Vérifié, pas de blocage.',
      priority: 'haute', status: 'en_cours',
      createdAt: todayISO(-3), createdBy: 'c1',
      technicianIds: ['t1'], scheduledAt: todayISO(0), scheduledEnd: todayISO(1),
      hours: 1.5,
      comments: [
        { author: 'Marc Lebon', role: 'client', text: 'Client mécontent, à traiter rapidement.', date: todayISO(-3) },
        { author: 'Pierre Hoarau', role: 'tech', text: 'Diagnostic effectué, manque de gaz suspecté. Pièce commandée.', date: todayISO(-1) },
      ],
    },
    {
      id: uid('t'), number: 'INT-2026-0002',
      clientId: 'c2', siteId: 's3', productId: 'p3',
      title: 'Plus d\'eau chaude au 2e étage',
      description: 'Aucune eau chaude depuis hier soir aux étages 2 et 3.',
      priority: 'urgente', status: 'planifie',
      createdAt: todayISO(-1), createdBy: 'c2',
      technicianIds: ['t2'], scheduledAt: todayISO(1), scheduledEnd: null,
      hours: 0,
      comments: [],
    },
    {
      id: uid('t'), number: 'INT-2026-0003',
      clientId: 'c3', siteId: 's4', productId: 'p5',
      title: 'Badge accès bureau du DGS HS',
      description: 'Le lecteur de badge du bureau du DGS ne répond plus.',
      priority: 'normale', status: 'nouveau',
      createdAt: todayISO(0), createdBy: 'c3',
      technicianIds: [], scheduledAt: null, scheduledEnd: null,
      hours: 0,
      comments: [],
    },
    {
      id: uid('t'), number: 'INT-2026-0004',
      clientId: 'c1', siteId: 's2', productId: 'p4',
      title: 'Bruit anormal pompe spa',
      description: 'La pompe émet un cliquetis depuis 2 jours, pression normale.',
      priority: 'normale', status: 'resolu',
      createdAt: todayISO(-7), createdBy: 'c1',
      technicianIds: ['t2'], scheduledAt: todayISO(-5), scheduledEnd: todayISO(-4),
      completedAt: todayISO(-4),
      hours: 2.0,
      comments: [
        { author: 'Yann Grondin', role: 'tech', text: 'Roulement remplacé, pompe réamorcée. Test OK.', date: todayISO(-4) },
      ],
    },
    {
      id: uid('t'), number: 'INT-2026-0005',
      clientId: 'c4', siteId: 's6', productId: 'p2',
      title: 'Installation nouveau split apt 12',
      description: 'Installation d\'un nouveau climatiseur dans l\'appartement 12 (fourni).',
      priority: 'basse', status: 'planifie',
      createdAt: todayISO(-2), createdBy: 'a1',
      technicianIds: ['t1', 't4'], scheduledAt: todayISO(2), scheduledEnd: todayISO(2),
      hours: 0,
      comments: [],
    },
    {
      id: uid('t'), number: 'INT-2026-0006',
      clientId: 'c3', siteId: 's5', productId: null,
      title: 'Tableau électrique disjoncte salle de spectacle',
      description: 'Le différentiel saute dès la mise en route des projecteurs.',
      priority: 'haute', status: 'en_cours',
      createdAt: todayISO(-4), createdBy: 'c3',
      technicianIds: ['t3'], scheduledAt: todayISO(0), scheduledEnd: null,
      hours: 3.5,
      comments: [
        { author: 'Laurent Payet', role: 'tech', text: 'Fuite à la terre identifiée sur projecteur 4. Diag en cours.', date: todayISO(-1) },
      ],
    },
    {
      id: uid('t'), number: 'INT-2026-0007',
      clientId: 'c2', siteId: 's3', productId: 'p6',
      title: 'Maintenance préventive trimestrielle VRV',
      description: 'Visite préventive trimestrielle du système VRV.',
      priority: 'basse', status: 'cloture',
      createdAt: todayISO(-25), createdBy: 'a1',
      technicianIds: ['t4'], scheduledAt: todayISO(-20), scheduledEnd: todayISO(-19),
      completedAt: todayISO(-19),
      hours: 4.0,
      comments: [
        { author: 'Sébastien Robert', role: 'tech', text: 'Maintenance complète effectuée. Filtres remplacés.', date: todayISO(-19) },
      ],
    },
    {
      id: uid('t'), number: 'INT-2026-0008',
      clientId: 'c1', siteId: 's1', productId: 'p1',
      title: 'Chambre 312 : régulation thermostat',
      description: 'Le thermostat ne maintient pas la consigne, écart de 3°C.',
      priority: 'normale', status: 'planifie',
      createdAt: todayISO(0), createdBy: 'c1',
      technicianIds: ['t1'], scheduledAt: todayISO(1), scheduledEnd: null,
      hours: 0,
      comments: [],
    },
    {
      id: uid('t'), number: 'INT-2026-0009',
      clientId: 'c4', siteId: 's6', productId: null,
      title: 'Fuite robinet cuisine apt 5',
      description: 'Fuite goutte-à-goutte au niveau du mitigeur cuisine.',
      priority: 'basse', status: 'nouveau',
      createdAt: todayISO(0), createdBy: 'c4',
      technicianIds: [], scheduledAt: null, scheduledEnd: null,
      hours: 0,
      comments: [],
    },
    {
      id: uid('t'), number: 'INT-2026-0010',
      clientId: 'c1', siteId: 's2', productId: 'p2',
      title: 'Cuisine : maintenance climatisation',
      description: 'Maintenance annuelle climatisation cuisine.',
      priority: 'normale', status: 'planifie',
      createdAt: todayISO(-1), createdBy: 'a1',
      technicianIds: ['t4'], scheduledAt: todayISO(3), scheduledEnd: null,
      hours: 0,
      comments: [],
    },
  ];

  const chantiers = [
    {
      id: 'cha1',
      number: 'CHA-2026-0001',
      clientId: 'c1', siteId: 's1',
      name: 'Rénovation lobby Hôtel Le Récif',
      numAffaire: 'AF-2026-001',
      description: 'Rénovation complète du lobby principal : moquette, peinture, éclairage.',
      contactName: 'Marc Lebon',
      contactPhone: '0262 24 00 00',
      contactEmail: 'contact@hotel-recif.re',
      address: '50 av. de Bourbon, St-Gilles-les-Bains',
      lat: -21.0553, lng: 55.2236,
      tasks: '- Démontage moquette existante\n- Pose nouvelle moquette\n- Peinture murs et plafonds\n- Installation nouveaux éclairages LED',
      comments: [],
      createdAt: todayISO(-5),
      createdBy: 'a1',
      technicianIds: ['t1', 't4'],
      scheduledAt: todayISO(0),
      duration: 4,
    },
  ];
  const bulletins = [
    {
      id: 'b1',
      number: 'NZI-2026-0001',
      title: 'Port des EPI sur tous les chantiers',
      date: todayISO(-2),
      info: 'Rappel : le port des équipements de protection individuelle (casque, chaussures de sécurité, gants) est obligatoire dès l\'arrivée sur chantier. Tout manquement constaté fera l\'objet d\'un signalement QSE.',
      comments: [],
      readBy: [],
      createdAt: todayISO(-2),
      createdBy: 'a1',
    },
  ];
  return {
    clients, sites, products, technicians, admins, tickets,
    accidents: [],
    derogations: [],
    chantiers,
    bulletins,
    seq: 11,
    accidentSeq: 1,
    derogationSeq: 1,
    chantierSeq: 2,
    bulletinSeq: 2,
    settings: { name: 'ARGOS OCEAN INDIEN' }
  };
}

const DB = {
  data: null,
  init() {
    this.data = loadDB() || seedDB();
    saveDB(this.data);
    return this.data;
  },
  reset() {
    this.data = seedDB();
    saveDB(this.data);
    return this.data;
  },
  save() { saveDB(this.data); },

  // === Generic CRUD ===
  list(coll) { return [...(this.data[coll] || [])]; },
  get(coll, id) { return (this.data[coll] || []).find(x => x.id === id); },
  insert(coll, obj) {
    if (!obj.id) obj.id = uid(coll[0]);
    this.data[coll].push(obj);
    this.save();
    return obj;
  },
  update(coll, id, patch) {
    const i = this.data[coll].findIndex(x => x.id === id);
    if (i < 0) return null;
    this.data[coll][i] = { ...this.data[coll][i], ...patch };
    this.save();
    return this.data[coll][i];
  },
  remove(coll, id) {
    const before = this.data[coll].length;
    this.data[coll] = this.data[coll].filter(x => x.id !== id);
    this.save();
    return before !== this.data[coll].length;
  },

  // === Tickets ===
  newTicketNumber() {
    const n = String(this.data.seq++).padStart(4, '0');
    this.save();
    return `INT-2026-${n}`;
  },
  createTicket(payload) {
    const t = {
      id: uid('t'),
      number: this.newTicketNumber(),
      createdAt: new Date().toISOString(),
      status: 'nouveau',
      hours: 0,
      tripCount: 0,
      interventionDescription: '',
      comments: [],
      technicianIds: [],
      scheduledAt: null,
      scheduledEnd: null,
      signature: null,
      signatureDate: null,
      techSignature: null,
      techSignatureDate: null,
      ...payload,
    };
    this.data.tickets.push(t);
    this.save();
    return t;
  },

  // === Ticket multi-tech & date range helpers ===
  ticketTechs(t) {
    if (!t) return [];
    return Array.isArray(t.technicianIds) ? t.technicianIds : [];
  },
  ticketHasTech(t, techId) {
    return this.ticketTechs(t).includes(techId);
  },
  ticketTechsLabel(t) {
    const ids = this.ticketTechs(t);
    return ids.length ? ids.map(id => this.techName(id)).join(', ') : '';
  },
  ticketCoversDay(t, day) {
    if (!t || !t.scheduledAt) return false;
    const start = new Date(t.scheduledAt); start.setHours(0,0,0,0);
    const endIso = t.scheduledEnd || t.scheduledAt;
    const end = new Date(endIso); end.setHours(23,59,59,999);
    const d = new Date(day); d.setHours(12,0,0,0);
    return d >= start && d <= end;
  },
  newAccidentNumber() {
    const n = String(this.data.accidentSeq++).padStart(4, '0');
    this.save();
    return `ACC-2026-${n}`;
  },
  newDerogationNumber() {
    const n = String(this.data.derogationSeq++).padStart(4, '0');
    this.save();
    return `DER-2026-${n}`;
  },
  newChantierNumber() {
    if (this.data.chantierSeq == null) this.data.chantierSeq = 1;
    const n = String(this.data.chantierSeq++).padStart(4, '0');
    this.save();
    return `CHA-2026-${n}`;
  },
  newBulletinNumber() {
    if (this.data.bulletinSeq == null) this.data.bulletinSeq = 1;
    const n = String(this.data.bulletinSeq++).padStart(4, '0');
    this.save();
    return `NZI-2026-${n}`;
  },
  createBulletin(payload) {
    const b = {
      id: uid('b'),
      number: this.newBulletinNumber(),
      createdAt: new Date().toISOString(),
      comments: [],
      readBy: [],
      ...payload,
    };
    if (!this.data.bulletins) this.data.bulletins = [];
    this.data.bulletins.push(b);
    this.save();
    return b;
  },
  addBulletinComment(id, comment) {
    const b = this.get('bulletins', id);
    if (!b) return;
    if (!b.comments) b.comments = [];
    b.comments.push({ ...comment, date: new Date().toISOString() });
    this.save();
    return b;
  },
  markBulletinRead(id, techId) {
    const b = this.get('bulletins', id);
    if (!b) return;
    if (!b.readBy) b.readBy = [];
    if (!b.readBy.includes(techId)) {
      b.readBy.push(techId);
      this.save();
    }
    return b;
  },
  createChantier(payload) {
    const c = {
      id: uid('cha'),
      number: this.newChantierNumber(),
      createdAt: new Date().toISOString(),
      comments: [],
      tasks: '',
      technicianIds: [],
      scheduledAt: null,
      duration: 1,
      ...payload,
    };
    if (!this.data.chantiers) this.data.chantiers = [];
    this.data.chantiers.push(c);
    this.save();
    return c;
  },
  addChantierComment(chantierId, comment) {
    const c = this.get('chantiers', chantierId);
    if (!c) return;
    if (!c.comments) c.comments = [];
    c.comments.push({ ...comment, date: new Date().toISOString() });
    this.save();
    return c;
  },
  createAccident(payload) {
    const a = {
      id: uid('acc'),
      number: this.newAccidentNumber(),
      createdAt: new Date().toISOString(),
      status: 'en_cours',
      qseRecommendations: '',
      photos: [],
      ...payload,
    };
    this.data.accidents.push(a);
    this.save();
    return a;
  },
  createDerogation(payload) {
    const d = {
      id: uid('der'),
      number: this.newDerogationNumber(),
      createdAt: new Date().toISOString(),
      status: 'en_cours',
      preventiveMeasures: '',  // QSE - rempli par l'admin
      techRecommendations: '', // technicien - peut être rempli après création
      photos: [],
      techSignature: null,
      techSignatureDate: null,
      respSignature: null,
      respSignatureDate: null,
      ...payload,
    };
    this.data.derogations.push(d);
    this.save();
    return d;
  },
  setDerogationSignature(id, kind, dataUrl) {
    const patch = kind === 'resp'
      ? { respSignature: dataUrl, respSignatureDate: new Date().toISOString() }
      : { techSignature: dataUrl, techSignatureDate: new Date().toISOString() };
    return this.update('derogations', id, patch);
  },

  setSignature(ticketId, kind, dataUrl, signerName) {
    if (kind === 'tech') {
      return this.update('tickets', ticketId, {
        techSignature: dataUrl,
        techSignatureDate: new Date().toISOString(),
      });
    }
    return this.update('tickets', ticketId, {
      signature: dataUrl,
      signatureDate: new Date().toISOString(),
      signerName: (signerName || '').trim() || null,
    });
  },
  addComment(ticketId, comment) {
    const t = this.get('tickets', ticketId);
    if (!t) return;
    t.comments.push({ ...comment, date: new Date().toISOString() });
    this.save();
    return t;
  },

  // === Resolvers (display helpers) ===
  clientName(id) { const c = this.get('clients', id); return c ? c.name : '—'; },
  siteName(id)   { const s = this.get('sites', id);   return s ? s.name : '—'; },
  techName(id)   { const t = this.get('technicians', id); return t ? t.name : '—'; },
  techColor(id)  { const t = this.get('technicians', id); return t ? t.color : '#94a3b8'; },
  productName(id){ const p = this.get('products', id); return p ? p.name : '—'; },
  statusLabel(id){ const s = STATUSES.find(x => x.id === id); return s ? s.label : id; },
  priorityLabel(id){ const p = PRIORITIES.find(x => x.id === id); return p ? p.label : id; },
};
