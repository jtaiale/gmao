// ============================================================
// Route /api/tickets/:id/pdf — génération côté serveur via Puppeteer
// ============================================================
import type { FastifyInstance } from 'fastify';
import { generateTicketPDF } from '../lib/pdf.js';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Logo en data URL : tente plusieurs emplacements (proto frontend, asset embarqué)
let logoCache: string | null | undefined;
function loadLogoDataUrl(): string | null {
  if (logoCache !== undefined) return logoCache;
  const candidates = [
    path.resolve(process.cwd(), '..', 'assets', 'img', 'logo.png'),
    path.resolve(process.cwd(), '..', 'assets', 'img', 'logo.svg'),
    path.resolve(process.cwd(), 'assets', 'img', 'logo.png'),
    path.resolve(process.cwd(), 'assets', 'img', 'logo.svg'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const buf = readFileSync(p);
      const ext = p.toLowerCase().endsWith('.svg') ? 'svg+xml' : 'png';
      logoCache = `data:image/${ext};base64,${buf.toString('base64')}`;
      return logoCache;
    }
  }
  logoCache = null;
  return null;
}

export async function pdfRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/:id/pdf', async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({
      where: { id },
      include: {
        client: true, site: true, product: true,
        technicians: { include: { technician: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!t) return reply.code(404).send({ error: 'not_found' });

    // Périmètre : admin = tous ; tech = ses tickets ; client = ceux de son client
    if (req.auth.kind === 'client' && t.clientId !== req.auth.clientId) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (req.auth.kind === 'tech') {
      const ok = t.createdById === req.auth.id
              || t.technicians.some(x => x.technicianId === req.auth.id);
      if (!ok) return reply.code(403).send({ error: 'forbidden' });
    }

    const techsLabel = t.technicians.map(x => x.technician?.name).filter(Boolean).join(', ');
    const buf = await generateTicketPDF({
      ticket: t,
      techsLabel,
      logoUrl: loadLogoDataUrl(),
    });

    reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="${t.number}.pdf"`)
      .send(buf);
  });
}
