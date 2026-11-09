import { normalizeGtin, normalizeMpn, normalizeText, parsePriceRon, type B2bImportLine } from '@pretoscop/core';
import { auditLog, b2bPositions, b2bSkuCount, importB2bSkus } from '@pretoscop/db';
import { apiError, apiJson, pageParams, withB2bApi } from '@/lib/b2b-api';
import { apiSku } from '@/lib/b2b-api-format';
import { SkuImportRequest } from '@/lib/b2b-api-schema';
import { readTextCapped } from '@/lib/body';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['matched', 'unmatched', 'ambiguous']);
const MAX_BODY = 512 * 1024;

/** GET /api/v1/b2b/skus — tracked SKUs of the key's workspace. */
export async function GET(req: Request): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const url = new URL(req.url);
    const page = pageParams(url);
    const status = url.searchParams.get('status');
    if (!page || (status !== null && !STATUSES.has(status))) return apiError(400, 'invalid_request', 'Invalid limit, offset or status.', ctx.headers);
    const s = status as 'matched' | 'unmatched' | 'ambiguous' | null;
    const [rows, total] = await Promise.all([b2bPositions(db(), ctx.workspaceId, { ...page, status: s }), b2bSkuCount(db(), ctx.workspaceId, s)]);
    return apiJson({ data: rows.map((r) => apiSku(r, ctx.baseUrl)), total, ...page }, ctx.headers);
  });
}

const clean = (v: string | null | undefined, max = 200): string | null => {
  if (v === null || v === undefined) return null;
  const s = normalizeText(v).trim().slice(0, max);
  return s === '' ? null : s;
};

/** POST /api/v1/b2b/skus — adds SKUs by GTIN or MPN (same rules as the import page). */
export async function POST(req: Request): Promise<Response> {
  return withB2bApi(req, async (ctx) => {
    const text = await readTextCapped(req, MAX_BODY);
    if (text === null) return apiError(400, 'invalid_request', `Body larger than ${MAX_BODY} bytes.`, ctx.headers);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return apiError(400, 'invalid_request', 'Body is not JSON.', ctx.headers);
    }
    const parsed = SkuImportRequest.safeParse(json);
    if (!parsed.success) {
      return apiError(400, 'invalid_request', parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), ctx.headers);
    }
    const errors: Array<{ index: number; message: string }> = [];
    const lines: B2bImportLine[] = parsed.data.skus.map((s, index) => {
      const lineErrors: string[] = [];
      const gtin = s.gtin ? normalizeGtin(s.gtin) : null;
      if (s.gtin && !gtin) lineErrors.push('invalid gtin');
      const mpn = s.mpn ? normalizeMpn(s.mpn) : null;
      if (s.mpn && !mpn && !gtin) lineErrors.push('mpn too short or generic');
      if (!s.gtin && !s.mpn) lineErrors.push('gtin or mpn required');
      let referencePriceBani: number | null = null;
      if (s.reference_price) {
        const p = parsePriceRon(s.reference_price);
        if (p.ok) referencePriceBani = p.bani;
        else lineErrors.push('unreadable reference_price');
      }
      for (const message of lineErrors) errors.push({ index, message });
      return { line: index, gtin, mpn, mpnRaw: mpn ? clean(s.mpn) : null, brand: clean(s.brand), ref: clean(s.ref), label: clean(s.label), referencePriceBani, errors: lineErrors };
    });
    const r = await importB2bSkus(db(), ctx.workspaceId, lines, ctx.limits.skuLimit);
    await db()
      .insert(auditLog)
      .values({ actor: `b2b-key:${ctx.principal.keyId}`, action: 'b2b.import', entity: 'b2b_workspaces', entityId: String(ctx.workspaceId), before: null, after: { ...r, via: 'api' } });
    return apiJson(
      { added: r.added, matched: r.matched, unmatched: r.unmatched, ambiguous: r.ambiguous, duplicates: r.duplicates, invalid: r.invalid, over_limit: r.overLimit, errors: errors.slice(0, 100) },
      ctx.headers,
    );
  });
}
