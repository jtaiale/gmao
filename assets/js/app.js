/* ============================================================
   App principale — routage + shell (sidebar/header)
   ============================================================ */

const ADMIN_ROUTES = [
  { path: '/admin',                 title: 'Tableau de bord',   icon: 'dashboard', perm: null,         view: () => AdminViews.dashboard() },
  { path: '/admin/tickets',         title: 'Tickets',           icon: 'ticket',    perm: 'tickets',    view: () => AdminViews.tickets() },
  { path: '/admin/planning',        title: 'Planning',          icon: 'calendar',  perm: 'planning',   view: (p) => AdminViews.planning(p) },
  { path: '/admin/clients',         title: 'Clients',           icon: 'user',      perm: 'clients',    view: () => AdminViews.clients() },
  { path: '/admin/sites',           title: 'Sites',             icon: 'building',  perm: 'sites',      view: () => AdminViews.sites() },
  { path: '/admin/products',        title: 'Produits',          icon: 'box',       perm: 'products',   view: () => AdminViews.products() },
  { path: '/admin/technicians',     title: 'Techniciens',       icon: 'wrench',    perm: 'technicians',view: () => AdminViews.technicians() },
  { path: '/admin/chantiers',       title: 'Chantiers',         icon: 'building',  perm: 'chantiers',  view: () => Chantier.list('admin') },
  { path: '/admin/admins',          title: 'Administrateurs',   icon: 'user',      perm: 'admins',     view: () => AdminViews.admins() },
  { path: '/admin/accidents',       title: 'Presque-accidents', icon: 'alert',     perm: 'accidents',  view: () => Safety.accidentsList('admin') },
  { path: '/admin/derogations',     title: 'Dérogations',       icon: 'alert',     perm: 'derogations',view: () => Safety.derogationsList('admin') },
  { path: '/admin/bulletins',       title: 'Bulletin NOUT ZINFOS', icon: 'alert',  perm: 'bulletins',  view: () => Bulletins.list('admin') },
  { path: '/admin/notifications',   title: 'Notifications mail',icon: 'inbox',     perm: 'notifications', view: () => AdminViews.notifications() },
  { path: '/admin/stats',           title: 'Statistiques',      icon: 'chart',     perm: 'stats',      view: () => AdminViews.stats() },
  { path: '/admin/exports',         title: 'Extractions',       icon: 'download',  perm: 'exports',    view: () => AdminViews.exports() },
];

const CLIENT_ROUTES = [
  { path: '/client',                title: 'Accueil',           icon: 'dashboard', view: () => ClientViews.dashboard() },
  { path: '/client/new',            title: 'Nouvelle demande',  icon: 'plus',      view: () => ClientViews.newTicket() },
  { path: '/client/tickets',        title: 'Mes demandes',      icon: 'ticket',    view: () => ClientViews.tickets() },
  { path: '/client/stats',          title: 'Statistiques',      icon: 'chart',     view: () => ClientViews.stats() },
];

const TECH_ROUTES = [
  { path: '/tech',                  title: 'Tableau de bord',        icon: 'dashboard', view: () => TechViews.dashboard() },
  { path: '/tech/planning',         title: 'Planning',               icon: 'calendar',  view: (p) => TechViews.planningGraphical(p) },
  { path: '/tech/tickets',          title: 'Mes tickets',            icon: 'ticket',    view: () => TechViews.tickets() },
  { path: '/tech/chantiers',        title: 'Chantiers',              icon: 'building',  view: () => Chantier.list('tech') },
  { path: '/tech/accidents',        title: 'Presque-accidents',      icon: 'alert',     view: () => Safety.accidentsList('tech') },
  { path: '/tech/derogations',      title: 'Demandes de dérogation', icon: 'alert',     view: () => Safety.derogationsList('tech') },
  { path: '/tech/bulletins',        title: 'Bulletin NOUT ZINFOS',   icon: 'alert',     view: () => Bulletins.list('tech') },
];

