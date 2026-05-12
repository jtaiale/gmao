// ============================================================
// Routes /tickets — CRUD + commentaires + signatures + multi-tech
// Périmètre selon le rôle :
//   - admin : tous les tickets (avec permission)
//   - tech  : ses tickets affectés OU créés
//   - client: tickets de son client
// ============================================================
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { nextNumber } from '../lib/numbering.js';
import { emit, html as mailHtml } from '../lib/notifier.js';

const STATUSES = ['nouveau', 'planifie', 'en_cours', 'resolu', 'cloture'] as const;
const PRIORITIES = ['basse', 'normale', 'haute', 'urgente'] as const;

const createSchema = z.object({
  clientId: z.string().min(1),
  siteId:   z.string().min(1),
  productId: z.string().nullish(),
  title:    z.string().min(1),
  description: z.string().optional().default(''),
  priority: z.enum(PRIORITIES).default('normale'),
  scheduledAt:  z.string().datetime().nullish(),
  scheduledEnd: z.string().datetime().nullish(),
  technicianIds: z.array(z.string()).optional().default([]),
});

const updateSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().optional(),
  interventionDescription: z.string().optional(),
  priority:    z.enum(PRIORITIES).optional(),
  status:      z.enum(STATUSES).optional(),
  scheduledAt:  z.string().datetime().nullish(),
  scheduledEnd: z.string().datetime().nullish(),
  hours:       z.number().min(0).optional(),
  tripCount:   z.number().int().min(0).optional(),
  productId:   z.string().nullish(),
  technicianIds: z.array(z.string()).optional(),
});

const commentSchema = z.object({
  text: z.string().min(1),
});

const signatureSchema = z.object({
  kind: z.enum(['client', 'tech']),
  dataUrl: z.string().min(1),
  signerName: z.string().optional(),
});

// Filtre commun construit selon le rôle de l'appelant
async function buildScopeWhere(req: FastifyRequest) {
  const { auth } = req;
  if (auth.kind === 'admin')  return {};
  if (auth.kind === 'client') return { clientId: auth.clientId ?? '__none__' };
  // tech : ses tickets assignés OU créés
  return {
    OR: [
      { technicians: { some: { technicianId: auth.id } } },
      { createdById: auth.id },
    ],
  };
}

