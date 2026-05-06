// ============================================================
// Stockage de fichiers — abstraction disk / S3-compatible
// Sélection via UPLOAD_PROVIDER (disk|s3)
// ============================================================
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export interface StoredFile {
  url: string;          // URL accessible (relative ou absolue)
  filename: string;     // nom final
  size: number;
  mimeType: string;
}

interface StorageProvider {
  put(buffer: Buffer, mimeType: string, originalName: string, kind?: string): Promise<StoredFile>;
}

// ---- Disk provider (par défaut) ----
class DiskStorage implements StorageProvider {
  private root: string;
  constructor(root: string) { this.root = path.resolve(process.cwd(), root); }

  async put(buffer: Buffer, mimeType: string, originalName: string, kind?: string): Promise<StoredFile> {
    const ext = (originalName.match(/\.[^./\\]+$/)?.[0] ?? '').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 7).replace('-', '');
    const subdir = (kind || 'misc').replace(/[^a-z0-9_-]/gi, '_');
    const dir = path.join(this.root, subdir, stamp);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(dir, filename);
    await writeFile(filepath, buffer);
    const rel = path.relative(this.root, filepath).split(path.sep).join('/');
    return {
      url: `/uploads/${rel}`,
      filename,
      size: buffer.length,
      mimeType,
    };
  }
}

// ---- S3 provider (optionnel — n'est chargé que si UPLOAD_PROVIDER=s3) ----
async function makeS3Storage(): Promise<StorageProvider> {
  // Import dynamique pour ne pas exiger @aws-sdk/client-s3 en mode disk
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const region   = process.env.S3_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT;
  const bucket   = process.env.S3_BUCKET;
  const publicBase = process.env.S3_PUBLIC_BASE; // ex. https://cdn.argos.re
  const accessKeyId     = process.env.S3_ACCESS_KEY || '';
  const secretAccessKey = process.env.S3_SECRET_KEY || '';

  if (!bucket) throw new Error('S3_BUCKET manquant en environnement');

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!endpoint,
  });

  return {
    async put(buffer: Buffer, mimeType: string, originalName: string, kind?: string): Promise<StoredFile> {
      const ext = (originalName.match(/\.[^./\\]+$/)?.[0] ?? '').toLowerCase();
      const stamp = new Date().toISOString().slice(0, 7).replace('-', '');
      const subdir = (kind || 'misc').replace(/[^a-z0-9_-]/gi, '_');
      const key = `${subdir}/${stamp}/${randomUUID()}${ext}`;
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      }));
      const url = publicBase
        ? `${publicBase.replace(/\/$/,'')}/${key}`
        : `${endpoint?.replace(/\/$/,'') ?? ''}/${bucket}/${key}`;
      return { url, filename: key.split('/').pop()!, size: buffer.length, mimeType };
    },
  };
}

let _provider: StorageProvider | null = null;
export async function getStorage(): Promise<StorageProvider> {
  if (_provider) return _provider;
  if (config.uploadProvider === 's3') {
    _provider = await makeS3Storage();
  } else {
    _provider = new DiskStorage(config.uploadDir);
  }
  return _provider;
}