const Router = {
  render() {
    if (!Auth.current) {
      LoginView.render();
      return;
    }

    const hash = (location.hash || '#/').slice(1);
    const parts = hash.split('/').filter(Boolean);

    // Force redirection per role
    if (Auth.isAdmin() && parts[0] !== 'admin') { location.hash = '#/admin'; return; }
    if (Auth.isClient() && parts[0] !== 'client') { location.hash = '#/client'; return; }
    if (Auth.isTech() && parts[0] !== 'tech') { location.hash = '#/tech'; return; }

    const routes = Auth.isAdmin() ? ADMIN_ROUTES : Auth.isTech() ? TECH_ROUTES : CLIENT_ROUTES;
    const path = '/' + parts.slice(0, 2).join('/');

    // Special detail routes
    if (Auth.isAdmin() && parts[1] === 'ticket' && parts[2]) {
      this._renderShell(routes, '/admin/tickets', `Ticket ${parts[2]}`, AdminViews.ticketDetail(parts[2]));
      return;
    }
    if (Auth.isClient() && parts[1] === 'ticket' && parts[2]) {
      this._renderShell(routes, '/client/tickets', 'Détail demande', ClientViews.ticketDetail(parts[2]));
      return;
    }
    if (Auth.isTech() && parts[1] === 'ticket' && parts[2]) {
      this._renderShell(routes, '/tech/tickets', 'Détail ticket', TechViews.ticketDetail(parts[2]));
      return;
    }
    if (Auth.isAdmin() && parts[1] === 'planning' && parts[2] !== undefined) {
      const view = (parts[2] === 'month' || parts[2] === 'week') ? parts[2] : 'week';
      const off  = (parts[2] === 'month' || parts[2] === 'week') ? parseInt(parts[3] || '0') : parseInt(parts[2]);
      this._renderShell(routes, '/admin/planning', 'Planning', AdminViews.planning(off, view));
      return;
    }
    if (Auth.isTech() && parts[1] === 'planning' && parts[2] !== undefined) {
      const view = (parts[2] === 'month' || parts[2] === 'week') ? parts[2] : 'week';
      const off  = (parts[2] === 'month' || parts[2] === 'week') ? parseInt(parts[3] || '0') : parseInt(parts[2]);
      this._renderShell(routes, '/tech/planning', 'Planning', TechViews.planningGraphical(off, view));
      return;
    }
    // Chantiers detail
    if (Auth.isAdmin() && parts[1] === 'chantier' && parts[2]) {
      this._renderShell(routes, '/admin/chantiers', 'Chantier', Chantier.detail(parts[2], 'admin'));
      return;
    }
    if (Auth.isTech() && parts[1] === 'chantier' && parts[2]) {
      this._renderShell(routes, '/tech/chantiers', 'Chantier', Chantier.detail(parts[2], 'tech'));
      return;
    }
    // Bulletins detail
    if (Auth.isAdmin() && parts[1] === 'bulletin' && parts[2]) {
      this._renderShell(routes, '/admin/bulletins', 'Bulletin', Bulletins.detail(parts[2], 'admin'));
      return;
    }
    if (Auth.isTech() && parts[1] === 'bulletin' && parts[2]) {
      this._renderShell(routes, '/tech/bulletins', 'Bulletin', Bulletins.detail(parts[2], 'tech'));
      return;
    }
    // Accidents
    if (Auth.isTech() && parts[1] === 'accident' && parts[2] === 'new') {
      this._renderShell(routes, '/tech/accidents', 'Nouvelle déclaration', Safety.accidentForm());
      return;
    }
    if (Auth.isTech() && parts[1] === 'accident' && parts[2]) {
      this._renderShell(routes, '/tech/accidents', 'Déclaration', Safety.accidentDetail(parts[2], 'tech'));
      return;
    }
    if (Auth.isAdmin() && parts[1] === 'accident' && parts[2]) {
      this._renderShell(routes, '/admin/accidents', 'Déclaration', Safety.accidentDetail(parts[2], 'admin'));
      return;
    }
    // Dérogations
    if (Auth.isTech() && parts[1] === 'derogation' && parts[2] === 'new') {
      this._renderShell(routes, '/tech/derogations', 'Nouvelle dérogation', Safety.derogationForm());
      return;
    }
    if (Auth.isTech() && parts[1] === 'derogation' && parts[2]) {
      this._renderShell(routes, '/tech/derogations', 'Dérogation', Safety.derogationDetail(parts[2], 'tech'));
      return;
    }
    if (Auth.isAdmin() && parts[1] === 'derogation' && parts[2]) {
      this._renderShell(routes, '/admin/derogations', 'Dérogation', Safety.derogationDetail(parts[2], 'admin'));
      return;
    }

    let route = routes.find(r => r.path === path);
    if (!route) route = routes[0];

    // Permission check (admin only)
    if (Auth.isAdmin() && route.perm && !Auth.can(route.perm, 'read')) {
      this._renderShell(routes, route.path, 'Accès restreint',
        `<div class="card"><div class="card-body"><h2>Accès refusé</h2><p class="muted">Vous n'avez pas l'autorisation de consulter ce menu. Contactez un super-administrateur.</p></div></div>`);
      return;
    }

    this._renderShell(routes, route.path, route.title, route.view());
  },

  _renderShell(routes, activePath, title, content) {
    const root = $('#app');
    const isAdmin = Auth.isAdmin();
    const isTech = Auth.isTech();
    const initials = (Auth.current.name || '?').split(/\s+/).map(p => p[0]).slice(0,2).join('').toUpperCase();
    const roleLabel = isAdmin ? 'Administrateur' : isTech ? 'Technicien' : 'Portail client';

    // Filter admin routes by permissions
    const visible = isAdmin
      ? routes.filter(r => !r.perm || Auth.can(r.perm, 'read'))
      : routes;

    // Count badges for accidents / dérogations / bulletins menus
    const navCountFor = (path) => {
      const scope = isAdmin ? 'admin' : isTech ? 'tech' : null;
      if (!scope) return null;
      if (path === '/admin/accidents'   || path === '/tech/accidents')   return Safety.accidentCounts(scope).en_cours;
      if (path === '/admin/derogations' || path === '/tech/derogations') return Safety.derogationCounts(scope).en_cours;
      if (path === '/tech/bulletins')   return Bulletins.unreadCountForTech();
      if (path === '/admin/bulletins')  return Bulletins._counts('admin').pending;
      return null;
    };

    // Group routes for admin
    const groupedAdmin = isAdmin ? [
      { title: '', items: visible.filter(r => ['/admin','/admin/tickets','/admin/planning','/admin/chantiers'].includes(r.path)) },
      { title: 'Sécurité', items: visible.filter(r => ['/admin/accidents','/admin/derogations','/admin/bulletins'].includes(r.path)) },
      { title: 'Référentiels', items: visible.filter(r => ['/admin/clients','/admin/sites','/admin/products','/admin/technicians','/admin/admins'].includes(r.path)) },
      { title: 'Système', items: visible.filter(r => ['/admin/notifications'].includes(r.path)) },
      { title: 'Analyses', items: visible.filter(r => ['/admin/stats','/admin/exports'].includes(r.path)) },
    ].filter(g => g.items.length > 0) : [{ title: '', items: visible }];

    root.innerHTML = `
      <div class="app">
        <div class="sidebar-overlay" id="sidebar-overlay"></div>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <a href="#/${isAdmin?'admin':isTech?'tech':'client'}"><img src="assets/img/logo.png" onerror="this.onerror=null;this.src='assets/img/logo.svg'" alt="ARGOS OCEAN INDIEN"></a>
          </div>
          <nav class="sidebar-nav">
            ${groupedAdmin.map(g => `
              ${g.title ? `<div class="nav-section-title">${g.title}</div>` : ''}
              ${g.items.map(r => {
                const cnt = navCountFor(r.path);
                const suffix = cnt != null ? ` <span class="nav-count">${cnt}</span>` : '';
                return `
                <a href="#${r.path}" class="nav-item ${r.path === activePath ? 'active' : ''}">
                  ${icon(r.icon)} <span>${escapeHtml(r.title)}${suffix}</span>
                </a>`;
              }).join('')}
            `).join('')}
          </nav>
          <div class="sidebar-footer">
            <div class="user-card">
              <div class="user-avatar">${escapeHtml(initials)}</div>
              <div class="user-info">
                <div class="user-name">${escapeHtml(Auth.current.name)}</div>
                <div class="user-role">${escapeHtml(roleLabel)}</div>
              </div>
              <button class="btn-icon logout-btn" id="logout-btn" title="Déconnexion">${icon('logout')}</button>
            </div>
          </div>
        </aside>

        <div class="main">
          <div class="topbar">
            <button class="menu-toggle" id="menu-toggle" aria-label="Menu">${icon('menu')}</button>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="content" id="content">${content}</div>
        </div>
      </div>
    `;

    $('#logout-btn').addEventListener('click', () => {
      Auth.logout();
      location.hash = '#/';
      Router.render();
    });
    $('#menu-toggle').addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
      $('#sidebar-overlay').classList.toggle('show');
    });
    $('#sidebar-overlay').addEventListener('click', () => {
      $('#sidebar').classList.remove('open');
      $('#sidebar-overlay').classList.remove('show');
    });
    // Close sidebar after navigation on mobile
    $$('#sidebar .nav-item').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          $('#sidebar').classList.remove('open');
          $('#sidebar-overlay').classList.remove('show');
        }
      });
    });
  }
};

