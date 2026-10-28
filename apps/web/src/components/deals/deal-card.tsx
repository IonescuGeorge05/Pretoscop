import { allTimeLowExplanation, dropExplanation } from '@pretoscop/core';
import type { DealItem } from '@pretoscop/db';
import { AllTimeLowBadge, DropBadge } from '@/components/price/badges';
import { ProductImage } from '@/components/product/product-image';
import { Badge } from '@/components/ui/badge';
import { formatDayMonth, formatLei } from '@/lib/format';

const at = (day: string) => `${day}T12:00:00Z`;

/**
 * One verified deal. The data attributes drive the CSS-only filters of /reduceri (period, minimum
 * drop, all-time lows): the list works, and filters, without JavaScript.
 */
export function DealCard({ d, today, priority = false }: { d: DealItem; today: string; priority?: boolean }) {
  const pct = d.drop?.pct ?? 0;
  return (
    <li
      data-deal
      data-today={d.drop?.since === today ? '1' : '0'}
      data-p10={pct >= 0.1 ? '1' : '0'}
      data-p20={pct >= 0.2 ? '1' : '0'}
      data-p30={pct >= 0.3 ? '1' : '0'}
      data-atl={d.allTimeLow ? '1' : '0'}
      className="flex"
    >
      <article className="relative flex w-full gap-3 rounded-[var(--radius-card)] bg-white p-3 ring-1 ring-line hover:shadow-[var(--shadow-card)] hover:ring-brand-200 sm:p-4" data-testid="deal">
        <ProductImage storageKey={d.image} alt={d.title} size={120} className="w-20 shrink-0 self-start sm:w-24" priority={priority} />
        <div className="flex min-w-0 flex-1 flex-col">
          {d.brand && <p className="text-xs font-medium uppercase tracking-wide text-muted">{d.brand}</p>}
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            <a href={`/p/${d.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-brand-700">
              {d.title}
            </a>
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {d.drop && <DropBadge drop={d.drop} />}
            {d.allTimeLow && <AllTimeLowBadge low={d.allTimeLow} />}
            {d.drop?.since === today && <Badge tone="brand">Azi</Badge>}
          </div>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-2">
            <p className="leading-tight">
              <span className="text-lg font-bold tabular text-ink">{formatLei(d.currentBani)}</span>
              {d.shopName && <span className="block text-xs text-ink-soft">la {d.shopName}{d.shopCount > 1 ? ` (din ${d.shopCount} magazine)` : ''}</span>}
            </p>
            {d.drop ? (
              <p className="text-right text-xs text-muted">
                minim 30 de zile înainte: <span className="tabular">{formatLei(d.drop.referenceBani)}</span>
                <br />
                scădere din {formatDayMonth(at(d.drop.since))}
              </p>
            ) : d.thirtyDayLow ? (
              <p className="text-right text-xs text-muted">
                cel mai mic din ultimele 30 de zile
                <br />
                maxim în perioadă: <span className="tabular">{formatLei(d.thirtyDayLow.highBani)}</span>
              </p>
            ) : null}
          </div>
          <p className="sr-only">
            {d.drop ? dropExplanation(d.drop) : ''} {d.allTimeLow ? allTimeLowExplanation(d.allTimeLow) : ''}
          </p>
        </div>
      </article>
    </li>
  );
}
