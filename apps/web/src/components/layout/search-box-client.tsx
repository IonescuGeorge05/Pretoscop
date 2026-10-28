'use client';

import { Search } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { SuggestResponse } from '@/app/api/suggest/route';
import { cn } from '@/lib/cn';

type Option = { kind: 'product' | 'category' | 'brand'; href: string; label: string; detail: string | null };

function options(s: SuggestResponse): Option[] {
  return [
    ...s.products.map((p) => ({ kind: 'product' as const, href: p.href, label: p.title, detail: p.price ? (p.shops > 1 ? `de la ${p.price}` : p.price) : 'indisponibil acum' })),
    ...s.categories.map((c) => ({ kind: 'category' as const, href: c.href, label: c.name, detail: c.count })),
    ...s.brands.map((b) => ({ kind: 'brand' as const, href: b.href, label: b.name, detail: b.count })),
  ];
}

const GROUP: Record<Option['kind'], string> = { product: 'Produse', category: 'Categorii', brand: 'Mărci' };

const noSubscribe = () => () => undefined;
const queryFromLocation = () => (window.location.pathname === '/cauta' ? (new URLSearchParams(window.location.search).get('q') ?? '') : '');
const emptyQuery = () => '';

/**
 * Search form with autocomplete (M14). Without JavaScript it is a plain GET form to /cauta. With
 * JavaScript it is an ARIA 1.2 combobox: suggestions from /api/suggest after a short pause, grouped
 * (products, categories, brands), arrow keys move through them, Enter opens the highlighted one (or
 * searches), Escape or leaving the box closes the list. Focus stays in the input throughout.
 */
export function SearchBoxClient({ className, defaultValue, placeholder, buttonLabel }: { className?: string; defaultValue?: string; placeholder: string; buttonLabel: string }) {
  const id = useId();
  const inputId = `${id}-q`;
  const listId = `${id}-list`;
  // On the results page the box shows the query that was searched for (read from the URL after
  // hydration, so the server HTML and the first client render agree).
  const urlQuery = useSyncExternalStore(noSubscribe, queryFromLocation, emptyQuery);
  const [typed, setValue] = useState<string | null>(defaultValue ?? null);
  const value = typed ?? urlQuery;
  const [items, setItems] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function query(q: string) {
    clearTimeout(timer.current);
    abort.current?.abort();
    if (q.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const next = options((await res.json()) as SuggestResponse);
        setItems(next);
        setActive(-1);
        setOpen(next.length > 0);
      } catch {
        // aborted or offline: keep the plain form
      }
    }, 150);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault();
      window.location.assign(items[active]!.href);
    }
  }

  const expanded = open && items.length > 0;
  const groups = (['product', 'category', 'brand'] as const)
    .map((kind) => ({ kind, entries: items.map((o, i) => ({ o, i })).filter((x) => x.o.kind === kind) }))
    .filter((g) => g.entries.length > 0);
  return (
    <form ref={root} action="/cauta" method="get" role="search" className={cn('relative flex w-full', className)}>
      <label htmlFor={inputId} className="sr-only">
        {buttonLabel}
      </label>
      <input
        id={inputId}
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          query(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        // Leaving the input (Tab to the button or beyond) closes the list; clicks on an option keep
        // the focus here (mousedown is prevented), so they still land.
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        role="combobox"
        aria-label={placeholder}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        className="h-11 w-full rounded-l-lg border border-r-0 border-line bg-surface px-3 text-[15px] placeholder:text-muted focus:border-brand-500 focus:bg-white focus:outline-none"
      />
      <button type="submit" className="flex h-11 items-center gap-1.5 rounded-r-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">{buttonLabel}</span>
      </button>
      <div
        id={listId}
        role="listbox"
        aria-label="Sugestii"
        hidden={!expanded}
        className="absolute left-0 right-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-line"
      >
        {groups.map((g) => (
          <div key={g.kind} role="group" aria-labelledby={`${listId}-g-${g.kind}`}>
            <div id={`${listId}-g-${g.kind}`} role="presentation" className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {GROUP[g.kind]}
            </div>
            {g.entries.map(({ o, i }) => (
              // The option is the link itself (no interactive element inside an option); mousedown
              // keeps the focus in the input, so the list does not close before the click lands.
              <a
                key={`${o.kind}-${o.href}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                href={o.href}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                className={cn('flex items-baseline justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-50', i === active && 'bg-brand-50')}
              >
                <span className="line-clamp-2 text-ink">{o.label}</span>
                {o.detail && <span className="shrink-0 text-xs tabular text-muted">{o.detail}</span>}
              </a>
            ))}
          </div>
        ))}
      </div>
    </form>
  );
}
