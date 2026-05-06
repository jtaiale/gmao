// ============================================================
// Helper : construit une instance Fastify pour les tests
// (équivalent du bootstrap mais sans listen, avec PrismaClient à part)
// ============================================================
import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

import { registerAuth } from '../src/plugins/auth.js';
import { authRoutes } from '../src/routes/auth.js';
import { ticketsRoutes } from '../src/routes/tickets.js';
import { clientsRoutes, sitesRoutes, productsRoutes, technicianRoutes, adminsRoutes } from '../src/routes/referentials.js';
import { chantiersRoutes } from '../src/routes/chantiers.js';
import { accidentsRoutes, derogationsRoutes, bulletinsRoutes } from '../src/routes/safety.js';
import { statsRoutes } from '../src/routes/stats.js';
import { exportsRoutes } from '../src/routes/exports.js';
import { uploadsRoutes } from '../src/routes/uploads.js';

let _prisma: PrismaClient | null = null;
export function getPrisma() {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

const ALL_PERMS = ['tickets','planning','clients','sites','products','chantiers','technicians','admins','accidents','derogations','bulletins','stats','exports'];
function defaultPerms(level: 'read' | 'write' = 'write') {
  return Object.fromEntries(ALL_PERMS.map(k => [k, level]));
}

export async function buildApp(): Promise<FastifyInstance> {
  const prisma = getPrisma();
  const app = Fastify({ logger: false });
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await registerAuth(app, prisma);

  app.register(authRoutes,        { prefix: '/api/auth' });
  app.register(ticketsRoutes,     { prefix: '/api/tickets' });
  app.register(clientsRoutes,     { prefix: '/api/clients' });
  app.register(sitesRoutes,       { prefix: '/api/sites' });
  app.register(productsRoutes,    { prefix: '/api/products' });
  app.register(technicianRoutes,  { prefix: '/api/technicians' });
  app.register(adminsRoutes,      { prefix: '/api/admins' });
  app.register(chantiersRoutes,   { prefix: '/api/chantiers' });
  app.register(accidentsRoutes,   { prefix: '/api/accidents' });
  app.register(derogationsRoutes, { prefix: '/api/derogations' });
  app.register(bulletinsRoutes,   { prefix: '/api/bulletins' });
  app.register(statsRoutes,       { prefix: '/api/stats' });
  app.register(exportsRoutes,     { prefix: '/api/exports' });
  app.register(uploadsRoutes,     { prefix: '/api/uploads' });

  await app.ready();
  return app;
}

// ----- Fixtures partagées -----
export async function seedMinimal() {
  const prisma = getPrisma();

  // Clean
  await prisma.ticketComment.deleteMany();
  await prisma.ticketTechnician.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.product.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.sequence.deleteMany();

  for (const key of ['ticket', 'accident', 'derogation', 'chantier', 'bulletin']) {
    await prisma.sequence.create({ data: { key, year: new Date().getFullYear(), value: 0 } });
  }

  const client = await prisma.client.create({
    data: { code: 'TEST', name: 'Client Test', email: 'test@example.com' },
  });
  const site = await prisma.site.create({ data: { clientId: client.id, name: 'Site Test', address: 'Test' } });

  const adminPwd = await bcrypt.hash('admin', 10);
  const techPwd  = await bcrypt.hash('tech',  10);
  const clientPwd= await bcrypt.hash('cli',   10);
  const consPwd  = await bcrypt.hash('cons',  10);

  const admin   = await prisma.user.create({ data: { kind: 'admin', login: 'admin',  password: adminPwd, name: 'Super Admin', superAdmin: true,  permissions: JSON.stringify(defaultPerms('write')) } });
  const consult = await prisma.user.create({ data: { kind: 'admin', login: 'consult',password: consPwd,  name: 'Consult',     superAdmin: false, permissions: JSON.stringify({ ...defaultPerms('read'), admins: 'none' }) } });
  const tech    = await prisma.user.create({ data: { kind: 'tech',  login: 'tech1',  password: techPwd,  name: 'Tech 1' } });
  const cliUser = await prisma.user.create({ data: { kind: 'client',login: 'cli1',   password: clientPwd,name: 'Client 1', clientId: client.id } });

  return { client, site, admin, consult, tech, cliUser };
}

export async function loginAs(app: FastifyInstance, login: string, password: string) {
  const r = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login, password },
  });
  if (r.statusCode !== 200) throw new Error(`Login failed for ${login}: ${r.statusCode} ${r.body}`);
  const j = JSON.parse(r.body);
  return { token: j.token, refreshToken: j.refreshToken, user: j.user };
}
