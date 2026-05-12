/* ============================================================
   Vues du portail client
   ============================================================ */
const ClientViews = {

  _myTickets() {
    const cid = Auth.current.clientId;
    return DB.list('tickets').filter(t => t.clientId === cid);
  },

  /* =========================== DASHBOARD =========================== */
  dashboard() {
    const tickets = this._myTickets();
    const open = tickets.filter(t => !['resolu','cloture'].includes(t.status));
    const recent = [...tickets].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);

    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-icon">${icon('inbox')}</div><div><div class="kpi-value">${tickets.length}</div><div class="kpi-label">Mes demandes</div></div></div>
        <div class="kpi"><div class="kpi-icon warning">${icon('clock')}</div><div><div class="kpi-value">${open.length}</div><div class="kpi-label">En cours de traitement</div></div></div>
        <div class="kpi"><div class="kpi-icon success">${icon('check')}</div><div><div class="kpi-value">${tickets.length - open.length}</div><div class="kpi-label">Résolues / clôturées</div></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Mes dernières demandes</h2>
          <a class="btn" href="#/client/new">${icon('plus')} Nouvelle demande</a>
        </div>
        <div class="card-body tight">
          ${recent.length === 0 ?
            `<div class="empty">${icon('inbox')}<div>Vous n'avez pas encore de demande.</div><a class="btn mt-2" href="#/client/new">Créer ma première demande</a></div>` :
            `<table class="data-table">
              <thead><tr><th>N°</th><th>Titre</th><th>Site</th><th>Priorité</th><th>Statut</th><th>Créée</th></tr></thead>
              <tbody>${recent.map(t => `
                <tr onclick="location.hash='#/client/ticket/${t.id}'" style="cursor:pointer">
                  <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
                  <td data-label="Titre">${escapeHtml(t.title)}</td>
                  <td data-label="Site">${escapeHtml(DB.siteName(t.siteId))}</td>
                  <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
                  <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
                  <td data-label="Créée">${fmtRelative(t.createdAt)}</td>
                </tr>`).join('')}</tbody>
             </table>`}
        </div>
      </div>
    `;
  },

  /* =========================== NEW TICKET =========================== */
  newTicket() {
    const cid = Auth.current.clientId;
    const sites = DB.list('sites').filter(s => s.clientId === cid);

    setTimeout(() => {
      const siteSel = $('#new-ticket-form [name="siteId"]');
      const prodSel = $('#new-ticket-form [name="productId"]');
      const refreshProducts = () => {
        const sid = siteSel?.value;
        const prods = DB.list('products').filter(p => p.clientId === cid && (!sid || p.siteId === sid));
        if (prodSel) {
          prodSel.innerHTML = ['<option value="">— Aucun —</option>',
            ...prods.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
          ].join('');
        }
      };
      siteSel?.addEventListener('change', refreshProducts);
      refreshProducts();

      $('#new-ticket-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        if (!data.siteId || !data.title || !data.description) {
          toast('Veuillez remplir tous les champs obligatoires', 'error'); return;
        }
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          const t = await DB.createTicket({
            clientId: Auth.current.clientId || Auth.current.id,
            siteId: data.siteId,
            productId: data.productId || null,
            priority: data.priority,
            title: data.title,
            description: data.description,
            createdBy: Auth.current.id,
          });
          toast(`Demande ${t.number} créée`);
          location.hash = `#/client/ticket/${t.id}`;
        } catch (_) {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }, 0);

    if (sites.length === 0) {
      return `
        <div class="card"><div class="card-body">
          <h2>Aucun site enregistré</h2>
          <p class="muted">Aucun site d'intervention n'a été enregistré pour votre compte. Veuillez contacter ARGOS OCEAN INDIEN pour configurer vos sites.</p>
          <a class="btn" href="#/client">Retour</a>
        </div></div>`;
    }

    return `
      <div class="card" style="max-width:780px">
        <div class="card-header"><h2>${icon('plus')} Nouvelle demande d'intervention</h2></div>
        <div class="card-body">
          <form id="new-ticket-form">
            <div class="form-row">
              <div class="form-group">
                <label>Site concerné *</label>
                <select class="select" name="siteId" required>
                  <option value="">— Sélectionner —</option>
                  ${sites.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Priorité *</label>
                <select class="select" name="priority" required>
                  ${PRIORITIES.map(p => `<option value="${p.id}" ${p.id==='normale'?'selected':''}>${p.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Équipement concerné (optionnel)</label>
              <select class="select" name="productId">
                <option value="">— Aucun —</option>
              </select>
            </div>
            <div class="form-group">
              <label>Objet de la demande *</label>
              <input class="input" name="title" required placeholder="Ex : Climatisation salle de réunion ne fonctionne plus">
            </div>
            <div class="form-group">
              <label>Description détaillée *</label>
              <textarea class="textarea" name="description" rows="6" required placeholder="Décrivez le problème, la localisation précise, depuis quand…"></textarea>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn">${icon('check')} Envoyer la demande</button>
              <a class="btn btn-secondary" href="#/client">Annuler</a>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  /* =========================== MY TICKETS =========================== */
  tickets() {
    setTimeout(() => this._wireToolbar(), 0);
    return `
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="ct-search" placeholder="Rechercher (n°, titre…)"></div>
          <div class="filters">
            <select class="select" id="ct-status">
              <option value="">Tous statuts</option>
              ${STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
            </select>
          </div>
          <a class="btn" href="#/client/new">${icon('plus')} Nouvelle demande</a>
        </div>
        <div class="card-body tight">
          <div id="ct-results">${this._table(this._filtered())}</div>
        </div>
      </div>
    `;
  },
  _filtered() {
    const q = ($('#ct-search')?.value || '').toLowerCase().trim();
    const st = $('#ct-status')?.value || '';
    return this._myTickets()
      .filter(t => !st || t.status === st)
      .filter(t => !q || (t.number+' '+t.title+' '+DB.siteName(t.siteId)).toLowerCase().includes(q))
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  },
  _wireToolbar() {
    const refresh = () => { $('#ct-results').innerHTML = this._table(this._filtered()); };
    ['#ct-search', '#ct-status'].forEach(s => $(s)?.addEventListener('input', refresh));
  },
  _table(tickets) {
    if (tickets.length === 0) return `<div class="empty">${icon('inbox')}<div>Aucune demande</div></div>`;
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Site</th><th>Priorité</th><th>Statut</th><th>Créée</th><th>Planifiée</th></tr></thead>
      <tbody>${tickets.map(t => `
        <tr onclick="location.hash='#/client/ticket/${t.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
          <td data-label="Titre">${escapeHtml(t.title)}</td>
          <td data-label="Site">${escapeHtml(DB.siteName(t.siteId))}</td>
          <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
          <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
          <td data-label="Créée">${fmtDate(t.createdAt)}</td>
          <td data-label="Planifiée">${t.scheduledAt ? fmtDate(t.scheduledAt) : '—'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },

  /* =========================== TICKET DETAIL =========================== */
  ticketDetail(id) {
    const t = DB.get('tickets', id);
    if (!t || t.clientId !== Auth.current.clientId) {
      return `<div class="card"><div class="card-body"><p>Demande introuvable.</p><a class="btn" href="#/client/tickets">Retour</a></div></div>`;
    }
    setTimeout(() => {
      $('#client-comment')?.addEventListener('click', () => {
        const text = $('#new-comment').value.trim();
        if (!text) return;
        DB.addComment(id, { author: Auth.current.name, role: 'client', text });
        toast('Commentaire ajouté');
        Router.render();
      });
    }, 0);

    return `
      <div class="flex mb-2">
        <a href="#/client/tickets" class="btn btn-ghost btn-sm">${icon('back')} Mes demandes</a>
        <h1 class="mt-0" style="flex:1">${escapeHtml(t.number)}</h1>
        <button class="btn btn-secondary btn-sm" onclick="exportTicketPDF(DB.get('tickets','${t.id}'))">${icon('download')} PDF</button>
        <span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span>
      </div>

      ${(t.signature || t.techSignature) ? `
      <div class="card mb-2">
        <div class="card-header"><h2>${icon('check')} Intervention validée</h2></div>
        <div class="card-body">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            ${t.signature ? `
              <div>
                <div class="meta-label">Signature client</div>
                <img src="${t.signature}" alt="Signature client" style="max-width:260px;border:1px solid var(--border);border-radius:6px;background:#fff;display:block;margin-top:4px">
                <p class="muted" style="margin:4px 0 0;font-size:12px">${t.signerName ? escapeHtml(t.signerName) + ' — ' : ''}le ${fmtDateTime(t.signatureDate)}</p>
              </div>` : ''}
            ${t.techSignature ? `
              <div>
                <div class="meta-label">Signature technicien</div>
                <img src="${t.techSignature}" alt="Signature technicien" style="max-width:260px;border:1px solid var(--border);border-radius:6px;background:#fff;display:block;margin-top:4px">
                <p class="muted" style="margin:4px 0 0;font-size:12px">Le ${fmtDateTime(t.techSignatureDate)}</p>
              </div>` : ''}
          </div>
        </div>
      </div>` : ''}

      <div class="card mb-2">
        <div class="card-body">
          <h2>${escapeHtml(t.title)}</h2>
          <div class="detail-meta mt-2">
            <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(t.siteId))}</div></div>
            <div class="meta-item"><div class="meta-label">Équipement</div><div class="meta-value">${t.productId ? escapeHtml(DB.productName(t.productId)) : '—'}</div></div>
            <div class="meta-item"><div class="meta-label">Priorité</div><div class="meta-value"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></div></div>
            <div class="meta-item"><div class="meta-label">Créée le</div><div class="meta-value">${fmtDateTime(t.createdAt)}</div></div>
            <div class="meta-item"><div class="meta-label">Technicien${DB.ticketTechs(t).length > 1 ? 's' : ''}</div><div class="meta-value">${DB.ticketTechs(t).length === 0 ? 'Non encore affecté' : DB.ticketTechsLabel(t)}</div></div>
            <div class="meta-item"><div class="meta-label">Date d'intervention</div><div class="meta-value">${t.scheduledAt ? fmtDateTime(t.scheduledAt) + (t.scheduledEnd && t.scheduledEnd !== t.scheduledAt ? ' → ' + fmtDateTime(t.scheduledEnd) : '') : 'Non planifiée'}</div></div>
            ${t.completedAt ? `<div class="meta-item"><div class="meta-label">Terminée le</div><div class="meta-value">${fmtDateTime(t.completedAt)}</div></div>` : ''}
          </div>
          <h3 class="mt-2">Description (votre demande)</h3>
          <p style="white-space:pre-wrap">${escapeHtml(t.description)}</p>
          ${t.interventionDescription ? `
            <h3 class="mt-2">Description de l'intervention (technicien)</h3>
            <p style="white-space:pre-wrap">${escapeHtml(t.interventionDescription)}</p>
          ` : ''}
          ${(t.tripCount || t.hours) ? `
            <p class="muted mt-2" style="font-size:13px">
              Heures réalisées : <strong>${(t.hours || 0).toFixed(1)} h</strong> · Déplacements : <strong>${t.tripCount || 0}</strong>
            </p>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Échanges</h2></div>
        <div class="card-body">
          <div class="comment-list">
            ${t.comments.length === 0 ? '<p class="muted">Aucun message pour le moment.</p>' :
              t.comments.map(c => `
                <div class="comment ${c.role === 'client' ? 'client' : ''}">
                  <div class="comment-head">
                    <span class="comment-author">${escapeHtml(c.authorName || c.author)} <span class="muted">(${c.role === 'client' ? 'vous' : c.role === 'tech' ? 'technicien' : 'ARGOS'})</span></span>
                    <span class="comment-date">${fmtDateTime(c.createdAt || c.date)}</span>
                  </div>
                  <div>${escapeHtml(c.text)}</div>
                </div>`).join('')}
          </div>
          ${t.status === 'cloture' ? '<p class="muted">Cette demande est clôturée.</p>' : `
          <div class="form-group">
            <textarea id="new-comment" class="textarea" placeholder="Précisez votre demande, ajoutez une information…"></textarea>
          </div>
          <button class="btn" id="client-comment">${icon('plus')} Envoyer</button>`}
        </div>
      </div>
    `;
  },

  /* =========================== STATS =========================== */
  stats() {
    setTimeout(() => this._draw(), 0);
    const tickets = this._myTickets();
    const total = tickets.length;
    const open = tickets.filter(t => !['resolu','cloture'].includes(t.status)).length;
    const totalHours = tickets.reduce((s,t)=>s+(t.hours||0),0);

    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-icon">${icon('ticket')}</div><div><div class="kpi-value">${total}</div><div class="kpi-label">Demandes</div></div></div>
        <div class="kpi"><div class="kpi-icon warning">${icon('clock')}</div><div><div class="kpi-value">${open}</div><div class="kpi-label">En cours</div></div></div>
        <div class="kpi"><div class="kpi-icon success">${icon('check')}</div><div><div class="kpi-value">${total - open}</div><div class="kpi-label">Terminées</div></div></div>
        <div class="kpi"><div class="kpi-icon">${icon('clock')}</div><div><div class="kpi-value">${totalHours.toFixed(1)} h</div><div class="kpi-label">Heures réalisées</div></div></div>
      </div>

      <div class="chart-grid">
        <div class="card"><div class="card-header"><h2>Mes demandes par statut</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="cl-chart-status"></canvas></div></div></div>
        <div class="card"><div class="card-header"><h2>Mes demandes par site</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="cl-chart-site"></canvas></div></div></div>
      </div>
    `;
  },
  _draw() {
    if (typeof Chart === 'undefined') return;
    const tickets = this._myTickets();
    const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

    const statusCounts = STATUSES.map(s => tickets.filter(t => t.status === s.id).length);
    new Chart($('#cl-chart-status'), {
      type: 'doughnut',
      data: { labels: STATUSES.map(s => s.label),
        datasets: [{ data: statusCounts, backgroundColor: ['#1f769e','#7c3aed','#d97a00','#2e9e5b','#94a3b8'] }]
      },
      options: opts
    });

    const sites = DB.list('sites').filter(s => s.clientId === Auth.current.clientId);
    const siteCounts = sites.map(s => tickets.filter(t => t.siteId === s.id).length);
    new Chart($('#cl-chart-site'), {
      type: 'bar',
      data: { labels: sites.map(s => s.name),
        datasets: [{ data: siteCounts, backgroundColor: '#1f769e', label: 'Demandes' }]
      },
      options: { ...opts, plugins: { legend: { display: false } } }
    });
  },
};
