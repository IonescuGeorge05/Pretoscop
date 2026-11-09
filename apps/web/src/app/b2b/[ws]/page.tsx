import { currentConsentText } from '@pretoscop/config/legal-texts';
import { B2B_PLANS } from '@pretoscop/core';
import { b2bPositions } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { acceptTermsAction } from '@/app/b2b/actions';
import { Flash, Panel, StatBox, WorkspaceNav } from '@/components/b2b/ui';
import { Button } from '@/components/ui/button';
import { requireB2bWorkspace } from '@/lib/b2b';
import { display, filterRows, machine, POSITION_COLUMNS, STATUS_FILTERS } from '@/lib/b2b-table';
import { cn } from '@/lib/cn';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Poziții' };

const PAGE = 100;

function TermsGate({ ws, canManage }: { ws: number; canManage: boolean }) {
  const t = currentConsentText('b2bTerms');
  if (!canManage) {
    return (
      <Panel title="Termenii de utilizare a datelor">
        <p className="text-sm text-ink-soft">Proprietarul spațiului de lucru trebuie să accepte mai întâi Termenii pentru clienții B2B. După aceea vezi aici pozițiile.</p>
      </Panel>
    );
  }
  return (
    <Panel title={t.title}>
      <form action={acceptTermsAction} className="space-y-4" data-testid="b2b-terms">
        <input type="hidden" name="ws" value={ws} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" required className="mt-1 accent-brand-600" aria-labelledby="b2b-terms-text" aria-describedby="b2b-terms-link" />
          <span id="b2b-terms-text">{t.text}</span>
        </label>
        <p id="b2b-terms-link" className="text-sm">
          <Link href={t.link.href} target="_blank" className="text-brand-700 underline">
            {t.link.label}
          </Link>
        </p>
        <Button type="submit">{t.acceptLabel}</Button>
      </form>
    </Panel>
  );
}

export default async function PositionsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireB2bWorkspace(ws);
  const w = ctx.workspace;
  const header = (
    <>
      <div className="mb-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold" data-testid="b2b-workspace-name">
          {w.name}
        </h1>
        <span className="text-sm text-muted">
          {B2B_PLANS[w.plan].label} · {w.kind === 'merchant' ? `prețurile tale: ${w.shopName ?? 'magazin nesetat'}` : 'brand: prețurile tale de referință'}
        </span>
      </div>
      <WorkspaceNav ws={w.id} current="pozitii" />
      <Flash ok={sp.ok} eroare={sp.eroare} />
    </>
  );
  if (!ctx.termsAccepted && !ctx.user.isAdmin) {
    return (
      <div>
        {header}
        <TermsGate ws={w.id} canManage={ctx.canManage} />
      </div>
    );
  }

  const all = await b2bPositions(db(), w.id);
  const rows = filterRows(all, sp.stare);
  const page = Math.max(1, Math.min(Number(sp.pagina) || 1, Math.max(1, Math.ceil(rows.length / PAGE))));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const count = (f: (typeof STATUS_FILTERS)[keyof typeof STATUS_FILTERS]) => all.filter(f.test).length;
  const filterQs = sp.stare && sp.stare in STATUS_FILTERS ? `&stare=${sp.stare}` : '';
  return (
    <div>
      {header}
      {!ctx.termsAccepted && (
        <p className="mb-4 rounded-lg bg-usual-bg px-4 py-3 text-sm text-usual ring-1 ring-line">Previzualizare de administrator: clientul nu a acceptat încă termenii.</p>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatBox label="SKU-uri urmărite" value={`${all.length} / ${ctx.limits.skuLimit}`} testId="b2b-stat-skus" />
        <StatBox label="Cel mai mic preț" value={count(STATUS_FILTERS.cel_mai_ieftin)} testId="b2b-stat-cheapest" />
        <StatBox label="Peste minim" value={count(STATUS_FILTERS.peste)} testId="b2b-stat-above" />
        <StatBox label="Fără prețul tău" value={count(STATUS_FILTERS.fara_pret)} />
        <StatBox label="Negăsite în catalog" value={count(STATUS_FILTERS.negasite)} />
      </div>
      <Panel
        title="Poziția prețurilor"
        right={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/b2b/${w.id}/export?tip=pozitii${filterQs}`} className="text-brand-700 underline" data-testid="b2b-export-positions" prefetch={false}>
              Descarcă CSV
            </Link>
            <Link href={`/b2b/${w.id}/export?tip=oferte${filterQs}`} className="text-brand-700 underline" prefetch={false}>
              CSV cu toate ofertele
            </Link>
          </div>
        }
      >
        <nav aria-label="Filtru" className="mb-3 flex flex-wrap gap-2 text-xs">
          <Link href={`/b2b/${w.id}`} className={cn('rounded px-2 py-1 ring-1 ring-line', !filterQs && 'bg-brand-50 font-semibold')}>
            Toate ({all.length})
          </Link>
          {Object.entries(STATUS_FILTERS).map(([key, f]) => (
            <Link key={key} href={`/b2b/${w.id}?stare=${key}`} className={cn('rounded px-2 py-1 ring-1 ring-line', sp.stare === key && 'bg-brand-50 font-semibold')}>
              {f.label} ({count(f)})
            </Link>
          ))}
        </nav>
        <p className="mb-3 text-[13px] text-muted">
          Prețuri totale (preț + livrare), cu TVA. Minimul și mediana iau în calcul doar ofertele noi, în stoc, verificate în intervalul obișnuit al magazinului;
          poziția 1 înseamnă cel mai mic preț. Detalii pe pagina fiecărui produs.
        </p>
        {shown.length === 0 ? (
          <p className="text-sm text-ink-soft" data-testid="b2b-empty">
            Nu urmărești încă niciun produs. <Link href={`/b2b/${w.id}/import`} className="text-brand-700 underline">Importă lista de SKU-uri</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]" data-testid="b2b-positions">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  {POSITION_COLUMNS.map((c) => (
                    <th key={c.key} scope="col" className="px-2 py-2 font-semibold" data-col={c.key}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.skuId} data-sku={r.skuId} className={cn(r.position.status === 'above' && 'bg-high-bg/40')}>
                    {POSITION_COLUMNS.map((c) => {
                      const v = c.value(r);
                      const text = display(c.kind, v);
                      return (
                        <td key={c.key} className={cn('px-2 py-2 align-top', c.kind !== 'text' && 'tabular whitespace-nowrap')} data-col={c.key} data-value={machine(c.kind, v) ?? ''}>
                          {c.key === 'produs' ? (
                            <Link href={`/b2b/${w.id}/sku/${r.skuId}`} className="text-brand-700 underline">
                              {text}
                            </Link>
                          ) : (
                            text
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
        {rows.length > PAGE && (
          <nav aria-label="Pagini" className="mt-3 flex flex-wrap gap-2 text-sm">
            {Array.from({ length: Math.ceil(rows.length / PAGE) }, (_, i) => i + 1).map((p) => (
              <Link key={p} href={`/b2b/${w.id}?pagina=${p}${filterQs}`} aria-current={p === page ? 'page' : undefined} className={cn('rounded px-2 py-1 ring-1 ring-line', p === page && 'bg-brand-600 text-white')}>
                {p}
              </Link>
            ))}
          </nav>
        )}
      </Panel>
    </div>
  );
}
