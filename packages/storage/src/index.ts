import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { type Env, repoPath } from '@pretoscop/config/env';

/**
 * Object storage for raw snapshots, backups and (later) licensed images. Cloudflare R2 in
 * production (S3 API), a local directory in development. Keys are POSIX paths without a leading
 * slash, e.g. `snapshots/emag/12/345.jsonl.gz`.
 */
export interface BlobStore {
  readonly kind: 'fs' | 's3';
  put(key: string, body: Uint8Array | string, contentType?: string): Promise<void>;
  putStream(key: string, body: Readable, contentType?: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  getStream(key: string): Promise<Readable | null>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<{ key: string; size: number; modified: Date }[]>;
  delete(key: string): Promise<void>;
  /** Human-readable location for logs and runbooks. */
  describe(key: string): string;
}

function checkKey(key: string): string {
  if (!key || key.startsWith('/') || key.split('/').some((p) => p === '..' || p === '')) {
    throw new Error(`invalid blob key: ${key}`);
  }
  return key;
}

export class FsBlobStore implements BlobStore {
  readonly kind = 'fs' as const;
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const p = resolve(this.root, checkKey(key));
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error(`blob key escapes root: ${key}`);
    return p;
  }

  async put(key: string, body: Uint8Array | string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async putStream(key: string, body: Readable): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await pipeline(body, createWriteStream(p));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async getStream(key: string): Promise<Readable | null> {
    return (await this.exists(key)) ? createReadStream(this.path(key)) : null;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ key: string; size: number; modified: Date }[]> {
    const base = resolve(this.root);
    const out: { key: string; size: number; modified: Date }[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const key = relative(base, full).split(sep).join('/');
          if (key.startsWith(prefix)) {
            const s = await stat(full);
            out.push({ key, size: s.size, modified: s.mtime });
          }
        }
      }
    };
    await walk(base);
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  describe(key: string): string {
    return this.path(key);
  }
}

export class S3BlobStore implements BlobStore {
  readonly kind = 's3' as const;
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Uint8Array | string, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: checkKey(key), Body: body, ContentType: contentType }),
    );
  }

  async putStream(key: string, body: Readable, contentType?: string): Promise<void> {
    // R2 needs a known length for a single PUT: buffer (snapshots and dumps are compressed).
    const chunks: Buffer[] = [];
    for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
    await this.put(key, Buffer.concat(chunks), contentType);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const s = await this.getStream(key);
    if (!s) return null;
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
    return new Uint8Array(Buffer.concat(chunks));
  }

  async getStream(key: string): Promise<Readable | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: checkKey(key) }));
      return r.Body ? (r.Body as Readable) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: checkKey(key) }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ key: string; size: number; modified: Date }[]> {
    const out: { key: string; size: number; modified: Date }[] = [];
    let token: string | undefined;
    do {
      const r = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified ?? new Date(0) });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: checkKey(key) }));
  }

  describe(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }
}

/** The configured store: BLOB_DRIVER=fs (BLOB_FS_ROOT, relative to the repo) or s3 (R2). */
export function createBlobStore(env: Env): BlobStore {
  if (env.BLOB_DRIVER === 's3') {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('BLOB_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
    }
    const client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    return new S3BlobStore(client, env.S3_BUCKET);
  }
  const root = env.BLOB_FS_ROOT.startsWith('/') ? env.BLOB_FS_ROOT : repoPath(env.BLOB_FS_ROOT);
  return new FsBlobStore(root);
}

export { Readable };
