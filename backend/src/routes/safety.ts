// ============================================================
// Routes Sécurité : presque-accidents, dérogations, bulletins
// ============================================================
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { nextNumber } from '../lib/numbering.js';
import { emit, html as mailHtml } from '../lib/notifier.js';

// ============================================================
// PRESQUE-ACCIDENTS (/accidents)
// ============================================================
const accidentCreateSchema = z.object({
  clientId: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  riskNature: z.string().min(1),
  recommendations: z.string().optional(),
  photos: z.array(z.object({ url: z.string() })).optional(),
});
const accidentAdminPatch = z.object({
  qseRecommendations: z.string().optional(),
  status: z.enum(['en_cours', 'traite']).optional(),
});

export async function accidentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const where: any = {};
    if (req.auth.kind === 'tech')   where.createdById = req.auth.id;
    if (req.auth.kind === 'client') where.clientId = req.auth.clientId ?? '__none__';
    return app.prisma.accident.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { photos: true, client: { select: { name: true } }, site: { select: { name: true } } },
    });
  });

  app.get('/:id', async (req, reply) => {
    const a = await app.prisma.accident.findUnique({
      where: { id: (req.params as any).id },
      include: { photos: true, client: true, site: true },
    });
    if (!a) return reply.code(404).send({ error: 'not_found' });
    if (req.auth.kind === 'tech' && a.createdById !== req.auth.id) return reply.code(403).send({ error: 'forbidden' });
    return a;
  });

  // Création : technicien (ou admin)
  app.post('/', { preHandler: app.requireKind('admin', 'tech') }, async (req, reply) => {
    const parsed = accidentCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const d = parsed.data;
    const number = await nextNumber(app.prisma, 'accident');
    const a = await app.prisma.accident.create({
      data: {
        number, clientId: d.clientId, siteId: d.siteId,
        title: d.title, description: d.description, riskNature: d.riskNature,
        recommendations: d.recommendations,
        createdById: req.auth.id, createdByName: req.auth.name,
        photos: { create: (d.photos ?? []).map((p, i) => ({ url: p.url, position: i })) },
      },
      include: { photos: true, client: true, site: true },
    });
    emit(app.prisma, 'accident_created', {
      subject: `[GMAO] Nouveau presque-accident ${a.number}`,
      bodyHtml: mailHtml(`Presque-accident déclaré`, [
        `<strong>${a.number} — ${a.title}</strong>`,
        `Client : ${a.client?.name ?? ''} — Site : ${a.site?.name ?? ''}`,
        `Nature du risque : ${a.riskNature}`,
        `Description : ${a.description}`,
        `Déclaré par : ${a.createdByName ?? ''}`,
      ]),
    });
    return reply.code(201).send(a);
  });

  // Mise à jour QSE / statut : admin uniquement
  app.patch('/:id', { preHandler: app.requireAdminCan('accidents', 'write') }, async (req, reply) => {
    const parsed = accidentAdminPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const a = await app.prisma.accident.update({ where: { id: (req.params as any).id }, data: parsed.data });
    return a;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('accidents', 'write') }, async (req) => {
    await app.prisma.accident.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });
}

// ============================================================
// DÉROGATIONS (/derogations)
// ============================================================
const derogationCreateSchema = z.object({
  clientId: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  dateStart: z.string().datetime(),
  dateEnd: z.string().datetime(),
  riskAnalysis: z.string().min(1),
  techRecommendations: z.string().optional(),
  photos: z.array(z.object({ url: z.string() })).optional(),
});
const derogationAdminPatch = z.object({
  preventiveMeasures: z.string().optional(),
  status: z.enum(['en_cours', 'valide']).optional(),
});
const derogationTechPatch = z.object({
  techRecommendations: z.string().optional(),
});
const derogationSignSchema = z.object({
  kind: z.enum(['tech', 'resp']),
  dataUrl: z.string().min(1),
});

