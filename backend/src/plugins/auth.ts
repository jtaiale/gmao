// ============================================================
// Plugin Fastify : @fastify/jwt + helpers d'authentification
// - Décore l'instance Fastify avec `prisma` et `requireAuth`
// - Le JWT contient : { sub: userId, kind, name }
// ============================================================
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { checkAdminCan, parsePermissions, type PermissionMenu } from '../lib/permissions.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireKind: (...kinds: AuthKind[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdminCan: (menu: PermissionMenu, level?: 'read' | 'write') => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthSession;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; kind: AuthKind; name: string };
    user:    { sub: string; kind: AuthKind; name: string };
  }
}

export type AuthKind = 'admin' | 'tech' | 'client';
export interface AuthSession {
  id: string;
  kind: AuthKind;
  name: string;
  superAdmin?: boolean;
  permissions?: ReturnType<typeof parsePermissions>;
  clientId?: string | null;
}

export async function registerAuth(app: FastifyInstance, prisma: PrismaClient) {
  app.decorate('prisma', prisma);

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign:   { expiresIn: config.jwtExpiresIn },
  });

  // Middleware principal — vérifie le JWT et charge la session
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token invalide ou expiré' });
    }
    const payload = req.user;
    const u = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!u) return reply.code(401).send({ error: 'unauthorized', message: 'Utilisateur inexistant' });
    req.auth = {
      id: u.id,
      kind: u.kind as AuthKind,
      name: u.name,
      superAdmin: u.superAdmin,
      permissions: parsePermissions(u.permissions),
      clientId: u.clientId,
    };
  });

  // Garde par type d'utilisateur
  app.decorate('requireKind', (...kinds: AuthKind[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
    if (!kinds.includes(req.auth.kind)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Accès non autorisé pour ce type de compte' });
    }
  });

  // Garde admin par menu / niveau
  app.decorate('requireAdminCan', (menu: PermissionMenu, level: 'read' | 'write' = 'read') =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
      if (req.auth.kind !== 'admin') {
        return reply.code(403).send({ error: 'forbidden', message: 'Réservé aux administrateurs' });
      }
      const ok = checkAdminCan(req.auth.superAdmin ?? false, req.auth.permissions ?? {}, menu, level);
      if (!ok) return reply.code(403).send({ error: 'forbidden', message: `Permission manquante : ${menu}.${level}` });
    });
}
