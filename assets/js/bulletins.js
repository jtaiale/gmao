/* ============================================================
   Module Bulletins NOUT ZINFOS
   - Admin : CRUD complet (titre, numéro, date, information)
   - Technicien : lecture + commentaires
   - Suivi de lecture : tant qu'un technicien n'a pas ouvert un
     bulletin, il est compté comme non lu (badge nav).
   ============================================================ */

const Bulletins = {

  /* ---------- Helpers de comptage ---------- */
  unreadCountForTech() {
    if (!Auth.isTech()) return 0;
    return (DB.list('bulletins') || [])
      .filter(b => !(b.readBy || []).includes(Auth.current.id))
      .length;
  },
  totalCount() { return (DB.list('bulletins') || []).length; },

  /* =========================== LIST =========================== */
  list(scope) {
    setTimeout(() => this._wireToolbar(scope), 0);
    const canCreate = scope === 'admin' && Auth.can('bulletins', 'write');
    const counts = this._counts(scope);
    return `
      ${this._statusPills(counts, scope)}
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="bul-search" placeholder="Rechercher (n°, titre…)"></div>
          ${canCreate ? `<button class="btn" onclick="Bulletins.openModal()">${icon('plus')} Nouveau bulletin</button>` : ''}
        </div>
        <div class="card-body tight">
          <div id="bul-results">${this._table(this._filtered(scope), scope)}</div>
        </div>
      </div>
    `;
  },
  _counts(scope) {
    const items = DB.list('bulletins') || [];
    if (scope === 'tech') {
      const me = Auth.current.id;
      return {
        unread: items.filter(b => !(b.readBy || []).includes(me)).length,
        read:   items.filter(b => (b.readBy || []).includes(me)).length,
      };
    }
    // admin: nombre total + bulletins non lus par au moins un tech
    const techCount = DB.list('technicians').length;
    return {
      total: items.length,
      pending: items.filter(b => (b.readBy || []).length < techCount).length,
    };
  },
  _statusPills(counts, scope) {
    if (scope === 'tech') {
      return `
        <div class="btn-group" style="gap:8px;margin-bottom:14px">
          <span class="badge status-en_cours" style="padding:6px 12px;font-size:12px">
            ${icon('alert')} Non lus : <strong style="margin-left:4px">${counts.unread}</strong>
          </span>
          <span class="badge status-resolu" style="padding:6px 12px;font-size:12px">
            ${icon('check')} Lus : <strong style="margin-left:4px">${counts.read}</strong>
          </span>
        </div>
      `;
    }
    return `
      <div class="btn-group" style="gap:8px;margin-bottom:14px">
        <span class="badge status-en_cours" style="padding:6px 12px;font-size:12px">
          ${icon('alert')} À lire par certains techs : <strong style="margin-left:4px">${counts.pending}</strong>
        </span>
        <span class="badge status-resolu" style="padding:6px 12px;font-size:12px">
          ${icon('check')} Total : <strong style="margin-left:4px">${counts.total}</strong>
        </span>
      </div>
    `;
  },
  _filtered(scope) {
    const q = ($('#bul-search')?.value || '').toLowerCase().trim();
    let items = DB.list('bulletins') || [];
    return items
      .filter(b => !q || (b.number+' '+b.title).toLowerCase().includes(q))
      .sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  },
  _wireToolbar(scope) {
    $('#bul-search')?.addEventListener('input', () => {
      $('#bul-results').innerHTML = this._table(this._filtered(scope), scope);
    });
  },
  _table(items, scope) {
    if (items.length === 0) return `<div class="empty">${icon('inbox')}<div>Aucun bulletin</div></div>`;
    const base = scope === 'admin' ? '#/admin/bulletin/' : '#/tech/bulletin/';
    const me = Auth.current.id;
    return `<table class="data-table">
      <thead><tr><th>N°</th><th>Titre</th><th>Date</th>
        ${scope === 'tech' ? '<th>Statut</th>' : '<th>Lu par</th>'}
      </tr></thead>
      <tbody>${items.map(b => {
        const readBy = b.readBy || [];
        const techCount = DB.list('technicians').length;
        const isUnreadForMe = scope === 'tech' && !readBy.includes(me);
        const statusCell = scope === 'tech'
          ? `<td data-label="Statut">${isUnreadForMe
              ? '<span class="badge status-en_cours">Non lu</span>'
              : '<span class="badge status-resolu">Lu</span>'}</td>`
          : `<td data-label="Lu par"><span class="muted">${readBy.length} / ${techCount} technicien${techCount>1?'s':''}</span></td>`;
        return `
          <tr onclick="location.hash='${base}${b.id}'" style="cursor:pointer; ${isUnreadForMe ? 'background:var(--brand-lighter)' : ''}">
            <td data-label="N°"><span class="ticket-link">${b.number}</span></td>
            <td data-label="Titre">${escapeHtml(b.title)}${isUnreadForMe ? ' <span class="badge status-en_cours" style="margin-left:6px">NOUVEAU</span>' : ''}</td>
            <td data-label="Date">${b.date ? fmtDate(b.date) : fmtDate(b.createdAt)}</td>
            ${statusCell}
          </tr>`;
      }).join('')}</tbody>
    </table>`;
  },

  /* =========================== DETAIL =========================== */
  detail(id, scope) {
    const b = DB.get('bulletins', id);
    if (!b) return `<div class="card"><div class="card-body"><p>Bulletin introuvable.</p></div></div>`;
    // Mark as read (tech only)
    if (scope === 'tech' && Auth.isTech()) {
      DB.markBulletinRead(id, Auth.current.id);
    }
    const back = scope === 'admin' ? '#/admin/bulletins' : '#/tech/bulletins';
    const canEdit = scope === 'admin' && Auth.can('bulletins', 'write');
    setTimeout(() => this._wireDetail(id, scope), 0);

    const techCount = DB.list('technicians').length;
    const readCount = (b.readBy || []).length;
    const readers = (b.readBy || []).map(tid => DB.techName(tid));

    return `
      <div class="flex mb-2">
        <a href="${back}" class="btn btn-ghost btn-sm">${icon('back')} Retour</a>
        <h1 class="mt-0" style="flex:1">${escapeHtml(b.number)} — ${escapeHtml(b.title)}</h1>
        ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="Bulletins.openModal('${b.id}')">${icon('edit')} Modifier</button>` : ''}
        ${canEdit ? `<button class="btn btn-danger btn-sm" onclick="Bulletins.deleteOne('${b.id}')">${icon('trash')} Supprimer</button>` : ''}
      </div>

      <div class="card mb-2">
        <div class="card-body">
          <div class="detail-meta">
            <div class="meta-item"><div class="meta-label">Numéro</div><div class="meta-value"><code>${escapeHtml(b.number)}</code></div></div>
            <div class="meta-item"><div class="meta-label">Date du bulletin</div><div class="meta-value">${b.date ? fmtDate(b.date) : '—'}</div></div>
            <div class="meta-item"><div class="meta-label">Publié le</div><div class="meta-value">${fmtDateTime(b.createdAt)}</div></div>
            ${scope === 'admin' ? `<div class="meta-item"><div class="meta-label">Lu par</div><div class="meta-value">${readCount} / ${techCount} technicien${techCount>1?'s':''}</div></div>` : ''}
          </div>
          <h3>Information</h3>
          <p style="white-space:pre-wrap">${escapeHtml(b.info || '—')}</p>

          ${scope === 'admin' && readers.length > 0 ? `
            <div class="mt-2">
              <div class="meta-label" style="margin-bottom:6px">Lecteurs</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${readers.map(name => `<span class="tech-pill"><span class="tech-color" style="background:var(--success)"></span>${escapeHtml(name)}</span>`).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Commentaires</h2></div>
        <div class="card-body">
          <div class="comment-list">
            ${(b.comments && b.comments.length) ? b.comments.map(cm => `
              <div class="comment ${cm.role === 'tech' ? '' : 'client'}">
                <div class="comment-head">
                  <span class="comment-author">${escapeHtml(cm.author)} <span class="muted">(${cm.role === 'tech' ? 'technicien' : 'admin'})</span></span>
                  <span class="comment-date">${fmtDateTime(cm.date)}</span>
                </div>
                <div>${escapeHtml(cm.text)}</div>
              </div>`).join('') : '<p class="muted">Aucun commentaire pour le moment.</p>'}
          </div>
          <div class="form-group">
            <textarea id="bul-new-comment" class="textarea" placeholder="Ajouter un commentaire…"></textarea>
          </div>
          <button class="btn" id="bul-add-comment">${icon('plus')} Publier</button>
        </div>
      </div>
    `;
  },
  _wireDetail(id, scope) {
    $('#bul-add-comment')?.addEventListener('click', () => {
      const text = $('#bul-new-comment').value.trim();
      if (!text) return;
      DB.addBulletinComment(id, {
        author: Auth.current.name,
        role: scope === 'tech' ? 'tech' : 'admin',
        text,
      });
      toast('Commentaire ajouté');
      Router.render();
    });
  },

  /* =========================== ADMIN MODAL =========================== */
  openModal(id) {
    const b = id ? DB.get('bulletins', id) : null;
    openModal({
      title: b ? 'Modifier le bulletin' : 'Nouveau bulletin NOUT ZINFOS',
      size: 'lg',
      body: `
        <form id="bul-form">
          <div class="form-row">
            <div class="form-group"><label>Titre du bulletin *</label>
              <input class="input" name="title" required value="${b?escapeHtml(b.title):''}">
            </div>
            <div class="form-group"><label>Numéro du bulletin</label>
              <input class="input" name="number" value="${b?escapeHtml(b.number):''}" placeholder="auto si vide">
            </div>
          </div>
          <div class="form-group"><label>Date du bulletin</label>
            <input class="input" type="date" name="date" value="${b && b.date ? new Date(b.date).toISOString().slice(0,10) : ''}">
          </div>
          <div class="form-group"><label>Information *</label>
            <textarea class="textarea" name="info" rows="8" required placeholder="Contenu de l'information à diffuser aux techniciens">${b?escapeHtml(b.info||''):''}</textarea>
          </div>
        </form>
      `,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn" id="bul-save">${icon('check')} Enregistrer</button>`,
      onOpen(modal) {
        modal.parentElement.querySelector('#bul-save').onclick = () => {
          const data = Object.fromEntries(new FormData(modal.querySelector('#bul-form')));
          if (!data.title || !data.info) { toast('Champs requis manquants', 'error'); return; }
          data.date = data.date ? new Date(data.date).toISOString() : null;
          if (b) {
            // Garder le numéro existant si l'utilisateur n'a pas changé
            if (!data.number) data.number = b.number;
            DB.update('bulletins', b.id, data);
          } else {
            const payload = { ...data, createdBy: Auth.current.id };
            if (!payload.number) delete payload.number; // laisse createBulletin générer
            DB.createBulletin(payload);
          }
          closeModal();
          toast('Bulletin enregistré');
          Router.render();
        };
      }
    });
  },

  deleteOne(id) {
    confirmDialog('Supprimer définitivement ce bulletin ?', () => {
      DB.remove('bulletins', id);
      toast('Bulletin supprimé');
      location.hash = '#/admin/bulletins';
    });
  },
};
