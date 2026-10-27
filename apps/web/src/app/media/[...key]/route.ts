import { getEnv } from '@pretoscop/config/env';
import { createBlobStore } from '@pretoscop/storage';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

/**
 * Serves licensed product images (Icecat, feeds, manual) from the blob store in development.
 * Only keys under `images/` are reachable: snapshots and backups are never served.
 * Production serves the same keys from R2 through MEDIA_BASE_URL.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const { key } = await ctx.params;
  const path = key.join('/');
  if (!path.startsWith('images/') || key.some((p) => p === '..' || p === '')) return new Response('not found', { status: 404 });
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES[ext];
  if (!type) return new Response('not found', { status: 404 });
  const body = await createBlobStore(getEnv()).get(path);
  if (!body) return new Response('not found', { status: 404 });
  return new Response(Buffer.from(body), {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}
