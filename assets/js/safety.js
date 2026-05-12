/* ============================================================
   Module Sécurité : presque-accidents + demandes de dérogation
   Vues partagées entre technicien (création) et admin (consultation/validation)
   ============================================================ */

const Safety = {

  /* ============================================================
     Helpers de comptage par statut (utilisés par nav et listes)
     ============================================================ */
  accidentCounts(scope) {
    let items = DB.list('accidents');
    if (scope === 'tech') items = items.filter(a => a.createdBy === Auth.current.id);
    return {
      total:    items.length,
      en_cours: items.filter(a => a.status !== 'traite').length,
      traite:   items.filter(a => a.status === 'traite').length,
    };
  },
  derogationCounts(scope) {
    let items = DB.list('derogations');
    if (scope === 'tech') items = items.filter(d => d.createdBy === Auth.current.id);
    return {
      total:    items.length,
      en_cours: items.filter(d => d.status !== 'valide').length,
      valide:   items.filter(d => d.status === 'valide').length,
    };
  },
  _statusPills(counts, validatedLabel) {
    return `
      <div class="btn-group" style="gap:8px;margin-bottom:14px">
        <span class="badge status-en_cours" style="padding:6px 12px;font-size:12px">
          ${icon('clock')} En cours : <strong style="margin-left:4px">${counts.en_cours}</strong>
        </span>
        <span class="badge status-resolu" style="padding:6px 12px;font-size:12px">
          ${icon('check')} ${escapeHtml(validatedLabel)} : <strong style="margin-left:4px">${counts.traite != null ? counts.traite : counts.valide}</strong>
        </span>
      </div>
    `;
  },

  /* ============================================================
     PRESQUE-ACCIDENTS
     ============================================================ */

  // Liste accessible côté tech (les siens) et côté admin (tous)
  accidentsList(scope) {
    setTimeout(() => this._wireAccidentsToolbar(scope), 0);
    const counts = this.accidentCounts(scope);
    return `
      ${this._statusPills(counts, 'Traité')}
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="acc-search" placeholder="Rechercher (n°, titre, site…)"></div>
          ${scope === 'tech' ? `<a class="btn" href="#/tech/accident/new">${icon('plus')} Nouvelle déclaration</a>` : ''}
        </div>
        <div class="card-body tight">
          <div id="acc-results">${this._accidentsTable(this._filteredAccidents(scope), scope)}</div>
        </div>
      </div>
    `;
  },
  _filteredAccidents(scope) {
    const q = ($('#acc-search')?.value || '').toLowerCase().trim();
    let items = DB.list('accidents');
    if (scope === 'tech') items = items.filter(a => a.createdBy === Auth.current.id);
    return items
      .filter(a => !q || (a.number+' '+a.title+' '+DB.siteName(a.siteId)).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  _accidentsTable(items, scope) {
    if (items.length === 0) return `<div class="empty">${icon('alert')}<div>Aucune déclaration</div></div>`;
    const base = scope === 'tech' ? '#/tech/accident/' : '#/admin/accident/';
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Site</th><th>Statut</th><th>Photos</th><th>Déclarée</th></tr></thead>
      <tbody>${items.map(a => `
        <tr onclick="location.hash='${base}${a.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${a.number}</span></td>
          <td data-label="Titre">${escapeHtml(a.title)}</td>
          <td data-label="Site">${escapeHtml(DB.clientName(a.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(a.siteId))}</small></td>
          <td data-label="Statut"><span class="badge ${a.status==='traite'?'status-resolu':'status-en_cours'}">${a.status==='traite'?'Traité':'En cours'}</span></td>
          <td data-label="Photos">${(a.photos || []).length}</td>
          <td data-label="Déclarée">${fmtRelative(a.createdAt)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },
  _wireAccidentsToolbar(scope) {
    const refresh = () => { $('#acc-results').innerHTML = this._accidentsTable(this._filteredAccidents(scope), scope); };
    $('#acc-search')?.addEventListener('input', refresh);
  },

  // Formulaire création (technicien uniquement)
  accidentForm() {
    const clients = DB.list('clients');
    const photos = []; // local buffer

    setTimeout(() => {
      const cliSel  = $('#acc-form [name="clientId"]');
      const siteSel = $('#acc-form [name="siteId"]');
      const refreshSites = () => {
        const cid = cliSel.value;
        const sites = DB.list('sites').filter(s => s.clientId === cid);
        siteSel.innerHTML = sites.length === 0
          ? '<option value="">— Aucun site —</option>'
          : ['<option value="">— Sélectionner —</option>', ...sites.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)].join('');
      };
      cliSel.addEventListener('change', refreshSites);
      refreshSites();

      // Photos
      setupPhotoUpload($('#acc-photos'), photos);

      $('#acc-submit').addEventListener('click', async () => {
        const data = Object.fromEntries(new FormData($('#acc-form')));
        if (!data.clientId || !data.siteId || !data.title || !data.description || !data.riskNature) {
          toast('Champs obligatoires manquants', 'error'); return;
        }
        const btn = $('#acc-submit'); if (btn) btn.disabled = true;
        try {
          // Upload des photos (data URLs) → S3/disk via /api/uploads
          const uploaded = [];
          for (const dataUrl of photos) {
            try { uploaded.push({ url: (await api.uploads.dataUrl(dataUrl, 'accident')).url }); }
            catch (e) { console.warn('upload photo accident KO', e?.message); }
          }
          const a = await DB.createAccident({
            clientId: data.clientId,
            siteId: data.siteId,
            title: data.title,
            description: data.description,
            riskNature: data.riskNature,
            recommendations: data.recommendations || '',
            photos: uploaded,
            createdBy: Auth.current.id,
            createdByName: Auth.current.name,
          });
          toast(`Déclaration ${a.number} enregistrée`);
          location.hash = `#/tech/accident/${a.id}`;
        } catch (_) { if (btn) btn.disabled = false; }
      });
    }, 0);

    return `
      <div class="card" style="max-width:880px">
        <div class="card-header"><h2>${icon('alert')} Nouvelle déclaration de presque-accident</h2></div>
        <div class="card-body">
          <p class="muted">Déclarez un événement à risque (sans dommage) survenu lors d'une intervention. Vos retours alimentent la prévention.</p>
          <form id="acc-form">
            <div class="form-row">
              <div class="form-group"><label>Client *</label>
                <select class="select" name="clientId" required>
                  <option value="">— Sélectionner —</option>
                  ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Site *</label>
                <select class="select" name="siteId" required></select>
              </div>
            </div>
            <div class="form-group"><label>Titre / objet *</label>
              <input class="input" name="title" required placeholder="Ex : Chute d'outil depuis échelle">
            </div>
            <div class="form-group"><label>Description de la situation *</label>
              <textarea class="textarea" name="description" rows="4" required placeholder="Que s'est-il passé ? Qui était présent ? Quelles conséquences potentielles ?"></textarea>
            </div>
            <div class="form-group"><label>Nature du risque *</label>
              <textarea class="textarea" name="riskNature" rows="3" required placeholder="Ex : risque de chute d'objet sur personne au sol"></textarea>
            </div>
            <div class="form-group"><label>Préconisations du technicien</label>
              <textarea class="textarea" name="recommendations" rows="3" placeholder="Mesures à mettre en place pour éviter la récurrence"></textarea>
            </div>
            <div class="form-group">
              <label>Photos</label>
              <div id="acc-photos"></div>
            </div>
          </form>
          <div class="btn-group mt-2">
            <button class="btn" id="acc-submit">${icon('check')} Envoyer la déclaration</button>
            <a class="btn btn-secondary" href="#/tech/accidents">Annuler</a>
          </div>
        </div>
      </div>
    `;
  },

  // Détail (tech + admin)
  accidentDetail(id, scope) {
    const a = DB.get('accidents', id);
    if (!a) return `<div class="card"><div class="card-body"><p>Déclaration introuvable.</p></div></div>`;
    if (scope === 'tech' && a.createdBy !== Auth.current.id) {
      return `<div class="card"><div class="card-body"><p>Accès refusé.</p></div></div>`;
    }
    const back = scope === 'tech' ? '#/tech/accidents' : '#/admin/accidents';
    const canAdminEdit = scope === 'admin' && Auth.can('accidents', 'write');
    setTimeout(() => this._wireAccidentDetail(id, scope, canAdminEdit), 0);

    return `
      <div class="flex mb-2">
        <a href="${back}" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">${escapeHtml(a.number)} — ${escapeHtml(a.title)}</h1>
        <span class="badge ${a.status==='traite'?'status-resolu':'status-en_cours'}">${a.status==='traite'?'Traité':'En cours'}</span>
      </div>

      <div class="card mb-2">
        <div class="card-body">
          <div class="detail-meta">
            <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${escapeHtml(DB.clientName(a.clientId))}</div></div>
            <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(a.siteId))}</div></div>
            <div class="meta-item"><div class="meta-label">Déclaré par</div><div class="meta-value">${escapeHtml(a.createdByName || '—')}</div></div>
            <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${fmtDateTime(a.createdAt)}</div></div>
          </div>
          <h3>Description</h3><p style="white-space:pre-wrap">${escapeHtml(a.description)}</p>
          <h3>Nature du risque</h3><p style="white-space:pre-wrap">${escapeHtml(a.riskNature)}</p>
          <h3>Préconisations du technicien</h3>
          <p style="white-space:pre-wrap">${escapeHtml(a.recommendations || '— Aucune —')}</p>
        </div>
      </div>

      <div class="card mb-2">
        <div class="card-header"><h2>${icon('alert')} Suivi QSE</h2></div>
        <div class="card-body">
          <h3 style="margin-bottom:6px">Préconisations QSE</h3>
          ${canAdminEdit ? `
            <textarea id="acc-qse-reco" class="textarea" rows="4" placeholder="Préconisations du service QSE après analyse">${escapeHtml(a.qseRecommendations || '')}</textarea>
          ` : `
            <p style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:6px;border-left:3px solid var(--brand)">${escapeHtml(a.qseRecommendations || '— Pas encore renseignées par le service QSE —')}</p>
          `}

          <h3 style="margin-top:14px;margin-bottom:6px">Statut</h3>
          ${canAdminEdit ? `
            <div class="form-row">
              <div class="form-group">
                <select class="select" id="acc-status">
                  <option value="en_cours" ${a.status==='en_cours'?'selected':''}>En cours</option>
                  <option value="traite"   ${a.status==='traite'?'selected':''}>Traité</option>
                </select>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end">
                <button class="btn" id="acc-save-qse">${icon('check')} Enregistrer (QSE)</button>
              </div>
            </div>
          ` : `
            <span class="badge ${a.status==='traite'?'status-resolu':'status-en_cours'}">${a.status==='traite'?'Traité':'En cours'}</span>
          `}
        </div>
      </div>

      ${a.photos && a.photos.length ? `
        <div class="card">
          <div class="card-header"><h2>Photos (${a.photos.length})</h2></div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${a.photos.map((p,i) => `<a href="${p}" target="_blank"><img src="${p}" alt="Photo ${i+1}" style="width:140px;height:140px;object-fit:cover;border:1px solid var(--border);border-radius:6px"></a>`).join('')}
            </div>
          </div>
        </div>` : ''}
    `;
  },
  _wireAccidentDetail(id, scope, canAdminEdit) {
    if (!canAdminEdit) return;
    $('#acc-save-qse')?.addEventListener('click', () => {
      DB.update('accidents', id, {
        qseRecommendations: $('#acc-qse-reco').value,
        status: $('#acc-status').value,
      });
      toast('Suivi QSE enregistré');
      Router.render();
    });
  },

  /* ============================================================
     DEROGATIONS
     ============================================================ */

  derogationsList(scope) {
    setTimeout(() => this._wireDerogationsToolbar(scope), 0);
    const counts = this.derogationCounts(scope);
    return `
      ${this._statusPills(counts, 'Validé')}
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="der-search" placeholder="Rechercher (n°, titre, site…)"></div>
          <select class="select" id="der-status">
            <option value="">Tous statuts</option>
            <option value="en_cours">En cours</option>
            <option value="valide">Validé</option>
          </select>
          ${scope === 'tech' ? `<a class="btn" href="#/tech/derogation/new">${icon('plus')} Nouvelle dérogation</a>` : ''}
        </div>
        <div class="card-body tight">
          <div id="der-results">${this._derogationsTable(this._filteredDerogations(scope), scope)}</div>
        </div>
      </div>
    `;
  },
  _filteredDerogations(scope) {
    const q = ($('#der-search')?.value || '').toLowerCase().trim();
    const st = $('#der-status')?.value || '';
    let items = DB.list('derogations');
    if (scope === 'tech') items = items.filter(d => d.createdBy === Auth.current.id);
    return items
      .filter(d => !st || d.status === st)
      .filter(d => !q || (d.number+' '+d.title+' '+DB.siteName(d.siteId)).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  _derogationsTable(items, scope) {
    if (items.length === 0) return `<div class="empty">${icon('alert')}<div>Aucune demande</div></div>`;
    const base = scope === 'tech' ? '#/tech/derogation/' : '#/admin/derogation/';
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Site</th><th>Période</th><th>Statut</th><th>Demandée</th></tr></thead>
      <tbody>${items.map(d => `
        <tr onclick="location.hash='${base}${d.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${d.number}</span></td>
          <td data-label="Titre">${escapeHtml(d.title)}</td>
          <td data-label="Site">${escapeHtml(DB.clientName(d.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(d.siteId))}</small></td>
          <td data-label="Période">${d.dateStart ? fmtDate(d.dateStart) : '—'} → ${d.dateEnd ? fmtDate(d.dateEnd) : '—'}</td>
          <td data-label="Statut"><span class="badge ${d.status==='valide'?'status-resolu':'status-en_cours'}">${d.status==='valide'?'Validé':'En cours'}</span></td>
          <td data-label="Demandée">${fmtRelative(d.createdAt)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },
  _wireDerogationsToolbar(scope) {
    const refresh = () => { $('#der-results').innerHTML = this._derogationsTable(this._filteredDerogations(scope), scope); };
    ['#der-search', '#der-status'].forEach(s => $(s)?.addEventListener('input', refresh));
  },

  // Formulaire création (tech)
  derogationForm() {
    const clients = DB.list('clients');
    const photos = [];
    setTimeout(() => {
      const cliSel  = $('#der-form [name="clientId"]');
      const siteSel = $('#der-form [name="siteId"]');
      const refreshSites = () => {
        const cid = cliSel.value;
        const sites = DB.list('sites').filter(s => s.clientId === cid);
        siteSel.innerHTML = sites.length === 0
          ? '<option value="">— Aucun site —</option>'
          : ['<option value="">— Sélectionner —</option>', ...sites.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)].join('');
      };
      cliSel.addEventListener('change', refreshSites);
      refreshSites();

      setupPhotoUpload($('#der-photos'), photos);

      $('#der-submit').addEventListener('click', async () => {
        const data = Object.fromEntries(new FormData($('#der-form')));
        if (!data.clientId || !data.siteId || !data.title || !data.description || !data.dateStart || !data.dateEnd || !data.riskAnalysis) {
          toast('Champs obligatoires manquants', 'error'); return;
        }
        const btn = $('#der-submit'); if (btn) btn.disabled = true;
        try {
          const uploaded = [];
          for (const dataUrl of photos) {
            try { uploaded.push({ url: (await api.uploads.dataUrl(dataUrl, 'derogation')).url }); }
            catch (e) { console.warn('upload photo derogation KO', e?.message); }
          }
          const d = await DB.createDerogation({
            clientId: data.clientId,
            siteId: data.siteId,
            title: data.title,
            description: data.description,
            dateStart: new Date(data.dateStart).toISOString(),
            dateEnd: new Date(data.dateEnd).toISOString(),
            riskAnalysis: data.riskAnalysis,
            techRecommendations: data.techRecommendations || '',
            photos: uploaded,
            createdBy: Auth.current.id,
            createdByName: Auth.current.name,
          });
          toast(`Demande ${d.number} créée`);
          location.hash = `#/tech/derogation/${d.id}`;
        } catch (_) { if (btn) btn.disabled = false; }
      });
    }, 0);

    return `
      <div class="card" style="max-width:880px">
        <div class="card-header"><h2>${icon('alert')} Nouvelle demande de dérogation</h2></div>
        <div class="card-body">
          <p class="muted">Demande d'autorisation exceptionnelle pour intervenir hors procédure standard. Soumise à validation par un responsable.</p>
          <form id="der-form">
            <div class="form-row">
              <div class="form-group"><label>Client *</label>
                <select class="select" name="clientId" required>
                  <option value="">— Sélectionner —</option>
                  ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Site *</label>
                <select class="select" name="siteId" required></select>
              </div>
            </div>
            <div class="form-group"><label>Titre / objet *</label>
              <input class="input" name="title" required placeholder="Ex : Intervention sous tension réseau client">
            </div>
            <div class="form-group"><label>Description de l'intervention *</label>
              <textarea class="textarea" name="description" rows="4" required></textarea>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Date de besoin (du) *</label>
                <input class="input" type="date" name="dateStart" required>
              </div>
              <div class="form-group"><label>au *</label>
                <input class="input" type="date" name="dateEnd" required>
              </div>
            </div>
            <div class="form-group"><label>Analyse du risque *</label>
              <textarea class="textarea" name="riskAnalysis" rows="4" required placeholder="Identification et évaluation des dangers"></textarea>
            </div>
            <div class="form-group"><label>Préconisations du technicien</label>
              <textarea class="textarea" name="techRecommendations" rows="4" placeholder="Vos propositions de mesures à mettre en œuvre"></textarea>
            </div>
            <div class="form-group">
              <p class="muted" style="background:var(--brand-lighter);padding:10px;border-radius:6px;border-left:3px solid var(--brand);font-size:13px;margin:0">
                Les <strong>mesures de prévention QSE</strong> seront complétées par le service QSE après analyse de votre demande.
              </p>
            </div>
            <div class="form-group">
              <label>Photos</label>
              <div id="der-photos"></div>
            </div>
          </form>
          <div class="btn-group mt-2">
            <button class="btn" id="der-submit">${icon('check')} Envoyer la demande</button>
            <a class="btn btn-secondary" href="#/tech/derogations">Annuler</a>
          </div>
        </div>
      </div>
    `;
  },

  // Détail dérogation (tech : signe sa demande / admin : valide et signe)
  derogationDetail(id, scope) {
    const d = DB.get('derogations', id);
    if (!d) return `<div class="card"><div class="card-body"><p>Demande introuvable.</p></div></div>`;
    if (scope === 'tech' && d.createdBy !== Auth.current.id) {
      return `<div class="card"><div class="card-body"><p>Accès refusé.</p></div></div>`;
    }
    setTimeout(() => this._wireDerogationDetail(id, scope), 0);
    const back = scope === 'tech' ? '#/tech/derogations' : '#/admin/derogations';
    const canValidate = scope === 'admin' && Auth.can('derogations', 'write');

    return `
      <div class="flex mb-2">
        <a href="${back}" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">${escapeHtml(d.number)} — ${escapeHtml(d.title)}</h1>
        <span class="badge ${d.status==='valide'?'status-resolu':'status-en_cours'}">${d.status==='valide'?'Validé':'En cours'}</span>
      </div>

      <div class="card mb-2">
        <div class="card-body">
          <div class="detail-meta">
            <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${escapeHtml(DB.clientName(d.clientId))}</div></div>
            <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(d.siteId))}</div></div>
            <div class="meta-item"><div class="meta-label">Demandée par</div><div class="meta-value">${escapeHtml(d.createdByName || '—')}</div></div>
            <div class="meta-item"><div class="meta-label">Date demande</div><div class="meta-value">${fmtDateTime(d.createdAt)}</div></div>
            <div class="meta-item"><div class="meta-label">Période demandée</div><div class="meta-value">${fmtDate(d.dateStart)} → ${fmtDate(d.dateEnd)}</div></div>
          </div>
          <h3>Description</h3><p style="white-space:pre-wrap">${escapeHtml(d.description)}</p>
          <h3>Analyse du risque</h3><p style="white-space:pre-wrap">${escapeHtml(d.riskAnalysis)}</p>

          <h3>Préconisations du technicien</h3>
          ${scope === 'tech' && d.createdBy === Auth.current.id ? `
            <textarea id="der-tech-reco" class="textarea" rows="4" placeholder="Vos propositions complémentaires">${escapeHtml(d.techRecommendations || '')}</textarea>
            <button class="btn btn-sm mt-1" id="der-save-tech-reco">${icon('check')} Enregistrer mes préconisations</button>
          ` : `
            <p style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:6px;border-left:3px solid var(--warning)">${escapeHtml(d.techRecommendations || '— Aucune préconisation du technicien —')}</p>
          `}
        </div>
      </div>

      <div class="card mb-2">
        <div class="card-header"><h2>${icon('alert')} Mesures de prévention QSE</h2></div>
        <div class="card-body">
          ${canValidate ? `
            <textarea id="der-qse-measures" class="textarea" rows="5" placeholder="Mesures de prévention définies par le service QSE">${escapeHtml(d.preventiveMeasures || '')}</textarea>
            <button class="btn mt-2" id="der-save-qse">${icon('check')} Enregistrer (QSE)</button>
          ` : `
            <p style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:6px;border-left:3px solid var(--brand)">${escapeHtml(d.preventiveMeasures || '— Pas encore renseignées par le service QSE —')}</p>
          `}
        </div>
      </div>

      ${d.photos && d.photos.length ? `
        <div class="card mb-2">
          <div class="card-header"><h2>Photos (${d.photos.length})</h2></div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${d.photos.map((p,i) => `<a href="${p}" target="_blank"><img src="${p}" alt="Photo ${i+1}" style="width:140px;height:140px;object-fit:cover;border:1px solid var(--border);border-radius:6px"></a>`).join('')}
            </div>
          </div>
        </div>` : ''}

      <div class="card mb-2">
        <div class="card-header"><h2>${icon('edit')} Signatures</h2></div>
        <div class="card-body">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <h3 style="margin-bottom:6px">Signature technicien</h3>
              ${d.techSignature ? `
                <img src="${d.techSignature}" alt="Signature technicien" style="max-width:100%;border:1px solid var(--border);border-radius:6px;background:#fff">
                <p class="muted" style="margin:4px 0 0;font-size:12px">Le ${fmtDateTime(d.techSignatureDate)}</p>
              ` : `<p class="muted">Aucune signature.</p>`}
              ${scope === 'tech' && d.createdBy === Auth.current.id ? `<button class="btn btn-secondary btn-sm mt-1" id="der-sign-tech">${icon('edit')} ${d.techSignature?'Resigner':'Signer la demande'}</button>` : ''}
            </div>
            <div style="flex:1;min-width:240px">
              <h3 style="margin-bottom:6px">Signature responsable</h3>
              ${d.respSignature ? `
                <img src="${d.respSignature}" alt="Signature responsable" style="max-width:100%;border:1px solid var(--border);border-radius:6px;background:#fff">
                <p class="muted" style="margin:4px 0 0;font-size:12px">Le ${fmtDateTime(d.respSignatureDate)}</p>
              ` : `<p class="muted">En attente de validation.</p>`}
              ${canValidate ? `<button class="btn btn-secondary btn-sm mt-1" id="der-sign-resp">${icon('edit')} ${d.respSignature?'Resigner':'Signer (valider)'}</button>` : ''}
            </div>
          </div>
        </div>
      </div>


      ${canValidate ? `
      <div class="card">
        <div class="card-header"><h2>Statut</h2></div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label>Changer le statut</label>
              <select class="select" id="der-status-edit">
                <option value="en_cours" ${d.status==='en_cours'?'selected':''}>En cours</option>
                <option value="valide"   ${d.status==='valide'?'selected':''}>Validé</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end">
              <button class="btn" id="der-status-save">${icon('check')} Enregistrer</button>
            </div>
          </div>
        </div>
      </div>` : ''}
    `;
  },
  _wireDerogationDetail(id, scope) {
    $('#der-sign-tech')?.addEventListener('click', () => this._openDerogSignModal(id, 'tech'));
    $('#der-sign-resp')?.addEventListener('click', () => this._openDerogSignModal(id, 'resp'));
    $('#der-status-save')?.addEventListener('click', () => {
      DB.update('derogations', id, { status: $('#der-status-edit').value });
      toast('Statut mis à jour');
      Router.render();
    });
    $('#der-save-qse')?.addEventListener('click', () => {
      DB.update('derogations', id, { preventiveMeasures: $('#der-qse-measures').value });
      toast('Mesures de prévention QSE enregistrées');
      Router.render();
    });
    $('#der-save-tech-reco')?.addEventListener('click', () => {
      DB.update('derogations', id, { techRecommendations: $('#der-tech-reco').value });
      toast('Préconisations du technicien enregistrées');
      Router.render();
    });
  },
  _openDerogSignModal(id, kind) {
    const titleLabel = kind === 'resp' ? 'Signature responsable' : 'Signature technicien';
    openModal({
      title: titleLabel,
      body: `
        <p class="muted">Apposez votre signature dans le cadre ci-dessous.</p>
        <canvas id="der-sig-canvas" style="width:100%;height:200px;border:2px dashed var(--border-strong);border-radius:8px;background:#fff;cursor:crosshair;display:block"></canvas>
        <div class="btn-group mt-2">
          <button class="btn btn-secondary btn-sm" id="der-sig-clear">${icon('refresh')} Effacer</button>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn" id="der-sig-save">${icon('check')} Valider</button>
      `,
      onOpen(modal) {
        const canvas = modal.querySelector('#der-sig-canvas');
        setTimeout(() => {
          const pad = attachSignaturePad(canvas);
          modal.querySelector('#der-sig-clear').onclick = () => pad.clear();
          modal.parentElement.querySelector('#der-sig-save').onclick = () => {
            if (pad.isEmpty()) { toast('Veuillez signer avant de valider', 'error'); return; }
            DB.setDerogationSignature(id, kind, pad.toDataURL());
            toast('Signature enregistrée');
            closeModal();
            Router.render();
          };
        }, 50);
      }
    });
  },
};
