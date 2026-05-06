// ============================================================
// Routes /stats — KPIs et séries pour graphiques admin
// Filtres : status, priority, clientId, siteId, technicianId, from, to
// ============================================================
import type { FastifyInstance } from 'fastify';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);
  app.addHook('preHandler', app.requireAdminCan('stats', 'read'));

  app.get('/tickets', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const filters: any[] = [];
    if (q.status)   filters.push({ status: q.status });
    if (q.priority) filters.push({ priority: q.priority });
    if (q.clientId) filters.push({ clientId: q.clientId });
    if (q.siteId)   filters.push({ siteId: q.siteId });
    if (q.technicianId) filters.push({ technicians: { some: { technicianId: q.technicianId } } });
    if (q.from) filters.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to)   filters.push({ createdAt: { lte: new Date(q.to)   } });
    const where = filters.length ? { AND: filters } : undefined;

    const [tickets, techs, clients] = await Promise.all([
      app.prisma.ticket.findMany({ where, include: { technicians: true } }),
      app.prisma.user.findMany({ where: { kind: 'tech' }, select: { id: true, name: true, color: true } }),
      app.prisma.client.findMany({ select: { id: true, name: true } }),
    ]);

    const total = tickets.length;
    const closed = tickets.filter(t => t.status === 'cloture' || t.status === 'resolu').length;
    const totalHours = tickets.reduce((s, t) => s + (t.hours || 0), 0);
    const done = tickets.filter(t => t.completedAt);
    const avgRespHours = done.length === 0 ? 0
      : done.reduce((s, t) => s + ((t.completedAt!.getTime() - t.createdAt.getTime()) / 3_600_000), 0) / done.length;

    const STATUSES = ['nouveau', 'planifie', 'en_cours', 'resolu', 'cloture'];
    const PRIORITIES = ['basse', 'normale', 'haute', 'urgente'];

    return {
      kpi: { total, closed, totalHours, avgRespHours },
      byStatus:   STATUSES.map(s => ({ key: s, count: tickets.filter(t => t.status === s).length })),
      byPriority: PRIORITIES.map(p => ({ key: p, count: tickets.filter(t => t.priority === p).length })),
      byTech:     techs.map(tc => ({
        id: tc.id, name: tc.name, color: tc.color,
        hours: tickets.filter(t => t.technicians.some(x => x.technicianId === tc.id))
                      .reduce((s, t) => s + (t.hours || 0), 0),
      })),
      byClient:   clients.map(c => ({ id: c.id, name: c.name, count: tickets.filter(t => t.clientId === c.id).length })),
    };
  });
}
