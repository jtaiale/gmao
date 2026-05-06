import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getPrisma, seedMinimal, loginAs } from './app.js';

let app: FastifyInstance;
let ctx: Awaited<ReturnType<typeof seedMinimal>>;

beforeAll(async () => {
  ctx = await seedMinimal();
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await getPrisma().$disconnect();
});

async function authHeaders(login: string, password: string) {
  const { token } = await loginAs(app, login, password);
  return { authorization: `Bearer ${token}` };
}

describe('Tickets — golden path', () => {
  let ticketId: string;
  let ticketNumber: string;

  it('admin crée un ticket pour le client/site test', async () => {
    const headers = await authHeaders('admin', 'admin');
    const res = await app.inject({
      method: 'POST', url: '/api/tickets', headers,
      payload: {
        clientId: ctx.client.id, siteId: ctx.site.id,
        title: 'Test ticket', description: 'description',
        priority: 'haute',
        technicianIds: [ctx.tech.id],
      },
    });
    expect(res.statusCode).toBe(201);
    const j = JSON.parse(res.body);
    expect(j.id).toBeTypeOf('string');
    expect(j.number).toMatch(/^INT-\d{4}-\d{4}$/);
    ticketId = j.id; ticketNumber = j.number;
  });

  it('tech voit le ticket dans sa liste', async () => {
    const headers = await authHeaders('tech1', 'tech');
    const res = await app.inject({ method: 'GET', url: '/api/tickets', headers });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body);
    expect(list.some((t: any) => t.number === ticketNumber)).toBe(true);
  });

  it('tech ajoute un commentaire', async () => {
    const headers = await authHeaders('tech1', 'tech');
    const res = await app.inject({
      method: 'POST', url: `/api/tickets/${ticketId}/comments`, headers,
      payload: { text: 'Diagnostic en cours' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).text).toBe('Diagnostic en cours');
  });

  it('tech ne peut pas passer le statut à "cloture"', async () => {
    const headers = await authHeaders('tech1', 'tech');
    const res = await app.inject({
      method: 'PATCH', url: `/api/tickets/${ticketId}`, headers,
      payload: { status: 'cloture' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('tech passe le statut à "en_cours" + remplit heures et description intervention', async () => {
    const headers = await authHeaders('tech1', 'tech');
    const res = await app.inject({
      method: 'PATCH', url: `/api/tickets/${ticketId}`, headers,
      payload: { status: 'en_cours', hours: 2.5, tripCount: 1, interventionDescription: 'remplacement filtre' },
    });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(j.status).toBe('en_cours');
    expect(j.hours).toBe(2.5);
    expect(j.interventionDescription).toBe('remplacement filtre');
  });

  it('signature client avec nom du signataire', async () => {
    const headers = await authHeaders('tech1', 'tech');
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const res = await app.inject({
      method: 'POST', url: `/api/tickets/${ticketId}/signature`, headers,
      payload: { kind: 'client', dataUrl, signerName: 'Jean Dupont' },
    });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(j.signature).toBe(dataUrl);
    expect(j.signerName).toBe('Jean Dupont');
    expect(j.signatureDate).toBeTruthy();
  });

  it('admin clôture le ticket → completedAt renseigné', async () => {
    const headers = await authHeaders('admin', 'admin');
    const res = await app.inject({
      method: 'PATCH', url: `/api/tickets/${ticketId}`, headers,
      payload: { status: 'cloture' },
    });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(j.status).toBe('cloture');
    expect(j.completedAt).toBeTruthy();
  });
});

describe('Tickets — scope par rôle', () => {
  it('client ne voit que les tickets de son client', async () => {
    const headers = await authHeaders('cli1', 'cli');
    const res = await app.inject({ method: 'GET', url: '/api/tickets', headers });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body);
    expect(list.every((t: any) => t.clientId === ctx.client.id)).toBe(true);
  });

  it('client ne peut pas créer un ticket pour un autre client', async () => {
    const headers = await authHeaders('cli1', 'cli');
    const res = await app.inject({
      method: 'POST', url: '/api/tickets', headers,
      payload: {
        clientId: 'autre-client-id', siteId: ctx.site.id,
        title: 'Hack', description: '...', priority: 'normale',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Permissions admin', () => {
  it('admin "consult" peut lire les clients', async () => {
    const headers = await authHeaders('consult', 'cons');
    const res = await app.inject({ method: 'GET', url: '/api/clients', headers });
    expect(res.statusCode).toBe(200);
  });

  it('admin "consult" ne peut pas créer un client', async () => {
    const headers = await authHeaders('consult', 'cons');
    const res = await app.inject({
      method: 'POST', url: '/api/clients', headers,
      payload: { code: 'NEW', name: 'Nouveau' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin "consult" ne peut pas accéder aux admins', async () => {
    const headers = await authHeaders('consult', 'cons');
    const res = await app.inject({ method: 'GET', url: '/api/admins', headers });
    expect(res.statusCode).toBe(403);
  });
});
