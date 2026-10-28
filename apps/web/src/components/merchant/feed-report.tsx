import type { MerchantValidation } from '@pretoscop/db/schema';
import { AlertTriangle, CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLei } from '@/lib/format';
import { FORMAT_LABELS, feedReportHints, rejectLabel, type Hint } from '@/lib/merchant-hints';

const AVAILABILITY: Record<string, string> = { in_stock: 'în stoc', out_of_stock: 'stoc epuizat', preorder: 'precomandă', unknown: 'necunoscut' };
const FIELD_LABELS: Array<[string, string]> = [
  ['gtin', 'EAN/GTIN'],
  ['brand', 'Marcă'],
  ['mpn', 'Cod producător'],
  ['availability', 'Stoc'],
  ['shippingCost', 'Cost livrare'],
  ['oldPrice', 'Preț vechi'],
  ['imageUrl', 'Imagine'],
  ['category', 'Categorie'],
];
const nf = new Intl.NumberFormat('ro-RO');

export function HintList({ hints }: { hints: Hint[] }) {
  if (hints.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="feed-hints">
      {hints.map((h) => {
        const Icon = h.level === 'error' ? CircleAlert : h.level === 'warn' ? AlertTriangle : Info;
        return (
          <li
            key={h.text}
            className={cn(
              'flex gap-2.5 rounded-lg px-3 py-2 text-sm ring-1',
              h.level === 'error' ? 'bg-high-bg text-high ring-red-200' : h.level === 'warn' ? 'bg-surface text-ink ring-line' : 'bg-info-bg text-blue-950 ring-blue-200',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{h.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The last feed check: progress, failure or report with hints and the 20-offer preview. */
export function FeedReportView({ validation, showDetail = false }: { validation: MerchantValidation | null; showDetail?: boolean }) {
  if (!validation) return <p className="text-sm text-muted">Feed-ul nu a fost verificat încă.</p>;
  if (validation.status === 'queued' || validation.status === 'running') {
    return (
      <p role="status" data-testid="feed-check-running" className="flex items-center gap-2 text-sm text-ink-soft">
        <LoaderCircle className="size-4 animate-spin text-brand-700" aria-hidden />
        Verificăm feed-ul… De obicei durează mai puțin de un minut; pagina se actualizează singură.
      </p>
    );
  }
  const r = validation.report;
  return (
    <div className="space-y-4" data-testid="feed-report">
      {validation.status === 'failed' && (
        <div role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm text-high ring-1 ring-red-200">
          <p className="font-semibold">Feed-ul nu a trecut verificarea.</p>
          <p className="mt-1">{validation.error}</p>
          {showDetail && validation.detail && <p className="mt-1 font-mono text-xs text-ink-soft">{validation.detail}</p>}
        </div>
      )}
      {r && (
        <>
          <p className="text-sm text-ink-soft" data-testid="feed-summary">
            Verificat la {formatDateTime(validation.finishedAt ?? r.fetchedAt)} · {FORMAT_LABELS[r.format]} · {nf.format(r.offers)} produse citite ·{' '}
            <strong className="text-ink">{nf.format(r.normalization.accepted)} pot fi afișate</strong>
            {r.truncated ? ' (primele 5.000)' : ''}
          </p>
          <HintList hints={feedReportHints(r)} />
          {r.offers > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Câmpuri găsite în feed">
              {FIELD_LABELS.map(([k, label]) => {
                const share = Math.round(((r.fields[k] ?? 0) / r.offers) * 100);
                return (
                  <span key={k} className={cn('rounded-full px-2.5 py-1 text-xs font-medium ring-1', share >= 90 ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-surface text-ink-soft ring-line')}>
                    {label}: {share}%
                  </span>
                );
              })}
            </div>
          )}
          {r.preview.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--radius-card)] ring-1 ring-line">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm" data-testid="feed-preview">
                <caption className="sr-only">Primele {r.preview.length} produse din feed, așa cum le-am afișa</caption>
                <thead className="bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">Produs</th>
                    <th scope="col" className="px-3 py-2 text-right">Preț</th>
                    <th scope="col" className="px-3 py-2 text-right">Livrare</th>
                    <th scope="col" className="px-3 py-2 text-right">Total</th>
                    <th scope="col" className="px-3 py-2">Stoc</th>
                    <th scope="col" className="px-3 py-2">Observații</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {r.preview.map((p) => (
                    <tr key={p.externalId} className={p.rejects.length ? 'bg-high-bg/40' : undefined}>
                      <td className="max-w-[20rem] px-3 py-2">
                        <div className="font-medium text-ink">{p.title}</div>
                        <div className="truncate text-xs text-muted">
                          {p.externalId}
                          {p.gtin ? ` · EAN ${p.gtin}` : ''}
                          {p.brand ? ` · ${p.brand}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatLei(p.priceBani)}
                        {p.oldPriceBani ? <div className="text-xs text-muted line-through">{formatLei(p.oldPriceBani)}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{p.shippingBasis === 'unknown' ? 'necunoscută' : formatLei(p.shippingBani)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular">{formatLei(p.totalBani)}</td>
                      <td className="px-3 py-2">{AVAILABILITY[p.availability ?? 'unknown'] ?? p.availability}</td>
                      <td className="px-3 py-2 text-xs text-ink-soft">
                        {p.rejects.length ? <span className="font-semibold text-high">Nu se afișează: {p.rejects.map(rejectLabel).join(', ')}</span> : p.condition !== 'new' ? p.condition : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
