'use client';

import type { ProductRow, ReviewItem } from '@pretoscop/db';
import { useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import { formatLeiNumeric } from '@/lib/format';
import { reviewDecideAction, searchProductsAction } from '../../catalog-actions';

type Kind = 'accept' | 'reject' | 'new_product' | 'bundle' | 'accessory';

/**
 * Review queue with keyboard shortcuts: j/k move, 1–5 accept the n-th candidate, N new product,
 * R reject, B bundle, A accessory, / search another product. Each decision becomes a sticky alias.
 */
export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const [cursor, setCursor] = useState(0);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductRow[]>([]);
  const current = items[Math.min(cursor, items.length - 1)];

  function decide(item: ReviewItem, kind: Kind, productId?: number) {
    const fd = new FormData();
    fd.set('offerId', String(item.offerId));
    fd.set('kind', kind);
    if (productId) fd.set('productId', String(productId));
    start(async () => {
      await reviewDecideAction(fd);
      setResults([]);
      setQuery('');
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (!current || pending || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, items.length - 1));
      else if (k === 'k' || e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
      else if (/^[1-5]$/.test(k)) {
        const c = current.candidates[Number(k) - 1];
        if (c) decide(current, 'accept', c.productId);
      } else if (k === 'n') decide(current, 'new_product');
      else if (k === 'r') decide(current, 'reject');
      else if (k === 'b') decide(current, 'bundle');
      else if (k === 'a') decide(current, 'accessory');
      else if (k === '/') {
        e.preventDefault();
        document.getElementById('review-search')?.focus();
      } else return;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (items.length === 0) return <p className="rounded-lg bg-white p-6 text-sm text-muted ring-1 ring-line">Nimic de verificat. Coada este goală.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Taste: <kbd>j</kbd>/<kbd>k</kbd> navigare · <kbd>1</kbd>–<kbd>5</kbd> acceptă candidatul · <kbd>n</kbd> produs nou · <kbd>r</kbd> respinge ·{' '}
        <kbd>b</kbd> pachet · <kbd>a</kbd> accesoriu · <kbd>/</kbd> caută alt produs
      </p>
      {items.map((it, i) => (
        <article
          key={it.offerId}
          data-testid="review-item"
          onFocusCapture={() => setCursor(i)}
          className={cn('grid gap-4 rounded-lg bg-white p-4 ring-1 lg:grid-cols-2', i === cursor ? 'ring-2 ring-brand-500' : 'ring-line', pending && i === cursor && 'opacity-60')}
        >
          <div className="min-w-0 space-y-1 text-sm">
            <div className="text-xs text-muted">
              {it.shopName} · {it.sellerType === 'marketplace' ? 'marketplace' : 'magazin'} · {it.condition} · scor {it.score?.toFixed(3) ?? '—'}
            </div>
            <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
              {it.title}
            </a>
            <div className="tabular">
              {formatLeiNumeric(it.price)} · total {formatLeiNumeric(it.total)}
            </div>
            <div className="text-xs text-ink-soft">
              {it.brand ?? 'fără marcă'} · MPN {it.mpn ?? '—'} · GTIN {it.gtin14 ?? '—'} · categorie {it.category ?? '—'}
            </div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {Object.entries(it.attributes)
                .filter(([k]) => k !== 'kind')
                .map(([k, v]) => (
                  <span key={k} className="rounded bg-surface px-1.5 py-0.5 ring-1 ring-line">
                    {k}: {Array.isArray(v) ? v.join(',') : String(v)}
                  </span>
                ))}
            </div>
            {it.reason && <div className="text-xs text-muted">Motiv: {it.reason}</div>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" disabled={pending} onClick={() => decide(it, 'new_product')} className="rounded bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                Produs nou (N)
              </button>
              <button type="button" disabled={pending} onClick={() => decide(it, 'reject')} className="rounded bg-high-bg px-2.5 py-1 text-xs font-semibold text-high">
                Respinge (R)
              </button>
              <button type="button" disabled={pending} onClick={() => decide(it, 'bundle')} className="rounded bg-surface px-2.5 py-1 text-xs ring-1 ring-line">
                Pachet (B)
              </button>
              <button type="button" disabled={pending} onClick={() => decide(it, 'accessory')} className="rounded bg-surface px-2.5 py-1 text-xs ring-1 ring-line">
                Accesoriu (A)
              </button>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            {it.candidates.length === 0 && <p className="text-sm text-muted">Niciun candidat.</p>}
            {it.candidates.map((c, n) => (
              <div key={c.productId} className="flex items-start gap-3 rounded border border-line p-2 text-sm" data-testid="review-candidate">
                <div className="w-14 shrink-0 text-right tabular">
                  <div className={cn('font-bold', c.score >= 0.9 ? 'text-good' : c.score >= 0.6 ? 'text-usual' : 'text-high')}>{c.score.toFixed(3)}</div>
                  <div className="text-[10px] text-muted">{c.via ?? c.generator}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <a href={`/p/${c.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {c.title}
                  </a>
                  <div className="text-xs text-muted">
                    #{c.productId} · {c.offerCount} oferte · {formatLeiNumeric(c.minTotal)}
                    {c.conflicts.length > 0 && <span className="text-high"> · conflicte: {c.conflicts.join(', ')}</span>}
                  </div>
                  {c.llm && (
                    <div className="text-xs text-ink-soft" data-testid="review-llm-opinion">
                      LLM ({c.llm.model.replace(/^claude-/, '')}): {c.llm.same ? 'același produs' : 'alt produs'} {c.llm.confidence.toFixed(2)} · {c.llm.reason}
                    </div>
                  )}
                </div>
                <button type="button" disabled={pending} onClick={() => decide(it, 'accept', c.productId)} className="shrink-0 rounded bg-good-bg px-2 py-1 text-xs font-semibold text-good">
                  Acceptă ({n + 1})
                </button>
              </div>
            ))}
            {i === cursor && (
              <div className="space-y-1">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => setResults(await searchProductsAction(query)));
                  }}
                  className="flex gap-2"
                >
                  <input
                    id="review-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Caută alt produs (titlu, id, GTIN, MPN)"
                    aria-label="Caută alt produs"
                    className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm"
                  />
                  <button type="submit" className="rounded bg-surface px-2 py-1 text-xs ring-1 ring-line">
                    Caută
                  </button>
                </form>
                {results.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      #{p.id} {p.title} <span className="text-muted">({p.status}, {p.offerCount} oferte)</span>
                    </span>
                    <button type="button" disabled={pending} onClick={() => decide(it, 'accept', p.id)} className="rounded bg-good-bg px-2 py-0.5 font-semibold text-good">
                      Acceptă
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
