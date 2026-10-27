import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { serverEnv } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** POST /api/revalidate { tags: ["product:123"] } with `authorization: Bearer <REVALIDATE_TOKEN>` (worker → web). */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!same(auth, serverEnv().REVALIDATE_TOKEN)) return new Response('forbidden', { status: 403 });
  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && /^[a-z]+:[\w-]+$/.test(t)).slice(0, 500) : [];
  for (const t of tags) revalidateTag(t, 'max');
  return Response.json({ revalidated: tags.length });
}
