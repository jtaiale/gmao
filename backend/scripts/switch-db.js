// ============================================================
// Bascule le provider Prisma entre SQLite et PostgreSQL
// Usage : node scripts/switch-db.js sqlite | postgres
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');

const target = (process.argv[2] || '').toLowerCase();
if (!['sqlite', 'postgres', 'postgresql'].includes(target)) {
  console.error('Usage : node scripts/switch-db.js [sqlite|postgres]');
  process.exit(1);
}
const provider = target === 'sqlite' ? 'sqlite' : 'postgresql';

const src = readFileSync(SCHEMA_PATH, 'utf8');
const updated = src.replace(/provider\s*=\s*"(sqlite|postgresql|mysql|sqlserver)"/, `provider = "${provider}"`);
if (src === updated) {
  console.log(`✓ Provider Prisma déjà sur "${provider}"`);
} else {
  writeFileSync(SCHEMA_PATH, updated);
  console.log(`✓ Provider Prisma basculé sur "${provider}"`);
  console.log('Pensez à mettre à jour DATABASE_URL en .env, puis :');
  console.log('  npm run prisma:generate');
  console.log('  npm run prisma:migrate');
}
