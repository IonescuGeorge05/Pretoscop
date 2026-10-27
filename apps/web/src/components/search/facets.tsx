import { toQueryString, type SearchParams, type SearchResult, type SortKey, SORT_LABELS } from '@pretoscop/search';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BrandInfo, CategoryTree } from '@/lib/catalog';
import { cn } from '@/lib/cn';

const href = (p: SearchParams, change: Partial<SearchParams>) => {
  const qs = toQueryString(p, { page: 1, ...change });
  return qs ? `/cauta?${qs}` : '/cauta';
};

function Toggle({ on, to, children, count }: { on: boolean; to: string; children: ReactNode; count?: number }) {
  return (
    <a
      href={to}
      rel="nofollow"
      className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-brand-50', on ? 'font-semibold text-brand-800' : 'text-ink-soft')}
    >
      <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 bg-white')} aria-hidden>
        {on && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        {children}
        {on && <span className="sr-only"> (filtru activ, apasă pentru a-l elimina)</span>}
      </span>
      {count !== undefined && <span className="text-xs tabular text-muted">{count}</span>}
    </a>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-3 last:border-0">
      <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Filters of the results page as plain links and one GET form (no JavaScript). Links carry
 * rel="nofollow": the combinations are endless and every /cauta page is noindex anyway.
 */
export function Facets({ p, r, tree, brands, idPrefix }: { p: SearchParams; r: SearchResult; tree: CategoryTree; brands: Map<string, BrandInfo>; idPrefix: string }) {
  const selectedCategory = p.category ? tree.bySlug.get(p.category) : undefined;
  const cats = r.facets.categories.filter((c) => tree.bySlug.has(c.value));
  const brandRows = r.facets.brands.filter((b) => brands.has(b.value) || p.brands.includes(b.value));
  const [topBrands, moreBrands] = [brandRows.slice(0, 10), brandRows.slice(10)];
  const brandToggle = (slug: string) => (p.brands.includes(slug) ? p.brands.filter((b) => b !== slug) : [...p.brands, slug]);
  const hidden: Array<[string, string]> = [];
  if (p.q) hidden.push(['q', p.q]);
  if (p.category) hidden.push(['categorie', p.category]);
  for (const b of p.brands) hidden.push(['marca', b]);
  if (p.shop) hidden.push(['magazin', p.shop]);
  if (p.inStock) hidden.push(['stoc', '1']);
  if (p.hasHistory) hidden.push(['istoric', '1']);
  if (p.sort !== (p.q ? 'relevanta' : 'populare')) hidden.push(['ordine', p.sort]);

  return (
    <div className="text-sm">
      <Group title="Categorie">
        {selectedCategory ? (
          <a href={href(p, { category: null })} rel="nofollow" className="flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-brand-800 hover:bg-brand-50">
            <X className="size-4" aria-hidden /> {selectedCategory.name}
            <span className="sr-only">(elimină filtrul)</span>
          </a>
        ) : cats.length ? (
          <ul>
            {cats.slice(0, 12).map((c) => (
              <li key={c.value}>
                <Toggle on={false} to={href(p, { category: c.value })} count={c.count}>
                  {tree.bySlug.get(c.value)!.name}
                </Toggle>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-muted">—</p>
        )}
      </Group>

      {brandRows.length > 0 && (
        <Group title="Marcă">
          <ul>
            {topBrands.map((b) => (
              <li key={b.value}>
                <Toggle on={p.brands.includes(b.value)} to={href(p, { brands: brandToggle(b.value) })} count={b.count}>
                  {brands.get(b.value)?.name ?? b.value}
                </Toggle>
              </li>
            ))}
          </ul>
          {moreBrands.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer px-2 py-1 text-brand-700">Încă {moreBrands.length} mărci</summary>
              <ul>
                {moreBrands.map((b) => (
                  <li key={b.value}>
                    <Toggle on={p.brands.includes(b.value)} to={href(p, { brands: brandToggle(b.value) })} count={b.count}>
                      {brands.get(b.value)?.name ?? b.value}
                    </Toggle>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Group>
      )}

      <Group title="Preț total (lei)">
        <form action="/cauta" method="get" className="flex flex-wrap items-end gap-2 px-2">
          {hidden.map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <div className="w-24">
            <label htmlFor={`${idPrefix}-min`} className="block text-xs text-muted">
              de la
            </label>
            <input id={`${idPrefix}-min`} aria-label="Preț total minim, în lei" name="pret_min" inputMode="numeric" defaultValue={p.priceMin ?? ''} placeholder={r.facets.price ? String(r.facets.price.min) : ''} className="h-9 w-full rounded-md bg-white px-2 ring-1 ring-line focus:outline-none focus:ring-brand-500" />
          </div>
          <div className="w-24">
            <label htmlFor={`${idPrefix}-max`} className="block text-xs text-muted">
              până la
            </label>
            <input id={`${idPrefix}-max`} aria-label="Preț total maxim, în lei" name="pret_max" inputMode="numeric" defaultValue={p.priceMax ?? ''} placeholder={r.facets.price ? String(r.facets.price.max) : ''} className="h-9 w-full rounded-md bg-white px-2 ring-1 ring-line focus:outline-none focus:ring-brand-500" />
          </div>
          <button type="submit" className="h-9 rounded-md bg-brand-600 px-3 font-semibold text-white hover:bg-brand-700">
            Aplică
          </button>
        </form>
        {(p.priceMin !== null || p.priceMax !== null) && (
          <a href={href(p, { priceMin: null, priceMax: null })} rel="nofollow" className="mt-1 inline-block px-2 text-xs text-brand-700 underline">
            Elimină limita de preț
          </a>
        )}
      </Group>

      <Group title="Disponibilitate și istoric">
        <Toggle on={p.inStock} to={href(p, { inStock: !p.inStock })} count={p.inStock ? undefined : r.facets.inStock}>
          Doar în stoc
        </Toggle>
        <Toggle on={p.hasHistory} to={href(p, { hasHistory: !p.hasHistory })} count={p.hasHistory ? undefined : r.facets.hasHistory}>
          Cu istoric de cel puțin 14 zile
        </Toggle>
      </Group>
    </div>
  );
}

/** Sort options as links (the active one is marked with aria-current). */
export function SortLinks({ p, options }: { p: SearchParams; options: SortKey[] }) {
  return (
    <nav aria-label="Ordonare" className="-mx-1 flex items-center gap-1 overflow-x-auto pb-1 text-sm">
      <span className="shrink-0 px-1 text-muted">Ordonează:</span>
      {options.map((s) => (
        <a
          key={s}
          href={href(p, { sort: s })}
          rel="nofollow"
          aria-current={p.sort === s ? 'true' : undefined}
          className={cn('shrink-0 rounded-full px-3 py-1 ring-1', p.sort === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-soft ring-line hover:bg-brand-50')}
        >
          {SORT_LABELS[s]}
        </a>
      ))}
    </nav>
  );
}

export function activeFilterChips(p: SearchParams, tree: CategoryTree, brands: Map<string, BrandInfo>): Array<{ label: string; to: string }> {
  const chips: Array<{ label: string; to: string }> = [];
  if (p.category) chips.push({ label: tree.bySlug.get(p.category)?.name ?? p.category, to: href(p, { category: null }) });
  for (const b of p.brands) chips.push({ label: brands.get(b)?.name ?? b, to: href(p, { brands: p.brands.filter((x) => x !== b) }) });
  if (p.shop) chips.push({ label: `Magazin: ${p.shop}`, to: href(p, { shop: null }) });
  if (p.priceMin !== null || p.priceMax !== null) {
    const label = p.priceMin !== null && p.priceMax !== null ? `${p.priceMin}–${p.priceMax} lei` : p.priceMin !== null ? `peste ${p.priceMin} lei` : `sub ${p.priceMax} lei`;
    chips.push({ label, to: href(p, { priceMin: null, priceMax: null }) });
  }
  if (p.inStock) chips.push({ label: 'În stoc', to: href(p, { inStock: false }) });
  if (p.hasHistory) chips.push({ label: 'Cu istoric', to: href(p, { hasHistory: false }) });
  return chips;
}

export { href as searchHref };
