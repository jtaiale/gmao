/* ============================================================
   Authentification — désormais branchée sur le backend (api.js)
   Garde l'interface synchrone (Auth.isAdmin etc.) que le reste
   de l'application utilise déjà, mais les méthodes login* / init
   sont asynchrones et passent par /api/auth.
   ============================================================ */
const Auth = {
  current: null,

  /**
   * Restaure la session depuis un token déjà stocké côté navigateur.
   * Renvoie l'utilisateur courant ou null si pas de session valide.
   */
  async init() {
    if (typeof api === 'undefined') {
      console.warn('api.js non chargé — Auth en mode dégradé');
      this.current = null;
      return null;
    }
    if (!api.auth.isLogged()) {
      this.current = null;
      return null;
    }
    try {
      const u = await api.auth.me();
      this._setCurrent(u);
      return this.current;
    } catch (e) {
      console.warn('Auth.init: session invalide, on déconnecte', e?.message);
      api.Token.clear();
      this.current = null;
      return null;
    }
  },

  _setCurrent(u) {
    if (!u) { this.current = null; return; }
    this.current = {
      kind: u.kind,
      id: u.id,
      name: u.name,
      login: u.login,
      superAdmin: !!u.superAdmin,
      permissions: u.permissions || {},
      clientId: u.clientId || null,
    };
  },

  async _login(kind, login, password) {
    if (typeof api === 'undefined') throw new Error('Client API non chargé');
    const u = await api.auth.login(login, password, kind);
    this._setCurrent(u);
    return this.current;
  },

  loginAdmin (login, password) { return this._login('admin',  login, password); },
  loginClient(login, password) { return this._login('client', login, password); },
  loginTech  (login, password) { return this._login('tech',   login, password); },

  async logout() {
    try { if (typeof api !== 'undefined') await api.auth.logout(); } catch (_) {}
    this.current = null;
  },

  isAdmin () { return this.current && this.current.kind === 'admin';  },
  isClient() { return this.current && this.current.kind === 'client'; },
  isTech  () { return this.current && this.current.kind === 'tech';   },

  /**
   * Vérification de permission admin (lecture/écriture par menu).
   * Pour tech / client, retourne true (leurs accès sont scopés ailleurs).
   */
  can(menu, level) {
    level = level || 'read';
    if (!this.isAdmin()) return true;
    if (this.current.superAdmin) return true;
    const lvl = (this.current.permissions || {})[menu] || 'none';
    if (level === 'read')  return lvl === 'read' || lvl === 'write';
    if (level === 'write') return lvl === 'write';
    return false;
  },
};
