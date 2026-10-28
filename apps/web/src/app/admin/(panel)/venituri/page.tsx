import { invoiceTotals, revenueSummary, sql, type RevenueRow } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Stat, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatLei, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

const lei = (bani: number | null) => (bani === null ? '—' : formatLei(bani));
const pct = (x: number | null) => (x === null ? '—' : formatPercent(x));

function Rows({ rows }: { rows: RevenueRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.key}>
          <Td>{r.label}</Td>
          <Td className="tabular">{r.clicks}</Td>
          <Td className="tabular">{r.affiliateClicks}</Td>
          <Td className="tabular">{r.commissions}</Td>
          <Td className="tabular">{lei(r.pendingBani)}</Td>
          <Td className="tabular">{lei(r.acceptedBani)}</Td>
          <Td className="tabular">{lei(r.epcBani)}</Td>
          <Td className="tabular">{pct(r.conversion)}</Td>
        </tr>
      ))}
    </>
  );
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ luna?: string }> }) {
  const { luna } = await searchParams;
  const month = luna && /^\d{4}-\d{2}$/.test(luna) ? luna : new Date().toISOString().slice(0, 7);
  const [summary, invoice, programs] = await Promise.all([
    revenueSummary(db(), 30),
    invoiceTotals(db(), month),
    db().execute<{ shop: string; network: string; status: string; policy: string; notes: string | null }>(sql`
      SELECT s.name AS shop, ap.network, ap.status, ap.comparator_policy AS policy, ap.notes FROM affiliate_programs ap JOIN shops s ON s.id = ap.shop_id
      ORDER BY (ap.status = 'approved') DESC, s.name`),
  ]);
  const t = summary.byShop.reduce(
    (a, r) => ({ clicks: a.clicks + r.clicks, aff: a.aff + r.affiliateClicks, n: a.n + r.commissions, pending: a.pending + r.pendingBani, accepted: a.accepted + r.acceptedBani }),
    { clicks: 0, aff: 0, n: 0, pending: 0, accepted: 0 },
  );
  const head = ['', 'Clickuri', 'Clickuri afiliate', 'Comisioane', 'În așteptare', 'Acceptate', 'EPC', 'Conversie'];
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Venituri</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Ultimele 30 de zile. EPC = comisioane acceptate (și plătite) pe click afiliat; conversie = comisioane pe click afiliat. Comisioanele vin din importul
        nocturn (2Performant) sau din <code>commissions:import</code> (rapoarte CSV).
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Clickuri" value={t.clicks} />
        <Stat label="Clickuri afiliate" value={t.aff} />
        <Stat label="Comisioane" value={t.n} />
        <Stat label="În așteptare" value={lei(t.pending)} />
        <Stat label="EPC" value={t.aff ? lei(Math.round(t.accepted / t.aff)) : '—'} />
      </div>
      <Section title="Pe magazine">
        <Table head={['Magazin', ...head.slice(1)]}>
          <Rows rows={summary.byShop} />
        </Table>
      </Section>
      <Section title="Pe zile">
        <Table head={['Ziua', ...head.slice(1)]}>
          <Rows rows={summary.byDay} />
        </Table>
      </Section>
      <Section
        title={`Pentru contabil: ${month}`}
        right={
          <div className="flex items-center gap-3 text-xs">
            <form className="flex items-center gap-1">
              <input name="luna" defaultValue={month} aria-label="Luna (AAAA-LL)" className="w-24 rounded border border-line px-2 py-1" />
              <button className="rounded bg-surface px-2 py-1 ring-1 ring-line">Arată</button>
            </form>
            <Link href={`/admin/venituri/factura?luna=${month}`} className="text-brand-700 underline">
              CSV
            </Link>
          </div>
        }
      >
        <Table head={['Rețea', 'Comisioane', 'Acceptate', 'Plătite', 'În așteptare']}>
          {invoice.map((i) => (
            <tr key={i.network}>
              <Td>{i.network}</Td>
              <Td className="tabular">{i.commissions}</Td>
              <Td className="tabular">{lei(i.acceptedBani)}</Td>
              <Td className="tabular">{lei(i.paidBani)}</Td>
              <Td className="tabular">{lei(i.pendingBani)}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Programe de afiliere">
        <Table head={['Magazin', 'Rețea', 'Stare', 'Comparatoare', 'Note']}>
          {programs.rows.map((p) => (
            <tr key={`${p.shop}-${p.network}`}>
              <Td>{p.shop}</Td>
              <Td>{p.network}</Td>
              <Td className="text-xs">{p.status}</Td>
              <Td className="text-xs">{p.policy}</Td>
              <Td className="text-xs text-muted">{p.notes}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
