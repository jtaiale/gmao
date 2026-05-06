import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getPrisma, seedMinimal, loginAs } from './app.js';

let app: FastifyInstance;

beforeAll(async () => {
  await seedMinimal();
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await getPrisma().$disconnect();
});

describe('Auth', () => {
  it('login admin avec bons identifiants → 200 + token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'admin' } });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(j.token).toBeTypeOf('string');
    expect(j.refreshToken).toBeTypeOf('string');
    expect(j.user.kind).toBe('admin');
    expect(j.user.superAdmin).toBe(true);
  });

  it('login mauvais mot de passe → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('login mauvais kind → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'admin', kind: 'tech' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me sans token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me avec token → 200 + user', async () => {
    const { token } = await loginAs(app, 'tech1', 'tech');
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(j.user.login).toBe('tech1');
    expect(j.user.kind).toBe('tech');
  });

  it('refresh token → renvoie un nouveau access token', async () => {
    const { refreshToken } = await loginAs(app, 'admin', 'admin');
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toBeTypeOf('string');
  });
});
