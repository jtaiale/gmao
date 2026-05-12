// ============================================================
// Routes /leaves — gestion des congés / absences techniciens
// Admin : tous les techs ; technicien : ses propres congés
// ============================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const LEAVE_TYPES = ['conge', 'rtt', 'maladie', 'formation', 'autre'] as const;

const createSchema = z.object({
  technicianId: z.string().min(1),
  startDate:    z.string().datetime(),
  endDate:      z.string().datetime(),
  type:         z.enum(LEAVE_TYPES).default('conge'),
  comment:      z.string().optional(),
});

export async function leavesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // GET /api/leaves
  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (req.auth.kind === 'client') return [];
    if (req.auth.kind === 'tech')   where.technicianId = req.auth.id;
    else if (q.technicianId)        where.technicianId = q.technicianId;
    if (q.from) where.endDate   = { gte: new Date(q.from) };
    if (q.to)   where.startDate = { lte: new Date(q.to) };
    return app.prisma.leave.findMany({
      where, orderBy: { startDate: 'asc' },
      include: { technician: { select: { id: true, name: true, color: true } } },
    });
  });

  // POST /api/leaves — admin ou tech pour lui-même
  app.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const d = parsed.data;

    if (req.auth.kind === 'tech' && d.technicianId !== req.auth.id) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (req.auth.kind === 'client') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (req.auth.kind === 'admin' && !req.auth.superAdmin) {
      // admin standard : vérifier permission technicians:write
      const lvl = (req.auth.permissions || {}).technicians ?? 'none';
      if (lvl !== 'write') return reply.code(403).send({ error: 'forbidden' });
    }

    const start = new Date(d.startDate);
    const end   = new Date(d.endDate);
    if (end < start) return reply.code(400).send({ error: 'bad_request', message: 'Date de fin antérieure à la date de début' });

    const leave = await app.prisma.leave.create({
      data: {
        technicianId: d.technicianId,
        startDate:    start,
        endDate:      end,
        type:         d.type,
        comment:      d.comment || null,
      },
      include: { technician: { select: { id: true, name: true } } },
    });
    return reply.code(201).send(leave);
  });

  // DELETE /api/leaves/:id
  app.delete('/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const lv = await app.prisma.leave.findUnique({ where: { id } });
    if (!lv) return reply.code(404).send({ error: 'not_found' });
    // Admin OU le tech propriétaire
    if (req.auth.kind === 'tech' && lv.technicianId !== req.auth.id) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (req.auth.kind === 'client') return reply.code(403).send({ error: 'forbidden' });
    await app.prisma.leave.delete({ where: { id } });
    return { ok: true };
  });
}
