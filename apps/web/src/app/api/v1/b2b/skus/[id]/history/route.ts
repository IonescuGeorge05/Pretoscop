import { b2bSkuProductId, getHistory, type HistoryRange } from '@pretoscop/db';
import { apiError, apiJson, withB2bApi } from '@/lib/b2b-api';
import { apiHistory } from '@/lib/b2b-api-format';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGES = new Set<HistoryRange>(['30d', '90d', '1y', 'all']);

/** GET /api/v1/b2b/skus/{id}/history?range= — observed daily series of the SKU's product (M08 history). */
export async function GET(req: Request, route: { params: Promise<{ id: string }> }): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const raw = (await route.params).id;
    const range = new URL(req.url).searchParams.get('range') ?? '90d';
    if (!RANGES.has(range as HistoryRange)) return apiError(400, 'invalid_request', 'range must be 30d, 90d, 1y or all.', ctx.headers);
    const productId = /^\d{1,12}$/.test(raw) ? await b2bSkuProductId(db(), ctx.workspaceId, Number(raw)) : null;
    if (productId === null) return apiError(404, 'not_found', 'No matched SKU with this id in this workspace.', ctx.headers);
    return apiJson(apiHistory(await getHistory(db(), productId, range as HistoryRange)), ctx.headers);
  });
}
