import { monthlyPromotedStatement } from '@pretoscop/db';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

/** CSV field (RFC 4180): quoted when it holds a comma, quote or line break. */
const csv = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** A merchant-typed text cell: a leading =, +, - or @ would run as a formula in a spreadsheet. */
const text = (v: string | null) => (v !== null && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/**
 * Monthly promoted-placement statement per merchant as CSV, for the accountant (M25): opening and
 * closing wallet balances, paid top-ups (net, VAT, gross: the invoices to issue), billed clicks,
 * refunds and adjustments, Europe/Bucharest calendar month. Opening + movements = closing.
 */
export async function GET(req: Request): Promise<Response> {
  await requireAdmin();
  const luna = new URL(req.url).searchParams.get('luna') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(luna)) return new Response('luna=AAAA-LL', { status: 400 });
  const rows = await monthlyPromotedStatement(db(), luna);
  const lei = (b: number) => (b / 100).toFixed(2);
  const head = 'merchant_id,company,cui,shop,opening_ron,topups,topups_net_ron,topups_vat_ron,topups_gross_ron,clicks,clicks_ron,refunds_ron,adjustments_ron,closing_ron';
  const body = rows.map((r) =>
    [r.merchantId, text(r.companyName), text(r.cui), text(r.shopName), lei(r.openingBani), r.topups, lei(r.topupsNetBani), lei(r.topupsVatBani), lei(r.topupsGrossBani), r.clicks, lei(r.clicksBani), lei(r.refundsBani), lei(r.adjustmentsBani), lei(r.closingBani)]
      .map(csv)
      .join(','),
  );
  return new Response(`${[head, ...body].join('\r\n')}\r\n`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="promovare-${luna}.csv"`, 'cache-control': 'no-store' },
  });
}
