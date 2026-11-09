import { b2bChanges } from '@pretoscop/db';
import { apiError, apiJson, withB2bApi } from '@/lib/b2b-api';
import { apiChange } from '@/lib/b2b-api-format';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEEK = 7 * 86_400_000;

/** GET /api/v1/b2b/changes?since=&limit= — observed price/stock changes on the workspace's SKUs. */
export async function GET(req: Request): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const url = new URL(req.url);
    const until = new Date();
    const sinceText = url.searchParams.get('since');
    const since = sinceText === null ? new Date(until.getTime() - 86_400_000) : new Date(sinceText);
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? 500 : Number(limitText);
    if (Number.isNaN(since.getTime()) || since.getTime() < until.getTime() - WEEK - 60_000 || since > until) {
      return apiError(400, 'invalid_request', 'since must be an ISO time within the last 7 days.', ctx.headers);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return apiError(400, 'invalid_request', 'limit must be 1–1000.', ctx.headers);
    const r = await b2bChanges(db(), ctx.workspaceId, since, until, limit);
    return apiJson({ data: r.changes.map(apiChange), total: r.total, since: since.toISOString(), until: until.toISOString() }, ctx.headers);
  });
}
