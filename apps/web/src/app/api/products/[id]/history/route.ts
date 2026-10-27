import { getHistory, type HistoryRange } from '@pretoscop/db';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const RANGES = new Set<HistoryRange>(['30d', '90d', '1y', 'all']);

/** GET /api/products/{id}/history?range=30d|90d|1y|all → daily series (M13 contract). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: 'invalid id' }, { status: 400 });
  const r = new URL(req.url).searchParams.get('range') ?? '90d';
  if (!RANGES.has(r as HistoryRange)) return Response.json({ error: 'invalid range' }, { status: 400 });
  const h = await getHistory(db(), productId, r as HistoryRange);
  return Response.json(h, { headers: { 'cache-control': 'public, max-age=300, s-maxage=600' } });
}
