import { invoiceTotals } from '@pretoscop/db';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

/** Monthly commission totals per network as CSV, for the accountant (M24). */
export async function GET(req: Request): Promise<Response> {
  await requireAdmin();
  const luna = new URL(req.url).searchParams.get('luna') ?? '';
  if (!/^\d{4}-\d{2}$/.test(luna)) return new Response('luna=AAAA-LL', { status: 400 });
  const rows = await invoiceTotals(db(), luna);
  const money = (b: number) => (b / 100).toFixed(2);
  const body = ['network,commissions,accepted_ron,paid_ron,pending_ron', ...rows.map((r) => `${r.network},${r.commissions},${money(r.acceptedBani)},${money(r.paidBani)},${money(r.pendingBani)}`)].join('\r\n');
  return new Response(`${body}\r\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="comisioane-${luna}.csv"` } });
}