export async function ticketsRoutes(app: FastifyInstance) {
  // Toutes les routes nécessitent l'auth
  app.addHook('preHandler', app.requireAuth);

  // GET /tickets — liste avec filtres
  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const filters: any[] = [];
    if (q.status)     filters.push({ status: q.status });
    if (q.priority)   filters.push({ priority: q.priority });
    if (q.clientId)   filters.push({ clientId: q.clientId });
    if (q.siteId)     filters.push({ siteId: q.siteId });
    if (q.search) {
      filters.push({ OR: [
        { number: { contains: q.search } },
        { title:  { contains: q.search } },
      ]});
    }
    if (q.technicianId === 'none') {
      filters.push({ technicians: { none: {} } });
    } else if (q.technicianId) {
      filters.push({ technicians: { some: { technicianId: q.technicianId } } });
    }
    if (q.from) filters.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to)   filters.push({ createdAt: { lte: new Date(q.to)   } });

    const scope = await buildScopeWhere(req);
    const where = { AND: [scope, ...filters] };

    const tickets = await app.prisma.ticket.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: {
        technicians: { include: { technician: { select: { id: true, name: true, color: true } } } },
        client:  { select: { id: true, name: true } },
        site:    { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
      take: 500,
    });
    return tickets.map(serializeFull);
  });

  // GET /tickets/:id — détail
  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({
      where: { id },
      include: {
        technicians: { include: { technician: true } },
        client: true,
        site: true,
        product: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!ticketAccessible(t, req)) return reply.code(403).send({ error: 'forbidden' });
    return serializeFull(t);
  });

  // POST /tickets — création
  app.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const data = parsed.data;

    if (req.auth.kind === 'client') {
      // Le client ne peut créer que des tickets pour son propre clientId
      if (data.clientId !== req.auth.clientId) return reply.code(403).send({ error: 'forbidden' });
    }

    const number = await nextNumber(app.prisma, 'ticket');
    const t = await app.prisma.ticket.create({
      data: {
        number,
        clientId: data.clientId,
        siteId:   data.siteId,
        productId: data.productId ?? null,
        title: data.title,
        description: data.description ?? '',
        priority: data.priority,
        status: req.auth.kind === 'tech' ? 'en_cours' : 'nouveau',
        scheduledAt:  data.scheduledAt  ? new Date(data.scheduledAt)  : null,
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null,
        createdById: req.auth.id,
        technicians: {
          create: (data.technicianIds || []).map(tid => ({ technicianId: tid })),
        },
      },
      include: { technicians: true, client: true, site: true },
    });
    emit(app.prisma, 'ticket_created', {
      subject: `[GMAO] Nouveau ticket ${t.number}`,
      bodyHtml: mailHtml(`Nouveau ticket ${t.number}`, [
        `<strong>${t.title}</strong>`,
        `Client : ${t.client?.name ?? ''} — Site : ${t.site?.name ?? ''}`,
        `Priorité : ${t.priority}`,
        t.description ? `Description : ${t.description}` : '',
      ].filter(Boolean)),
    });
    return reply.code(201).send({ id: t.id, number: t.number });
  });

  // PATCH /tickets/:id — mise à jour
  app.patch('/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({ where: { id }, include: { technicians: true } });
    if (!t) return reply.code(404).send({ error: 'not_found' });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });

    // Périmètre : client = lecture seule ; tech = ses tickets, restrictions ; admin = tout
    if (req.auth.kind === 'client') return reply.code(403).send({ error: 'forbidden' });
    if (req.auth.kind === 'tech') {
      if (!ticketAccessible(t, req)) return reply.code(403).send({ error: 'forbidden' });
      // Tech : peut changer status / hours / tripCount / interventionDescription / scheduledAt/End mais
      // pas la liste des techniciens ni le statut "cloture" / "planifie"
      const techPatch = parsed.data;
      if (techPatch.status && !['nouveau', 'en_cours', 'resolu'].includes(techPatch.status)) {
        return reply.code(403).send({ error: 'forbidden_status', message: 'Statut réservé à l\'admin' });
      }
      delete (techPatch as any).technicianIds;
    }

    const d = parsed.data;
    const patch: any = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.interventionDescription !== undefined) patch.interventionDescription = d.interventionDescription;
    if (d.priority !== undefined) patch.priority = d.priority;
    if (d.status !== undefined) {
      patch.status = d.status;
      if ((d.status === 'resolu' || d.status === 'cloture') && !t.completedAt) {
        patch.completedAt = new Date();
      }
    }
    if (d.scheduledAt !== undefined)  patch.scheduledAt  = d.scheduledAt  ? new Date(d.scheduledAt)  : null;
    if (d.scheduledEnd !== undefined) patch.scheduledEnd = d.scheduledEnd ? new Date(d.scheduledEnd) : null;
    if (d.hours !== undefined) patch.hours = d.hours;
    if (d.tripCount !== undefined) patch.tripCount = d.tripCount;
    if (d.productId !== undefined) patch.productId = d.productId ?? null;

    // Multi-tech : remplace l'ensemble si fourni
    if (Array.isArray(d.technicianIds)) {
      await app.prisma.ticketTechnician.deleteMany({ where: { ticketId: id } });
      patch.technicians = { create: d.technicianIds.map(tid => ({ technicianId: tid })) };
    }

    const updated = await app.prisma.ticket.update({
      where: { id }, data: patch,
      include: {
        technicians: { include: { technician: true } },
        client: true, site: true, product: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    // Notification : ticket complété
    if ((updated.status === 'resolu' || updated.status === 'cloture') &&
        t.status !== updated.status) {
      emit(app.prisma, 'ticket_completed', {
        subject: `[GMAO] Ticket ${updated.number} ${updated.status}`,
        bodyHtml: mailHtml(`Ticket ${updated.status === 'cloture' ? 'clôturé' : 'résolu'}`, [
          `<strong>${updated.number} — ${updated.title}</strong>`,
          `Client : ${updated.client?.name ?? ''} — Site : ${updated.site?.name ?? ''}`,
          `Heures réalisées : ${(updated.hours ?? 0).toFixed(2)} h, Déplacements : ${updated.tripCount ?? 0}`,
          updated.interventionDescription ? `Intervention : ${updated.interventionDescription}` : '',
        ].filter(Boolean)),
      });
    }
    return serializeFull(updated);
  });

  // DELETE /tickets/:id — admin uniquement
  app.delete('/:id', { preHandler: app.requireAdminCan('tickets', 'write') }, async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({ where: { id } });
    if (!t) return reply.code(404).send({ error: 'not_found' });
    await app.prisma.ticket.delete({ where: { id } });
    return { ok: true };
  });

  // POST /tickets/:id/comments — ajouter un commentaire
  app.post('/:id/comments', async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({ where: { id } });
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!ticketAccessible(t, req)) return reply.code(403).send({ error: 'forbidden' });

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const c = await app.prisma.ticketComment.create({
      data: {
        ticketId: id,
        authorId: req.auth.id,
        authorName: req.auth.name,
        role: req.auth.kind,
        text: parsed.data.text,
      },
    });
    return reply.code(201).send(c);
  });

  // POST /tickets/:id/signature — capturer une signature (admin / tech)
  app.post('/:id/signature', { preHandler: app.requireKind('admin', 'tech') }, async (req, reply) => {
    const id = (req.params as any).id;
    const t = await app.prisma.ticket.findUnique({ where: { id } });
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (req.auth.kind === 'tech' && !ticketAccessible(t, req)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = signatureSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const { kind, dataUrl, signerName } = parsed.data;

    const patch = kind === 'tech'
      ? { techSignature: dataUrl, techSignatureDate: new Date() }
      : { signature: dataUrl, signatureDate: new Date(), signerName: (signerName ?? '').trim() || null };

    const updated = await app.prisma.ticket.update({ where: { id }, data: patch });
    return updated;
  });
}

