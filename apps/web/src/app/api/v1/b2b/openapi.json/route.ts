import { openApiDocument } from '@/lib/b2b-api-schema';

export const dynamic = 'force-static';

/** GET /api/v1/b2b/openapi.json — the B2B API contract (public, no key, no quota). */
export function GET(): Response {
  return new Response(`${JSON.stringify(openApiDocument(), null, 2)}\n`, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
