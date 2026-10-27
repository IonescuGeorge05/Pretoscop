import { renderCsv } from '@pretoscop/report';
import { findReport } from '@/content/reports';

/** Data downloads of an approved report: the CSV files and the JSON (schema pretoscop.report/v1). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }): Promise<Response> {
  const { id, file } = await ctx.params;
  const r = findReport(id);
  if (!r) return new Response('Raport inexistent', { status: 404 });
  if (file === 'report.json') {
    return new Response(JSON.stringify(r, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${r.id}.json"` } });
  }
  const body = renderCsv(r)[file];
  if (!body) return new Response('Fișier inexistent', { status: 404 });
  return new Response(`\ufeff${body}`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${r.id}-${file}"`, 'cache-control': 'public, max-age=3600' },
  });
}