// ----- Helpers -----

function ticketAccessible(t: any, req: FastifyRequest) {
  if (req.auth.kind === 'admin') return true;
  if (req.auth.kind === 'client') return t.clientId === req.auth.clientId;
  // tech : assigné ou créateur
  if (t.createdById === req.auth.id) return true;
  return Array.isArray(t.technicians)
    ? t.technicians.some((x: any) => x.technicianId === req.auth.id)
    : false;
}

function serializeList(t: any) {
  return {
    id: t.id, number: t.number, title: t.title,
    status: t.status, priority: t.priority,
    clientId: t.clientId, clientName: t.client?.name,
    siteId: t.siteId, siteName: t.site?.name,
    scheduledAt: t.scheduledAt, scheduledEnd: t.scheduledEnd,
    hours: t.hours, tripCount: t.tripCount,
    technicianIds: (t.technicians ?? []).map((x: any) => x.technicianId),
    technicians:   (t.technicians ?? []).map((x: any) => ({ id: x.technician?.id, name: x.technician?.name, color: x.technician?.color })),
    createdAt: t.createdAt, completedAt: t.completedAt,
  };
}

function serializeFull(t: any) {
  return {
    ...serializeList(t),
    description: t.description,
    interventionDescription: t.interventionDescription,
    productId: t.productId,
    productName: t.product?.name,
    signature: t.signature, signatureDate: t.signatureDate, signerName: t.signerName,
    techSignature: t.techSignature, techSignatureDate: t.techSignatureDate,
    comments: t.comments ?? [],
  };
}
