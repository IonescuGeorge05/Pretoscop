import { serverEnv } from '@/lib/db';
import { robotsTxt } from '@/lib/robots';

export const runtime = 'nodejs';
// Read at request time: the same build serves staging (closed) and production (open).
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const env = serverEnv();
  return new Response(robotsTxt({ indexable: env.SITE_INDEXABLE, baseUrl: env.PUBLIC_BASE_URL }), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
