import { b2bPositions, b2bSkuCount } from '@pretoscop/db';
import { apiError, apiJson, pageParams, withB2bApi } from '@/lib/b2b-api';
import { apiPosition } from '@/lib/b2b-api-format';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['matched', 'unmatched', 'ambiguous']);

/** GET /api/v1/b2b/positions — the position table of the key's workspace (M28). */
export async function GET(req: Request): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const url = new URL(req.url);
    const page = pageParams(url);
    const status = url.searchParams.get('status');
    if (!page || (status !== null && !STATUSES.has(status))) return apiError(400, 'invalid_request', 'Invalid limit, offset or status.', ctx.headers);
    const s = status as 'matched' | 'unmatched' | 'ambiguous' | null;
    const [rows, total] = await Promise.all([b2bPositions(db(), ctx.workspaceId, { ...page, status: s }), b2bSkuCount(db(), ctx.workspaceId, s)]);
    return apiJson({ data: rows.map((r) => apiPosition(r, ctx.baseUrl)), total, ...page }, ctx.headers);
  });
}
