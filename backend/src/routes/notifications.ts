// ============================================================
// Routes /notifications — CRUD des règles d'envoi mail
// + endpoint pour la liste des événements disponibles
// + journal des envois (read-only)
// ============================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NOTIFICATION_EVENTS } from '../lib/notifier.js';

const EVENT_KEYS = NOTIFICATION_EVENTS.map(e => e.key) as [string, ...string[]];

const ruleBaseSchema = z.object({
  label:         z.string().optional(),
  event:         z.enum(EVENT_KEYS),
  recipientType: z.enum(['email', 'user']).default('email'),
  email:         z.string().email().nullable().optional(),
  userId:        z.string().nullable().optional(),
  active:        z.boolean().optional().default(true),
});
const ruleSchema = ruleBaseSchema.refine(
  d => (d.recipientType === 'email' ? !!d.email : !!d.userId),
  { message: 'recipientType=email requiert email, recipientType=user requiert userId' }
);
const rulePatchSchema = ruleBaseSchema.partial();

export async function notificationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // Liste des événements connus (pour la UI)
  app.get('/events', { preHandler: app.requireAdminCan('notifications', 'read') },
    async () => NOTIFICATION_EVENTS);

  // CRUD des règles
  app.get('/', { preHandler: app.requireAdminCan('notifications', 'read') }, async () =>
    app.prisma.notificationRule.findMany({ orderBy: { createdAt: 'desc' } }));

  app.post('/', { preHandler: app.requireAdminCan('notifications', 'write') }, async (req, reply) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const r = await app.prisma.notificationRule.create({ data: parsed.data });
    return reply.code(201).send(r);
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('notifications', 'write') }, async (req, reply) => {
    const parsed = rulePatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const r = await app.prisma.notificationRule.update({ where: { id: (req.params as any).id }, data: parsed.data as any });
    return r;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('notifications', 'write') }, async (req) => {
    await app.prisma.notificationRule.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });

  // Journal récent
  app.get('/log', { preHandler: app.requireAdminCan('notifications', 'read') }, async () =>
    app.prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
}
