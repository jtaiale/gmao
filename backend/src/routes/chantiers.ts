// ============================================================
// Routes /chantiers — CRUD + commentaires + multi-tech
// Périmètre :
//   - admin : tous (selon permissions)
//   - tech  : ses chantiers affectés
// ============================================================
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { nextNumber } from '../lib/numbering.js';

const createSchema = z.object({
  clientId: z.string().min(1),
  siteId: z.string().min(1),
  name: z.string().min(1),
  numAffaire: z.string().optional(),
  description: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  address: z.string().optional(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  tasks: z.string().optional(),
  scheduledAt: z.string().datetime().nullish(),
  duration: z.number().int().min(0).optional(),
  technicianIds: z.array(z.string()).optional().default([]),
});

const updateSchema = createSchema.partial();
const commentSchema = z.object({ text: z.string().min(1) });

function chantierAccessible(c: any, req: FastifyRequest) {
  if (req.auth.kind === 'admin') return true;
  if (req.auth.kind === 'tech') {
    return Array.isArray(c.technicians)
      ? c.technicians.some((x: any) => x.technicianId === req.auth.id)
      : false;
  }
  return false;
}

function serialize(c: any) {
  return {
    ...c,
    technicianIds: (c.technicians ?? []).map((x: any) => x.technicianId),
    technicians: (c.technicians ?? []).map((x: any) => ({ id: x.technician?.id, name: x.technician?.name, color: x.technician?.color })),
  };
}

export async function chantiersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const where: any = {};
    if (req.auth.kind === 'tech') {
      where.technicians = { some: { technicianId: req.auth.id } };
    } else if (req.auth.kind === 'client') {
      return [];
    }
    const list = await app.prisma.chantier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { technicians: { include: { technician: { select: { id: true, name: true, color: true } } } } },
    });
    return list.map(serialize);
  });

  app.get('/:id', async (req, reply) => {
    const c = await app.prisma.chantier.findUnique({
      where: { id: (req.params as any).id },
      include: {
        technicians: { include: { technician: true } },
        client: true, site: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    if (!chantierAccessible(c, req)) return reply.code(403).send({ error: 'forbidden' });
    return serialize(c);
  });

  app.post('/', { preHandler: app.requireAdminCan('chantiers', 'write') }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const d = parsed.data;
    const number = await nextNumber(app.prisma, 'chantier');
    const c = await app.prisma.chantier.create({
      data: {
        number, clientId: d.clientId, siteId: d.siteId,
        name: d.name, numAffaire: d.numAffaire,
        description: d.description, contactName: d.contactName,
        contactPhone: d.contactPhone, contactEmail: d.contactEmail || null,
        address: d.address, lat: d.lat ?? null, lng: d.lng ?? null,
        tasks: d.tasks, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
        duration: d.duration ?? 1, createdById: req.auth.id,
        technicians: { create: (d.technicianIds || []).map(tid => ({ technicianId: tid })) },
      },
    });
    return reply.code(201).send({ id: c.id, number: c.number });
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('chantiers', 'write') }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const id = (req.params as any).id;

    if (Array.isArray(d.technicianIds)) {
      await app.prisma.chantierTechnician.deleteMany({ where: { chantierId: id } });
    }

    const patch: any = { ...d };
    delete patch.technicianIds;
    if (d.scheduledAt !== undefined) patch.scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
    if (Array.isArray(d.technicianIds)) {
      patch.technicians = { create: d.technicianIds.map((tid: string) => ({ technicianId: tid })) };
    }

    const c = await app.prisma.chantier.update({
      where: { id }, data: patch,
      include: { technicians: { include: { technician: true } } },
    });
    return serialize(c);
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('chantiers', 'write') }, async (req, reply) => {
    await app.prisma.chantier.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });

  app.post('/:id/comments', async (req, reply) => {
    const id = (req.params as any).id;
    const c = await app.prisma.chantier.findUnique({
      where: { id },
      include: { technicians: true },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    if (!chantierAccessible(c, req)) return reply.code(403).send({ error: 'forbidden' });

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const cm = await app.prisma.chantierComment.create({
      data: {
        chantierId: id,
        authorId: req.auth.id,
        authorName: req.auth.name,
        role: req.auth.kind,
        text: parsed.data.text,
      },
    });
    return reply.code(201).send(cm);
  });
}
