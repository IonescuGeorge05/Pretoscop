import { B2B_STATUS_LABELS, baniToLeiString } from '@pretoscop/core';
import { b2bSkuPosition } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { removeSkuAction, updateSkuAction } from '@/app/b2b/actions';
import { Field, Flash, inputClass, Panel, StatBox, WorkspaceNav } from '@/components/b2b/ui';
import { PriceChart } from '@/components/product/price-chart';
import { Button } from '@/components/ui/button';
import { requireB2bData } from '@/lib/b2b';
import { display, machine, OFFER_COLUMNS, SKU_STATUS_LABELS, skuName } from '@/lib/b2b-table';
import { cn } from '@/lib/cn';
import { db } from '@/lib/db';
import { formatLei } from '@/lib/format';

export const metadata: Metadata = { title: 'SKU' };

const DETAIL_COLUMNS = OFFER_COLUMNS.filter((c) => c.key !== 'ref' && c.key !== 'produs');

export default async function SkuPage({ params, searchParams }: { params: Promise<{ ws: string; sku: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws, sku } = await params;
  const sp = await searchParams;
  const ctx = await requireB2bData(ws);
  const skuId = /^\d{1,12}$/.test(sku) ? Number(sku) : null;
  // Tenant isolation: a SKU of another workspace is simply not found here.
  const row = skuId === null ? null : await b2bSkuPosition(db(), ctx.workspace.id, skuId);
  if (!row) notFound();
  const w = ctx.workspace;
  return (
    <div>
      <WorkspaceNav ws={w.id} current="pozitii" />
      <Flash ok={sp.ok} eroare={sp.eroare} />
      <p className="mb-1 text-sm">
        <Link href={`/b2b/${w.id}`} className="text-brand-700 underline">
          ← Poziții
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-bold" data-testid="b2b-sku-title">
        {skuName(row)}
      </h1>
      <p className="mb-4 text-sm text-muted">
        {[row.ref && `cod intern ${row.ref}`, row.gtin && `GTIN ${row.gtin}`, row.mpn && `MPN ${row.mpn}`, row.product?.brand].filter(Boolean).join(' · ')}
        {row.product && (
          <>
            {' · '}
            <Link href={`/p/${row.product.slug}`} className="text-brand-700 underline">
              pagina publică
            </Link>
          </>
        )}
      </p>
      {row.status !== 'matched' ? (
        <Panel title="Produsul nu este încă în catalog">
          <p className="text-sm text-ink-soft">
            {SKU_STATUS_LABELS[row.status]}. Încercăm din nou în fiecare noapte; poți alege și produsul direct din catalog, din pagina{' '}
            <Link href={`/b2b/${w.id}/import`} className="text-brand-700 underline">Import</Link>.
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatBox label={row.ownBasis === 'reference' ? 'Prețul tău de referință' : 'Prețul tău'} value={formatLei(row.ownTotalBani)} testId="b2b-sku-own" />
            <StatBox label="Minimul concurenței" value={formatLei(row.position.minBani)} testId="b2b-sku-min" />
            <StatBox label="Mediana" value={formatLei(row.position.medianBani)} />
            <StatBox label="Poziția" value={row.position.rank === null ? '—' : `${row.position.rank} din ${row.position.competitors + 1}`} testId="b2b-sku-rank" />
            <StatBox label="Situația" value={<span className="text-base">{B2B_STATUS_LABELS[row.position.status]}</span>} />
          </div>
          <Panel title="Ofertele concurenței">
            {row.own && (
              <p className="mb-3 text-sm text-ink-soft">
                Oferta ta ({row.own.shopName}): {formatLei(row.own.totalBani)}, {row.own.availability === 'in_stock' ? 'în stoc' : 'fără stoc'}, verificată{' '}
                {display('time', row.own.lastCheckedAt)}
                {row.own.stale ? ' (veche)' : ''}.
              </p>
            )}
            {row.offers.length === 0 ? (
              <p className="text-sm text-ink-soft">Nicio ofertă a altui magazin în ultimele 30 de zile.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[13px]" data-testid="b2b-offers">
                  <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                    <tr>
                      {DETAIL_COLUMNS.map((c) => (
                        <th key={c.key} scope="col" className="px-2 py-2 font-semibold">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {row.offers.map((offer) => (
                      <tr key={offer.offerId} className={cn(!offer.comparable && 'text-muted')}>
                        {DETAIL_COLUMNS.map((c) => {
                          const v = c.value({ sku: row, offer });
                          return (
                            <td key={c.key} className={cn('px-2 py-2 align-top', c.kind !== 'text' && 'tabular whitespace-nowrap')} data-col={c.key} data-value={machine(c.kind, v) ?? ''}>
                              {c.key === 'link' ? (
                                <a href={offer.url} rel="nofollow noopener noreferrer" target="_blank" className="text-brand-700 underline">
                                  deschide
                                </a>
                              ) : (
                                display(c.kind, v)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[13px] text-muted">Rândurile gri nu intră în minim și mediană (fără stoc, vechi, resigilate, pachete sau prețuri în verificare).</p>
          </Panel>
          {row.product && (
            <Panel title="Istoricul prețului observat">
              <PriceChart productId={row.product.id} />
              <p className="mt-2 text-[13px] text-muted">Doar prețuri observate de Pretoscop; zilele fără observații rămân goale.</p>
            </Panel>
          )}
        </>
      )}
      {ctx.canManage && (
        <Panel title="Datele tale pentru acest SKU">
          <form action={updateSkuAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="ws" value={w.id} />
            <input type="hidden" name="sku" value={row.skuId} />
            <Field id="ref" label="Cod intern">
              <input id="ref" name="ref" aria-labelledby="ref-label" defaultValue={row.ref ?? ''} className={inputClass} />
            </Field>
            <Field id="label" label="Denumirea ta">
              <input id="label" name="label" aria-labelledby="label-label" defaultValue={row.label ?? ''} className={inputClass} />
            </Field>
            <Field id="referencePrice" label={w.kind === 'brand' ? 'Prețul recomandat (lei, cu TVA)' : 'Preț de referință (lei, cu TVA)'}>
              <input
                id="referencePrice"
                name="referencePrice"
                aria-labelledby="referencePrice-label"
                inputMode="decimal"
                defaultValue={row.referencePriceBani === null ? '' : baniToLeiString(row.referencePriceBani)!.replace('.', ',')}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit">Salvează</Button>
            </div>
          </form>
          <form action={removeSkuAction} className="mt-4">
            <input type="hidden" name="ws" value={w.id} />
            <input type="hidden" name="sku" value={row.skuId} />
            <Button type="submit" variant="ghost" size="sm" className="text-high">
              Nu mai urmări acest SKU
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
