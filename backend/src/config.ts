// ============================================================
// Configuration centralisée — toutes les variables d'environnement
// ============================================================

function asInt(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function asBool(v: string | undefined, def: boolean): boolean {
  if (v == null) return def;
  return /^(1|true|yes|on)$/i.test(v);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: asInt(process.env.PORT, 4000),

  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',

  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-please-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  corsOrigin: (process.env.CORS_ORIGIN ?? '*').split(',').map(s => s.trim()).filter(Boolean),

  uploadProvider: process.env.UPLOAD_PROVIDER ?? 'disk',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  uploadMaxBytes: asInt(process.env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024),

  serveFrontend: asBool(process.env.SERVE_FRONTEND, true),
  frontendDir: process.env.FRONTEND_DIR ?? '../',
};

export type AppConfig = typeof config;
