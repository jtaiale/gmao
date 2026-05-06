// ============================================================
// Génération de PDF côté serveur via Puppeteer
// - Lance un Chromium headless partagé (pool d'1 instance)
// - Rend une page HTML (template Mustache-like) puis exporte en PDF
// - Inclut le logo et le plan Leaflet pour rester fidèle au proto
// ============================================================
import puppeteer, { Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}
export async function closeBrowser() {
  if (browserPromise) {
    try { (await browserPromise).close(); } catch {}
    browserPromise = null;
  }
}

function escapeHtml(s: any): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS: Record<string,string> = {
  nouveau: 'Nouveau', planifie: 'Planifié', en_cours: 'En cours', resolu: 'Résolu', cloture: 'Clôturé',
};
const PRIO_LABELS: Record<string,string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
};

export interface TicketPDFData {
  ticket: any;            // Ticket avec includes
  techsLabel: string;
  logoUrl: string | null; // URL absolue ou data URL (peut être null)
}

function renderHtml(data: TicketPDFData): string {
  const t = data.ticket;
  const site = t.site ?? {};
  const lat = site.lat;
  const lng = site.lng;
  const hasMap = lat != null && lng != null;

  const comments = (t.comments ?? []).map((c: any) => `
    <div class="comment">
      <div class="comment-head"><strong>${escapeHtml(c.authorName)}</strong>
        <span class="muted">(${escapeHtml(c.role)})</span>
        <span class="muted"> — ${escapeHtml(fmtDateTime(c.createdAt))}</span>
      </div>
      <div>${escapeHtml(c.text)}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>${escapeHtml(t.number)}</title>
${hasMap ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">' : ''}
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2332; font-size: 11pt; line-height: 1.4; margin:0; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1.2pt solid #1f769e; padding-bottom: 6pt; margin-bottom: 10pt; }
  .header img { height: 50px; }
  .header .right { text-align: right; }
  .header .right h1 { color: #1f769e; font-size: 14pt; margin: 0; font-weight: 700; }
  .header .right p { color: #5a6b7a; font-size: 9pt; margin: 2pt 0 0; }
  h2 { font-size: 13pt; margin: 4pt 0; }
  h3 { font-size: 11pt; margin: 8pt 0 4pt; color: #1f769e; }
  .muted { color: #5a6b7a; }
  .pills { margin: 4pt 0 8pt; }
  .pill { display: inline-block; padding: 2pt 8pt; border-radius: 8pt; font-size: 9pt; font-weight: 700; margin-right: 4pt; }
  .pill-status { background: #e8f1f7; color: #1f769e; }
  .pill-prio   { background: #fdf2e0; color: #d97a00; }
  table.info { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  table.info td { vertical-align: top; padding: 2pt 6pt 2pt 0; font-size: 10pt; }
  table.info td.k { color: #5a6b7a; font-weight: 700; width: 110pt; }
  .map-block { display: flex; gap: 10pt; margin: 8pt 0; align-items: stretch; }
  #map { width: 95mm; height: 50mm; border: 1px solid #e3e8ee; border-radius: 4pt; }
  .map-info { font-size: 9pt; flex: 1; }
  .map-info p { margin: 2pt 0; }
  .desc { white-space: pre-wrap; padding: 4pt 0; }
  hr { border: 0; border-top: 1px solid #e3e8ee; margin: 8pt 0; }
  .sigs { display: flex; gap: 14pt; margin-top: 8pt; }
  .sig { flex: 1; }
  .sig .label { font-weight: 700; font-size: 9pt; color: #5a6b7a; margin-bottom: 4pt; }
  .sig-box { width: 100%; height: 30mm; border: 1px solid #b9c2cc; border-radius: 3pt; display: flex; align-items: center; justify-content: center; }
  .sig-box img { max-width: 95%; max-height: 95%; }
  .sig .meta { font-size: 8pt; color: #5a6b7a; margin-top: 3pt; font-style: italic; }
  .comment { background: #f4f6f9; border-left: 2pt solid #1f769e; padding: 4pt 6pt; margin: 4pt 0; font-size: 9pt; }
  .footer { position: fixed; bottom: 5mm; left: 14mm; right: 14mm; font-size: 8pt; color: #8a98a5; text-align: center; }
</style></head>
<body>
  <div class="header">
    ${data.logoUrl ? `<img src="${escapeHtml(data.logoUrl)}" alt="ARGOS">` : `<div style="font-family:Georgia,serif;font-weight:700;font-size:18pt;color:#1f769e">ARGOS<span style="font-size:9pt;font-weight:400;color:#5a6b7a;letter-spacing:3pt;display:block">OCEAN INDIEN</span></div>`}
    <div class="right">
      <h1>Fiche d'intervention</h1>
      <p>Édité le ${escapeHtml(new Date().toLocaleDateString('fr-FR'))}</p>
    </div>
  </div>

  <h2>Ticket ${escapeHtml(t.number)}</h2>
  <h3 style="margin-top:0;color:#1a2332">${escapeHtml(t.title)}</h3>

  <div class="pills">
    <span class="pill pill-status">STATUT : ${escapeHtml((STATUS_LABELS[t.status] || t.status).toUpperCase())}</span>
    <span class="pill pill-prio">PRIORITÉ : ${escapeHtml((PRIO_LABELS[t.priority] || t.priority).toUpperCase())}</span>
  </div>

  <table class="info">
    <tr><td class="k">Client</td><td>${escapeHtml(t.client?.name)}</td>
        <td class="k">Site</td><td>${escapeHtml(t.site?.name)}</td></tr>
    <tr><td class="k">Équipement</td><td>${escapeHtml(t.product?.name || '—')}</td>
        <td class="k">Technicien(s)</td><td>${escapeHtml(data.techsLabel || 'Non affecté')}</td></tr>
    <tr><td class="k">Créé le</td><td>${escapeHtml(fmtDateTime(t.createdAt))}</td>
        <td class="k">Terminé le</td><td>${escapeHtml(fmtDateTime(t.completedAt))}</td></tr>
    <tr><td class="k">Planifié du</td><td>${escapeHtml(fmtDateTime(t.scheduledAt))}</td>
        <td class="k">Planifié au</td><td>${escapeHtml(fmtDateTime(t.scheduledEnd))}</td></tr>
    <tr><td class="k">Heures</td><td>${escapeHtml((t.hours ?? 0).toFixed(2))} h</td>
        <td class="k">Déplacements</td><td>${escapeHtml(String(t.tripCount ?? 0))}</td></tr>
  </table>

  ${hasMap ? `
  <hr>
  <h3>Plan d'accès</h3>
  <div class="map-block">
    <div id="map"></div>
    <div class="map-info">
      <p><strong>${escapeHtml(site.name || '')}</strong></p>
      <p>${escapeHtml(site.address || '')}</p>
      ${site.contact ? `<p>${escapeHtml(site.contact)}</p>` : ''}
      ${site.contactPhone ? `<p>Tél : ${escapeHtml(site.contactPhone)}</p>` : ''}
      ${site.contactEmail ? `<p>Email : ${escapeHtml(site.contactEmail)}</p>` : ''}
      <p class="muted">GPS : ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
    </div>
  </div>
  ` : ''}

  <hr>
  <h3>Description (client)</h3>
  <div class="desc">${escapeHtml(t.description || '—')}</div>

  ${t.interventionDescription ? `
    <h3>Description de l'intervention</h3>
    <div class="desc">${escapeHtml(t.interventionDescription)}</div>
  ` : ''}

  <hr>
  <h3>Signatures</h3>
  <div class="sigs">
    <div class="sig">
      <div class="label">Signature client</div>
      <div class="sig-box">${t.signature ? `<img src="${escapeHtml(t.signature)}">` : '<span class="muted" style="font-size:9pt">(non recueillie)</span>'}</div>
      <div class="meta">${t.signature ? (t.signerName ? escapeHtml(t.signerName) + ' — ' : '') + 'signé le ' + escapeHtml(fmtDateTime(t.signatureDate)) : ''}</div>
    </div>
    <div class="sig">
      <div class="label">Signature technicien</div>
      <div class="sig-box">${t.techSignature ? `<img src="${escapeHtml(t.techSignature)}">` : '<span class="muted" style="font-size:9pt">(non recueillie)</span>'}</div>
      <div class="meta">${t.techSignature ? 'signé le ' + escapeHtml(fmtDateTime(t.techSignatureDate)) : ''}</div>
    </div>
  </div>

  <div class="footer">ARGOS OCEAN INDIEN — Fiche d'intervention</div>

  ${hasMap ? `
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${lat}, ${lng}], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.marker([${lat}, ${lng}]).addTo(map);
      window.__mapReady = false;
      let pending = 0; let started = false;
      map.eachLayer(l => { if (l.on && l._url) {
        l.on('tileloadstart', () => { pending++; started = true; });
        l.on('tileload',      () => { pending = Math.max(0, pending-1); if (started && pending === 0) window.__mapReady = true; });
      }});
      // safety net
      setTimeout(() => { window.__mapReady = true; }, 4500);
    })();
  </script>` : '<script>window.__mapReady = true;</script>'}
</body></html>`;
}

export async function generateTicketPDF(data: TicketPDFData): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1700, deviceScaleFactor: 1 });
    const html = renderHtml(data);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    // Attendre que la carte soit prête
    try {
      await page.waitForFunction('window.__mapReady === true', { timeout: 8_000 });
    } catch { /* carte indisponible : on imprime quand même */ }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
