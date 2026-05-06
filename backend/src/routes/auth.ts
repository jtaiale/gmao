// ============================================================
// Routes /auth — login, refresh, me, logout
// ============================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../lib/hash.js';
import { parsePermissions } from '../lib/permissions.js';
import { config } from '../config.js';

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  kind: z.enum(['admin', 'tech', 'client']).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', message: 'Identifiant et mot de passe requis' });
    const { login, password, kind } = parsed.data;

    const user = await app.prisma.user.findUnique({ where: { login } });
    if (!user) return reply.code(401).send({ error: 'invalid_credentials', message: 'Identifiant ou mot de passe incorrect' });
    if (kind && user.kind !== kind) {
      return reply.code(401).send({ error: 'wrong_kind', message: 'Ce compte n\'est pas autorisé pour cet espace' });
    }
    const ok = await verifyPassword(password, user.password);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials', message: 'Identifiant ou mot de passe incorrect' });

    const token = await reply.jwtSign({ sub: user.id, kind: user.kind as any, name: user.name });
    const refreshToken = await reply.jwtSign(
      { sub: user.id, kind: user.kind as any, name: user.name },
      { expiresIn: config.jwtRefreshExpiresIn }
    );

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        login: user.login,
        kind: user.kind,
        name: user.name,
        email: user.email,
        clientId: user.clientId,
        superAdmin: user.superAdmin,
        permissions: parsePermissions(user.permissions),
      },
    };
  });

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const schema = z.object({ refreshToken: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    try {
      const decoded = app.jwt.verify<{ sub: string; kind: any; name: string }>(parsed.data.refreshToken);
      const u = await app.prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!u) return reply.code(401).send({ error: 'invalid_token' });
      const token = await reply.jwtSign({ sub: u.id, kind: u.kind as any, name: u.name });
      return { token };
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  // GET /auth/me
  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    const u = await app.prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!u) return { user: null };
    return {
      user: {
        id: u.id,
        login: u.login,
        kind: u.kind,
        name: u.name,
        email: u.email,
        clientId: u.clientId,
        superAdmin: u.superAdmin,
        permissions: parsePermissions(u.permissions),
      },
    };
  });

  // POST /auth/logout (côté client : oublier le token)
  app.post('/logout', async () => ({ ok: true }));
}