export async function derogationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const where: any = {};
    if (req.auth.kind === 'tech') where.createdById = req.auth.id;
    return app.prisma.derogation.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { photos: true, client: { select: { name: true } }, site: { select: { name: true } } },
    });
  });

  app.get('/:id', async (req, reply) => {
    const d = await app.prisma.derogation.findUnique({
      where: { id: (req.params as any).id },
      include: { photos: true, client: true, site: true },
    });
    if (!d) return reply.code(404).send({ error: 'not_found' });
    if (req.auth.kind === 'tech' && d.createdById !== req.auth.id) return reply.code(403).send({ error: 'forbidden' });
    return d;
  });

  app.post('/', { preHandler: app.requireKind('admin', 'tech') }, async (req, reply) => {
    const parsed = derogationCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const d = parsed.data;
    const number = await nextNumber(app.prisma, 'derogation');
    const der = await app.prisma.derogation.create({
      data: {
        number, clientId: d.clientId, siteId: d.siteId,
        title: d.title, description: d.description,
        dateStart: new Date(d.dateStart), dateEnd: new Date(d.dateEnd),
        riskAnalysis: d.riskAnalysis, techRecommendations: d.techRecommendations,
        createdById: req.auth.id, createdByName: req.auth.name,
        photos: { create: (d.photos ?? []).map((p, i) => ({ url: p.url, position: i })) },
      },
      include: { client: true, site: true },
    });
    emit(app.prisma, 'derogation_created', {
      subject: `[GMAO] Nouvelle dérogation ${der.number}`,
      bodyHtml: mailHtml(`Nouvelle demande de dérogation`, [
        `<strong>${der.number} — ${der.title}</strong>`,
        `Client : ${der.client?.name ?? ''} — Site : ${der.site?.name ?? ''}`,
        `Période : ${new Date(der.dateStart).toLocaleDateString('fr-FR')} → ${new Date(der.dateEnd).toLocaleDateString('fr-FR')}`,
        `Analyse du risque : ${der.riskAnalysis}`,
        `Demandée par : ${der.createdByName ?? ''}`,
      ]),
    });
    return reply.code(201).send(der);
  });

  // Mesures de prévention QSE + statut : admin
  app.patch('/:id', { preHandler: app.requireAdminCan('derogations', 'write') }, async (req, reply) => {
    const parsed = derogationAdminPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const id = (req.params as any).id;
    const prev = await app.prisma.derogation.findUnique({ where: { id } });
    const d = await app.prisma.derogation.update({
      where: { id },
      data: parsed.data,
      include: { client: true, site: true },
    });
    if (parsed.data.status === 'valide' && prev?.status !== 'valide') {
      emit(app.prisma, 'derogation_validated', {
        subject: `[GMAO] Dérogation ${d.number} validée`,
        bodyHtml: mailHtml(`Dérogation validée`, [
          `<strong>${d.number} — ${d.title}</strong>`,
          `Client : ${d.client?.name ?? ''} — Site : ${d.site?.name ?? ''}`,
          d.preventiveMeasures ? `Mesures de prévention : ${d.preventiveMeasures}` : '',
        ].filter(Boolean)),
      });
    }
    return d;
  });

  // Préconisations technicien (par le créateur uniquement)
  app.patch('/:id/tech-reco', async (req, reply) => {
    const id = (req.params as any).id;
    const target = await app.prisma.derogation.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    if (req.auth.kind !== 'tech' || target.createdById !== req.auth.id) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = derogationTechPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = await app.prisma.derogation.update({ where: { id }, data: parsed.data });
    return d;
  });

  // Signature tech (créateur) ou resp (admin)
  app.post('/:id/signature', async (req, reply) => {
    const parsed = derogationSignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const id = (req.params as any).id;
    const target = await app.prisma.derogation.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    const { kind, dataUrl } = parsed.data;
    if (kind === 'tech' && (req.auth.kind !== 'tech' || target.createdById !== req.auth.id)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (kind === 'resp' && req.auth.kind !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const patch = kind === 'resp'
      ? { respSignature: dataUrl, respSignatureDate: new Date() }
      : { techSignature: dataUrl, techSignatureDate: new Date() };
    const d = await app.prisma.derogation.update({ where: { id }, data: patch });
    return d;
  });
}

// ============================================================
// BULLETINS NOUT ZINFOS (/bulletins)
// ============================================================
const bulletinCreateSchema = z.object({
  title: z.string().min(1),
  bulletinDate: z.string().datetime().optional(),
  info: z.string().min(1),
});

export async function bulletinsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const list = await app.prisma.bulletin.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reads: { where: { technicianId: req.auth.id } },
        _count: { select: { reads: true } },
      },
    });
    return list.map(b => ({
      ...b,
      readByMe: b.reads.length > 0,
      readCount: b._count.reads,
      reads: undefined, _count: undefined,
    }));
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const b = await app.prisma.bulletin.findUnique({
      where: { id },
      include: {
        comments: { orderBy: { createdAt: 'asc' } },
        reads: { include: { technician: { select: { id: true, name: true } } } },
      },
    });
    if (!b) return reply.code(404).send({ error: 'not_found' });

    // Marquer comme lu si tech
    if (req.auth.kind === 'tech') {
      await app.prisma.bulletinRead.upsert({
        where: { bulletinId_technicianId: { bulletinId: id, technicianId: req.auth.id } },
        update: {},
        create: { bulletinId: id, technicianId: req.auth.id },
      });
    }
    return b;
  });

  app.post('/', { preHandler: app.requireAdminCan('bulletins', 'write') }, async (req, reply) => {
    const parsed = bulletinCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const number = await nextNumber(app.prisma, 'bulletin');
    const b = await app.prisma.bulletin.create({
      data: {
        number, title: d.title,
        bulletinDate: d.bulletinDate ? new Date(d.bulletinDate) : null,
        info: d.info, createdById: req.auth.id,
      },
    });
    emit(app.prisma, 'bulletin_published', {
      subject: `[GMAO] Nouveau bulletin ${b.number} — ${b.title}`,
      bodyHtml: mailHtml(`Bulletin NOUT ZINFOS — ${b.title}`, [
        `Numéro : <strong>${b.number}</strong>`,
        b.bulletinDate ? `Date : ${new Date(b.bulletinDate).toLocaleDateString('fr-FR')}` : '',
        b.info,
      ].filter(Boolean)),
    });
    return reply.code(201).send(b);
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('bulletins', 'write') }, async (req, reply) => {
    const parsed = bulletinCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const patch: any = { ...d };
    if (d.bulletinDate !== undefined) patch.bulletinDate = d.bulletinDate ? new Date(d.bulletinDate) : null;
    const b = await app.prisma.bulletin.update({ where: { id: (req.params as any).id }, data: patch });
    return b;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('bulletins', 'write') }, async (req) => {
    await app.prisma.bulletin.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });

  app.post('/:id/read', async (req, reply) => {
    if (req.auth.kind !== 'tech') return reply.code(403).send({ error: 'forbidden' });
    const id = (req.params as any).id;
    await app.prisma.bulletinRead.upsert({
      where: { bulletinId_technicianId: { bulletinId: id, technicianId: req.auth.id } },
      update: {}, create: { bulletinId: id, technicianId: req.auth.id },
    });
    return { ok: true };
  });

  app.post('/:id/comments', async (req, reply) => {
    const parsed = z.object({ text: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const c = await app.prisma.bulletinComment.create({
      data: {
        bulletinId: (req.params as any).id,
        authorId: req.auth.id, authorName: req.auth.name,
        role: req.auth.kind, text: parsed.data.text,
      },
    });
    return reply.code(201).send(c);
  });
}
