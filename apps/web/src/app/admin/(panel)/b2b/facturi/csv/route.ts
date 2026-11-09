import { toCsv } from '@pretoscop/core';
import { listB2bInvoices } from '@pretoscop/db';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The month's B2B billing documents as CSV for the accountant (M28): one line per confirmed
 * payment with everything an e-Factura invoice needs. Formula-safe text cells.
 */
export async function GET(req: Request): Promise<Response> {
  await requireAdmin();
  const luna = new URL(req.url).searchParams.get('luna') ?? '';
  if (!/^\d{4}-\d{2}$/.test(luna)) return new Response('luna=AAAA-LL', { status: 400 });
  const rows = await listB2bInvoices(db(), null, luna);
  const body = toCsv(
    ['paid_at', 'workspace_id', 'buyer_name', 'buyer_cui', 'buyer_reg_com', 'buyer_address', 'buyer_email', 'plan', 'period_start', 'period_end', 'currency', 'net', 'vat_rate', 'vat', 'total', 'provider_invoice_id', 'fiscal_number', 'efactura_status'],
    rows.map((i) => [
      { text: i.paidAt ? new Date(i.paidAt).toISOString() : null },
      { num: i.workspaceId },
      { text: i.buyerName },
      { text: i.buyerCui },
      { text: i.buyerRegCom },
      { text: i.buyerAddress },
      { text: i.buyerEmail },
      { text: i.plan },
      { text: i.periodStart },
      { text: i.periodEnd },
      { text: i.currency },
      { num: i.netAmount },
      { num: i.vatRate },
      { num: i.vatAmount },
      { num: i.totalAmount },
      { text: i.providerInvoiceId },
      { text: i.fiscalNumber },
      { text: i.efacturaStatus },
    ]),
  );
  return new Response(body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="facturi-b2b-${luna}.csv"`, 'cache-control': 'no-store' },
  });
}
