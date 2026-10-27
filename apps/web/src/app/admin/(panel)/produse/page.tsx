import { searchProducts } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatLeiNumeric } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; inactive?: string }> }) {
  const { q = '', inactive } = await searchParams;
  const rows = await searchProducts(db(), q, 60, { includeInactive: inactive === '1' });
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Produse</h1>
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Titlu, id, GTIN sau MPN" aria-label="Caută produse" className="w-80 max-w-full rounded border border-line px-2 py-1.5" />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="inactive" value="1" aria-label="Include îmbinate" defaultChecked={inactive === '1'} /> include îmbinate
        </label>
        <button className="rounded bg-brand-600 px-3 py-1.5 font-semibold text-white">Caută</button>
      </form>
      <Section title={q ? `Rezultate pentru „${q}”` : 'Produse recente'}>
        <Table head={['#', 'Produs', 'Marcă', 'Categorie', 'Oferte', 'Minim total', 'Stare']}>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="tabular text-xs">{p.id}</Td>
              <Td>
                <Link href={`/admin/produse/${p.id}`} className="text-brand-700 hover:underline">
                  {p.title}
                </Link>
                {p.mpn && <div className="text-xs text-muted">MPN {p.mpn}</div>}
              </Td>
              <Td>{p.brand ?? '—'}</Td>
              <Td className="text-xs">{p.category ?? '—'}</Td>
              <Td className="tabular">{p.offerCount}</Td>
              <Td className="tabular">{formatLeiNumeric(p.minTotal)}</Td>
              <Td className="text-xs">
                {p.status}
                {p.provisional ? ' · provizoriu' : ''}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
