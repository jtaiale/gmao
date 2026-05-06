/* ============================================================
   Client HTTP du backend GMAO ARGOS
   - Stocke le JWT en localStorage
   - Auto-refresh sur 401
   - Expose `api.*` similaire à `DB.*` mais en async
   - Compatibilité prototype : peut coexister avec db.js,
     l'application bascule sur l'API si window.GMAO_USE_API = true
   ============================================================ */

const API = (() => {

  const TOKEN_KEY   = 'gmao_token';
  const REFRESH_KEY = 'gmao_refresh';
  const USER_KEY    = 'gmao_api_user';

  // Base URL : par défaut même origine. Override via window.GMAO_API_BASE.
  const BASE = (typeof window !== 'undefined' && window.GMAO_API_BASE) || '/api';

  // ---------------- Token store ----------------
  const Token = {
    get()        { return localStorage.getItem(TOKEN_KEY); },
    getRefresh() { return localStorage.getItem(REFRESH_KEY); },
    set(t, r)    {
      if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
      if (r !== undefined) {
        if (r) localStorage.setItem(REFRESH_KEY, r); else localStorage.removeItem(REFRESH_KEY);
      }
    },
    setUser(u)   {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
      else   localStorage.removeItem(USER_KEY);
    },
    getUser()    {
      try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; }
      catch { return null; }
    },
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    },
  };

  // ---------------- Erreurs typées ----------------
  class ApiError extends Error {
    constructor(status, code, message, payload) {
      super(message || code || `HTTP ${status}`);
      this.status = status; this.code = code; this.payload = payload;
    }
  }

  // ---------------- Refresh handling ----------------
  let refreshPromise = null;
  async function refreshToken() {
    if (refreshPromise) return refreshPromise;
    const refresh = Token.getRefresh();
    if (!refresh) throw new ApiError(401, 'no_refresh', 'Session expirée');
    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    }).then(async r => {
      if (!r.ok) throw new ApiError(r.status, 'refresh_failed', 'Renouvellement de session échoué');
      const j = await r.json();
      Token.set(j.token);
      return j.token;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  // ---------------- Cœur fetch ----------------
  async function request(method, path, { body, query, asBlob, headers, retried } = {}) {
    let url = path.startsWith('http') ? path : `${BASE}${path}`;
    if (query) {
      const qs = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    const init = {
      method,
      headers: {
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body == null ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
    };
    const tok = Token.get();
    if (tok) init.headers['Authorization'] = `Bearer ${tok}`;

    const res = await fetch(url, init);
    if (res.status === 401 && !retried && Token.getRefresh()) {
      try { await refreshToken(); return request(method, path, { body, query, asBlob, headers, retried: true }); }
      catch { Token.clear(); throw new ApiError(401, 'session_expired', 'Session expirée'); }
    }
    if (asBlob) {
      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        throw new ApiError(res.status, 'blob_error', txt || res.statusText);
      }
      return res.blob();
    }
    let payload = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) payload = await res.json().catch(()=>null);
    else if (res.status !== 204) payload = await res.text().catch(()=>null);
    if (!res.ok) {
      const code = (payload && payload.error)   || 'http_error';
      const msg  = (payload && payload.message) || res.statusText;
      throw new ApiError(res.status, code, msg, payload);
    }
    return payload;
  }

  const get   = (p, opts) => request('GET',    p, opts);
  const post  = (p, body, opts) => request('POST',  p, { body, ...opts });
  const patch = (p, body, opts) => request('PATCH', p, { body, ...opts });
  const del   = (p, opts) => request('DELETE', p, opts);

  // ---------------- Modules ----------------

  const auth = {
    async login(login, password, kind) {
      const r = await post('/auth/login', { login, password, kind });
      Token.set(r.token, r.refreshToken);
      Token.setUser(r.user);
      return r.user;
    },
    async me() {
      const r = await get('/auth/me');
      Token.setUser(r.user);
      return r.user;
    },
    async logout() {
      try { await post('/auth/logout'); } catch {}
      Token.clear();
    },
    isLogged()   { return !!Token.get(); },
    currentUser(){ return Token.getUser(); },
  };

  function buildResource(prefix) {
    return {
      list:   (query) => get(prefix, { query }),
      get:    (id) => get(`${prefix}/${id}`),
      create: (data) => post(prefix, data),
      update: (id, data) => patch(`${prefix}/${id}`, data),
      delete: (id) => del(`${prefix}/${id}`),
    };
  }

  const tickets = {
    ...buildResource('/tickets'),
    addComment: (id, text) => post(`/tickets/${id}/comments`, { text }),
    setSignature: (id, kind, dataUrl, signerName) =>
      post(`/tickets/${id}/signature`, { kind, dataUrl, signerName }),
    pdf: (id) => request('GET', `/tickets/${id}/pdf`, { asBlob: true }),
  };

  const clients     = buildResource('/clients');
  const sites       = buildResource('/sites');
  const products    = buildResource('/products');
  const technicians = buildResource('/technicians');
  const admins      = {
    ...buildResource('/admins'),
    permissionMenus: () => get('/admins/permissions/menus'),
  };

  const chantiers = {
    ...buildResource('/chantiers'),
    addComment: (id, text) => post(`/chantiers/${id}/comments`, { text }),
  };

  const accidents = {
    ...buildResource('/accidents'),
  };

  const derogations = {
    ...buildResource('/derogations'),
    setTechReco: (id, techRecommendations) => patch(`/derogations/${id}/tech-reco`, { techRecommendations }),
    sign: (id, kind, dataUrl) => post(`/derogations/${id}/signature`, { kind, dataUrl }),
  };

  const bulletins = {
    ...buildResource('/bulletins'),
    markRead: (id) => post(`/bulletins/${id}/read`),
    addComment: (id, text) => post(`/bulletins/${id}/comments`, { text }),
  };

  const stats = {
    tickets: (filters) => get('/stats/tickets', { query: filters }),
  };

  const exportsCsv = {
    tickets: (filters) => request('GET', `/exports/tickets.csv${qs(filters)}`, { asBlob: true }),
    hours:   (filters) => request('GET', `/exports/hours.csv${qs(filters)}`,   { asBlob: true }),
    clients: (filters) => request('GET', `/exports/clients.csv${qs(filters)}`, { asBlob: true }),
    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'export.csv';
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    },
  };
  function qs(filters) {
    if (!filters) return '';
    const u = new URLSearchParams();
    Object.entries(filters).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') u.set(k, String(v)); });
    const s = u.toString();
    return s ? `?${s}` : '';
  }

  // ---------------- Uploads ----------------
  const uploads = {
    /**
     * Upload un fichier (Blob / File) et retourne { url, filename, size, mimeType }
     * Le serveur stocke en disque local par défaut, S3 si configuré.
     */
    async file(file, kind) {
      const fd = new FormData();
      fd.append('file', file, file.name || 'upload');
      if (kind) fd.append('kind', kind);
      return post('/uploads', fd);
    },
    /**
     * Upload un data URL (signature, photo prise depuis un canvas) en le
     * convertissant côté navigateur en Blob avant POST multipart.
     */
    async dataUrl(dataUrl, kind, filename) {
      const blob = await (await fetch(dataUrl)).blob();
      const f = new File([blob], filename || `upload-${Date.now()}.png`, { type: blob.type || 'image/png' });
      return this.file(f, kind);
    },
  };

  // ---------------- Public API ----------------
  return {
    base: BASE,
    Token,
    ApiError,
    auth,
    tickets,
    clients,
    sites,
    products,
    technicians,
    admins,
    chantiers,
    accidents,
    derogations,
    bulletins,
    stats,
    exports: exportsCsv,
    uploads,
  };
})();

// Expose en global pour usage console / intégration progressive
if (typeof window !== 'undefined') window.api = API;
