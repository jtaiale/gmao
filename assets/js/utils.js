/* ============================================================
   Helpers UI — modal, toast, formatage, icônes
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...opts });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 30) return `il y a ${j} j`;
  return fmtDate(iso);
}
function inputDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- Toast ---------- */
function toast(msg, type = 'success', duration = 3000) {
  let cont = $('.toast-container');
  if (!cont) {
    cont = document.createElement('div');
    cont.className = 'toast-container';
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon('check')} <span>${escapeHtml(msg)}</span>`;
  cont.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .2s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 200);
  }, duration);
}

/* ---------- Modal ---------- */
function openModal({ title, body, footer, size, onOpen }) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal ${size === 'lg' ? 'lg' : ''}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="btn-icon modal-close" aria-label="Fermer">${icon('x')}</button>
      </div>
      <div class="modal-body">${body || ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(back);
  back.addEventListener('click', e => { if (e.target === back) closeModal(); });
  $('.modal-close', back).addEventListener('click', closeModal);
  if (onOpen) onOpen(back.querySelector('.modal'));
  return back;
}
function closeModal() {
  $$('.modal-backdrop').forEach(m => m.remove());
}

function confirmDialog(message, onYes) {
  openModal({
    title: 'Confirmation',
    body: `<p>${escapeHtml(message)}</p>`,
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Annuler</button>
      <button class="btn btn-danger" data-act="ok">Confirmer</button>
    `,
    onOpen(modal) {
      modal.querySelector('[data-act="cancel"]').onclick = closeModal;
      modal.querySelector('[data-act="ok"]').onclick = () => { closeModal(); onYes(); };
    }
  });
}

/* ---------- CSV export ---------- */
function downloadCSV(filename, rows) {
  if (!rows.length) { toast('Aucune donnée à exporter', 'warning'); return; }
  const headers = Object.keys(rows[0]);
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => esc(r[h])).join(';'))
  ].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Export téléchargé', 'success');
}

/* ---------- Stockage localStorage : suivi de l'occupation ---------- */
const STORAGE_HARD_CAP = 4 * 1024 * 1024; // 4 Mo (sous le quota navigateur ~5 Mo)
function getLocalStorageSizeBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    total += (k.length + v.length);
  }
  return total * 2; // chaque char ≈ 2 octets en UTF-16
}
function storageWouldExceed(extraBytes) {
  return (getLocalStorageSizeBytes() + (extraBytes || 0)) > STORAGE_HARD_CAP;
}

/* ---------- Photo upload (data URL) ---------- */
function setupPhotoUpload(rootEl, photos, opts) {
  opts = opts || {};
  const maxBytes = opts.maxBytes || 1.2 * 1024 * 1024; // ~1.2MB par photo
  rootEl.innerHTML = `
    <input type="file" accept="image/*" multiple class="photo-input" hidden>
    <button type="button" class="btn btn-secondary btn-sm photo-add-btn">${icon('plus')} Ajouter des photos</button>
    <div class="photo-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
  `;
  const input = rootEl.querySelector('.photo-input');
  const grid  = rootEl.querySelector('.photo-grid');
  const addBtn= rootEl.querySelector('.photo-add-btn');

  function render() {
    grid.innerHTML = photos.length === 0
      ? '<div class="muted" style="font-size:12px">Aucune photo</div>'
      : photos.map((url, i) => `
          <div style="position:relative;width:96px;height:96px;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff">
            <img src="${url}" style="width:100%;height:100%;object-fit:cover" alt="Photo ${i+1}">
            <button type="button" data-idx="${i}" class="photo-rm" style="position:absolute;top:2px;right:2px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(200,54,45,.92);color:#fff;cursor:pointer;font-size:14px;line-height:1">×</button>
          </div>`).join('');
    grid.querySelectorAll('.photo-rm').forEach(b => {
      b.onclick = () => { photos.splice(parseInt(b.dataset.idx), 1); render(); };
    });
  }
  addBtn.onclick = () => input.click();
  input.onchange = () => {
    const files = [...input.files];
    let pending = files.length;
    if (!pending) return;
    files.forEach(f => {
      if (f.size > maxBytes) {
        toast(`${f.name} trop volumineux (max ${(maxBytes/1024/1024).toFixed(1)} Mo)`, 'error');
        if (--pending === 0) { input.value=''; render(); }
        return;
      }
      const r = new FileReader();
      r.onload = () => {
        // Le data URL pèse environ 4/3 du fichier brut (encodage base64). On ajoute la taille du nouveau payload.
        const estimated = r.result.length * 2; // 2 octets / char en UTF-16
        if (storageWouldExceed(estimated)) {
          toast(`Quota stockage atteint (${(STORAGE_HARD_CAP/1024/1024).toFixed(0)} Mo). Supprimez des photos avant d'en ajouter.`, 'error', 5000);
          if (--pending === 0) { input.value=''; render(); }
          return;
        }
        photos.push(r.result);
        if (--pending === 0) { input.value=''; render(); }
      };
      r.readAsDataURL(f);
    });
  };
  render();
  return { photos };
}

