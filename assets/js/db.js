/* ============================================================
   Couche données — bridge cache local + API backend
   - Au boot : hydrate toutes les collections depuis /api/*
   - Lectures (list/get) : sync, depuis le cache
   - Mutations (insert/update/remove + helpers create*) : envoi
     au backend + mise à jour optimiste du cache
   - L'interface publique reste compatible avec l'ancien proto
   ============================================================ */

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
const ACCIDENT_STATUSES = [
  { id: 'en_cours', label: 'En cours' },
  { id: 'traite',   label: 'Traité' },
];
const TECH_COLORS = ['#1f769e', '#2e9e5b', '#d97a00', '#7c3aed', '#c8362d', '#0891b2'];

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
  return Object.fromEntries(PERMISSION_MENUS.map(m => [m.key, 'write']));
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function _silentToast(msg, type = 'error') {
  if (typeof toast === 'function') toast(msg, type, 5000);
  else console.warn('[DB]', msg);
}
function _rerender() {
  if (typeof Router !== 'undefined' && Router.render) {
    try { Router.render(); } catch (_) {}
  }
}

// Mappe nom de collection -> module api correspondant
function _apiFor(coll) {
  if (typeof api === 'undefined') return null;
  switch (coll) {
    case 'tickets':     return api.tickets;
    case 'clients':     return api.clients;
    case 'sites':       return api.sites;
    case 'products':    return api.products;
    case 'technicians': return api.technicians;
    case 'admins':      return api.admins;
    case 'chantiers':   return api.chantiers;
    case 'accidents':   return api.accidents;
    case 'derogations': return api.derogations;
    case 'bulletins':   return api.bulletins;
    default: return null;
  }
}

