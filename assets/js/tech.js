/* ============================================================
   Vues du portail technicien
   ============================================================ */
const TechViews = {

  _myTickets() {
    const me = Auth.current.id;
    return DB.list('tickets').filter(t => DB.ticketHasTech(t, me) || t.createdBy === me);
  },

  /* =========================== DASHBOARD =========================== */
  dashboard() {
    const tickets = this._myTickets();
    const todayStr = new Date().toDateString();
    const todays = tickets.filter(t => t.scheduledAt && new Date(t.scheduledAt).toDateString() === todayStr);
    const open = tickets.filter(t => !['resolu','cloture'].includes(t.status));
    const monthHours = tickets
      .filter(t => t.completedAt && new Date(t.completedAt).getMonth() === new Date().getMonth())
      .reduce((s,t) => s + (Number(t.hours)||0), 0);

    const upcoming = tickets
      .filter(t => t.scheduledAt && !['resolu','cloture'].includes(t.status))
      .sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, 6);

    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-icon warning">${icon('calendar')}</div><div><div class="kpi-value">${todays.length}</div><div class="kpi-label">Interventions du jour</div></div></div>
        <div class="kpi"><div class="kpi-icon">${icon('inbox')}</div><div><div class="kpi-value">${open.length}</div><div class="kpi-label">Tickets en cours</div></div></div>
        <div class="kpi"><div class="kpi-icon success">${icon('check')}</div><div><div class="kpi-value">${tickets.length - open.length}</div><div class="kpi-label">Terminés</div></div></div>
        <div class="kpi"><div class="kpi-icon">${icon('clock')}</div><div><div class="kpi-value">${monthHours.toFixed(1)} h</div><div class="kpi-label">Heures ce mois</div></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Prochaines interventions</h2>
          <a href="#/tech/tickets" class="btn btn-secondary btn-sm">Voir tous mes tickets</a>
        </div>
        <div class="card-body tight">
          ${upcoming.length === 0 ? `<div class="empty">${icon('inbox')}<div>Aucune intervention planifiée</div></div>` :
            `<table class="data-table">
              <thead><tr><th>N°</th><th>Date</th><th>Client / Site</th><th>Titre</th><th>Priorité</th><th>Statut</th></tr></thead>
              <tbody>${upcoming.map(t => `
                <tr onclick="location.hash='#/tech/ticket/${t.id}'" style="cursor:pointer">
                  <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
                  <td data-label="Date">${fmtDateTime(t.scheduledAt)}</td>
                  <td data-label="Client">${escapeHtml(DB.clientName(t.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(t.siteId))}</small></td>
                  <td data-label="Titre">${escapeHtml(t.title)}</td>
                  <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
                  <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
                </tr>`).join('')}</tbody>
            </table>`}
        </div>
      </div>
    `;
  },

  /* =========================== PLANNING GRAPHIQUE =========================== */
  planningGraphical(offset = 0, viewMode) {
    const mode = viewMode === 'month' ? 'month' : 'week';
    return mode === 'month' ? this._techPlanningMonth(parseInt(offset)||0) : this._techPlanningWeek(parseInt(offset)||0);
  },

  _techPlanningToolbar(mode, offset, label) {
    const w = mode === 'week';
    return `
      <div class="planning-controls">
        <button class="btn btn-secondary btn-sm" id="tech-prev">${icon('back')} Précédent</button>
        <button class="btn btn-secondary btn-sm" id="tech-today">Aujourd'hui</button>
        <button class="btn btn-secondary btn-sm" id="tech-next">Suivant ${icon('back')}</button>
        <strong>${escapeHtml(label)}</strong>
        <div style="margin-left:auto;display:flex;gap:4px;background:var(--bg);padding:2px;border-radius:6px">
          <a class="btn btn-sm ${w?'':'btn-secondary'}" href="#/tech/planning/week/0">Semaine</a>
          <a class="btn btn-sm ${w?'btn-secondary':''}" href="#/tech/planning/month/0">Mois</a>
        </div>
      </div>
    `;
  },

  _techPlanningWeek(off) {
    const me = Auth.current.id;
    const monday = this._mondayOf(new Date(), off);
    const days = Array.from({length: 7}, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
    });
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const eventsFor = (day) => DB.list('tickets').filter(t => DB.ticketHasTech(t, me) && DB.ticketCoversDay(t, day));
    const chantiersFor = (day) => (DB.list('chantiers') || []).filter(c => DB.chantierCoversDay(c, me, day));
    const myColor = DB.techColor(me);

    setTimeout(() => {
      $('#tech-prev') ?.addEventListener('click', () => location.hash = `#/tech/planning/week/${off - 1}`);
      $('#tech-next') ?.addEventListener('click', () => location.hash = `#/tech/planning/week/${off + 1}`);
      $('#tech-today')?.addEventListener('click', () => location.hash = `#/tech/planning/week/0`);
    }, 0);

    return `
      ${this._techPlanningToolbar('week', off,
        `Semaine du ${days[0].toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}`)}

      <div class="planning-grid mb-2">
        <table class="planning-table">
          <thead>
            <tr>${days.map((d,i) => {
              const h = holidayOn(d);
              return `<th class="${h?'pl-holiday':''}">${dayLabels[i]} ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}${h?`<br><small style="color:var(--danger);font-weight:400">${escapeHtml(h.name)}</small>`:''}</th>`;
            }).join('')}</tr>
          </thead>
          <tbody>
            <tr>${days.map(d => {
              const wknd = d.getDay() === 0 || d.getDay() === 6;
              const hol = holidayOn(d);
              const lv  = DB.leaveOn(me, d);
              const cls = `planning-cell ${wknd?'pl-weekend':''} ${hol?'pl-holiday':''} ${lv?'pl-leave':''}`;
              if (lv) return `<td class="${cls}"><span class="pl-leave-badge" title="${escapeHtml(lv.comment||'')}">${escapeHtml(_leaveLabel(lv.type))}</span></td>`;
              return `<td class="${cls}">
                ${eventsFor(d).map(ev => `
                  <a class="planning-event" style="background:${myColor}" href="#/tech/ticket/${ev.id}">
                    <span class="num">${ev.number}</span>
                    <span class="title">${escapeHtml(ev.title.slice(0, 32))}${ev.title.length>32?'…':''}</span>
                  </a>`).join('')}
                ${chantiersFor(d).map(ch => `
                  <a class="planning-chantier" href="#/tech/chantier/${ch.id}" title="${escapeHtml(ch.name)}">
                    <span class="num">${ch.number}</span><span class="tag">CHA</span>
                    <span class="title">${escapeHtml(ch.name.slice(0, 28))}${ch.name.length>28?'…':''}</span>
                  </a>`).join('')}
              </td>`;
            }).join('')}</tr>
          </tbody>
        </table>
      </div>
    `;
  },

  _techPlanningMonth(off) {
    const me = Auth.current.id;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const start = new Date(first);
    const dow = (start.getDay() || 7) - 1;
    start.setDate(start.getDate() - dow);
    start.setHours(0,0,0,0);
    const cells = Array.from({length: 42}, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
    const myColor = DB.techColor(me);
    const monthLabel = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    setTimeout(() => {
      $('#tech-prev') ?.addEventListener('click', () => location.hash = `#/tech/planning/month/${off - 1}`);
      $('#tech-next') ?.addEventListener('click', () => location.hash = `#/tech/planning/month/${off + 1}`);
      $('#tech-today')?.addEventListener('click', () => location.hash = `#/tech/planning/month/0`);
    }, 0);

    const dayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    return `
      ${this._techPlanningToolbar('month', off, monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1))}

      <div class="planning-month mb-2">
        <div class="pl-month-head">${dayHeaders.map(h => `<div>${h}</div>`).join('')}</div>
        <div class="pl-month-grid">
          ${cells.map(d => {
            const inMonth = d.getMonth() === month;
            const isToday = (new Date()).toDateString() === d.toDateString();
            const hol = holidayOn(d);
            const lv  = DB.leaveOn(me, d);
            const evs = DB.list('tickets').filter(t => DB.ticketHasTech(t, me) && DB.ticketCoversDay(t, d));
            const chs = (DB.list('chantiers') || []).filter(c => DB.chantierCoversDay(c, me, d));
            const items = [
              ...evs.map(ev => ({ kind: 't', id: ev.id, label: ev.number, title: ev.title })),
              ...chs.map(ch => ({ kind: 'c', id: ch.id, label: ch.number, title: ch.name })),
            ];
            const max = 3;
            const visible = items.slice(0, max);
            const more = items.length - visible.length;
            return `
              <div class="pl-month-cell ${inMonth?'':'pl-out'} ${isToday?'pl-today':''} ${hol?'pl-holiday':''}">
                <div class="pl-month-day">
                  <span class="pl-day-num">${d.getDate()}</span>
                  ${hol ? `<span class="pl-day-holiday" title="${escapeHtml(hol.name)}">${escapeHtml(hol.name.slice(0,14))}${hol.name.length>14?'…':''}</span>` : ''}
                </div>
                ${lv ? `<span class="pl-leave-badge" title="${escapeHtml(lv.comment||'')}">${escapeHtml(_leaveLabel(lv.type))}</span>` : ''}
                ${visible.map(it => `
                  <a class="pl-month-event" style="background:${it.kind==='c'?'#6d28d9':myColor}" href="#/tech/${it.kind==='c'?'chantier':'ticket'}/${it.id}" title="${escapeHtml(it.label+' — '+it.title)}">
                    ${it.kind==='c'?'<span class="tag">CHA</span>':''}<span class="num">${escapeHtml(it.label.slice(0,12))}</span>
                  </a>`).join('')}
                ${more > 0 ? `<div class="pl-month-more">+${more}</div>` : ''}
              </div>`;
          }).join('')}
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

  /* =========================== TICKETS LIST =========================== */
  tickets() {
    setTimeout(() => this._wireToolbar(), 0);
    return `
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="tt-search" placeholder="Rechercher (n°, titre, client…)"></div>
          <div class="filters">
            <select class="select" id="tt-status">
              <option value="">Tous statuts</option>
              ${STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
            </select>
          </div>
          <button class="btn" onclick="TechViews.openTicketModal()">${icon('plus')} Nouveau ticket</button>
        </div>
        <div class="card-body tight">
          <div id="tt-results">${this._table(this._filtered())}</div>
        </div>
      </div>
    `;
  },
  _filtered() {
    const q  = ($('#tt-search')?.value || '').toLowerCase().trim();
    const st = $('#tt-status')?.value || '';
    return this._myTickets()
      .filter(t => !st || t.status === st)
      .filter(t => !q || (t.number+' '+t.title+' '+DB.clientName(t.clientId)+' '+DB.siteName(t.siteId)).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  _wireToolbar() {
    const refresh = () => { $('#tt-results').innerHTML = this._table(this._filtered()); };
    ['#tt-search', '#tt-status'].forEach(s => $(s)?.addEventListener('input', refresh));
  },
  _table(tickets) {
    if (tickets.length === 0) return `<div class="empty">${icon('inbox')}<div>Aucun ticket</div></div>`;
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Client / Site</th><th>Priorité</th><th>Statut</th><th>Planifié</th><th>H</th></tr></thead>
      <tbody>${tickets.map(t => `
        <tr onclick="location.hash='#/tech/ticket/${t.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${t.number}</span></td>
          <td data-label="Titre">${escapeHtml(t.title)}</td>
          <td data-label="Client">${escapeHtml(DB.clientName(t.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(t.siteId))}</small></td>
          <td data-label="Priorité"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></td>
          <td data-label="Statut"><span class="badge status-${t.status}">${DB.statusLabel(t.status)}</span></td>
          <td data-label="Planifié">${t.scheduledAt ? fmtDate(t.scheduledAt) : '—'}</td>
          <td data-label="Heures">${(t.hours || 0).toFixed(1)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },

  /* =========================== TICKET DETAIL =========================== */
  ticketDetail(id) {
    const t = DB.get('tickets', id);
    if (!t) return `<div class="card"><div class="card-body"><p>Ticket introuvable.</p><a class="btn" href="#/tech/tickets">Retour</a></div></div>`;
    if (!DB.ticketHasTech(t, Auth.current.id) && t.createdBy !== Auth.current.id) {
      return `<div class="card"><div class="card-body"><p>Vous n'avez pas accès à ce ticket.</p><a class="btn" href="#/tech/tickets">Retour</a></div></div>`;
    }

    setTimeout(() => this._wireDetail(id), 0);

    // Statuts autorisés pour le technicien : nouveau, en_cours, résolu (pas planifié ni clôturé)
    const TECH_STATUSES = STATUSES.filter(s => !['planifie','cloture'].includes(s.id));
    // Si le ticket est déjà planifié, on garde l'option pour ne pas perdre la valeur
    if (t.status === 'planifie' && !TECH_STATUSES.find(s => s.id === 'planifie')) {
      TECH_STATUSES.unshift({ id: 'planifie', label: 'Planifié' });
    }
    const statusOpts = TECH_STATUSES.map(s => `<option value="${s.id}" ${s.id===t.status?'selected':''}>${s.label}</option>`).join('');

    const site = DB.get('sites', t.siteId);
    return `
      <div class="flex mb-2">
        <a href="#/tech/tickets" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">Ticket ${escapeHtml(t.number)}</h1>
        <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="${gpsLink(site && site.lat, site && site.lng, site && site.address)}">${icon('calendar')} GPS</a>
        <button class="btn btn-secondary btn-sm" onclick="exportTicketPDF(DB.get('tickets','${t.id}'))">${icon('download')} PDF</button>
      </div>

      <div class="detail-grid">
        <div>
          <div class="card mb-2">
            <div class="card-body">
              <h2 style="margin-bottom:14px">${escapeHtml(t.title)}</h2>
              <div class="detail-meta">
                <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${escapeHtml(DB.clientName(t.clientId))}</div></div>
                <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(t.siteId))}</div></div>
                <div class="meta-item"><div class="meta-label">Équipement</div><div class="meta-value">${t.productId ? escapeHtml(DB.productName(t.productId)) : '—'}</div></div>
                <div class="meta-item"><div class="meta-label">Priorité</div><div class="meta-value"><span class="badge priority-${t.priority}">${DB.priorityLabel(t.priority)}</span></div></div>
                <div class="meta-item"><div class="meta-label">Créé le</div><div class="meta-value">${fmtDateTime(t.createdAt)}</div></div>
                <div class="meta-item"><div class="meta-label">Période</div><div class="meta-value">${t.scheduledAt ? fmtDate(t.scheduledAt) + (t.scheduledEnd && t.scheduledEnd !== t.scheduledAt ? ' → ' + fmtDate(t.scheduledEnd) : '') : 'Non planifiée'}</div></div>
                ${t.completedAt ? `<div class="meta-item"><div class="meta-label">Terminé le</div><div class="meta-value">${fmtDateTime(t.completedAt)}</div></div>` : ''}
                <div class="meta-item"><div class="meta-label">Heures</div><div class="meta-value">${(t.hours || 0).toFixed(1)} h</div></div>
                <div class="meta-item"><div class="meta-label">Déplacements</div><div class="meta-value">${t.tripCount || 0}</div></div>
                <div class="meta-item"><div class="meta-label">Techniciens</div><div class="meta-value">${(() => {
                  const ids = DB.ticketTechs(t);
                  return ids.length ? ids.map(id => `<span class="tech-pill"><span class="tech-color" style="background:${DB.techColor(id)}"></span>${escapeHtml(DB.techName(id))}</span>`).join(' ') : 'Non affecté';
                })()}</div></div>
              </div>
              <h3>Description (client)</h3>
              <p style="white-space:pre-wrap">${escapeHtml(t.description)}</p>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header"><h2>${icon('calendar')} Localisation & contact</h2></div>
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
              <textarea id="intervention-desc" class="textarea" rows="5" placeholder="Diagnostic, actions menées, pièces remplacées…">${escapeHtml(t.interventionDescription || '')}</textarea>
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
                <p class="muted">Faites signer le client pour valider l'intervention.</p>
                <button class="btn" onclick="AdminViews.openSignatureModal('${t.id}','client')">${icon('edit')} Recueillir la signature client</button>
              `}
              <hr style="border:0;border-top:1px solid var(--border);margin:14px 0">
              <h3 style="margin-bottom:6px">Votre signature</h3>
              ${t.techSignature ? `
                <img src="${t.techSignature}" alt="Signature technicien" style="max-width:100%;height:auto;border:1px solid var(--border);border-radius:6px;background:#fff">
                <p class="muted mt-1">Signée le ${fmtDateTime(t.techSignatureDate)}</p>
                <button class="btn btn-secondary btn-sm" onclick="AdminViews.openSignatureModal('${t.id}','tech')">${icon('edit')} Nouvelle signature</button>
              ` : `
                <p class="muted">Apposez votre signature pour valider l'intervention.</p>
                <button class="btn" onclick="AdminViews.openSignatureModal('${t.id}','tech')">${icon('edit')} Apposer ma signature</button>
              `}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Commentaires & échanges</h2></div>
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
                <textarea id="new-comment" class="textarea" placeholder="Note d'intervention, info pour le client…"></textarea>
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
                <label>Date d'intervention</label>
                <input type="datetime-local" class="input" id="t-edit-sched" value="${inputDate(t.scheduledAt)}">
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
  _wireDetail(id) {
    const t = DB.get('tickets', id);
    const site = t ? DB.get('sites', t.siteId) : null;
    const mapEl = document.getElementById('ticket-map');
    if (mapEl && site) renderMap(mapEl, site.lat, site.lng, site.name);

    $('#save-tracking')?.addEventListener('click', () => {
      const status = $('#t-edit-status').value;
      const t = DB.get('tickets', id);
      const patch = {
        status,
        scheduledAt: $('#t-edit-sched').value ? new Date($('#t-edit-sched').value).toISOString() : null,
        hours: parseFloat($('#t-edit-hours').value) || 0,
        tripCount: parseInt($('#t-edit-trips').value) || 0,
      };
      if (status === 'resolu' && !t.completedAt) {
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
      DB.addComment(id, { author: Auth.current.name, role: 'tech', text });
      toast('Commentaire ajouté');
      Router.render();
    });
  },

  /* =========================== NEW TICKET =========================== */
  openTicketModal() {
    const clients = DB.list('clients');
    const clientOpts = ['<option value="">— Sélectionner —</option>',
      ...clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    ].join('');
    const prioOpts = PRIORITIES.map(p => `<option value="${p.id}" ${p.id==='normale'?'selected':''}>${p.label}</option>`).join('');

    openModal({
      title: 'Nouveau ticket d\'intervention',
      size: 'lg',
      body: `
        <form id="tech-ticket-form">
          <div class="form-row">
            <div class="form-group"><label>Client</label><select class="select" name="clientId" required>${clientOpts}</select></div>
            <div class="form-group"><label>Site</label><select class="select" name="siteId" id="tt-site" required></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Équipement (optionnel)</label><select class="select" name="productId" id="tt-prod"><option value="">— Aucun —</option></select></div>
            <div class="form-group"><label>Priorité</label><select class="select" name="priority" required>${prioOpts}</select></div>
          </div>
          <div class="form-group"><label>Titre</label><input class="input" name="title" required placeholder="Ex : Intervention sur site"></div>
          <div class="form-group"><label>Description</label><textarea class="textarea" name="description" rows="5" required></textarea></div>
        </form>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn" id="tt-save">${icon('check')} Créer le ticket</button>
      `,
      onOpen(modal) {
        const cliSel = modal.querySelector('[name="clientId"]');
        const siteSel = modal.querySelector('#tt-site');
        const prodSel = modal.querySelector('#tt-prod');
        const refreshProducts = () => {
          const cid = cliSel.value, sid = siteSel.value;
          const prods = DB.list('products').filter(p => (!cid || p.clientId === cid) && (!sid || p.siteId === sid));
          prodSel.innerHTML = ['<option value="">— Aucun —</option>',
            ...prods.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
          ].join('');
        };
        const refreshSites = () => {
          const cid = cliSel.value;
          const sites = DB.list('sites').filter(s => s.clientId === cid);
          siteSel.innerHTML = sites.length === 0
            ? '<option value="">— Aucun site —</option>'
            : ['<option value="">— Sélectionner —</option>', ...sites.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)].join('');
          refreshProducts();
        };
        cliSel.addEventListener('change', refreshSites);
        siteSel.addEventListener('change', refreshProducts);
        refreshSites();

        modal.parentElement.querySelector('#tt-save').onclick = async () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#tech-ticket-form')));
          if (!data.clientId || !data.siteId || !data.title) { toast('Champs obligatoires manquants', 'error'); return; }
          try {
            const t = await DB.createTicket({
              ...data,
              createdBy: Auth.current.id,
              technicianIds: [Auth.current.id],
              status: 'en_cours',
            });
            toast(`Ticket ${t.number} créé`);
            closeModal();
            location.hash = `#/tech/ticket/${t.id}`;
          } catch (_) { /* erreur déjà toastée */ }
        };
      }
    });
  },
};
