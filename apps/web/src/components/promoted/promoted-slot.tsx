import { comparePromotedPrice } from '@pretoscop/core';
import type { PromotedSlotData } from '@pretoscop/db';
import Link from 'next/link';
import { formatLei, plural } from '@/lib/format';

/** `/out/…` of the slot: the click-out route bills it (M25) and never adds an affiliate link. */
export function promotedHref(data: Pick<PromotedSlotData, 'slot' | 'offerId' | 'placementId'>, categoryId?: number): string {
  return data.slot === 'product'
    ? `/out/${data.offerId}?p=promoted_product&k=${data.placementId}`
    : `/out/${data.offerId}?p=promoted_category&k=${data.placementId}&c=${categoryId ?? 0}`;
}

/**
 * The paid "Promovat" slot (M25, ADR-026), always outside the ranked list and visibly labelled
 * (UCPD Annex I point 11a as transposed into Law 363/2007; P2B Regulation art. 5; DSA art. 26): the
 * shop paid for this place. It never calls itself the best offer; when the promoted offer costs
 * more than the cheapest live offer, it says by how much. The organic list below stays ordered by total price and does not change.
 */
export function PromotedSlot({ data, categoryId }: { data: PromotedSlotData; categoryId?: number }) {
  const cmp = comparePromotedPrice(data.totalBani, data.bestTotalBani);
  const shipping =
    data.shippingBani === null ? 'livrare necunoscută' : data.shippingBani === 0 ? 'livrare gratuită' : `${data.shippingEstimated ? 'livrare estimată' : 'livrare'} ${formatLei(data.shippingBani)}`;
  return (
    <aside aria-label="Ofertă promovată" data-testid="promoted-slot" data-placement={data.placementId} className="rounded-[var(--radius-card)] bg-usual-bg p-4 ring-1 ring-amber-200">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="rounded-full bg-amber-200 px-2 py-0.5 font-bold uppercase tracking-wide text-amber-950" data-testid="promoted-label">
          Promovat
        </span>
        <span>
          {data.shopName} plătește pentru acest spațiu; nu schimbă ordinea ofertelor.{' '}
          <Link href="/cum-functioneaza#promovat" className="text-brand-700 underline">
            Ce înseamnă
          </Link>
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {data.slot === 'category' && (
            <Link href={`/p/${data.productSlug}`} className="block font-semibold text-ink hover:text-brand-700">
              {data.productTitle}
            </Link>
          )}
          <p className="text-sm text-ink">
            <span className="font-semibold">{data.shopName}</span>: <span className="text-lg font-bold tabular">{formatLei(data.totalBani)}</span>{' '}
            <span className="text-muted">
              total ({formatLei(data.priceBani)} + {shipping})
            </span>
          </p>
          {cmp.kind === 'more_expensive' ? (
            <p className="text-sm text-ink-soft" data-testid="promoted-more-expensive">
              Cu {formatLei(cmp.diffBani)} mai scump decât cea mai mică ofertă de acum ({formatLei(cmp.bestBani)}).
            </p>
          ) : null}
          {data.slot === 'category' && data.liveShops > 1 && (
            <Link href={`/p/${data.productSlug}`} className="text-sm text-brand-700 underline">
              Compară {plural(data.liveShops, 'magazin', 'magazine')}
            </Link>
          )}
        </div>
        <a
          href={promotedHref(data, categoryId)}
          rel="sponsored nofollow noopener"
          className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          data-testid="promoted-link"
        >
          Vezi oferta la {data.shopName}
        </a>
      </div>
    </aside>
  );
}