/* ---------- Map (Leaflet) ---------- */
function renderMap(container, lat, lng, label) {
  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="muted" style="padding:14px">Bibliothèque cartographique non chargée.</div>';
    return null;
  }
  if (lat == null || lng == null) {
    container.innerHTML = '<div class="muted" style="padding:14px">Coordonnées non disponibles pour ce site.</div>';
    return null;
  }
  container.innerHTML = '';
  const map = L.map(container, { scrollWheelZoom: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
  L.marker([lat, lng]).addTo(map).bindPopup(label || 'Site d\'intervention').openPopup();
  // resize fix : Leaflet a parfois besoin d'un invalidateSize après le rendu
  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

function gpsLink(lat, lng, address) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  }
  return '#';
}

/* ---------- Signature pad (canvas) ---------- */
function attachSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let last = null;
  let dirty = false;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 500;
  const cssH = canvas.clientHeight || 160;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a2332';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cssW, cssH);

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
  function move(e)  {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    dirty = true;
  }
  function stop()   { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', stop);

  return {
    clear() {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssW, cssH);
      dirty = false;
    },
    isEmpty() { return !dirty; },
    toDataURL() { return canvas.toDataURL('image/png'); },
  };
}

/* ---------- Logo loader (cached, with PNG → SVG fallback) ---------- */
let _logoDataUrlPromise = null;
function loadLogoDataUrl() {
  if (_logoDataUrlPromise) return _logoDataUrlPromise;
  const tryLoad = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img load failed: ' + src));
    img.src = src;
  });
  _logoDataUrlPromise = tryLoad('assets/img/logo.png')
    .catch(() => tryLoad('assets/img/logo.svg'))
    .then(img => {
      const w = img.naturalWidth || 480;
      const h = img.naturalHeight || 140;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png');
    })
    .catch(() => null);
  return _logoDataUrlPromise;
}

