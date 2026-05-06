// ============================================================
// Routes /exports — extractions CSV (tickets, heures, clients)
// Filtre par intervalle de dates sur createdAt
// ============================================================
import type { FastifyInstance } from 'fastify';

const SEP = ';';
function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}
function rowsToCSV(headers: string[], rows: Record<string, any>[]): string {
  const head = headers.join(SEP);
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(SEP)).join('\n');
  return '﻿' + head + '\n' + body;
}
function dateRange(q: Record<string, string | undefined>) {
  const filter: any = {};
  if (q.from) filter.gte = new Date(q.from);
  if (q.to)   filter.lte = new Date(q.to);
  return Object.keys(filter).length ? filter : undefined;
}

export async function exportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);
  app.addHook('preHandler', app.requireAdminCan('exports', 'read'));

  // GET /exports/tickets.csv?from=...&to=...
  app.get('/tickets.csv', async (req, reply) => {
    const range = dateRange(req.query as any);
    const tickets = await app.prisma.ticket.findMany({
      where: range ? { createdAt: range } : undefined,
      include: {
        client: { select: { name: true } },
        site: { select: { name: true } },
        product: { select: { name: true } },
        technicians: { include: { technician: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const STATUS_LABELS: Record<string,string> = {
      nouveau: 'Nouveau', planifie: 'Planifié', en_cours: 'En cours', resolu: 'Résolu', cloture: 'Clôturé',
    };
    const PRIO_LABELS: Record<string,string> = {
      basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
    };

    const rows = tickets.map(t => ({
      Numero: t.number,
      Titre: t.title,
      Client: t.client?.name ?? '',
      Site: t.site?.name ?? '',
      Produit: t.product?.name ?? '',
      Priorite: PRIO_LABELS[t.priority] || t.priority,
      Statut: STATUS_LABELS[t.status] || t.status,
      Techniciens: t.technicians.map(x => x.technician?.name).filter(Boolean).join(', '),
      Cree_le: t.createdAt.toISOString(),
      Planifie_du: t.scheduledAt?.toISOString() ?? '',
      Planifie_au: t.scheduledEnd?.toISOString() ?? '',
      Termine_le: t.completedAt?.toISOString() ?? '',
      Heures: t.hours,
      Deplacements: t.tripCount,
      Description: t.description ?? '',
    }));
    const csv = rowsToCSV(Object.keys(rows[0] || { Numero: '' }), rows);
    reply.type('text/csv; charset=utf-8')
         .header('Content-Disposition', `attachment; filename="tickets_${new Date().toISOString().slice(0,10)}.csv"`);
    return csv;
  });

  // GET /exports/hours.csv?from=...&to=...
  app.get('/hours.csv', async (req, reply) => {
    const range = dateRange(req.query as any);
    const techs = await app.prisma.user.findMany({ where: { kind: 'tech' }, select: { id: true, name: true, specialty: true } });
    const tickets = await app.prisma.ticket.findMany({
      where: range ? { createdAt: range } : undefined,
      include: { technicians: true },
    });
    const rows = techs.map(tc => {
      const tks = tickets.filter(t => t.technicians.some(x => x.technicianId === tc.id));
      return {
        Technicien: tc.name,
        Specialite: tc.specialty ?? '',
        Nb_tickets: tks.length,
        Heures_totales: tks.reduce((s, t) => s + (t.hours || 0), 0).toFixed(2),
        Deplacements: tks.reduce((s, t) => s + (t.tripCount || 0), 0),
      };
    });
    const csv = rowsToCSV(Object.keys(rows[0] || { Technicien: '' }), rows);
    reply.type('text/csv; charset=utf-8')
         .header('Content-Disposition', `attachment; filename="heures_techniciens_${new Date().toISOString().slice(0,10)}.csv"`);
    return csv;
  });

  // GET /exports/clients.csv?from=...&to=...
  app.get('/clients.csv', async (req, reply) => {
    const range = dateRange(req.query as any);
    const clients = await app.prisma.client.findMany({
      include: {
        tickets: range ? { where: { createdAt: range } } : true,
      },
    });
    const rows = clients.map(c => ({
      Code: c.code,
      Nom: c.name,
      Contact: c.contact ?? '',
      Email: c.email ?? '',
      Telephone: c.phone ?? '',
      Nb_tickets: c.tickets.length,
      Heures_total: c.tickets.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2),
    }));
    const csv = rowsToCSV(Object.keys(rows[0] || { Code: '' }), rows);
    reply.type('text/csv; charset=utf-8')
         .header('Content-Disposition', `attachment; filename="clients_${new Date().toISOString().slice(0,10)}.csv"`);
    return csv;
  });
}
