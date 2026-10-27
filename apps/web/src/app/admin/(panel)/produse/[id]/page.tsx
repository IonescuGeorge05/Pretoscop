import { listCategories, productDetail } from '@pretoscop/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDateTime, formatLeiNumeric } from '@/lib/format';
import {
  addGtinAction,
  blacklistOfferAction,
  mergeProductAction,
  removeGtinAction,
  setProductStatusAction,
  splitProductAction,
  undoMergeAction,
  unlinkOfferAction,
  updateProductAction,
} from '../../../catalog-actions';

export const dynamic = 'force-dynamic';

const input = 'w-full rounded border border-line px-2 py-1.5 text-sm';
const button = 'rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white';

export default async function ProductAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p, categories] = await Promise.all([productDetail(db(), id), listCategories(db())]);
  if (!p) notFound();
  const activeMerge = p.merges.find((m) => m.direction === 'out' && !m.undoneAt);

  return (
    <div>
      <p className="text-xs text-muted">
        <Link href="/admin/produse" className="hover:underline">
          Produse
        </Link>{' '}
        › #{p.id}
      </p>
      <h1 className="mb-1 text-xl font-bold">{p.title}</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Stare: <strong data-testid="product-status">{p.status}</strong>
        {p.provisional && ' · provizoriu (noindex)'}
        {p.mergedIntoId && (
          <>
            {' '}
            · îmbinat în <Link href={`/admin/produse/${p.mergedIntoId}`} className="text-brand-700 underline">#{p.mergedIntoId}</Link>
          </>
        )}{' '}
        ·{' '}
        <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 underline">
          pagina publică
        </a>
      </p>

      {activeMerge && (
        <form action={undoMergeAction} className="mb-6 rounded-lg bg-usual-bg p-3 text-sm">
          <input type="hidden" name="id" value={p.id} />
          Îmbinat în #{activeMerge.intoId} la {formatDateTime(activeMerge.createdAt)} de {activeMerge.actor}.{' '}
          <button className="ml-2 rounded bg-white px-2 py-1 text-xs font-semibold ring-1 ring-line">Anulează îmbinarea</button>
        </form>
      )}

      {p.status !== 'merged' && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <form action={updateProductAction} className="space-y-2 rounded-lg bg-white p-4 ring-1 ring-line">
            <h2 className="font-semibold">Editează</h2>
            <input type="hidden" name="id" value={p.id} />
            <label className="block text-xs text-muted">
              Titlu
              <input name="title" aria-label="Titlu" defaultValue={p.title} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Marcă
              <input name="brand" aria-label="Marcă" defaultValue={p.brand ?? ''} className={input} />
            </label>
            <label className="block text-xs text-muted">
              Categorie
              <select name="category" aria-label="Categorie" defaultValue={p.category ?? ''} className={input}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {'  '.repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="provisional" aria-label="Provizoriu" defaultChecked={p.provisional} /> provizoriu (noindex până la verificare)
            </label>
            <div className="flex items-center gap-2">
              <button className={button}>Salvează</button>
              <span className="text-xs text-muted">
                Familie: {p.family ?? '—'} · MPN {p.mpn ?? '—'}
              </span>
            </div>
          </form>

          <div className="space-y-4">
            <div className="rounded-lg bg-white p-4 ring-1 ring-line">
              <h2 className="mb-2 font-semibold">GTIN</h2>
              <ul className="mb-2 space-y-1 text-sm">
                {p.gtins.map((g) => (
                  <li key={g.gtin14} className="flex items-center gap-2">
                    <span className="font-mono">{g.gtin14}</span> <span className="text-xs text-muted">{g.source}</span>
                    <form action={removeGtinAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="gtin14" value={g.gtin14} />
                      <button className="text-xs text-high underline">șterge</button>
                    </form>
                  </li>
                ))}
                {p.gtins.length === 0 && <li className="text-xs text-muted">Niciun GTIN.</li>}
              </ul>
              <form action={addGtinAction} className="flex gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="gtin" placeholder="EAN / UPC / GTIN" aria-label="GTIN nou" className={input} />
                <button className={button}>Adaugă</button>
              </form>
            </div>

            <form action={mergeProductAction} className="rounded-lg bg-white p-4 ring-1 ring-line">
              <h2 className="mb-1 font-semibold">Îmbină în alt produs</h2>
              <p className="mb-2 text-xs text-muted">Ofertele se mută cu tot istoricul; pagina acestui produs redirecționează permanent. Se poate anula.</p>
              <input type="hidden" name="id" value={p.id} />
              <div className="flex gap-2">
                <input name="intoId" inputMode="numeric" placeholder="# produs țintă" aria-label="Id produs țintă" className={input} data-testid="merge-into" />
                <button className={button}>Îmbină</button>
              </div>
            </form>

            <form action={setProductStatusAction} className="rounded-lg bg-white p-4 ring-1 ring-line">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value={p.status === 'hidden' ? 'active' : 'hidden'} />
              <button className="rounded bg-surface px-3 py-1.5 text-sm ring-1 ring-line">{p.status === 'hidden' ? 'Fă vizibil' : 'Ascunde produsul'}</button>
              <span className="ml-2 text-xs text-muted">Un produs ascuns nu mai apare public (404); ofertele rămân legate.</span>
            </form>
          </div>
        </div>
      )}

      <form action={splitProductAction}>
        <input type="hidden" name="id" value={p.id} />
        {/* read only by the per-offer "Listă neagră" button (blacklist on) */}
        <input type="hidden" name="on" value="1" />
        <Section
          title={`Oferte (${p.offers.length})`}
          right={
            p.status !== 'merged' && (
              <div className="flex items-center gap-2">
                <input name="title" placeholder="Titlu produs nou (opțional)" aria-label="Titlu produs nou" className="w-64 rounded border border-line px-2 py-1 text-xs" />
                <button className="rounded bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-line">Separă ofertele bifate</button>
              </div>
            )
          }
        >
          <Table head={['', 'Magazin', 'Ofertă', 'Total', 'Stoc', 'Potrivire', 'Verificat', '']}>
            {p.offers.map((o) => (
              <tr key={o.id} className={o.active ? '' : 'opacity-60'}>
                <Td>
                  <input type="checkbox" name="offerIds" value={o.id} aria-label={`Selectează oferta ${o.id}`} />
                </Td>
                <Td className="text-xs">
                  {o.shop}
                  {o.sellerType === 'marketplace' && ' (mp)'}
                </Td>
                <Td>
                  <a href={o.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {o.title.slice(0, 90)}
                  </a>
                  {o.condition !== 'new' && <span className="text-xs text-usual"> · {o.condition}</span>}
                </Td>
                <Td className="tabular">{formatLeiNumeric(o.total)}</Td>
                <Td className="text-xs">{o.availability}</Td>
                <Td className="text-xs">
                  {o.matchStatus}
                  <div className="text-muted">{o.matchReason?.slice(0, 60)}</div>
                </Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(o.lastCheckedAt)}</Td>
                <Td>
                  <div className="flex gap-1">
                    <button formAction={unlinkOfferAction} name="offerId" value={o.id} className="rounded bg-surface px-2 py-0.5 text-xs ring-1 ring-line">
                      Dezleagă
                    </button>
                    <button formAction={blacklistOfferAction} name="offerId" value={o.id} className="rounded bg-high-bg px-2 py-0.5 text-xs text-high">
                      Listă neagră
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      </form>

      <Section title="Istoric îmbinări">
        <Table head={['#', 'Din', 'În', 'Actor', 'Data', 'Anulat']}>
          {p.merges.map((m) => (
            <tr key={m.id}>
              <Td className="tabular text-xs">{m.id}</Td>
              <Td>
                <Link href={`/admin/produse/${m.fromId}`} className="text-brand-700">#{m.fromId}</Link>
              </Td>
              <Td>
                <Link href={`/admin/produse/${m.intoId}`} className="text-brand-700">#{m.intoId}</Link>
              </Td>
              <Td className="text-xs">{m.actor}</Td>
              <Td className="text-xs">{formatDateTime(m.createdAt)}</Td>
              <Td className="text-xs">{m.undoneAt ? formatDateTime(m.undoneAt) : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
