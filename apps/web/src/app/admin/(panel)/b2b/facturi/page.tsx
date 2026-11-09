import { B2B_PLANS } from '@pretoscop/core';
import { listB2bInvoices } from '@pretoscop/db';
import Link from 'next/link';
import { setInvoiceFiscalAction } from '@/app/admin/b2b-actions';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';

const input = 'h-8 rounded border border-line bg-white px-2 text-xs';

/**
 * B2B billing documents (M28) of a month: what the accountant needs to issue the fiscal invoices
 * (RO e-Factura) — buyer, CUI, address, net, VAT, total — and where each one stands.
 */
export default async function B2bInvoicesPage({ searchParams }: { searchParams: Promise<{ luna?: string; eroare?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const { luna, eroare } = await searchParams;
  const month = luna && /^\d{4}-\d{2}$/.test(luna) ? luna : new Date().toISOString().slice(0, 7);
  const rows = await listB2bInvoices(db(), null, month);
  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href="/admin/b2b" className="text-brand-700 underline">
          ← B2B
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-bold">Facturi B2B: {month}</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Plăți confirmate de procesator. Factura fiscală se emite din aceste date (e-Factura, în 5 zile lucrătoare); apoi treceți aici numărul ei.
      </p>
      {eroare && (
        <p role="alert" className="mb-4 rounded bg-high-bg px-3 py-2 text-sm text-high">
          Numărul facturii este obligatoriu pentru orice altă stare decât „de emis”.
        </p>
      )}
      <Section
        title={`${rows.length} plăți`}
        right={
          <div className="flex items-center gap-3 text-xs">
            <form className="flex items-center gap-1">
              <input name="luna" defaultValue={month} aria-label="Luna (AAAA-LL)" className="w-24 rounded border border-line px-2 py-1" />
              <button className="rounded bg-surface px-2 py-1 ring-1 ring-line">Arată</button>
            </form>
            <Link href={`/admin/b2b/facturi/csv?luna=${month}`} className="text-brand-700 underline" prefetch={false}>
              CSV pentru contabil
            </Link>
          </div>
        }
      >
        <Table head={['Plătită', 'Client', 'CUI / adresă', 'Plan, perioada', 'Net', 'TVA', 'Total', 'Factura fiscală']}>
          {rows.map((i) => (
            <tr key={i.id}>
              <Td className="text-xs">{i.paidAt ? formatDate(i.paidAt) : '—'}</Td>
              <Td>
                {i.buyerName ?? i.workspaceName}
                <div className="text-xs text-muted">{i.buyerEmail}</div>
              </Td>
              <Td className="text-xs">
                {i.buyerCui ?? <span className="text-high">fără CUI</span>}
                <div className="text-muted">{i.buyerAddress ?? <span className="text-high">fără adresă</span>}</div>
              </Td>
              <Td className="text-xs">
                {B2B_PLANS[i.plan].label}
                <div className="text-muted">{i.periodStart && i.periodEnd ? `${i.periodStart} – ${i.periodEnd}` : '—'}</div>
              </Td>
              <Td className="tabular text-xs">
                {i.netAmount} {i.currency}
              </Td>
              <Td className="tabular text-xs">
                {i.vatAmount} ({i.vatRate}%)
              </Td>
              <Td className="tabular text-xs">
                {i.totalAmount} {i.currency}
              </Td>
              <Td>
                <form action={setInvoiceFiscalAction} className="flex flex-wrap items-center gap-1">
                  <input type="hidden" name="invoice" value={i.id} />
                  <input type="hidden" name="luna" value={month} />
                  <input name="fiscalNumber" aria-label="Numărul facturii fiscale" defaultValue={i.fiscalNumber ?? ''} placeholder="nr. factură" className={`${input} w-28`} />
                  <select name="efactura" aria-label="Starea în e-Factura" defaultValue={i.efacturaStatus} className={input}>
                    <option value="to_issue">de emis</option>
                    <option value="issued">emisă</option>
                    <option value="sent">trimisă</option>
                    <option value="accepted">acceptată</option>
                    <option value="rejected">respinsă</option>
                  </select>
                  <button className="rounded bg-surface px-2 py-1 text-xs ring-1 ring-line">Salvează</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
