import { searchOffers } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime, formatLeiNumeric } from '@/lib/format';
import { blacklistOfferAction, unlinkOfferAction } from '../../catalog-actions';

export const dynamic = 'force-dynamic';

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ q?: string; bl?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const { q = '', bl } = await searchParams;
  const rows = await searchOffers(db(), q, { blacklisted: bl === '1' });
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Oferte</h1>
      <p className="mb-3 text-sm text-ink-soft">
        Dezleagă = oferta iese din produs definitiv (alias fix „fără produs”). Listă neagră = oferta nu mai este potrivită și nu mai apare public.
        Carantina prețurilor are pagina ei.
      </p>
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Id, id extern, URL sau cuvinte din titlu" aria-label="Caută oferte" className="w-96 max-w-full rounded border border-line px-2 py-1.5" />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="bl" value="1" aria-label="Doar lista neagră" defaultChecked={bl === '1'} /> doar lista neagră
        </label>
        <button className="rounded bg-brand-600 px-3 py-1.5 font-semibold text-white">Caută</button>
      </form>
      <Section title={`${rows.length} oferte`}>
        <Table head={['#', 'Magazin', 'Ofertă', 'Total', 'Potrivire', 'Verificat', '']}>
          {rows.map((o) => (
            <tr key={o.id} className={o.active ? '' : 'opacity-60'}>
              <Td className="tabular text-xs">{o.id}</Td>
              <Td className="text-xs">
                {o.shop}
                <div className="font-mono text-[10px] text-muted">{o.externalId.slice(0, 24)}</div>
              </Td>
              <Td>
                <a href={o.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                  {o.title.slice(0, 90)}
                </a>
              </Td>
              <Td className="tabular">{formatLeiNumeric(o.total)}</Td>
              <Td className="text-xs">
                {o.matchStatus}
                {o.productId && (
                  <>
                    {' '}
                    → <Link href={`/admin/produse/${o.productId}`} className="text-brand-700">#{o.productId}</Link>
                  </>
                )}
                {o.blacklisted && <span className="text-high"> · listă neagră</span>}
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(o.lastCheckedAt)}</Td>
              <Td>
                <div className="flex gap-1">
                  {o.productId && (
                    <form action={unlinkOfferAction}>
                      <input type="hidden" name="offerId" value={o.id} />
                      <button className="rounded bg-surface px-2 py-0.5 text-xs ring-1 ring-line">Dezleagă</button>
                    </form>
                  )}
                  <form action={blacklistOfferAction}>
                    <input type="hidden" name="offerId" value={o.id} />
                    <input type="hidden" name="on" value={o.blacklisted ? '0' : '1'} />
                    <button className={o.blacklisted ? 'rounded bg-good-bg px-2 py-0.5 text-xs text-good' : 'rounded bg-high-bg px-2 py-0.5 text-xs text-high'}>
                      {o.blacklisted ? 'Scoate din lista neagră' : 'Listă neagră'}
                    </button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