/* ============================================================
   LoginView
   ============================================================ */
const LoginView = {
  state: { tab: 'admin', error: null },

  render() {
    const root = $('#app');
    root.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <img src="assets/img/logo.png" onerror="this.onerror=null;this.src='assets/img/logo.svg'" alt="ARGOS OCEAN INDIEN">
          </div>
          <div class="login-title">Plateforme GMAO</div>
          <div class="login-tabs">
            <button class="login-tab ${this.state.tab==='admin'?'active':''}" data-tab="admin">Admin</button>
            <button class="login-tab ${this.state.tab==='tech'?'active':''}" data-tab="tech">Technicien</button>
            <button class="login-tab ${this.state.tab==='client'?'active':''}" data-tab="client">Client</button>
          </div>
          ${this.state.error ? `<div class="login-error">${escapeHtml(this.state.error)}</div>` : ''}
          <form class="login-form" id="login-form">
            <div class="form-group">
              <label>Identifiant</label>
              <input class="input" name="login" required autofocus>
            </div>
            <div class="form-group">
              <label>Mot de passe</label>
              <input class="input" type="password" name="password" required>
            </div>
            <button type="submit" class="btn btn-block btn-lg">Se connecter</button>
          </form>
        </div>
      </div>
    `;

    $$('.login-tab').forEach(b => b.addEventListener('click', () => {
      this.state.tab = b.dataset.tab;
      this.state.error = null;
      this.render();
    }));

    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const login = fd.get('login').trim();
      const password = fd.get('password');
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Connexion…'; }
      this.state.error = null;
      try {
        const session = this.state.tab === 'admin'
          ? await Auth.loginAdmin(login, password)
          : this.state.tab === 'tech'
            ? await Auth.loginTech(login, password)
            : await Auth.loginClient(login, password);
        if (!session) throw new Error('Identifiant ou mot de passe incorrect');
        // Charge les données depuis l'API maintenant que la session est ouverte
        await DB.init();
        location.hash = session.kind === 'admin' ? '#/admin' : session.kind === 'tech' ? '#/tech' : '#/client';
        Router.render();
      } catch (err) {
        this.state.error = (err && err.status === 401)
          ? 'Identifiant ou mot de passe incorrect'
          : (err?.message || 'Erreur de connexion au serveur');
        this.render();
      }
    });
  }
};

/* ============================================================
   Bootstrap — asynchrone : auth (restoration token) puis hydratation API
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await Auth.init();
    if (Auth.current) await DB.init();
  } catch (e) {
    console.warn('Bootstrap auth/db error', e);
  }
  Router.render();
  window.addEventListener('hashchange', () => Router.render());
});
