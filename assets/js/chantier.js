/* ============================================================
   Module Chantier — fiche de chantier rattachée à un client + site
   - Admin : CRUD complet
   - Technicien : lecture seule + commentaires
   ============================================================ */

const Chantier = {

  /* =========================== LIST =========================== */
  list(scope) {
    setTimeout(() => this._wireToolbar(scope), 0);
    const canCreate = scope === 'admin' && Auth.can('chantiers', 'write');
    return `
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="cha-search" placeholder="Rechercher (n°, dénomination, client…)"></div>
          ${canCreate ? `<button class="btn" onclick="Chantier.openModal()">${icon('plus')} Nouveau chantier</button>` : ''}
        </div>
        <div class="card-body tight">
          <div id="cha-results">${this._table(this._filtered(scope), scope)}</div>
        </div>
      </div>
    `;
  },
  // Returns chantiers visible by current user, filtered by free-text query
  _filtered(scope) {
    const q = ($('#cha-search')?.value || '').toLowerCase().trim();
    let items = DB.list('chantiers') || [];
    if (scope === 'tech') {
      items = items.filter(c => (c.technicianIds || []).includes(Auth.current.id));
    }
    return items
      .filter(c => !q || (c.number+' '+c.name+' '+(c.numAffaire||'')+' '+DB.clientName(c.clientId)).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  _wireToolbar(scope) {
    $('#cha-search')?.addEventListener('input', () => {
      $('#cha-results').innerHTML = this._table(this._filtered(scope), scope);
    });
  },
  _table(items, scope) {
    if (items.length === 0) return `<div class="empty">${icon('inbox')}<div>Aucun chantier</div></div>`;
    const base = scope === 'admin' ? '#/admin/chantier/' : '#/tech/chantier/';
    const techPills = (ids) => (ids || [])
      .map(id => `<span class="tech-pill"><span class="tech-color" style="background:${DB.techColor(id)}"></span>${escapeHtml(DB.techName(id))}</span>`)
      .join(' ');
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Dénomination</th><th>Client / Site</th><th>Techniciens</th><th>Période</th><th>Durée</th><th>Heures (réalisées / budget)</th></tr></thead>
      <tbody>${items.map(c => {
        const nbT = (c.technicianIds || []).length;
        const dur = Number(c.duration) || 0;
        const budget = Number(c.hours)     || 0;
        const done   = Number(c.hoursDone) || 0;
        const over   = budget > 0 && done > budget;
        return `
        <tr onclick="location.hash='${base}${c.id}'" style="cursor:pointer">
          <td data-label="N°"><span class="ticket-link">${c.number}</span></td>
          <td data-label="Dénomination">${escapeHtml(c.name)}<br><small class="muted">${escapeHtml(c.numAffaire || '')}</small></td>
          <td data-label="Client">${escapeHtml(DB.clientName(c.clientId))}<br><small class="muted">${escapeHtml(DB.siteName(c.siteId))}</small></td>
          <td data-label="Techniciens">${nbT === 0 ? '<span class="muted">—</span>' : techPills(c.technicianIds)}</td>
          <td data-label="Période">${c.scheduledAt ? fmtDate(c.scheduledAt) : '<span class="muted">non planifié</span>'}</td>
          <td data-label="Durée">${dur ? dur + ' j' : '<span class="muted">—</span>'}</td>
          <td data-label="Heures">${budget > 0
            ? `<strong style="color:${over?'var(--danger)':'inherit'}">${done.toFixed(1)} h</strong> / ${budget.toFixed(1)} h`
            : `<strong>${done.toFixed(1)} h</strong> <span class="muted">/ —</span>`}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  },

  /* =========================== DETAIL =========================== */
  detail(id, scope) {
    const c = DB.get('chantiers', id);
    if (!c) return `<div class="card"><div class="card-body"><p>Chantier introuvable.</p></div></div>`;
    if (scope === 'tech' && !(c.technicianIds || []).includes(Auth.current.id)) {
      return `<div class="card"><div class="card-body"><p>Vous n'êtes pas affecté à ce chantier.</p><a class="btn" href="#/tech/chantiers">Retour</a></div></div>`;
    }
    const back = scope === 'admin' ? '#/admin/chantiers' : '#/tech/chantiers';
    const canEdit = scope === 'admin' && Auth.can('chantiers', 'write');
    setTimeout(() => this._wireDetail(id, scope), 0);

    return `
      <div class="flex mb-2">
        <a href="${back}" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">${escapeHtml(c.number)} — ${escapeHtml(c.name)}</h1>
        ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="Chantier.openModal('${c.id}')">${icon('edit')} Modifier</button>` : ''}
        ${canEdit ? `<button class="btn btn-danger btn-sm" onclick="Chantier.deleteOne('${c.id}')">${icon('trash')} Supprimer</button>` : ''}
      </div>

      <div class="detail-grid">
        <div>
          <div class="card mb-2">
            <div class="card-body">
              <div class="detail-meta">
                <div class="meta-item"><div class="meta-label">N° affaire</div><div class="meta-value"><code>${escapeHtml(c.numAffaire || '—')}</code></div></div>
                <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${escapeHtml(DB.clientName(c.clientId))}</div></div>
                <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${escapeHtml(DB.siteName(c.siteId))}</div></div>
                <div class="meta-item"><div class="meta-label">Date de début</div><div class="meta-value">${c.scheduledAt ? fmtDate(c.scheduledAt) : '<span class="muted">non planifié</span>'}</div></div>
                <div class="meta-item"><div class="meta-label">Durée</div><div class="meta-value">${c.duration || 0} jour${(c.duration||0) > 1 ? 's' : ''}</div></div>
                <div class="meta-item"><div class="meta-label">Budget heures</div><div class="meta-value">${(c.hours || 0).toFixed(1)} h</div></div>
                <div class="meta-item"><div class="meta-label">Créé le</div><div class="meta-value">${fmtDateTime(c.createdAt)}</div></div>
              </div>
              ${(c.technicianIds || []).length > 0 ? `
                <div class="meta-item mt-2">
                  <div class="meta-label">Techniciens affectés</div>
                  <div class="meta-value" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
                    ${c.technicianIds.map(id => `<span class="tech-pill"><span class="tech-color" style="background:${DB.techColor(id)}"></span>${escapeHtml(DB.techName(id))}</span>`).join('')}
                  </div>
                </div>` : ''}
              <h3>Description</h3>
              <p style="white-space:pre-wrap">${escapeHtml(c.description || '—')}</p>
              <h3>Tâches</h3>
              <p style="white-space:pre-wrap">${escapeHtml(c.tasks || '—')}</p>
            </div>
          </div>

          ${(() => {
            const budget    = Number(c.hours)     || 0;
            const done      = Number(c.hoursDone) || 0;
            const remaining = budget - done;
            const pct       = budget > 0 ? Math.min(100, Math.round((done / budget) * 100)) : 0;
            const over      = budget > 0 && remaining < 0;
            const barColor  = over ? 'var(--danger)' : (pct >= 90 ? 'var(--warning)' : 'var(--success)');
            const barWidth  = budget > 0 ? Math.min(100, (done / budget) * 100) : 0;
            const canEditHours = scope === 'admin' || (c.technicianIds || []).includes(Auth.current.id);
            return `
            <div class="card mb-2">
              <div class="card-header"><h2>${icon('clock')} Heures chantier</h2></div>
              <div class="card-body">
                <div class="kpi-grid" style="margin-bottom:14px">
                  <div class="kpi"><div class="kpi-icon">${icon('clock')}</div><div><div class="kpi-value">${budget.toFixed(1)} h</div><div class="kpi-label">Budget alloué</div></div></div>
                  <div class="kpi"><div class="kpi-icon warning">${icon('wrench')}</div><div><div class="kpi-value">${done.toFixed(1)} h</div><div class="kpi-label">Réalisées</div></div></div>
                  <div class="kpi"><div class="kpi-icon ${over?'danger':'success'}">${icon(over?'alert':'check')}</div><div><div class="kpi-value" style="color:${over?'var(--danger)':'var(--success)'}">${remaining.toFixed(1)} h</div><div class="kpi-label">${over ? 'Dépassement' : 'Marge restante'}</div></div></div>
                </div>
                ${budget > 0 ? `
                  <div style="background:var(--bg);border-radius:8px;height:14px;overflow:hidden;border:1px solid var(--border)">
                    <div style="height:100%;width:${barWidth}%;background:${barColor};transition:width .3s"></div>
                  </div>
                  <p class="muted" style="font-size:12px;margin:6px 0 12px">
                    ${pct}% du budget consommé.
                    ${over ? `<strong style="color:var(--danger)"> Dépassement de ${Math.abs(remaining).toFixed(1)} h.</strong>` : ''}
                  </p>
                ` : '<p class="muted" style="font-size:12px;margin:0 0 12px">Aucun budget saisi (modifiable par l\\'admin via la fiche chantier).</p>'}
                ${canEditHours ? `
                  <div class="form-row" style="gap:8px;align-items:flex-end">
                    <div class="form-group" style="flex:0 0 220px;margin-bottom:0">
                      <label>Saisir les heures réalisées</label>
                      <input class="input" type="number" min="0" step="0.25" id="cha-hours-input" value="${done}">
                    </div>
                    <button class="btn" id="cha-hours-save">${icon('check')} Enregistrer</button>
                  </div>
                ` : ''}
              </div>
            </div>`;
          })()}

          <div class="card mb-2">
            <div class="card-header">
              <h2>${icon('calendar')} Planifications</h2>
              ${canEdit ? `<button class="btn btn-sm" id="cha-add-sched">${icon('plus')} Ajouter une planification</button>` : ''}
            </div>
            <div class="card-body">
              ${(() => {
                const schedules = Array.isArray(c.schedules) ? [...c.schedules] : [];
                // Ligne legacy : scheduledAt + duration converti en heures
                if (c.scheduledAt) {
                  schedules.unshift({
                    id: 'legacy',
                    scheduledAt: c.scheduledAt,
                    durationHours: (c.duration || 1) * 8,
                    comment: 'Planning principal (depuis fiche)',
                  });
                }
                if (schedules.length === 0) return '<p class="muted">Aucune planification enregistrée.</p>';
                return `<table class="data-table" style="margin:-12px 0">
                  <thead><tr><th>Date</th><th>Durée (heures)</th><th>Commentaire</th><th></th></tr></thead>
                  <tbody>${schedules.map(s => `
                    <tr>
                      <td data-label="Date">${fmtDate(s.scheduledAt)}</td>
                      <td data-label="Durée">${(s.durationHours || 0).toFixed(1)} h</td>
                      <td data-label="Commentaire">${escapeHtml(s.comment || '')}</td>
                      <td class="actions">${canEdit && s.id !== 'legacy' ? `<button class="btn-icon danger" data-sched-del="${s.id}">${icon('trash')}</button>` : ''}</td>
                    </tr>`).join('')}</tbody>
                </table>`;
              })()}
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header">
              <h2>${icon('calendar')} Localisation & itinéraire</h2>
              <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="${gpsLink(c.lat, c.lng, c.address)}">${icon('calendar')} Itinéraire GPS</a>
            </div>
            <div class="card-body">
              <p class="muted" style="margin-top:0">${escapeHtml(c.address || '')}</p>
              <div id="chantier-map" style="height:280px;border-radius:6px;overflow:hidden;border:1px solid var(--border)"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2>Commentaires</h2></div>
            <div class="card-body">
              <div class="comment-list">
                ${(c.comments && c.comments.length) ? c.comments.map(cm => `
                  <div class="comment ${cm.role === 'tech' ? '' : 'client'}">
                    <div class="comment-head">
                      <span class="comment-author">${escapeHtml(cm.authorName || cm.author)} <span class="muted">(${cm.role === 'tech' ? 'technicien' : 'admin'})</span></span>
                      <span class="comment-date">${fmtDateTime(cm.createdAt || cm.date)}</span>
                    </div>
                    <div>${escapeHtml(cm.text)}</div>
                  </div>`).join('') : '<p class="muted">Aucun commentaire pour le moment.</p>'}
              </div>
              <div class="form-group">
                <textarea id="cha-new-comment" class="textarea" placeholder="Ajouter un commentaire…"></textarea>
              </div>
              <button class="btn" id="cha-add-comment">${icon('plus')} Publier</button>
            </div>
          </div>
        </div>

        <aside>
          <div class="card mb-2">
            <div class="card-header"><h2>Contact chantier</h2></div>
            <div class="card-body">
              <div class="meta-item"><div class="meta-label">Nom</div><div class="meta-value">${escapeHtml(c.contactName || '—')}</div></div>
              <div class="meta-item mt-2"><div class="meta-label">Téléphone</div><div class="meta-value">${c.contactPhone ? `<a href="tel:${escapeHtml(c.contactPhone.replace(/\s+/g,''))}">${escapeHtml(c.contactPhone)}</a>` : '—'}</div></div>
              <div class="meta-item mt-2"><div class="meta-label">Email</div><div class="meta-value">${c.contactEmail ? `<a href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a>` : '—'}</div></div>
            </div>
          </div>
        </aside>
      </div>
    `;
  },
  _wireDetail(id, scope) {
    const c = DB.get('chantiers', id);
    const mapEl = document.getElementById('chantier-map');
    if (mapEl && c) renderMap(mapEl, c.lat, c.lng, c.name);

    $('#cha-add-comment')?.addEventListener('click', () => {
      const text = $('#cha-new-comment').value.trim();
      if (!text) return;
      DB.addChantierComment(id, {
        author: Auth.current.name,
        role: scope === 'tech' ? 'tech' : 'admin',
        text,
      });
      toast('Commentaire ajouté');
      Router.render();
    });

    $('#cha-hours-save')?.addEventListener('click', async () => {
      const val = parseFloat($('#cha-hours-input').value);
      if (isNaN(val) || val < 0) { toast('Heures invalides', 'error'); return; }
      const btn = $('#cha-hours-save'); if (btn) btn.disabled = true;
      try {
        await DB.setChantierHours(id, val);
        toast('Heures enregistrées');
      } catch (_) { /* déjà toastée */ }
      finally { if (btn) btn.disabled = false; }
    });

    // Ajout d'une planification
    $('#cha-add-sched')?.addEventListener('click', () => Chantier._openScheduleModal(id));
    // Suppression d'une planification
    document.querySelectorAll('[data-sched-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const schedId = btn.getAttribute('data-sched-del');
        confirmDialog('Supprimer cette planification ?', async () => {
          await DB.removeChantierSchedule(id, schedId);
          toast('Planification supprimée');
        });
      });
    });
  },

  _openScheduleModal(chantierId) {
    openModal({
      title: 'Nouvelle planification',
      body: `
        <form id="sch-form">
          <div class="form-row">
            <div class="form-group"><label>Date *</label>
              <input class="input" type="date" name="scheduledAt" required>
            </div>
            <div class="form-group"><label>Durée (heures) *</label>
              <input class="input" type="number" name="durationHours" min="0" step="0.5" value="8" required>
            </div>
          </div>
          <div class="form-group"><label>Commentaire</label>
            <input class="input" name="comment" placeholder="Optionnel">
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn" id="sch-save">${icon('check')} Ajouter</button>
      `,
      onOpen(modal) {
        modal.parentElement.querySelector('#sch-save').onclick = async () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#sch-form')));
          if (!data.scheduledAt) { toast('Date requise', 'error'); return; }
          try {
            await DB.addChantierSchedule(chantierId, {
              scheduledAt:   new Date(data.scheduledAt).toISOString(),
              durationHours: parseFloat(data.durationHours) || 8,
              comment:       data.comment || undefined,
            });
            closeModal();
            toast('Planification ajoutée');
            Router.render();
          } catch (_) { /* déjà toastée */ }
        };
      },
    });
  },

  /* =========================== ADMIN MODAL =========================== */
  openModal(id) {
    const c = id ? DB.get('chantiers', id) : null;
    const clients = DB.list('clients');
    const clientOpts = ['<option value="">— Sélectionner —</option>',
      ...clients.map(cl => `<option value="${cl.id}" ${c && c.clientId===cl.id?'selected':''}>${escapeHtml(cl.name)}</option>`)
    ].join('');

    openModal({
      title: c ? 'Modifier le chantier' : 'Nouveau chantier',
      size: 'lg',
      body: `
        <form id="cha-form">
          <div class="form-row">
            <div class="form-group"><label>Dénomination du chantier *</label>
              <input class="input" name="name" required value="${c?escapeHtml(c.name):''}">
            </div>
            <div class="form-group"><label>Numéro d'affaire</label>
              <input class="input" name="numAffaire" value="${c?escapeHtml(c.numAffaire||''):''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Client *</label><select class="select" name="clientId" required>${clientOpts}</select></div>
            <div class="form-group"><label>Site *</label><select class="select" name="siteId" id="cha-site" required></select></div>
          </div>
          <div class="form-group"><label>Description</label>
            <textarea class="textarea" name="description" rows="3">${c?escapeHtml(c.description||''):''}</textarea>
          </div>
          <h3 style="margin-top:8px">Contact</h3>
          <div class="form-row">
            <div class="form-group"><label>Nom du contact</label><input class="input" name="contactName" value="${c?escapeHtml(c.contactName||''):''}"></div>
            <div class="form-group"><label>Téléphone du contact</label><input class="input" name="contactPhone" value="${c?escapeHtml(c.contactPhone||''):''}"></div>
          </div>
          <div class="form-group"><label>Email du contact</label>
            <input class="input" type="email" name="contactEmail" value="${c?escapeHtml(c.contactEmail||''):''}">
          </div>
          <h3 style="margin-top:8px">Adresse</h3>
          <div class="form-group"><label>Adresse postale</label>
            <input class="input" name="address" value="${c?escapeHtml(c.address||''):''}" placeholder="Rue, ville">
          </div>
          <div class="form-row">
            <div class="form-group"><label>Latitude</label><input class="input" type="number" step="0.000001" name="lat" value="${c && c.lat != null ? c.lat : ''}" placeholder="ex : -21.0553"></div>
            <div class="form-group"><label>Longitude</label><input class="input" type="number" step="0.000001" name="lng" value="${c && c.lng != null ? c.lng : ''}" placeholder="ex : 55.2236"></div>
          </div>
          <div class="form-group"><label>Tâches</label>
            <textarea class="textarea" name="tasks" rows="5" placeholder="Liste des tâches à réaliser sur le chantier">${c?escapeHtml(c.tasks||''):''}</textarea>
          </div>
          <h3 style="margin-top:8px">Planification</h3>
          <div class="form-row">
            <div class="form-group"><label>Date de début</label>
              <input class="input" type="date" name="scheduledAt" value="${c && c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0,10) : ''}">
            </div>
            <div class="form-group"><label>Durée (jours)</label>
              <input class="input" type="number" min="0" step="1" name="duration" value="${c && c.duration != null ? c.duration : 1}">
            </div>
            <div class="form-group"><label>Nombre d'heures chantier (budget)</label>
              <input class="input" type="number" min="0" step="0.5" name="hours" value="${c && c.hours != null ? c.hours : 0}">
            </div>
          </div>
          <div class="form-group">
            <label>Techniciens affectés</label>
            <div id="cha-tech-list" style="display:flex;flex-wrap:wrap;gap:8px;border:1px solid var(--border);border-radius:6px;padding:10px;background:#fff">
              ${DB.list('technicians').map(t => {
                const checked = c && (c.technicianIds || []).includes(t.id) ? 'checked' : '';
                return `
                  <label style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;background:var(--bg)">
                    <input type="checkbox" name="techId" value="${t.id}" ${checked}>
                    <span class="tech-color" style="background:${t.color}"></span>
                    <span>${escapeHtml(t.name)}</span>
                  </label>`;
              }).join('')}
            </div>
            <p class="muted" style="font-size:12px;margin-top:4px">Cochez tous les techniciens qui interviennent sur ce chantier.</p>
          </div>
        </form>
      `,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="cha-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        const cliSel  = modal.querySelector('[name="clientId"]');
        const siteSel = modal.querySelector('#cha-site');
        const refreshSites = () => {
          const cid = cliSel.value;
          const sites = DB.list('sites').filter(s => s.clientId === cid);
          siteSel.innerHTML = sites.length === 0
            ? '<option value="">— Aucun site —</option>'
            : ['<option value="">— Sélectionner —</option>',
               ...sites.map(s => `<option value="${s.id}" ${c && s.id===c.siteId?'selected':''}>${escapeHtml(s.name)}</option>`)
              ].join('');
        };
        cliSel.addEventListener('change', refreshSites);
        refreshSites();
        // Autofill address/coords from selected site (helper)
        siteSel.addEventListener('change', () => {
          const s = DB.get('sites', siteSel.value);
          if (s && !modal.querySelector('[name="address"]').value) modal.querySelector('[name="address"]').value = s.address || '';
          if (s && s.lat != null && !modal.querySelector('[name="lat"]').value) modal.querySelector('[name="lat"]').value = s.lat;
          if (s && s.lng != null && !modal.querySelector('[name="lng"]').value) modal.querySelector('[name="lng"]').value = s.lng;
          if (s && !modal.querySelector('[name="contactName"]').value)  modal.querySelector('[name="contactName"]').value  = s.contact || '';
          if (s && !modal.querySelector('[name="contactPhone"]').value) modal.querySelector('[name="contactPhone"]').value = s.contactPhone || '';
          if (s && !modal.querySelector('[name="contactEmail"]').value) modal.querySelector('[name="contactEmail"]').value = s.contactEmail || '';
        });

        modal.parentElement.querySelector('#cha-save').onclick = async () => {
          const form = modal.querySelector('#cha-form');
          const data = Object.fromEntries(new FormData(form));
          if (!data.name || !data.clientId || !data.siteId) { toast('Champs requis manquants', 'error'); return; }
          data.lat = data.lat === '' ? null : parseFloat(data.lat);
          data.lng = data.lng === '' ? null : parseFloat(data.lng);
          data.duration = data.duration === '' ? 0 : parseInt(data.duration);
          data.hours = data.hours === '' ? 0 : parseFloat(data.hours);
          data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : null;
          // Collect checked technician IDs (FormData only keeps last value for repeated names)
          data.technicianIds = [...form.querySelectorAll('input[name="techId"]:checked')].map(cb => cb.value);
          delete data.techId;
          try {
            if (c) {
              DB.update('chantiers', c.id, data);
            } else {
              await DB.createChantier({ ...data, createdBy: Auth.current.id });
            }
            closeModal();
            toast('Chantier enregistré');
            Router.render();
          } catch (_) { /* erreur déjà toastée */ }
        };
      }
    });
  },

  deleteOne(id) {
    confirmDialog('Supprimer définitivement ce chantier ?', () => {
      DB.remove('chantiers', id);
      toast('Chantier supprimé');
      location.hash = '#/admin/chantiers';
    });
  },
};
