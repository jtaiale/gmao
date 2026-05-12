// ============================================================
// Routes référentielles : clients, sites, products, technicians, admins
// CRUD simple, scopés par permissions admin
// ============================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../lib/hash.js';
import { parsePermissions, PERMISSION_MENUS } from '../lib/permissions.js';

// ============================================================
// CLIENTS
// ============================================================
const clientSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contact: z.string().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  portalEnabled: z.boolean().optional(),
});

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { preHandler: app.requireAdminCan('clients', 'read') }, async () =>
    app.prisma.client.findMany({ orderBy: { name: 'asc' } })
  );

  app.get('/:id', { preHandler: app.requireAdminCan('clients', 'read') }, async (req, reply) => {
    const c = await app.prisma.client.findUnique({ where: { id: (req.params as any).id } });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    return c;
  });

  app.post('/', { preHandler: app.requireAdminCan('clients', 'write') }, async (req, reply) => {
    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const c = await app.prisma.client.create({ data: parsed.data });
    return reply.code(201).send(c);
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('clients', 'write') }, async (req, reply) => {
    const parsed = clientSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const c = await app.prisma.client.update({ where: { id: (req.params as any).id }, data: parsed.data });
    return c;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('clients', 'write') }, async (req, reply) => {
    await app.prisma.client.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });
}

// ============================================================
// SITES
// ============================================================
const siteSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  contact: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});

export async function sitesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    // Tech / client n'ont besoin de lire les sites que pour leur scope
    const where: any = {};
    if (q.clientId) where.clientId = q.clientId;
    if (req.auth.kind === 'client' && req.auth.clientId) where.clientId = req.auth.clientId;
    return app.prisma.site.findMany({ where, orderBy: { name: 'asc' } });
  });

  app.post('/', { preHandler: app.requireAdminCan('sites', 'write') }, async (req, reply) => {
    const parsed = siteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const s = await app.prisma.site.create({ data: parsed.data });
    return reply.code(201).send(s);
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('sites', 'write') }, async (req, reply) => {
    const parsed = siteSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const s = await app.prisma.site.update({ where: { id: (req.params as any).id }, data: parsed.data });
    return s;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('sites', 'write') }, async (req, reply) => {
    await app.prisma.site.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });
}

// ============================================================
// PRODUCTS
// ============================================================
const productSchema = z.object({
  clientId: z.string().min(1),
  siteId: z.string().min(1),
  reference: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function productsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (q.clientId) where.clientId = q.clientId;
    if (q.siteId)   where.siteId = q.siteId;
    if (req.auth.kind === 'client' && req.auth.clientId) where.clientId = req.auth.clientId;
    return app.prisma.product.findMany({ where, orderBy: { name: 'asc' } });
  });

  app.post('/', { preHandler: app.requireAdminCan('products', 'write') }, async (req, reply) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const p = await app.prisma.product.create({ data: parsed.data });
    return reply.code(201).send(p);
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('products', 'write') }, async (req, reply) => {
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const p = await app.prisma.product.update({ where: { id: (req.params as any).id }, data: parsed.data });
    return p;
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('products', 'write') }, async (req, reply) => {
    await app.prisma.product.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });
}

// ============================================================
// TECHNICIANS (User where kind='tech')
// ============================================================
const techSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
});

function publicUser(u: any) {
  if (!u) return u;
  const { password, permissions, ...rest } = u;
  return { ...rest, permissions: parsePermissions(permissions) };
}

export async function technicianRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { preHandler: app.requireAdminCan('technicians', 'read') }, async () => {
    const list = await app.prisma.user.findMany({ where: { kind: 'tech' }, orderBy: { name: 'asc' } });
    return list.map(publicUser);
  });

  app.post('/', { preHandler: app.requireAdminCan('technicians', 'write') }, async (req, reply) => {
    const parsed = techSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const d = parsed.data;
    const u = await app.prisma.user.create({
      data: { kind: 'tech', login: d.login, password: await hashPassword(d.password),
        name: d.name, email: d.email || null, phone: d.phone, specialty: d.specialty, color: d.color },
    });
    return reply.code(201).send(publicUser(u));
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('technicians', 'write') }, async (req, reply) => {
    const parsed = techSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const patch: any = { ...d };
    if (d.password) patch.password = await hashPassword(d.password);
    if (d.email === '') patch.email = null;
    const u = await app.prisma.user.update({ where: { id: (req.params as any).id }, data: patch });
    return publicUser(u);
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('technicians', 'write') }, async (req, reply) => {
    await app.prisma.user.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });
}

// ============================================================
// ADMINS (User where kind='admin')
// ============================================================
const adminSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().or(z.literal('')).optional(),
  superAdmin: z.boolean().optional(),
  permissions: z.record(z.string(), z.enum(['none','read','write'])).optional(),
  active: z.boolean().optional(),
});

export async function adminsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { preHandler: app.requireAdminCan('admins', 'read') }, async () => {
    const list = await app.prisma.user.findMany({ where: { kind: 'admin' }, orderBy: { name: 'asc' } });
    return list.map(publicUser);
  });

  app.post('/', { preHandler: app.requireAdminCan('admins', 'write') }, async (req, reply) => {
    const parsed = adminSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const u = await app.prisma.user.create({
      data: {
        kind: 'admin', login: d.login, password: await hashPassword(d.password),
        name: d.name, email: d.email || null,
        superAdmin: d.superAdmin ?? false,
        permissions: d.permissions ? JSON.stringify(d.permissions) : null,
      },
    });
    return reply.code(201).send(publicUser(u));
  });

  app.patch('/:id', { preHandler: app.requireAdminCan('admins', 'write') }, async (req, reply) => {
    const parsed = adminSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const d = parsed.data;
    const target = await app.prisma.user.findUnique({ where: { id: (req.params as any).id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    if (target.superAdmin && req.auth.id !== target.id && !req.auth.superAdmin) {
      return reply.code(403).send({ error: 'forbidden', message: 'Seul le super-admin peut éditer le super-admin' });
    }
    const patch: any = { ...d };
    if (d.password) patch.password = await hashPassword(d.password);
    if (d.permissions) patch.permissions = JSON.stringify(d.permissions);
    if (d.email === '') patch.email = null;
    const u = await app.prisma.user.update({ where: { id: (req.params as any).id }, data: patch });
    return publicUser(u);
  });

  app.delete('/:id', { preHandler: app.requireAdminCan('admins', 'write') }, async (req, reply) => {
    const target = await app.prisma.user.findUnique({ where: { id: (req.params as any).id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    if (target.superAdmin) return reply.code(403).send({ error: 'forbidden', message: 'Le super-admin ne peut pas être supprimé' });
    if (target.id === req.auth.id) return reply.code(403).send({ error: 'forbidden', message: 'Vous ne pouvez pas vous supprimer vous-même' });
    await app.prisma.user.delete({ where: { id: target.id } });
    return { ok: true };
  });

  // Liste des clés de permissions disponibles
  app.get('/permissions/menus', { preHandler: app.requireAdminCan('admins', 'read') }, async () => PERMISSION_MENUS);
}
