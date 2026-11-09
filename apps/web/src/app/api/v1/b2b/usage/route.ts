import { b2bSkuCount, listB2bApiUsage } from '@pretoscop/db';
import { apiJson, nextBucharestMidnight, withB2bApi } from '@/lib/b2b-api';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/b2b/usage — quota, today's use (this request included) and the last 30 days. */
export async function GET(req: Request): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const [days, skus] = await Promise.all([listB2bApiUsage(db(), ctx.workspaceId, 30), b2bSkuCount(db(), ctx.workspaceId)]);
    const used = ctx.limits.apiDailyQuota - Number(ctx.headers['x-ratelimit-remaining']);
    return apiJson(
      {
        plan: ctx.principal.plan,
        quota: { limit: ctx.limits.apiDailyQuota, used, remaining: Math.max(0, ctx.limits.apiDailyQuota - used), resets_at: nextBucharestMidnight().toISOString() },
        per_minute: ctx.limits.apiPerMinute,
        skus: { limit: ctx.limits.skuLimit, used: skus },
        days,
      },
      ctx.headers,
    );
  });
}