/* ---------- PDF export (jsPDF) ---------- */
async function exportTicketPDF(ticket) {
  if (typeof window.jspdf === 'undefined') {
    toast('Bibliothèque PDF non chargée', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;
  let y = M;

  // En-tête : logo à gauche, titre à droite, ligne de séparation
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 32, 'F');
  try {
    const logoUrl = await loadLogoDataUrl();
    if (logoUrl) {
      // Garde le ratio approximatif 480x140 → ~3.43:1
      doc.addImage(logoUrl, 'PNG', M, 5, 60, 18);
    }
  } catch (e) { /* ignore */ }
  doc.setTextColor(31, 118, 158);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Fiche d\'intervention', W - M, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, W - M, 19, { align: 'right' });
  doc.setDrawColor(31, 118, 158);
  doc.setLineWidth(0.8);
  doc.line(M, 30, W - M, 30);
  doc.setLineWidth(0.2);
  y = 38;

  // Ticket number + title
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(ticket.number, M, y);
  doc.setFontSize(11);
  y += 6;
  const titleLines = doc.splitTextToSize(ticket.title, W - M*2);
  doc.text(titleLines, M, y);
  y += titleLines.length * 5 + 3;

  // Status / priority pills
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(232, 241, 247);
  doc.setTextColor(31, 118, 158);
  doc.roundedRect(M, y, 30, 6, 1.5, 1.5, 'F');
  doc.text(`STATUT : ${DB.statusLabel(ticket.status).toUpperCase()}`, M + 1.5, y + 4);
  doc.setFillColor(253, 242, 224);
  doc.setTextColor(217, 122, 0);
  doc.roundedRect(M + 33, y, 30, 6, 1.5, 1.5, 'F');
  doc.text(`PRIORITÉ : ${DB.priorityLabel(ticket.priority).toUpperCase()}`, M + 34.5, y + 4);
  y += 12;

  // Info grid
  const info = [
    ['Client',         DB.clientName(ticket.clientId)],
    ['Site',           DB.siteName(ticket.siteId)],
    ['Équipement',     ticket.productId ? DB.productName(ticket.productId) : '—'],
    ['Technicien(s)',  DB.ticketTechs(ticket).length ? DB.ticketTechsLabel(ticket) : 'Non affecté'],
    ['Créé le',        fmtDateTime(ticket.createdAt)],
    ['Planifié du',    ticket.scheduledAt ? fmtDateTime(ticket.scheduledAt) : '—'],
    ['Planifié au',    ticket.scheduledEnd ? fmtDateTime(ticket.scheduledEnd) : (ticket.scheduledAt ? '—' : '—')],
    ['Terminé le',     ticket.completedAt ? fmtDateTime(ticket.completedAt) : '—'],
    ['Heures',         `${(ticket.hours || 0).toFixed(2)} h`],
    ['Déplacements',   String(ticket.tripCount || 0)],
  ];
  doc.setTextColor(20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const colW = (W - M*2) / 2;
  info.forEach((kv, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * colW;
    const ry = y + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(90);
    doc.text(kv[0] + ' :', x, ry);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20);
    doc.text(String(kv[1]).slice(0, 50), x + 28, ry);
  });
  y += Math.ceil(info.length / 2) * 7 + 4;

  // Plan d'accès (snapshot du plan Leaflet rendu sur la page)
  if (typeof html2canvas !== 'undefined') {
    const mapEl = document.getElementById('ticket-map');
    if (mapEl && mapEl.offsetWidth > 0) {
      try {
        const canvas = await html2canvas(mapEl, { useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        if (y > 200) { doc.addPage(); y = M; }
        doc.setDrawColor(220);
        doc.line(M, y, W - M, y); y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text('Plan d\'accès', M, y); y += 4;
        const mapW = 90;
        const mapH = mapW * (canvas.height / canvas.width);
        doc.addImage(dataUrl, 'PNG', M, y, mapW, mapH);
        const site = DB.get('sites', ticket.siteId);
        if (site) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(60);
          let ty = y + 2;
          if (site.address)      { doc.text(site.address.slice(0, 60), M + mapW + 6, ty); ty += 5; }
          if (site.contact)      { doc.text(`Contact : ${site.contact}`.slice(0, 60), M + mapW + 6, ty); ty += 5; }
          if (site.contactPhone) { doc.text(`Tél : ${site.contactPhone}`, M + mapW + 6, ty); ty += 5; }
          if (site.contactEmail) { doc.text(`Email : ${site.contactEmail}`.slice(0, 60), M + mapW + 6, ty); ty += 5; }
          if (site.lat != null && site.lng != null) {
            doc.text(`GPS : ${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}`, M + mapW + 6, ty);
          }
        }
        y += mapH + 6;
      } catch (e) { console.warn('Map snapshot failed', e); }
    }
  }

  // Description (client)
  doc.setDrawColor(220);
  doc.line(M, y, W - M, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Description (client)', M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(ticket.description || '—', W - M*2);
  doc.text(descLines, M, y);
  y += descLines.length * 4.5 + 4;

  // Description de l'intervention
  if (ticket.interventionDescription) {
    if (y > 240) { doc.addPage(); y = M; }
    doc.line(M, y, W - M, y); y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Description de l\'intervention', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const idLines = doc.splitTextToSize(ticket.interventionDescription, W - M*2);
    doc.text(idLines, M, y);
    y += idLines.length * 4.5 + 4;
  }

  // Signatures (client + tech) côte à côte
  if (y > 220) { doc.addPage(); y = M; }
  doc.line(M, y, W - M, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text('Signatures', M, y); y += 4;

  const sigW = 80, sigH = 30;
  const drawSigBox = (label, dataUrl, dateIso, x, yy, signerName) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(label, x, yy + 4);
    doc.setDrawColor(180);
    doc.rect(x, yy + 6, sigW, sigH);
    if (dataUrl) {
      try { doc.addImage(dataUrl, 'PNG', x + 1, yy + 7, sigW - 2, sigH - 2); } catch (e) { console.warn(e); }
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(90);
      let txt = '';
      if (signerName) txt += `${signerName} — `;
      txt += `signé le ${fmtDateTime(dateIso)}`;
      doc.text(txt, x, yy + sigH + 11);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('(non recueillie)', x + 22, yy + 22);
    }
  };
  drawSigBox('Signature client',     ticket.signature,     ticket.signatureDate,     M,             y, ticket.signerName);
  drawSigBox('Signature technicien', ticket.techSignature, ticket.techSignatureDate, M + sigW + 14, y, null);
  y += sigH + 16;

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('ARGOS OCEAN INDIEN — Fiche d\'intervention générée automatiquement', W/2, 290, { align: 'center' });

  doc.save(`${ticket.number}.pdf`);
}

/* ---------- Icons (inline SVG) ---------- */
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  ticket:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 013-3h14a3 3 0 013 3v2a2 2 0 100 4v2a3 3 0 01-3 3H5a3 3 0 01-3-3v-2a2 2 0 100-4V9z"/><path d="M13 5v14"/></svg>',
  user:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>',
  building:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/></svg>',
  box:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
  wrench:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 015.66 5.66l-9 9a2 2 0 01-2.83-2.83l9-9z"/><path d="M5 7a4 4 0 015-5l-1 1 2 2-2 2-2-2-1 1z"/></svg>',
  calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  chart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>',
  download:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  plus:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  search:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>',
  check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  logout:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  menu:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
  back:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  clock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  alert:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>',
  refresh:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  inbox:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
};
function icon(name) { return ICONS[name] || ''; }
