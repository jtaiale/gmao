// ============================================================
// Point d'entrée Fastify — assemble les plugins et les routes
// ============================================================
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

import { config } from './config.js';
import { registerAuth } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { ticketsRoutes } from './routes/tickets.js';
import {
  clientsRoutes, sitesRoutes, productsRoutes, technicianRoutes, adminsRoutes,
} from './routes/referentials.js';
import { chantiersRoutes } from './routes/chantiers.js';
import { accidentsRoutes, derogationsRoutes, bulletinsRoutes } from './routes/safety.js';
import { statsRoutes } from './routes/stats.js';
import { exportsRoutes } from './routes/exports.js';
import { uploadsRoutes } from './routes/uploads.js';
import { pdfRoutes } from './routes/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function bootstrap() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const app = Fastify({
    logger: { transport: config.env === 'development' ? { target: 'pino-pretty' } : undefined },
    bodyLimit: config.uploadMaxBytes,
  });

  // CORS
  await app.register(fastifyCors, {
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    credentials: true,
  });

  // Multipart pour les uploads
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
  });

  // Auth + Prisma + helpers
  await registerAuth(app, prisma);

  // ---- API ----
  app.register(authRoutes,        { prefix: '/api/auth' });
  app.register(ticketsRoutes,     { prefix: '/api/tickets' });
  app.register(pdfRoutes,         { prefix: '/api/tickets' });
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

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // ---- Uploads (stockage local) ----
  const uploadDir = path.resolve(process.cwd(), config.uploadDir);
  mkdirSync(uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ---- Frontend statique (proto) ----
  if (config.serveFrontend) {
    const frontDir = path.resolve(process.cwd(), config.frontendDir);
    await app.register(fastifyStatic, {
      root: frontDir,
      prefix: '/',
      decorateReply: false,
    });
  }

  // Gestion d'erreur globale
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'error', message: err.message });
    }
    return reply.code(500).send({ error: 'internal_error', message: 'Erreur interne du serveur' });
  });

  try {
    await app.listen({ host: config.host, port: config.port });
    console.log(`✓ GMAO backend prêt sur http://${config.host}:${config.port}`);
    console.log(`  API     : http://${config.host}:${config.port}/api`);
    console.log(`  Health  : http://${config.host}:${config.port}/api/health`);
    if (config.serveFrontend) {
      console.log(`  Front   : http://${config.host}:${config.port}/`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // Arrêt propre
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      console.log(`\n${sig} reçu, arrêt en cours...`);
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

bootstrap().catch((e) => { console.error(e); process.exit(1); });
