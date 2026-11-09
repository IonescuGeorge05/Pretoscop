import { auditLog, b2bMembership, b2bPositions, bucharestToday, getB2bWorkspace } from '@pretoscop/db';
import { auth } from '@/lib/auth';
import { b2bOpen, workspaceId } from '@/lib/b2b';
import { filterRows, OFFER_COLUMNS, offerRows, POSITION_COLUMNS, tableCsv } from '@/lib/b2b-table';
import { db, serverEnv } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * GET /b2b/{ws}/export?tip=pozitii|oferte[&stare=…] — the position table (same columns and filter
 * as the page) or one line per competitor offer, as CSV. Members only (or admins); the tenant gate
 * is the same as the pages'. Text cells are protected against spreadsheet formula injection.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }): Promise<Response> {
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return new Response('Autentifică-te.', { status: 401, headers: NO_STORE });
  const id = workspaceId((await ctx.params).ws);
  const email = s.user.email?.toLowerCase() ?? '';
  const isAdmin = (s.user as { role?: string }).role === 'admin' && serverEnv().ADMIN_EMAILS.includes(email);
  const [w, m] = id === null ? [null, null] : await Promise.all([getB2bWorkspace(db(), id), b2bMembership(db(), id, s.user.id)]);
  if (!w || (!m && !isAdmin)) return new Response('Negăsit.', { status: 404, headers: NO_STORE });
  if (!isAdmin && (!(await b2bOpen()) || w.status !== 'active' || !w.termsAcceptedAt)) return new Response('Indisponibil.', { status: 403, headers: NO_STORE });
  const url = new URL(req.url);
  const tip = url.searchParams.get('tip') === 'oferte' ? 'oferte' : 'pozitii';
  const rows = filterRows(await b2bPositions(db(), w.id), url.searchParams.get('stare'));
  const body = tip === 'oferte' ? tableCsv(OFFER_COLUMNS, offerRows(rows)) : tableCsv(POSITION_COLUMNS, rows);
  await db()
    .insert(auditLog)
    .values({ actor: m ? `b2b:${s.user.id}` : `human:${s.user.id}`, action: 'b2b.export', entity: 'b2b_workspaces', entityId: String(w.id), before: null, after: { tip, rows: rows.length } });
  return new Response(body, {
    headers: {
      ...NO_STORE,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pretoscop-${tip}-${w.id}-${bucharestToday()}.csv"`,
      'x-content-type-options': 'nosniff',
    },
  });
}
