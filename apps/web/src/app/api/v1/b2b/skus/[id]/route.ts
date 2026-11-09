import { auditLog, b2bSkuPosition, removeB2bSku } from '@pretoscop/db';
import { apiError, apiJson, withB2bApi } from '@/lib/b2b-api';
import { apiPositionDetail } from '@/lib/b2b-api-format';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const skuIdOf = (id: string) => (/^\d{1,12}$/.test(id) ? Number(id) : null);

/** GET /api/v1/b2b/skus/{id} — one SKU of the key's workspace, with every competitor offer. */
export async function GET(req: Request, route: { params: Promise<{ id: string }> }): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const id = skuIdOf((await route.params).id);
    // Tenant isolation: another workspace's SKU is "not found", never "forbidden".
    const row = id === null ? null : await b2bSkuPosition(db(), ctx.workspaceId, id);
    if (!row) return apiError(404, 'not_found', 'No such SKU in this workspace.', ctx.headers);
    return apiJson({ data: apiPositionDetail(row, ctx.baseUrl) }, ctx.headers);
  });
}

/** DELETE /api/v1/b2b/skus/{id} — stop tracking it. */
export async function DELETE(req: Request, route: { params: Promise<{ id: string }> }): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const id = skuIdOf((await route.params).id);
    if (id === null || !(await removeB2bSku(db(), ctx.workspaceId, id))) return apiError(404, 'not_found', 'No such SKU in this workspace.', ctx.headers);
    await db()
      .insert(auditLog)
      .values({ actor: `b2b-key:${ctx.principal.keyId}`, action: 'b2b.sku_remove', entity: 'b2b_workspaces', entityId: String(ctx.workspaceId), before: null, after: { skuId: id, via: 'api' } });
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', ...ctx.headers } });
  });
}