const DB = {
  data: {
    clients: [], sites: [], products: [], technicians: [], admins: [],
    tickets: [], chantiers: [], accidents: [], derogations: [], bulletins: [],
  },

  /** Charge les données à partir du backend (à appeler après login). */
  async init() {
    if (typeof Auth === 'undefined' || !Auth.current) {
      // Pas de session → données vides, l'app affichera la page de login
      this._resetCache();
      return this.data;
    }
    await this.hydrate();
    return this.data;
  },

  /** Vide le cache (sans toucher au backend). */
  _resetCache() {
    Object.keys(this.data).forEach(k => { this.data[k] = []; });
  },

  /** Recharge toutes les collections depuis l'API. */
  async hydrate() {
    if (typeof api === 'undefined' || !api.auth.isLogged()) {
      this._resetCache();
      return;
    }
    const kind = Auth.current.kind;
    const fetchSafe = async (key, fn) => {
      try { this.data[key] = await fn(); }
      catch (e) {
        if (e?.status !== 403 && e?.status !== 401) console.warn('[hydrate]', key, e?.message);
        this.data[key] = [];
      }
    };

    await Promise.all([
      fetchSafe('tickets',     () => api.tickets.list()),
      fetchSafe('clients',     () => api.clients.list()),
      fetchSafe('sites',       () => api.sites.list()),
      fetchSafe('products',    () => api.products.list()),
      fetchSafe('chantiers',   () => api.chantiers.list()),
      fetchSafe('accidents',   () => api.accidents.list()),
      fetchSafe('derogations', () => api.derogations.list()),
      fetchSafe('bulletins',   () => api.bulletins.list()),
      // technicians : utile pour tous (planning, affichage) mais nécessite
      // d'être admin côté backend. On laisse vide pour les autres rôles.
      (kind === 'admin') ? fetchSafe('technicians', () => api.technicians.list()) : Promise.resolve(),
      (kind === 'admin') ? fetchSafe('admins',      () => api.admins.list())      : Promise.resolve(),
    ]);

    // Pour les rôles non-admins, on tente quand même technicians (l'API peut
    // l'autoriser en lecture si la permission existe ; sinon, on aura un tableau vide).
    if (kind !== 'admin') {
      try { this.data.technicians = await api.technicians.list(); } catch { /* ignore */ }
    }
  },

  // ============================================================
  // Lectures synchrones depuis le cache
  // ============================================================
  list(coll)      { return [...(this.data[coll] || [])]; },
  get(coll, id)   { return (this.data[coll] || []).find(x => x.id === id); },

  // ============================================================
  // Mutations génériques (référentiels simples)
  // ============================================================

  /** Insert optimiste + POST. Renvoie le record server (Promise). */
  async insert(coll, obj) {
    if (!obj.id) obj.id = uid(coll[0]);
    this.data[coll].push(obj);
    _rerender();
    const m = _apiFor(coll);
    if (!m) return obj;
    try {
      const server = await m.create(this._stripLocalFields(obj, coll));
      // Remplace temp par serveur
      const i = this.data[coll].findIndex(x => x.id === obj.id);
      if (i >= 0) this.data[coll][i] = server;
      _rerender();
      return server;
    } catch (e) {
      this.data[coll] = this.data[coll].filter(x => x.id !== obj.id);
      _rerender();
      _silentToast('Échec création : ' + (e?.message || ''), 'error');
      throw e;
    }
  },

  /** Update optimiste + PATCH. Renvoie le record local mis à jour (sync). */
  update(coll, id, patch) {
    const i = this.data[coll].findIndex(x => x.id === id);
    if (i < 0) return null;
    const prev = this.data[coll][i];
    this.data[coll][i] = { ...prev, ...patch };
    const updated = this.data[coll][i];
    const m = _apiFor(coll);
    if (m && m.update) {
      m.update(id, this._stripLocalFields(patch, coll)).then(server => {
        const j = this.data[coll].findIndex(x => x.id === id);
        if (j >= 0) this.data[coll][j] = { ...this.data[coll][j], ...server };
        _rerender();
      }).catch(e => {
        // rollback
        const j = this.data[coll].findIndex(x => x.id === id);
        if (j >= 0) this.data[coll][j] = prev;
        _silentToast('Échec mise à jour : ' + (e?.message || ''), 'error');
        _rerender();
      });
    }
    return updated;
  },

  /** Delete optimiste + DELETE. */
  remove(coll, id) {
    const prev = this.data[coll].find(x => x.id === id);
    if (!prev) return false;
    this.data[coll] = this.data[coll].filter(x => x.id !== id);
    _rerender();
    const m = _apiFor(coll);
    if (m && m.delete) {
      m.delete(id).catch(e => {
        // rollback
        this.data[coll].push(prev);
        _silentToast('Échec suppression : ' + (e?.message || ''), 'error');
        _rerender();
      });
    }
    return true;
  },

  /** Retire les champs locaux non envoyés au backend (variables selon ent.) */
  _stripLocalFields(obj, coll) {
    const clone = { ...obj };
    delete clone.id;          // jamais d'ID local côté serveur
    delete clone.createdAt;
    delete clone.updatedAt;
    delete clone.number;      // généré côté serveur
    if (coll === 'tickets')   { delete clone.technicians; delete clone.client; delete clone.site; delete clone.product; delete clone.comments; }
    if (coll === 'chantiers') { delete clone.technicians; delete clone.comments; }
    if (coll === 'bulletins') { delete clone.reads; delete clone.comments; delete clone.readByMe; delete clone.readCount; }
    return clone;
  },

  // ============================================================
  // Tickets — actions spécialisées
  // ============================================================
  async createTicket(payload) {
    const optimistic = {
      id: uid('t'), number: '…',
      status: 'nouveau', hours: 0, tripCount: 0,
      interventionDescription: '', comments: [],
      technicianIds: [], scheduledAt: null, scheduledEnd: null,
      signature: null, signatureDate: null, signerName: null,
      techSignature: null, techSignatureDate: null,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.data.tickets.unshift(optimistic);
    _rerender();
    try {
      const server = await api.tickets.create({
        clientId: payload.clientId, siteId: payload.siteId,
        productId: payload.productId || null,
        title: payload.title, description: payload.description || '',
        priority: payload.priority || 'normale',
        technicianIds: payload.technicianIds || [],
        scheduledAt:  payload.scheduledAt  || null,
        scheduledEnd: payload.scheduledEnd || null,
      });
      // Le serveur renvoie { id, number }. On récupère ensuite le détail complet.
      const full = await api.tickets.get(server.id);
      const i = this.data.tickets.findIndex(x => x.id === optimistic.id);
      if (i >= 0) this.data.tickets[i] = full; else this.data.tickets.unshift(full);
      _rerender();
      return full;
    } catch (e) {
      this.data.tickets = this.data.tickets.filter(x => x.id !== optimistic.id);
      _rerender();
      _silentToast('Échec création du ticket : ' + (e?.message || ''), 'error');
      throw e;
    }
  },

  async addComment(ticketId, comment) {
    const t = this.get('tickets', ticketId);
    if (!t) return null;
    const optimistic = {
      id: uid('c'),
      authorName: comment.author, role: comment.role,
      text: comment.text, createdAt: new Date().toISOString(),
    };
    t.comments = [...(t.comments || []), optimistic];
    _rerender();
    try {
      const server = await api.tickets.addComment(ticketId, comment.text);
      // remplace tempo
      const idx = t.comments.findIndex(c => c.id === optimistic.id);
      if (idx >= 0) t.comments[idx] = server;
      _rerender();
      return t;
    } catch (e) {
      t.comments = t.comments.filter(c => c.id !== optimistic.id);
      _silentToast('Échec ajout commentaire : ' + (e?.message || ''), 'error');
      _rerender();
      throw e;
    }
  },

  /** Signature client (kind='client') ou technicien (kind='tech'). */
  async setSignature(ticketId, kind, dataUrl, signerName) {
    const t = this.get('tickets', ticketId);
    if (!t) return null;
    // Optimistic
    if (kind === 'tech') {
      t.techSignature = dataUrl;
      t.techSignatureDate = new Date().toISOString();
    } else {
      t.signature = dataUrl;
      t.signatureDate = new Date().toISOString();
      t.signerName = signerName || null;
    }
    _rerender();
    try {
      const server = await api.tickets.setSignature(ticketId, kind, dataUrl, signerName);
      Object.assign(t, server);
      _rerender();
      return t;
    } catch (e) {
      _silentToast('Échec signature : ' + (e?.message || ''), 'error');
      // pas de rollback simple — on rafraîchit depuis l'API
      this.refresh('tickets', ticketId);
      throw e;
    }
  },

  // ============================================================
  // Chantiers
  // ============================================================
  async createChantier(payload) {
    const optimistic = {
      id: uid('cha'), number: '…', createdAt: new Date().toISOString(),
      comments: [], tasks: '', technicianIds: [], scheduledAt: null, duration: 1,
      ...payload,
    };
    this.data.chantiers.unshift(optimistic);
    _rerender();
    try {
      const meta = await api.chantiers.create(payload);
      const full = await api.chantiers.get(meta.id);
      const i = this.data.chantiers.findIndex(x => x.id === optimistic.id);
      if (i >= 0) this.data.chantiers[i] = full;
      _rerender();
      return full;
    } catch (e) {
      this.data.chantiers = this.data.chantiers.filter(x => x.id !== optimistic.id);
      _silentToast('Échec création chantier : ' + (e?.message || ''), 'error');
      _rerender();
      throw e;
    }
  },
  async addChantierComment(chantierId, comment) {
    const c = this.get('chantiers', chantierId);
    if (!c) return null;
    const optimistic = { id: uid('cm'), authorName: comment.author, role: comment.role, text: comment.text, createdAt: new Date().toISOString() };
    c.comments = [...(c.comments || []), optimistic];
    _rerender();
    try { await api.chantiers.addComment(chantierId, comment.text); }
    catch (e) {
      c.comments = c.comments.filter(x => x.id !== optimistic.id);
      _silentToast('Échec ajout commentaire : ' + (e?.message || ''), 'error');
      _rerender();
    }
    return c;
  },

  // ============================================================
  // Accidents / Dérogations / Bulletins
  // ============================================================
  async createAccident(payload) {
    const optimistic = { id: uid('acc'), number: '…', status: 'en_cours', qseRecommendations: '', photos: [], createdAt: new Date().toISOString(), ...payload };
    this.data.accidents.unshift(optimistic);
    _rerender();
    try {
      const server = await api.accidents.create(payload);
      const i = this.data.accidents.findIndex(x => x.id === optimistic.id);
      if (i >= 0) this.data.accidents[i] = server;
      _rerender();
      return server;
    } catch (e) {
      this.data.accidents = this.data.accidents.filter(x => x.id !== optimistic.id);
      _silentToast('Échec création déclaration : ' + (e?.message || ''), 'error');
      _rerender();
      throw e;
    }
  },

  async createDerogation(payload) {
    const optimistic = { id: uid('der'), number: '…', status: 'en_cours', preventiveMeasures: '', techRecommendations: '', photos: [], techSignature: null, techSignatureDate: null, respSignature: null, respSignatureDate: null, createdAt: new Date().toISOString(), ...payload };
    this.data.derogations.unshift(optimistic);
    _rerender();
    try {
      const server = await api.derogations.create(payload);
      const i = this.data.derogations.findIndex(x => x.id === optimistic.id);
      if (i >= 0) this.data.derogations[i] = server;
      _rerender();
      return server;
    } catch (e) {
      this.data.derogations = this.data.derogations.filter(x => x.id !== optimistic.id);
      _silentToast('Échec création dérogation : ' + (e?.message || ''), 'error');
      _rerender();
      throw e;
    }
  },
  async setDerogationSignature(id, kind, dataUrl) {
    const d = this.get('derogations', id);
    if (!d) return null;
    if (kind === 'resp') { d.respSignature = dataUrl; d.respSignatureDate = new Date().toISOString(); }
    else                  { d.techSignature = dataUrl; d.techSignatureDate = new Date().toISOString(); }
    _rerender();
    try { await api.derogations.sign(id, kind, dataUrl); }
    catch (e) { _silentToast('Échec signature : ' + (e?.message || ''), 'error'); this.refresh('derogations', id); }
    return d;
  },

  async createBulletin(payload) {
    const optimistic = { id: uid('b'), number: '…', readByMe: true, readCount: 0, comments: [], createdAt: new Date().toISOString(), ...payload };
    this.data.bulletins.unshift(optimistic);
    _rerender();
    try {
      const server = await api.bulletins.create(payload);
      const i = this.data.bulletins.findIndex(x => x.id === optimistic.id);
      if (i >= 0) this.data.bulletins[i] = { ...server, readByMe: true, readCount: 0 };
      _rerender();
      return server;
    } catch (e) {
      this.data.bulletins = this.data.bulletins.filter(x => x.id !== optimistic.id);
      _silentToast('Échec création bulletin : ' + (e?.message || ''), 'error');
      _rerender();
      throw e;
    }
  },
  async addBulletinComment(bulletinId, comment) {
    const b = this.get('bulletins', bulletinId);
    if (!b) return null;
    const optimistic = { id: uid('bc'), authorName: comment.author, role: comment.role, text: comment.text, createdAt: new Date().toISOString() };
    b.comments = [...(b.comments || []), optimistic];
    _rerender();
    try { await api.bulletins.addComment(bulletinId, comment.text); }
    catch (e) {
      b.comments = b.comments.filter(x => x.id !== optimistic.id);
      _silentToast('Échec ajout commentaire : ' + (e?.message || ''), 'error');
      _rerender();
    }
    return b;
  },
  async markBulletinRead(bulletinId, _techId) {
    const b = this.get('bulletins', bulletinId);
    if (!b) return null;
    if (!b.readByMe) b.readByMe = true;
    _rerender();
    try { await api.bulletins.markRead(bulletinId); } catch (_) {}
    return b;
  },

  // ============================================================
  // Refresh ciblé d'un élément (pour récupérer des champs lourds après mutation)
  // ============================================================
  async refresh(coll, id) {
    const m = _apiFor(coll);
    if (!m || !m.get) return null;
    try {
      const fresh = await m.get(id);
      const i = this.data[coll].findIndex(x => x.id === id);
      if (i >= 0) this.data[coll][i] = fresh; else this.data[coll].push(fresh);
      _rerender();
      return fresh;
    } catch (_) { return null; }
  },

  // ============================================================
  // Compat — numéros générés côté serveur, ces helpers ne sont
  // plus utilisés directement mais on les garde pour ne rien casser.
  // ============================================================
  newTicketNumber()     { return '…'; },
  newAccidentNumber()   { return '…'; },
  newDerogationNumber() { return '…'; },
  newChantierNumber()   { return '…'; },
  newBulletinNumber()   { return '…'; },

  /** Bouton "Réinitialiser les données" de l'écran Extractions → recharge depuis l'API. */
  async reset() { await this.hydrate(); _rerender(); return this.data; },
  save()        { /* no-op : tout est persisté via l'API au moment de la mutation */ },

  // ============================================================
  // Helpers d'affichage (toujours sync, depuis le cache)
  // ============================================================
  clientName(id) { const c = this.get('clients', id); return c ? c.name : '—'; },
  siteName(id)   { const s = this.get('sites', id);   return s ? s.name : '—'; },
  techName(id)   { const t = this.get('technicians', id); return t ? t.name : '—'; },
  techColor(id)  { const t = this.get('technicians', id); return t ? t.color : '#94a3b8'; },
  productName(id){ const p = this.get('products', id); return p ? p.name : '—'; },
  statusLabel(id)  { const s = STATUSES.find(x => x.id === id);   return s ? s.label : id; },
  priorityLabel(id){ const p = PRIORITIES.find(x => x.id === id); return p ? p.label : id; },

  // Tickets multi-tech & intervalle
  ticketTechs(t) {
    if (!t) return [];
    return Array.isArray(t.technicianIds) ? t.technicianIds : [];
  },
  ticketHasTech(t, techId) { return this.ticketTechs(t).includes(techId); },
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
};
