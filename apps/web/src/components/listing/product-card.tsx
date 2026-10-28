import type { ProductCard as Card } from '@pretoscop/search';
import { ProductImage } from '@/components/product/product-image';
import { AllTimeLowBadge, ListingDropBadge, VerdictBadge } from '@/components/price/badges';
import { cn } from '@/lib/cn';
import { formatLei, plural } from '@/lib/format';

const COLORS: Record<string, string> = {
  black: 'Negru', white: 'Alb', gray: 'Gri', silver: 'Argintiu', blue: 'Albastru', green: 'Verde', red: 'Roșu', pink: 'Roz',
  gold: 'Auriu', purple: 'Mov', yellow: 'Galben', orange: 'Portocaliu', beige: 'Bej', brown: 'Maro', titanium: 'Titan',
};

/** "256 GB · 8 GB RAM · 55″ · Negru": the attributes that tell variants apart. */
export function cardSpecs(a: Card['attributes']): string {
  const out: string[] = [];
  const n = (k: string) => (typeof a[k] === 'number' ? (a[k] as number) : null);
  const storage = n('storageGb');
  if (storage) out.push(storage >= 1024 && storage % 1024 === 0 ? `${storage / 1024} TB` : `${storage} GB`);
  if (n('ramGb')) out.push(`${n('ramGb')} GB RAM`);
  if (n('screenInches')) out.push(`${String(n('screenInches')).replace('.', ',')}″`);
  if (n('capacityL')) out.push(`${n('capacityL')} l`);
  if (n('capacityKg')) out.push(`${String(n('capacityKg')).replace('.', ',')} kg`);
  const color = typeof a.colorRo === 'string' ? a.colorRo : typeof a.color === 'string' ? COLORS[a.color] : null;
  if (color) out.push(color.charAt(0).toUpperCase() + color.slice(1));
  return out.join(' · ');
}

/**
 * One product in a listing (search, category, brand, shop). Prices are integer bani from the search
 * index: the lowest total (price + known delivery) among new, in-stock offers checked recently.
 * The whole card is clickable through the title link (stretched), so there is one link per card.
 */
export function ProductCard({ p, priority = false, placement }: { p: Card; priority?: boolean; placement?: string }) {
  const specs = cardSpecs(p.attributes ?? {});
  const href = `/p/${p.slug}`;
  return (
    <article className="relative flex gap-3 rounded-[var(--radius-card)] bg-white p-3 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-card)] hover:ring-brand-200 sm:p-4" data-testid="product-card" data-product-id={p.id}>
      <ProductImage storageKey={p.image} alt={p.title} size={120} className="w-20 shrink-0 self-start sm:w-24" priority={priority} />
      <div className="flex min-w-0 flex-1 flex-col">
        {p.brand && <p className="text-xs font-medium uppercase tracking-wide text-muted">{p.brand}</p>}
        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-ink">
          <a href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-brand-700" data-placement={placement}>
            {p.title}
          </a>
        </h3>
        {specs && <p className="mt-0.5 text-xs text-ink-soft">{specs}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-2">
          <PriceBlock p={p} />
          <div className="flex flex-wrap gap-1">
            {p.drop_pct ? <ListingDropBadge pct={p.drop_pct} referenceBani={p.drop_ref_bani ?? null} since={p.drop_since ?? null} /> : null}
            {p.all_time_low ? <AllTimeLowBadge /> : null}
            {!p.drop_pct && <VerdictBadge verdict={p.verdict} />}
          </div>
        </div>
      </div>
    </article>
  );
}

function PriceBlock({ p }: { p: Card }) {
  if (p.in_stock && p.min_total_bani !== null) {
    const where = p.shop_count > 1 ? `la ${plural(p.shop_count, 'magazin', 'magazine')}` : p.min_shop ? `la ${p.min_shop}` : null;
    return (
      <p className="leading-tight">
        <span className="block text-xs text-muted">{p.shop_count > 1 ? 'de la' : 'preț total'}</span>
        <span className="text-lg font-bold tabular text-ink">{formatLei(p.min_total_bani)}</span>
        {where && <span className="block text-xs text-ink-soft">{where}</span>}
      </p>
    );
  }
  return (
    <p className={cn('text-sm', p.offer_count > 0 ? 'text-ink-soft' : 'text-muted')}>
      {p.offer_count > 0 ? 'Indisponibil acum' : 'Nicio ofertă activă'}
      <span className="block text-xs text-muted">vezi istoricul prețului</span>
    </p>
  );
}

export function ProductGrid({ products, placement, priorityFirst = 2 }: { products: Card[]; placement?: string; priorityFirst?: number }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="product-list">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <div className="w-full">
            <ProductCard p={p} priority={i < priorityFirst} placement={placement} />
          </div>
        </li>
      ))}
    </ul>
  );
}
