// ============================================================
// Setup commun aux tests : DB SQLite isolée + helpers
// ============================================================
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const TEST_DIR = path.resolve(process.cwd(), 'tests', '.tmp');
const TEST_DB  = path.join(TEST_DIR, 'test.db');

// Variables d'environnement avant que Prisma soit chargé
process.env.NODE_ENV     = 'test';
process.env.DATABASE_URL = `file:${TEST_DB}`;
process.env.JWT_SECRET   = 'test-secret-32-chars-minimum-please';
process.env.HOST         = '127.0.0.1';
process.env.PORT         = '0';
process.env.SERVE_FRONTEND = 'false';
process.env.UPLOAD_DIR   = path.join(TEST_DIR, 'uploads');

beforeAll(() => {
  // Préparer le dossier
  mkdirSync(TEST_DIR, { recursive: true });
  if (existsSync(TEST_DB)) rmSync(TEST_DB);

  // Appliquer le schéma sur la DB de test (sans créer de migration)
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'inherit',
  });
});

afterAll(() => {
  // Cleanup à la fin de la suite
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
});
