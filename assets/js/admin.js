/* ============================================================
   Vues du back-office (admin)
   ============================================================ */
const AdminViews = {

  /* =========================== DASHBOARD =========================== */
  dashboard() {
    const tickets = DB.list('tickets');
    const open = tickets.filter(t => !['resolu', 'cloture'].includes(t.status));
    const urgent = tickets.filter(t => t.priority === 'urgente' && !['resolu', 'cloture'].includes(t.status));
    const todayStr = new Date().toDateString();
    const todays = tickets.filter(t => t.scheduledAt && new Date(t.scheduledAt).toDateString() === todayStr);
    const monthHours = tickets
      .filter(t => t.completedAt && new Date(t.completedAt).getMonth() === new Date().getMonth())
      .reduce((s, t) => s + (Number(t.hours) || 0), 0);

    const recent = [...tickets].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-icon">${icon('inbox')}</div><div><div class="kpi-value">${open.length}</div><div class="kpi-label">Tickets en cours</div></div></div>
        <div class="kpi"><div class="kpi-icon danger">${icon('alert')}</div><div><div class="kpi-value">${urgent.length}</div><div class="kpi-label">Urgences</div></div></div>
        <div class="kpi"><div class="kpi-icon warning">${icon('calendar')}</div><div><div class="kpi-value">${todays.length}</div><div class="kpi-label">Interventions du jour</div></div></div>
        <div class="kpi"><div class="kpi-icon success">${icon('clock')}</div><div><div class="kpi-value">${monthHours.toFixed(1)} h</div><div class="kpi-label">Heures ce mois</div></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Tickets récents</h2>
          <a href="#/admin/tickets" class="btn btn-secondary btn-sm">Voir tous</a>
        </div>
        <div class="card-body tight">
          ${recent.length === 0 ? `<div class="empty">${icon('inbox')}<div>Aucun ticket</div></div>` :
            `<table class="data-table">
              <thead><tr><th>N°</th><th>Client</th><th>Site</th><th>Titre</th><th>Priorité</th><th>Statut</th><th>Créé</th></tr></thead>
              <tbody>${recent.map(t => `
                <tr onclick="location.hash='#/admin/ticket/${t.id}'" style="cursor:pointer">
                  <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
                  <td data-label="Client">${escapeHtml(DB.clientName(t.clientId))}</td>
                  <td data-label="Site">${escapeHtml(DB.siteName(t.siteId))}</td>
                  <td data-label="Titre">${escapeHtml(t.title)}</td>
                  <td data-label="Priorité"><span class="badge dot priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
                  <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
                  <td data-label="Créé">${fmtRelative(t.createdAt)}</td>
                </tr>`).join('')}</tbody>
            </table>`}
        </div>
      </div>
    `;
  },

  /* =========================== TICKETS LIST =========================== */
  tickets() {
    setTimeout(() => this._wireTicketsToolbar(), 0);
    const tickets = this._filteredTickets();
    return `
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="t-search" placeholder="Rechercher (n°, titre, client…)"></div>
          <div class="filters">
            <select class="select" id="t-status">
              <option value="">Tous statuts</option>
              ${STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
            </select>
            <select class="select" id="t-priority">
              <option value="">Toutes priorités</option>
              ${PRIORITIES.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}
            </select>
            <select class="select" id="t-client">
              <option value="">Tous clients</option>
              ${DB.list('clients').map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
            </select>
            <select class="select" id="t-tech">
              <option value="">Tous techniciens</option>
              <option value="none">Non affecté</option>
              ${DB.list('technicians').map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>
          <button class="btn" onclick="AdminViews.openTicketModal()">${icon('plus')} Nouveau ticket</button>
        </div>
        <div class="card-body tight">
          <div id="t-results">${this._ticketsTable(tickets)}</div>
        </div>
      </div>
    `;
  },
  _filteredTickets() {
    const q   = ($('#t-search')?.value || '').toLowerCase().trim();
    const st  = $('#t-status')?.value || '';
    const pr  = $('#t-priority')?.value || '';
    const cl  = $('#t-client')?.value || '';
    const tc  = $('#t-tech')?.value || '';
    return DB.list('tickets')
      .filter(t => !st || t.status === st)
      .filter(t => !pr || t.priority === pr)
      .filter(t => !cl || t.clientId === cl)
      .filter(t => !tc || (tc === 'none' ? DB.ticketTechs(t).length === 0 : DB.ticketHasTech(t, tc)))
      .filter(t => !q || (t.number+' '+t.title+' '+DB.clientName(t.clientId)+' '+DB.siteName(t.siteId)).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  _ticketsTable(tickets) {
    if (tickets.length === 0) return `<div class="empty">${icon('inbox')}<div>Aucun ticket</div></div>`;
    const techPills = (t) => {
      const ids = DB.ticketTechs(t);
      if (ids.length === 0) return '<span class="muted">—</span>';
      return ids.map(id => `<span class="tech-pill"><span class="tech-color" style="background:${DB.techColor(id)}"></span>${escapeHtml(DB.techName(id))}</span>`).join(' ');
    };
    const period = (t) => {
      if (!t.scheduledAt) return '—';
      if (t.scheduledEnd && t.scheduledEnd !== t.scheduledAt) {
        return `${fmtDate(t.scheduledAt)} → ${fmtDate(t.scheduledEnd)}`;
      }
      return fmtDate(t.scheduledAt);
    };
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Client / Site</th><th>Techniciens</th><th>Priorité</th><th>Statut</th><th>Période</th><th>H</th></tr></thead>
      <tbody>${tickets.map(t => `
        <tr onclick="location.hash='#/admin/ticket/${t.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
          <td data-label="Titre">${escapeHtml(t.title)}</td>
          <td data-label="Client">${escapeHtml(DB.clientName(t.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(t.siteId))}</small></td>
          <td data-label="Techniciens">${techPills(t)}</td>
          <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
          <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
          <td data-label="Période">${period(t)}</td>
          <td data-label="Heures">${(t.hours || 0).toFixed(1)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },
  _wireTicketsToolbar() {
    const refresh = () => { $('#t-results').innerHTML = this._ticketsTable(this._filteredTickets()); };
    ['#t-search', '#t-status', '#t-priority', '#t-client', '#t-tech'].forEach(sel => {
      const el = $(sel); if (el) el.addEventListener('input', refresh);
    });
  },

  /* =========================== TICKET DETAIL =========================== */
  ticketDetail(id) {
    const t = DB.get('tickets', id);
    if (!t) return `<div class="card"><div class="card-body"><p>Ticket introuvable.</p><a class="btn" href="#/admin/tickets">Retour</a></div></div>`;
    setTimeout(() => this._wireTicketDetail(id), 0);

    const assignedIds = DB.ticketTechs(t);
    const techCheckboxes = DB.list('technicians').map(tc => {
      const checked = assignedIds.includes(tc.id) ? 'checked' : '';
      return `
        <label style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;background:var(--bg)">
          <input type="checkbox" name="techId" value="${tc.id}" ${checked}>
          <span class="tech-color" style="background:${tc.color}"></span>
          <span>${escapeHtml(tc.name)}</span>
        </label>`;
    }).join('');
    const statusOpts = STATUSES.map(s => `<option value="${s.id}" ${s.id===t.status?'selected':''}>${s.label}</option>`).join('');
    const prioOpts = PRIORITIES.map(p => `<option value="${p.id}" ${p.id===t.priority?'selected':''}>${p.label}</option>`).join('');

    const canWrite = Auth.can('tickets', 'write');
    const site = DB.get('sites', t.siteId);
    return `
      <div class="flex mb-2">
        <a href="#/admin/tickets" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">Ticket ${escapeHtml(t.number)}</h1>
        <button class="btn btn-secondary btn-sm" onclick="exportTicketPDF(DB.get('tickets','${t.id}'))">${icon('download')} PDF</button>
        ${canWrite ? `<button class="btn btn-secondary btn-sm" onclick="AdminViews.openTicketModal('${t.id}')">${icon('edit')} Modifier</button>` : ''}
        ${canWrite ? `<button class="btn btn-danger btn-sm" onclick="AdminViews.deleteTicket('${t.id}')">${icon('trash')} Supprimer</button>` : ''}
      </div>

      <div class="detail-grid">
        <div>
          <div class="card mb-2">
            <div class="card-body">
              <h2 style="margin-bottom:14px">${escapeHtml(t.title)}</h2>
              <div class="detail-meta">
                <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${escapeHtml(DB.clientName(t.clientId))}</div></div>
                <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(t.siteId))}</div></div>
                <div class="meta-item"><div class="meta-label">Produit</div><div class="meta-value">${t.productId ? escapeHtml(DB.productName(t.productId)) : '—'}</div></div>
                <div class="meta-item"><div class="meta-label">Créé le</div><div class="meta-value">${fmtDateTime(t.createdAt)}</div></div>
                ${t.completedAt ? `<div class="meta-item"><div class="meta-label">Terminé le</div><div class="meta-value">${fmtDateTime(t.completedAt)}</div></div>` : ''}
                <div class="meta-item"><div class="meta-label">Heures</div><div class="meta-value">${(t.hours || 0).toFixed(1)} h</div></div>
                <div class="meta-item"><div class="meta-label">Déplacements</div><div class="meta-value">${t.tripCount || 0}</div></div>
              </div>
              <h3>Description (client)</h3>
              <p style="white-space:pre-wrap">${escapeHtml(t.description)}</p>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header">
              <h2>${icon('calendar')} Localisation & contact</h2>
              <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="${gpsLink(site && site.lat, site && site.lng, site && site.address)}">${icon('calendar')} Itinéraire GPS</a>
            </div>
            <div class="card-body">
              <p class="muted" style="margin-top:0">${escapeHtml(site ? site.address || '' : '')}</p>
              ${site && (site.contact || site.contactPhone || site.contactEmail) ? `
                <p style="margin:6px 0 10px;font-size:13px">
                  ${site.contact ? `<strong>${escapeHtml(site.contact)}</strong>` : ''}
                  ${site.contactPhone ? ` · <a href="tel:${escapeHtml(site.contactPhone.replace(/\s+/g,''))}">${escapeHtml(site.contactPhone)}</a>` : ''}
                  ${site.contactEmail ? ` · <a href="mailto:${escapeHtml(site.contactEmail)}">${escapeHtml(site.contactEmail)}</a>` : ''}
                </p>` : ''}
              <div id="ticket-map" style="height:260px;border-radius:6px;overflow:hidden;border:1px solid var(--border)"></div>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header"><h2>${icon('wrench')} Description de l'intervention</h2></div>
            <div class="card-body">
              <textarea id="intervention-desc" class="textarea" rows="5" placeholder="Notes du technicien : diagnostic, actions menées, pièces remplacées…">${escapeHtml(t.interventionDescription || '')}</textarea>
              <button class="btn mt-2" id="save-intervention">${icon('check')} Enregistrer l'intervention</button>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header"><h2>${icon('edit')} Signatures</h2></div>
            <div class="card-body">
              <h3 style="margin-bottom:6px">Signature client</h3>
              ${t.signature ? `
                <img src="${t.signature}" alt="Signature client" style="max-width:100%;height:auto;border:1px solid var(--border);border-radius:6px;background:#fff">
                <p class="muted mt-1">${t.signerName ? `Signée par <strong>${escapeHtml(t.signerName)}</strong> le ` : 'Signée le '}${fmtDateTime(t.signatureDate)}</p>
                <button class="btn btn-secondary btn-sm" onclick="AdminViews.openSignatureModal('${t.id}','client')">${icon('edit')} Nouvelle signature</button>
              ` : `
                <p class="muted">Aucune signature client recueillie.</p>
                <button class="btn" onclick="AdminViews.openSignatureModal('${t.id}','client')">${icon('edit')} Recueillir la signature client</button>
              `}
              <hr style="border:0;border-top:1px solid var(--border);margin:14px 0">
              <h3 style="margin-bottom:6px">Signature technicien</h3>
              ${t.techSignature ? `
                <img src="${t.techSignature}" alt="Signature technicien" style="max-width:100%;height:auto;border:1px solid var(--border);border-radius:6px;background:#fff">
                <p class="muted mt-1">Signée le ${fmtDateTime(t.techSignatureDate)}</p>
                <button class="btn btn-secondary btn-sm" onclick="AdminViews.openSignatureModal('${t.id}','tech')">${icon('edit')} Nouvelle signature</button>
              ` : `
                <p class="muted">Aucune signature technicien.</p>
                <button class="btn" onclick="AdminViews.openSignatureModal('${t.id}','tech')">${icon('edit')} Apposer la signature technicien</button>
              `}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Commentaires</h2></div>
            <div class="card-body">
              <div class="comment-list">
                ${t.comments.length === 0 ? '<p class="muted">Aucun commentaire pour le moment.</p>' :
                  t.comments.map(c => `
                  <div class="comment ${c.role === 'client' ? 'client' : ''}">
                    <div class="comment-head">
                      <span class="comment-author">${escapeHtml(c.authorName || c.author)} <span class="muted">(${c.role === 'client' ? 'client' : c.role === 'tech' ? 'technicien' : 'admin'})</span></span>
                      <span class="comment-date">${fmtDateTime(c.createdAt || c.date)}</span>
                    </div>
                    <div>${escapeHtml(c.text)}</div>
                  </div>`).join('')}
              </div>
              <div class="form-group">
                <textarea id="new-comment" class="textarea" placeholder="Ajouter un commentaire interne ou pour le client…"></textarea>
              </div>
              <button class="btn" id="add-comment">${icon('plus')} Publier</button>
            </div>
          </div>
        </div>

        <aside>
          <div class="card mb-2">
            <div class="card-header"><h2>Suivi</h2></div>
            <div class="card-body">
              <div class="form-group">
                <label>Statut</label>
                <select class="select" id="t-edit-status">${statusOpts}</select>
              </div>
              <div class="form-group">
                <label>Priorité</label>
                <select class="select" id="t-edit-priority">${prioOpts}</select>
              </div>
              <div class="form-group">
                <label>Techniciens affectés</label>
                <div id="t-edit-techs" style="display:flex;flex-wrap:wrap;gap:6px;border:1px solid var(--border);border-radius:6px;padding:8px;background:#fff">
                  ${techCheckboxes}
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Début planifié</label>
                  <input type="datetime-local" class="input" id="t-edit-sched" value="${inputDate(t.scheduledAt)}">
                </div>
                <div class="form-group">
                  <label>Fin planifiée</label>
                  <input type="datetime-local" class="input" id="t-edit-sched-end" value="${inputDate(t.scheduledEnd)}">
                </div>
              </div>
              <div class="form-group">
                <label>Heures réalisées</label>
                <input type="number" class="input" id="t-edit-hours" step="0.25" min="0" value="${t.hours || 0}">
              </div>
              <div class="form-group">
                <label>Nombre de déplacements</label>
                <input type="number" class="input" id="t-edit-trips" step="1" min="0" value="${t.tripCount || 0}">
              </div>
              <button class="btn btn-block" id="save-tracking">${icon('check')} Enregistrer</button>
            </div>
          </div>
        </aside>
      </div>
    `;
  },
  _wireTicketDetail(id) {
    const t = DB.get('tickets', id);
    const site = t ? DB.get('sites', t.siteId) : null;
    const mapEl = document.getElementById('ticket-map');
    if (mapEl && site) renderMap(mapEl, site.lat, site.lng, site.name);

    $('#save-tracking')?.addEventListener('click', () => {
      const status = $('#t-edit-status').value;
      const techIds = [...document.querySelectorAll('#t-edit-techs input[type="checkbox"]:checked')].map(cb => cb.value);
      const startVal = $('#t-edit-sched').value;
      const endVal   = $('#t-edit-sched-end').value;
      const patch = {
        status,
        priority: $('#t-edit-priority').value,
        technicianIds: techIds,
        scheduledAt: startVal ? new Date(startVal).toISOString() : null,
        scheduledEnd: endVal ? new Date(endVal).toISOString() : null,
        hours: parseFloat($('#t-edit-hours').value) || 0,
        tripCount: parseInt($('#t-edit-trips').value) || 0,
      };
      const t = DB.get('tickets', id);
      if ((status === 'resolu' || status === 'cloture') && !t.completedAt) {
        patch.completedAt = new Date().toISOString();
      }
      DB.update('tickets', id, patch);
      toast('Ticket mis à jour');
      Router.render();
    });
    $('#save-intervention')?.addEventListener('click', () => {
      DB.update('tickets', id, { interventionDescription: $('#intervention-desc').value });
      toast('Description d\'intervention enregistrée');
      Router.render();
    });
    $('#add-comment')?.addEventListener('click', () => {
      const text = $('#new-comment').value.trim();
      if (!text) return;
      DB.addComment(id, { author: Auth.current.name, role: 'admin', text });
      toast('Commentaire ajouté');
      Router.render();
    });
  },

  openTicketModal(id) {
    const t = id ? DB.get('tickets', id) : null;
    const clients = DB.list('clients');

    const clientOpts = ['<option value="">— Sélectionner —</option>',
      ...clients.map(c => `<option value="${c.id}" ${t && c.id===t.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    ].join('');
    const prioOpts = PRIORITIES.map(p => `<option value="${p.id}" ${t && t.priority===p.id ? 'selected' : ''}>${p.label}</option>`).join('');

    openModal({
      title: t ? 'Modifier le ticket' : 'Nouveau ticket',
      size: 'lg',
      body: `
        <form id="ticket-form">
          <div class="form-row">
            <div class="form-group">
              <label>Client</label>
              <select class="select" name="clientId" required>${clientOpts}</select>
            </div>
            <div class="form-group">
              <label>Site</label>
              <select class="select" name="siteId" id="site-select" required></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Équipement (optionnel)</label>
              <select class="select" name="productId" id="product-select"><option value="">— Aucun —</option></select>
            </div>
            <div class="form-group">
              <label>Priorité</label>
              <select class="select" name="priority" required>${prioOpts}</select>
            </div>
          </div>
          <div class="form-group">
            <label>Titre</label>
            <input class="input" name="title" required value="${t ? escapeHtml(t.title) : ''}" placeholder="Court résumé du problème">
          </div>
          <div class="form-group">
            <label>Description détaillée</label>
            <textarea class="textarea" name="description" rows="5" required>${t ? escapeHtml(t.description) : ''}</textarea>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn" id="ticket-save">${icon('check')} ${t ? 'Enregistrer' : 'Créer le ticket'}</button>
      `,
      onOpen(modal) {
        const cliSel  = modal.querySelector('[name="clientId"]');
        const siteSel = modal.querySelector('#site-select');
        const prodSel = modal.querySelector('#product-select');

        const refreshProducts = () => {
          const cid = cliSel.value, sid = siteSel.value;
          const prods = DB.list('products').filter(p => (!cid || p.clientId === cid) && (!sid || p.siteId === sid));
          prodSel.innerHTML = ['<option value="">— Aucun —</option>',
            ...prods.map(p => `<option value="${p.id}" ${t && p.id===t.productId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
          ].join('');
        };
        const refreshSites = () => {
          const cid = cliSel.value;
          const sites = DB.list('sites').filter(s => s.clientId === cid);
          siteSel.innerHTML = sites.length === 0
            ? '<option value="">— Aucun site —</option>'
            : ['<option value="">— Sélectionner —</option>',
               ...sites.map(s => `<option value="${s.id}" ${t && s.id===t.siteId?'selected':''}>${escapeHtml(s.name)}</option>`)
              ].join('');
          refreshProducts();
        };
        cliSel.addEventListener('change', refreshSites);
        siteSel.addEventListener('change', refreshProducts);
        refreshSites();

        modal.parentElement.querySelector('#ticket-save').onclick = async () => {
          const fd = new FormData(modal.querySelector('#ticket-form'));
          const data = Object.fromEntries(fd);
          if (!data.clientId || !data.siteId || !data.title) { toast('Champs obligatoires manquants', 'error'); return; }
          try {
            if (t) {
              DB.update('tickets', t.id, data);
              toast('Ticket modifié');
            } else {
              await DB.createTicket({ ...data, createdBy: Auth.current.id });
              toast('Ticket créé');
            }
            closeModal();
            Router.render();
          } catch (_) { /* erreur déjà toastée par DB */ }
        };
      }
    });
  },

  deleteTicket(id) {
    confirmDialog('Supprimer définitivement ce ticket ?', () => {
      DB.remove('tickets', id);
      toast('Ticket supprimé');
      location.hash = '#/admin/tickets';
    });
  },

  openSignatureModal(id, kind) {
    kind = kind || 'client';
    const titleLabel = kind === 'tech' ? 'Signature technicien' : 'Signature client';
    const helper = kind === 'tech'
      ? 'Apposez votre signature dans le cadre ci-dessous.'
      : 'Faites signer le client dans le cadre ci-dessous (souris ou doigt sur tactile).';
    const ticket = DB.get('tickets', id);
    const existingName = ticket && ticket.signerName ? ticket.signerName : '';
    const [exFirst, exLast] = (() => {
      if (!existingName) return ['', ''];
      const parts = existingName.split(/\s+/);
      const first = parts.shift() || '';
      return [first, parts.join(' ')];
    })();
    openModal({
      title: titleLabel,
      body: `
        <p class="muted">${escapeHtml(helper)}</p>
        ${kind === 'client' ? `
          <div class="form-row">
            <div class="form-group"><label>Prénom du signataire *</label>
              <input class="input" id="sig-firstname" required value="${escapeHtml(exFirst)}">
            </div>
            <div class="form-group"><label>Nom du signataire *</label>
              <input class="input" id="sig-lastname" required value="${escapeHtml(exLast)}">
            </div>
          </div>
        ` : ''}
        <canvas id="sig-canvas" style="width:100%;height:200px;border:2px dashed var(--border-strong);border-radius:8px;background:#fff;cursor:crosshair;display:block"></canvas>
        <div class="btn-group mt-2">
          <button class="btn btn-secondary btn-sm" id="sig-clear">${icon('refresh')} Effacer</button>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn" id="sig-save">${icon('check')} Valider la signature</button>
      `,
      onOpen(modal) {
        const canvas = modal.querySelector('#sig-canvas');
        setTimeout(() => {
          const pad = attachSignaturePad(canvas);
          modal.querySelector('#sig-clear').onclick = () => pad.clear();
          modal.parentElement.querySelector('#sig-save').onclick = () => {
            if (pad.isEmpty()) { toast('Veuillez signer avant de valider', 'error'); return; }
            let signerName = null;
            if (kind === 'client') {
              const first = (modal.querySelector('#sig-firstname').value || '').trim();
              const last  = (modal.querySelector('#sig-lastname').value  || '').trim();
              if (!first || !last) { toast('Prénom et nom requis', 'error'); return; }
              signerName = `${first} ${last}`;
            }
            DB.setSignature(id, kind, pad.toDataURL(), signerName);
            toast('Signature enregistrée');
            closeModal();
            Router.render();
          };
        }, 50);
      }
    });
  },

  /* =========================== CLIENTS =========================== */
  clients() {
    const items = DB.list('clients');
    return this._crudList({
      title: 'Clients',
      items,
      readOnly: !Auth.can('clients', 'write'),
      addLabel: 'Nouveau client',
      onAdd: () => AdminViews.openClientModal(),
      onEdit: id => AdminViews.openClientModal(id),
      onDelete: id => {
        confirmDialog('Supprimer ce client ? (les tickets/sites associés resteront)', () => {
          DB.remove('clients', id); toast('Client supprimé'); Router.render();
        });
      },
      columns: [
        { label: 'Code', render: c => `<code>${escapeHtml(c.code)}</code>` },
        { label: 'Nom', render: c => escapeHtml(c.name) },
        { label: 'Contact', render: c => escapeHtml(c.contact) },
        { label: 'Email', render: c => escapeHtml(c.email) },
        { label: 'Téléphone', render: c => escapeHtml(c.phone) },
        { label: 'Identifiant', render: c => `<code>${escapeHtml(c.login)}</code>` },
      ]
    });
  },
  openClientModal(id) {
    const c = id ? DB.get('clients', id) : null;
    openModal({
      title: c ? 'Modifier le client' : 'Nouveau client',
      body: `
        <form id="cli-form">
          <div class="form-row">
            <div class="form-group"><label>Code</label><input class="input" name="code" required value="${c?escapeHtml(c.code):''}"></div>
            <div class="form-group"><label>Nom</label><input class="input" name="name" required value="${c?escapeHtml(c.name):''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Contact</label><input class="input" name="contact" value="${c?escapeHtml(c.contact):''}"></div>
            <div class="form-group"><label>Téléphone</label><input class="input" name="phone" value="${c?escapeHtml(c.phone):''}"></div>
          </div>
          <div class="form-group"><label>Email</label><input class="input" type="email" name="email" value="${c?escapeHtml(c.email):''}"></div>
          <div class="form-group"><label>Adresse</label><input class="input" name="address" value="${c?escapeHtml(c.address):''}"></div>
          <h3 style="margin-top:8px">Accès portail client</h3>
          <div class="form-row">
            <div class="form-group"><label>Identifiant</label><input class="input" name="login" required value="${c?escapeHtml(c.login):''}"></div>
            <div class="form-group"><label>Mot de passe</label><input class="input" name="password" required value="${c?escapeHtml(c.password):''}"></div>
          </div>
        </form>
      `,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="cli-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        modal.parentElement.querySelector('#cli-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#cli-form')));
          if (!data.name || !data.login) { toast('Champs requis manquants', 'error'); return; }
          if (c) DB.update('clients', c.id, data); else DB.insert('clients', data);
          closeModal(); toast('Client enregistré'); Router.render();
        };
      }
    });
  },

  /* =========================== SITES =========================== */
  sites() {
    const items = DB.list('sites');
    return this._crudList({
      title: 'Sites d\'intervention',
      items,
      readOnly: !Auth.can('sites', 'write'),
      addLabel: 'Nouveau site',
      onAdd: () => AdminViews.openSiteModal(),
      onEdit: id => AdminViews.openSiteModal(id),
      onDelete: id => {
        confirmDialog('Supprimer ce site ?', () => {
          DB.remove('sites', id); toast('Site supprimé'); Router.render();
        });
      },
      columns: [
        { label: 'Nom', render: s => escapeHtml(s.name) },
        { label: 'Client', render: s => escapeHtml(DB.clientName(s.clientId)) },
        { label: 'Adresse', render: s => escapeHtml(s.address) },
        { label: 'Contact', render: s => escapeHtml(s.contact) },
        { label: 'Téléphone', render: s => escapeHtml(s.contactPhone || '') },
        { label: 'Email', render: s => escapeHtml(s.contactEmail || '') },
      ]
    });
  },
  openSiteModal(id) {
    const s = id ? DB.get('sites', id) : null;
    const clientOpts = DB.list('clients').map(c => `<option value="${c.id}" ${s&&s.clientId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    openModal({
      title: s ? 'Modifier le site' : 'Nouveau site',
      body: `
        <form id="site-form">
          <div class="form-group"><label>Client</label><select class="select" name="clientId" required>${clientOpts}</select></div>
          <div class="form-group"><label>Nom du site</label><input class="input" name="name" required value="${s?escapeHtml(s.name):''}"></div>
          <div class="form-group"><label>Adresse</label><input class="input" name="address" value="${s?escapeHtml(s.address):''}"></div>
          <div class="form-row">
            <div class="form-group"><label>Latitude</label><input class="input" type="number" step="0.000001" name="lat" value="${s && s.lat != null ? s.lat : ''}" placeholder="ex : -21.0553"></div>
            <div class="form-group"><label>Longitude</label><input class="input" type="number" step="0.000001" name="lng" value="${s && s.lng != null ? s.lng : ''}" placeholder="ex : 55.2236"></div>
          </div>
          <div class="form-group"><label>Contact sur place</label><input class="input" name="contact" value="${s?escapeHtml(s.contact):''}"></div>
          <div class="form-row">
            <div class="form-group"><label>Téléphone du contact</label><input class="input" name="contactPhone" value="${s?escapeHtml(s.contactPhone||''):''}"></div>
            <div class="form-group"><label>Email du contact</label><input class="input" type="email" name="contactEmail" value="${s?escapeHtml(s.contactEmail||''):''}"></div>
          </div>
        </form>
      `,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="site-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        modal.parentElement.querySelector('#site-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#site-form')));
          // Convert lat/lng strings to numbers (or null if empty)
          data.lat = data.lat === '' ? null : parseFloat(data.lat);
          data.lng = data.lng === '' ? null : parseFloat(data.lng);
          if (s) DB.update('sites', s.id, data); else DB.insert('sites', data);
          closeModal(); toast('Site enregistré'); Router.render();
        };
      }
    });
  },

  /* =========================== PRODUCTS =========================== */
  products() {
    const items = DB.list('products');
    return this._crudList({
      title: 'Produits / équipements',
      items,
      readOnly: !Auth.can('products', 'write'),
      addLabel: 'Nouveau produit',
      onAdd: () => AdminViews.openProductModal(),
      onEdit: id => AdminViews.openProductModal(id),
      onDelete: id => {
        confirmDialog('Supprimer ce produit ?', () => {
          DB.remove('products', id); toast('Produit supprimé'); Router.render();
        });
      },
      columns: [
        { label: 'Référence', render: p => `<code>${escapeHtml(p.reference)}</code>` },
        { label: 'Nom', render: p => escapeHtml(p.name) },
        { label: 'Client', render: p => escapeHtml(DB.clientName(p.clientId)) },
        { label: 'Site', render: p => escapeHtml(DB.siteName(p.siteId)) },
        { label: 'Description', render: p => escapeHtml(p.description) },
      ]
    });
  },
  openProductModal(id) {
    const p = id ? DB.get('products', id) : null;
    const clientOpts = ['<option value="">— Sélectionner —</option>',
      ...DB.list('clients').map(c => `<option value="${c.id}" ${p&&p.clientId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`)
    ].join('');
    openModal({
      title: p ? 'Modifier le produit' : 'Nouveau produit',
      body: `
        <form id="p-form">
          <div class="form-row">
            <div class="form-group"><label>Référence</label><input class="input" name="reference" required value="${p?escapeHtml(p.reference):''}"></div>
            <div class="form-group"><label>Nom</label><input class="input" name="name" required value="${p?escapeHtml(p.name):''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Client</label><select class="select" name="clientId" required>${clientOpts}</select></div>
            <div class="form-group"><label>Site</label><select class="select" name="siteId" id="p-site" required></select></div>
          </div>
          <div class="form-group"><label>Description</label><textarea class="textarea" name="description">${p?escapeHtml(p.description):''}</textarea></div>
        </form>`,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="p-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        const sel = modal.querySelector('[name="clientId"]');
        const siteSel = modal.querySelector('#p-site');
        const refreshSites = () => {
          const cid = sel.value;
          const sites = DB.list('sites').filter(s => s.clientId === cid);
          siteSel.innerHTML = sites.length === 0
            ? '<option value="">— Aucun site —</option>'
            : ['<option value="">— Sélectionner —</option>',
               ...sites.map(s => `<option value="${s.id}" ${p && s.id===p.siteId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
              ].join('');
        };
        sel.addEventListener('change', refreshSites);
        refreshSites();
        modal.parentElement.querySelector('#p-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#p-form')));
          if (!data.clientId || !data.siteId) { toast('Client et site requis', 'error'); return; }
          if (p) DB.update('products', p.id, data); else DB.insert('products', data);
          closeModal(); toast('Produit enregistré'); Router.render();
        };
      }
    });
  },

  /* =========================== ADMINS =========================== */
  admins() {
    const items = DB.list('admins');
    return this._crudList({
      title: 'Administrateurs',
      items,
      addLabel: Auth.can('admins','write') ? 'Nouvel administrateur' : null,
      onAdd: () => AdminViews.openAdminModal(),
      onEdit: id => AdminViews.openAdminModal(id),
      onDelete: id => {
        if (id === Auth.current.id) { toast('Vous ne pouvez pas vous supprimer vous-même', 'error'); return; }
        const a = DB.get('admins', id);
        if (a && a.superAdmin) { toast('Le super-administrateur ne peut pas être supprimé', 'error'); return; }
        confirmDialog('Supprimer cet administrateur ?', () => {
          DB.remove('admins', id); toast('Administrateur supprimé'); Router.render();
        });
      },
      readOnly: !Auth.can('admins', 'write'),
      columns: [
        { label: 'Nom', render: a => escapeHtml(a.name) + (a.superAdmin ? ' <span class="badge status-resolu" style="margin-left:6px">SUPER</span>' : '') },
        { label: 'Identifiant', render: a => `<code>${escapeHtml(a.login)}</code>` },
        { label: 'Permissions actives', render: a => {
          if (a.superAdmin) return '<span class="muted">Toutes (super)</span>';
          const p = a.permissions || {};
          const w = Object.values(p).filter(v => v === 'write').length;
          const r = Object.values(p).filter(v => v === 'read').length;
          return `<span class="muted">${w} modif. · ${r} lecture</span>`;
        }},
      ]
    });
  },
  openAdminModal(id) {
    const a = id ? DB.get('admins', id) : null;
    const isSuper = a && a.superAdmin;
    const perms = (a && a.permissions) ? a.permissions : defaultAdminPermissions();
    const permsHtml = PERMISSION_MENUS.map(m => `
      <tr>
        <td style="padding:6px 8px"><strong>${escapeHtml(m.label)}</strong></td>
        <td style="padding:6px 8px">
          <select class="select" data-perm="${m.key}" ${isSuper?'disabled':''}>
            ${PERMISSION_LEVELS.map(l => `<option value="${l.key}" ${perms[m.key]===l.key?'selected':''}>${l.label}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');
    openModal({
      title: a ? 'Modifier l\'administrateur' : 'Nouvel administrateur',
      size: 'lg',
      body: `
        <form id="adm-form">
          <div class="form-row">
            <div class="form-group"><label>Nom complet</label><input class="input" name="name" required value="${a?escapeHtml(a.name):''}"></div>
            <div class="form-group"><label>Identifiant</label><input class="input" name="login" required value="${a?escapeHtml(a.login):''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Mot de passe</label><input class="input" name="password" required value="${a?escapeHtml(a.password):''}"></div>
            <div class="form-group">
              <label>Type</label>
              <input class="input" value="${isSuper?'Super-administrateur (tous droits)':'Administrateur standard'}" disabled>
            </div>
          </div>
          <h3 style="margin-top:8px">Droits par menu</h3>
          ${isSuper ? '<p class="muted">Le super-administrateur dispose de tous les droits par défaut.</p>' : ''}
          <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:6px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--brand-lighter)"><th style="text-align:left;padding:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase">Menu</th><th style="text-align:left;padding:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase">Niveau</th></tr></thead>
              <tbody>${permsHtml}</tbody>
            </table>
          </div>
        </form>`,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="adm-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        modal.parentElement.querySelector('#adm-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#adm-form')));
          if (!data.name || !data.login || !data.password) { toast('Champs requis manquants', 'error'); return; }
          const newPerms = isSuper ? (a.permissions || defaultAdminPermissions()) : (() => {
            const p = {};
            modal.querySelectorAll('[data-perm]').forEach(s => { p[s.dataset.perm] = s.value; });
            return p;
          })();
          if (a) {
            DB.update('admins', a.id, { ...data, permissions: newPerms });
          } else {
            DB.insert('admins', { ...data, role: 'admin', superAdmin: false, permissions: newPerms });
          }
          closeModal(); toast('Administrateur enregistré'); Router.render();
        };
      }
    });
  },

  /* =========================== TECHNICIANS =========================== */
  technicians() {
    const items = DB.list('technicians');
    return this._crudList({
      title: 'Techniciens',
      items,
      readOnly: !Auth.can('technicians', 'write'),
      addLabel: 'Nouveau technicien',
      onAdd: () => AdminViews.openTechModal(),
      onEdit: id => AdminViews.openTechModal(id),
      onDelete: id => {
        confirmDialog('Supprimer ce technicien ?', () => {
          DB.remove('technicians', id); toast('Technicien supprimé'); Router.render();
        });
      },
      columns: [
        { label: 'Nom', render: t => `<span class="tech-pill"><span class="tech-color" style="background:${t.color}"></span>${escapeHtml(t.name)}</span>` },
        { label: 'Spécialité', render: t => escapeHtml(t.specialty) },
        { label: 'Email', render: t => escapeHtml(t.email) },
        { label: 'Téléphone', render: t => escapeHtml(t.phone) },
        { label: 'Identifiant', render: t => `<code>${escapeHtml(t.login || '')}</code>` },
      ]
    });
  },
  openTechModal(id) {
    const t = id ? DB.get('technicians', id) : null;
    const colorOpts = TECH_COLORS.map(c =>
      `<option value="${c}" ${t&&t.color===c?'selected':''} style="background:${c}">${c}</option>`
    ).join('');
    openModal({
      title: t ? 'Modifier le technicien' : 'Nouveau technicien',
      body: `
        <form id="tech-form">
          <div class="form-row">
            <div class="form-group"><label>Nom complet</label><input class="input" name="name" required value="${t?escapeHtml(t.name):''}"></div>
            <div class="form-group"><label>Spécialité</label><input class="input" name="specialty" value="${t?escapeHtml(t.specialty):''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Email</label><input class="input" type="email" name="email" value="${t?escapeHtml(t.email):''}"></div>
            <div class="form-group"><label>Téléphone</label><input class="input" name="phone" value="${t?escapeHtml(t.phone):''}"></div>
          </div>
          <div class="form-group"><label>Couleur planning</label><select class="select" name="color">${colorOpts}</select></div>
          <h3 style="margin-top:8px">Accès portail technicien</h3>
          <div class="form-row">
            <div class="form-group"><label>Identifiant</label><input class="input" name="login" required value="${t?escapeHtml(t.login||''):''}"></div>
            <div class="form-group"><label>Mot de passe</label><input class="input" name="password" required value="${t?escapeHtml(t.password||''):''}"></div>
          </div>
        </form>`,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="tech-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        modal.parentElement.querySelector('#tech-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#tech-form')));
          if (t) DB.update('technicians', t.id, data); else DB.insert('technicians', data);
          closeModal(); toast('Technicien enregistré'); Router.render();
        };
      }
    });
  },

  /* =========================== PLANNING =========================== */
  planning(weekOffset = 0) {
    const techs = DB.list('technicians');
    const monday = this._mondayOf(new Date(), parseInt(weekOffset) || 0);
    const days = Array.from({length: 7}, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
    });
    const fmtDay = d => d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

    const eventsFor = (techId, day) => DB.list('tickets')
      .filter(t => DB.ticketHasTech(t, techId) && DB.ticketCoversDay(t, day));

    const inRange = (day, scheduledAt, duration) => {
      if (!scheduledAt) return false;
      const start = new Date(scheduledAt); start.setHours(0,0,0,0);
      const dur = Math.max(1, parseInt(duration) || 1);
      const end = new Date(start); end.setDate(start.getDate() + dur - 1); end.setHours(23,59,59,999);
      const d = new Date(day); d.setHours(12,0,0,0);
      return d >= start && d <= end;
    };
    const chantiersFor = (techId, day) => (DB.list('chantiers') || [])
      .filter(c => (c.technicianIds || []).includes(techId) && inRange(day, c.scheduledAt, c.duration));

    const unassigned = DB.list('tickets').filter(t =>
      DB.ticketTechs(t).length === 0 && !['resolu', 'cloture'].includes(t.status)
    );

    setTimeout(() => {
      $('#prev-week')?.addEventListener('click', () => location.hash = `#/admin/planning/${weekOffset - 1}`);
      $('#next-week')?.addEventListener('click', () => location.hash = `#/admin/planning/${weekOffset + 1}`);
      $('#today-week')?.addEventListener('click', () => location.hash = `#/admin/planning/0`);
    }, 0);

    return `
      <div class="planning-controls">
        <button class="btn btn-secondary btn-sm" id="prev-week">${icon('back')} Précédente</button>
        <button class="btn btn-secondary btn-sm" id="today-week">Aujourd'hui</button>
        <button class="btn btn-secondary btn-sm" id="next-week">Suivante ${icon('back')}</button>
        <strong>Semaine du ${days[0].toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}</strong>
      </div>

      <div class="planning-grid mb-2">
        <table class="planning-table">
          <thead>
            <tr>
              <th class="tech-col">Technicien</th>
              ${days.map(d => `<th>${fmtDay(d)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${techs.map(t => `
              <tr>
                <td class="tech-col"><span class="tech-pill"><span class="tech-color" style="background:${t.color}"></span>${escapeHtml(t.name)}</span><br><small class="muted">${escapeHtml(t.specialty)}</small></td>
                ${days.map(d => `<td class="planning-cell">
                  ${eventsFor(t.id, d).map(ev => `
                    <a class="planning-event" style="background:${t.color}" href="#/admin/ticket/${ev.id}">
                      <span class="num">${ev.number}</span>
                      <span class="title">${escapeHtml(ev.title.slice(0, 32))}${ev.title.length>32?'…':''}</span>
                    </a>`).join('')}
                  ${chantiersFor(t.id, d).map(ch => `
                    <a class="planning-chantier" href="#/admin/chantier/${ch.id}" title="${escapeHtml(ch.name)}">
                      <span class="num">${ch.number}</span><span class="tag">CHA</span>
                      <span class="title">${escapeHtml(ch.name.slice(0, 28))}${ch.name.length>28?'…':''}</span>
                    </a>`).join('')}
                </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><h2>${icon('inbox')} Tickets non affectés (${unassigned.length})</h2></div>
        <div class="card-body tight">
          ${unassigned.length === 0 ? '<div class="empty">Tous les tickets sont affectés.</div>' :
            `<table class="data-table">
              <thead><tr><th>N°</th><th>Titre</th><th>Client</th><th>Priorité</th><th>Créé</th></tr></thead>
              <tbody>${unassigned.map(t => `
                <tr onclick="location.hash='#/admin/ticket/${t.id}'" style="cursor:pointer">
                  <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
                  <td data-label="Titre">${escapeHtml(t.title)}</td>
                  <td data-label="Client">${escapeHtml(DB.clientName(t.clientId))}</td>
                  <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
                  <td data-label="Créé">${fmtRelative(t.createdAt)}</td>
                </tr>`).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;
  },
  _mondayOf(date, weekOffset = 0) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + weekOffset * 7);
    d.setHours(0,0,0,0);
    return d;
  },

  /* =========================== STATS =========================== */
  stats() {
    setTimeout(() => this._wireStatsToolbar(), 0);
    const clients = DB.list('clients');
    const techs = DB.list('technicians');
    return `
      <div class="card mb-2">
        <div class="toolbar" style="gap:8px">
          <select id="st-status" class="select" style="min-width:130px">
            <option value="">Tous statuts</option>
            ${STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
          </select>
          <select id="st-priority" class="select" style="min-width:130px">
            <option value="">Toutes priorités</option>
            ${PRIORITIES.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}
          </select>
          <select id="st-client" class="select" style="min-width:160px">
            <option value="">Tous clients</option>
            ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <select id="st-site" class="select" style="min-width:140px">
            <option value="">Tous sites</option>
          </select>
          <select id="st-tech" class="select" style="min-width:160px">
            <option value="">Tous techniciens</option>
            ${techs.map(tc => `<option value="${tc.id}">${escapeHtml(tc.name)}</option>`).join('')}
          </select>
          <input type="date" id="st-from" class="input" style="max-width:160px" title="Tickets créés à partir du">
          <input type="date" id="st-to"   class="input" style="max-width:160px" title="Tickets créés jusqu'au">
          <button class="btn btn-secondary btn-sm" id="st-reset">${icon('refresh')} Réinitialiser</button>
        </div>
      </div>

      <div id="st-kpi"></div>
      <div class="chart-grid" id="st-charts"></div>
    `;
  },
  _filteredStatsTickets() {
    const st = $('#st-status')?.value || '';
    const pr = $('#st-priority')?.value || '';
    const cl = $('#st-client')?.value || '';
    const si = $('#st-site')?.value || '';
    const tc = $('#st-tech')?.value || '';
    const from = $('#st-from')?.value;
    const to   = $('#st-to')?.value;
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toTs   = to   ? new Date(to   + 'T23:59:59').getTime() : null;
    return DB.list('tickets').filter(t => {
      if (st && t.status !== st) return false;
      if (pr && t.priority !== pr) return false;
      if (cl && t.clientId !== cl) return false;
      if (si && t.siteId !== si) return false;
      if (tc && !DB.ticketHasTech(t, tc)) return false;
      const ts = new Date(t.createdAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs   !== null && ts > toTs)   return false;
      return true;
    });
  },
  _wireStatsToolbar() {
    const populateSites = () => {
      const cli = $('#st-client').value;
      const cur = $('#st-site').value;
      const sites = DB.list('sites').filter(s => !cli || s.clientId === cli);
      $('#st-site').innerHTML = '<option value="">Tous sites</option>' +
        sites.map(s => `<option value="${s.id}" ${s.id===cur?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
    };
    populateSites();
    const update = () => this._renderStatsContent();
    $('#st-client').addEventListener('change', () => { populateSites(); update(); });
    ['#st-status','#st-priority','#st-site','#st-tech','#st-from','#st-to'].forEach(s => {
      $(s)?.addEventListener('input', update);
      $(s)?.addEventListener('change', update);
    });
    $('#st-reset').addEventListener('click', () => {
      ['#st-status','#st-priority','#st-client','#st-site','#st-tech','#st-from','#st-to'].forEach(s => { $(s).value = ''; });
      populateSites();
      update();
    });
    this._renderStatsContent();
  },
  _renderStatsContent() {
    const tickets = this._filteredStatsTickets();
    const total = tickets.length;
    const closed = tickets.filter(t => t.status === 'cloture' || t.status === 'resolu').length;
    const totalHours = tickets.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    const avgRespHours = (() => {
      const done = tickets.filter(t => t.completedAt);
      if (!done.length) return 0;
      const sum = done.reduce((s, t) => s + (new Date(t.completedAt) - new Date(t.createdAt)), 0);
      return (sum / done.length / 3_600_000);
    })();

    $('#st-kpi').innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-icon">${icon('ticket')}</div><div><div class="kpi-value">${total}</div><div class="kpi-label">Tickets filtrés</div></div></div>
        <div class="kpi"><div class="kpi-icon success">${icon('check')}</div><div><div class="kpi-value">${closed}</div><div class="kpi-label">Résolus / clôturés</div></div></div>
        <div class="kpi"><div class="kpi-icon warning">${icon('clock')}</div><div><div class="kpi-value">${totalHours.toFixed(1)} h</div><div class="kpi-label">Heures totales</div></div></div>
        <div class="kpi"><div class="kpi-icon">${icon('refresh')}</div><div><div class="kpi-value">${avgRespHours.toFixed(1)} h</div><div class="kpi-label">Délai moyen résolution</div></div></div>
      </div>
    `;

    $('#st-charts').innerHTML = `
      <div class="card"><div class="card-header"><h2>Tickets par statut</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="chart-status"></canvas></div></div></div>
      <div class="card"><div class="card-header"><h2>Tickets par priorité</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="chart-prio"></canvas></div></div></div>
      <div class="card"><div class="card-header"><h2>Heures par technicien</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="chart-tech"></canvas></div></div></div>
      <div class="card"><div class="card-header"><h2>Tickets par client</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="chart-client"></canvas></div></div></div>
    `;

    if (this._chartInstances) Object.values(this._chartInstances).forEach(c => c?.destroy?.());
    this._chartInstances = {};
    this._drawCharts(tickets);
  },
  _drawCharts(tickets) {
    if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }
    const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

    const statusCounts = STATUSES.map(s => tickets.filter(t => t.status === s.id).length);
    this._chartInstances.status = new Chart($('#chart-status'), {
      type: 'doughnut',
      data: {
        labels: STATUSES.map(s => s.label),
        datasets: [{ data: statusCounts, backgroundColor: ['#1f769e', '#7c3aed', '#d97a00', '#2e9e5b', '#94a3b8'] }]
      },
      options: opts
    });

    const prioCounts = PRIORITIES.map(p => tickets.filter(t => t.priority === p.id).length);
    this._chartInstances.prio = new Chart($('#chart-prio'), {
      type: 'bar',
      data: {
        labels: PRIORITIES.map(p => p.label),
        datasets: [{ data: prioCounts, backgroundColor: ['#94a3b8', '#1f769e', '#d97a00', '#c8362d'], label: 'Tickets' }]
      },
      options: { ...opts, plugins: { legend: { display: false } } }
    });

    const techs = DB.list('technicians');
    const techHours = techs.map(tc => tickets.filter(t => DB.ticketHasTech(t, tc.id)).reduce((s,t)=>s+(t.hours||0),0));
    this._chartInstances.tech = new Chart($('#chart-tech'), {
      type: 'bar',
      data: {
        labels: techs.map(t => t.name),
        datasets: [{ data: techHours, backgroundColor: techs.map(t => t.color), label: 'Heures' }]
      },
      options: { ...opts, indexAxis: 'y', plugins: { legend: { display: false } } }
    });

    const clients = DB.list('clients');
    const clCounts = clients.map(c => tickets.filter(t => t.clientId === c.id).length);
    this._chartInstances.client = new Chart($('#chart-client'), {
      type: 'bar',
      data: {
        labels: clients.map(c => c.name),
        datasets: [{ data: clCounts, backgroundColor: '#1f769e', label: 'Tickets' }]
      },
      options: { ...opts, plugins: { legend: { display: false } } }
    });
  },

  /* =========================== EXPORTS =========================== */
  exports() {
    setTimeout(() => {
      const ticketsInRange = () => {
        const from = $('#ex-from')?.value;
        const to   = $('#ex-to')?.value;
        const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
        const toTs   = to   ? new Date(to   + 'T23:59:59').getTime() : null;
        return DB.list('tickets').filter(t => {
          const ts = new Date(t.createdAt).getTime();
          if (fromTs !== null && ts < fromTs) return false;
          if (toTs   !== null && ts > toTs)   return false;
          return true;
        });
      };
      const periodSuffix = () => {
        const from = $('#ex-from')?.value;
        const to   = $('#ex-to')?.value;
        if (from || to) return `_${from || 'debut'}_au_${to || 'fin'}`;
        return '';
      };

      $('#exp-tickets')?.addEventListener('click', () => {
        const rows = ticketsInRange().map(t => ({
          Numero: t.number,
          Titre: t.title,
          Client: DB.clientName(t.clientId),
          Site: DB.siteName(t.siteId),
          Produit: t.productId ? DB.productName(t.productId) : '',
          Priorite: DB.priorityLabel(t.priority),
          Statut: DB.statusLabel(t.status),
          Techniciens: DB.ticketTechsLabel(t),
          Cree_le: fmtDateTime(t.createdAt),
          Planifie_du: t.scheduledAt ? fmtDateTime(t.scheduledAt) : '',
          Planifie_au: t.scheduledEnd ? fmtDateTime(t.scheduledEnd) : '',
          Termine_le: t.completedAt ? fmtDateTime(t.completedAt) : '',
          Heures: t.hours || 0,
          Deplacements: t.tripCount || 0,
          Description: t.description,
        }));
        downloadCSV(`tickets${periodSuffix()}_${new Date().toISOString().slice(0,10)}.csv`, rows);
      });
      $('#exp-hours')?.addEventListener('click', () => {
        const inRange = ticketsInRange();
        const rows = DB.list('technicians').map(tc => {
          const tks = inRange.filter(t => DB.ticketHasTech(t, tc.id));
          return {
            Technicien: tc.name,
            Specialite: tc.specialty,
            Nb_tickets: tks.length,
            Heures_totales: tks.reduce((s,t) => s + (t.hours||0), 0).toFixed(2),
            Deplacements: tks.reduce((s,t) => s + (t.tripCount||0), 0),
          };
        });
        downloadCSV(`heures_techniciens${periodSuffix()}_${new Date().toISOString().slice(0,10)}.csv`, rows);
      });
      $('#exp-clients')?.addEventListener('click', () => {
        const inRange = ticketsInRange();
        const rows = DB.list('clients').map(c => {
          const tks = inRange.filter(t => t.clientId === c.id);
          return {
            Code: c.code,
            Nom: c.name,
            Contact: c.contact,
            Email: c.email,
            Telephone: c.phone,
            Nb_tickets: tks.length,
            Heures_total: tks.reduce((s,t) => s + (t.hours||0), 0).toFixed(2),
          };
        });
        downloadCSV(`clients${periodSuffix()}_${new Date().toISOString().slice(0,10)}.csv`, rows);
      });
      $('#ex-reset')?.addEventListener('click', () => {
        $('#ex-from').value = '';
        $('#ex-to').value = '';
      });
      $('#reset-data')?.addEventListener('click', () => {
        confirmDialog('Réinitialiser toutes les données de démonstration ? Cette action ne peut pas être annulée.', () => {
          DB.reset(); toast('Données réinitialisées'); location.reload();
        });
      });
    }, 0);
    return `
      <div class="card mb-2">
        <div class="card-header"><h2>${icon('download')} Extractions CSV</h2></div>
        <div class="card-body">
          <p class="muted">Téléchargez les données au format CSV (séparateur point-virgule, encodage UTF-8 avec BOM, ouvert directement dans Excel).</p>
          <div class="form-row" style="max-width:560px;margin-bottom:8px">
            <div class="form-group"><label>Tickets créés à partir du</label>
              <input type="date" class="input" id="ex-from">
            </div>
            <div class="form-group"><label>Jusqu'au</label>
              <input type="date" class="input" id="ex-to">
            </div>
          </div>
          <p class="muted" style="font-size:12px;margin-top:0">Le filtre s'applique aux tickets créés dans la période. Laissez vide pour exporter tout l'historique.</p>
          <div class="btn-group">
            <button class="btn" id="exp-tickets">${icon('download')} Tous les tickets</button>
            <button class="btn" id="exp-hours">${icon('download')} Heures par technicien</button>
            <button class="btn" id="exp-clients">${icon('download')} Synthèse clients</button>
            <button class="btn btn-secondary btn-sm" id="ex-reset">${icon('refresh')} Effacer dates</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>${icon('refresh')} Données de démonstration</h2></div>
        <div class="card-body">
          <p class="muted">Cette version prototype stocke les données dans votre navigateur. Vous pouvez réinitialiser le jeu de données de démo.</p>
          <button class="btn btn-danger" id="reset-data">${icon('trash')} Réinitialiser les données</button>
        </div>
      </div>
    `;
  },

  /* =========================== Generic CRUD list helper =========================== */
  _crudList({ title, items, addLabel, onAdd, onEdit, onDelete, columns, readOnly }) {
    const fnId = 'crud_' + Math.random().toString(36).slice(2, 8);
    window[fnId] = { onEdit, onDelete, onAdd };
    const showActions = !readOnly;
    return `
      <div class="card">
        <div class="card-header">
          <h2>${escapeHtml(title)}</h2>
          ${addLabel && !readOnly ? `<button class="btn" onclick="window['${fnId}'].onAdd()">${icon('plus')} ${escapeHtml(addLabel)}</button>` : ''}
        </div>
        <div class="card-body tight">
          ${items.length === 0 ? `<div class="empty">${icon('inbox')}<div>Aucun élément</div></div>` :
            `<table class="data-table">
              <thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}${showActions?'<th></th>':''}</tr></thead>
              <tbody>${items.map(it => `
                <tr>
                  ${columns.map(c => `<td data-label="${escapeHtml(c.label)}">${c.render(it)}</td>`).join('')}
                  ${showActions ? `<td class="actions">
                    <button class="btn-icon" title="Modifier" onclick="window['${fnId}'].onEdit('${it.id}')">${icon('edit')}</button>
                    <button class="btn-icon danger" title="Supprimer" onclick="window['${fnId}'].onDelete('${it.id}')">${icon('trash')}</button>
                  </td>` : ''}
                </tr>`).join('')}</tbody>
            </table>`}
        </div>
      </div>
    `;
  },
};
