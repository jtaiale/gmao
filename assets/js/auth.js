/* ============================================================
   Authentification — session localStorage
   ============================================================ */
const SESSION_KEY = 'gmao_argos_session_v1';

const Auth = {
  current: null,

  init() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) this.current = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return this.current;
  },

  loginAdmin(login, password) {
    const admin = DB.list('admins').find(a => a.login === login && a.password === password);
    if (!admin) return null;
    this.current = { kind: 'admin', id: admin.id, name: admin.name, login: admin.login };
    localStorage.setItem(SESSION_KEY, JSON.stringify(this.current));
    return this.current;
  },

  loginClient(login, password) {
    const client = DB.list('clients').find(c => c.login === login && c.password === password);
    if (!client) return null;
    this.current = { kind: 'client', id: client.id, name: client.name, login: client.login };
    localStorage.setItem(SESSION_KEY, JSON.stringify(this.current));
    return this.current;
  },

  loginTech(login, password) {
    const tech = DB.list('technicians').find(t => t.login === login && t.password === password);
    if (!tech) return null;
    this.current = { kind: 'tech', id: tech.id, name: tech.name, login: tech.login };
    localStorage.setItem(SESSION_KEY, JSON.stringify(this.current));
    return this.current;
  },

  logout() {
    this.current = null;
    localStorage.removeItem(SESSION_KEY);
  },

  isAdmin() { return this.current && this.current.kind === 'admin'; },
  isClient() { return this.current && this.current.kind === 'client'; },
  isTech() { return this.current && this.current.kind === 'tech'; },

  // Permissions for admin role only.
  // For tech/client, returns true (their own scoped routes are not gated by this system).
  can(menu, level) {
    level = level || 'read';
    if (!this.isAdmin()) return true;
    const me = DB.get('admins', this.current.id);
    if (!me) return false;
    if (me.superAdmin) return true;
    const p = (me.permissions || {})[menu] || 'none';
    if (level === 'read')  return p === 'read' || p === 'write';
    if (level === 'write') return p === 'write';
    return false;
  },
};
