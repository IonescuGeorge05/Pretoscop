import { merchants, sql } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/merchant-hints';

/** Merchant portal (M20): approval queue first, then everyone else. */
export default async function MerchantsAdminPage() {
  const rows = await db()
    .select()
    .from(merchants)
    .orderBy(sql`CASE ${merchants.status} WHEN 'pending' THEN 0 WHEN 'suspended' THEN 1 WHEN 'approved' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END`, sql`${merchants.submittedAt} DESC NULLS LAST`, sql`${merchants.id} DESC`)
    .limit(500);
  const pending = rows.filter((r) => r.status === 'pending').length;
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Magazine partenere</h1>
      <p className="mb-6 text-sm text-ink-soft">
        {pending} {pending === 1 ? 'cerere așteaptă' : 'cereri așteaptă'} aprobarea. Decizia de respingere sau suspendare se trimite magazinului cu motivele (P2B art. 4).
      </p>
      <Section title="Toate">
        <Table head={['Magazin', 'Stare', 'Domeniu', 'Feed', 'Trimis', 'Decis']}>
          {rows.map((m) => {
            const v = m.validation;
            return (
              <tr key={m.id} data-testid={`merchant-row-${m.id}`}>
                <Td>
                  <Link href={`/admin/comercianti/${m.id}`} className="font-medium text-brand-700 hover:underline">
                    {m.shopName ?? `#${m.id}`}
                  </Link>
                  <div className="text-xs text-muted">{m.contactEmail}</div>
                </Td>
                <Td>{STATUS_LABELS[m.status]}</Td>
                <Td>
                  {m.domain ?? '—'}
                  <div className="text-xs text-muted">{m.domainVerifiedAt ? `verificat (${m.verificationMethod})` : 'neverificat'}</div>
                </Td>
                <Td>
                  {v?.status ?? '—'}
                  {v?.report && <div className="text-xs text-muted">{v.report.normalization.accepted} afișabile din {v.report.offers}</div>}
                </Td>
                <Td>{m.submittedAt ? formatDateTime(m.submittedAt) : '—'}</Td>
                <Td>{m.decidedAt ? formatDateTime(m.decidedAt) : '—'}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}
