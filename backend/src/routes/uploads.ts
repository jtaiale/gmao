// ============================================================
// Routes /uploads — upload multipart de fichiers (photos, signatures…)
// Provider de stockage choisi via UPLOAD_PROVIDER (disk|s3)
// ============================================================
import type { FastifyInstance } from 'fastify';
import { getStorage } from '../lib/storage.js';
import { config } from '../config.js';

const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;

export async function uploadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // POST /api/uploads (multipart : 1 fichier + champ optionnel "kind")
  app.post('/', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    const buf = await data.toBuffer();
    if (buf.length === 0)            return reply.code(400).send({ error: 'empty_file' });
    if (buf.length > config.uploadMaxBytes) {
      return reply.code(413).send({ error: 'file_too_large', message: `Limite ${(config.uploadMaxBytes/1024/1024).toFixed(0)} Mo` });
    }
    const mime = data.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME.test(mime)) {
      return reply.code(415).send({ error: 'unsupported_type', message: `Type non supporté : ${mime}` });
    }

    // "kind" peut être passé en champ supplémentaire OU en query param
    const kindFromForm = (data.fields as any)?.kind?.value;
    const kindFromQuery = (req.query as any)?.kind;
    const kind = String(kindFromForm || kindFromQuery || 'misc').slice(0, 32);

    const storage = await getStorage();
    const stored = await storage.put(buf, mime, data.filename || 'upload', kind);

    return reply.code(201).send(stored);
  });
}
