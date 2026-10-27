import { verdictText } from '@pretoscop/core';
import { Badge } from '@/components/ui/badge';
import { RelativeTime } from '@/components/ui/relative-time';
import { formatLeiNumeric, formatPercent } from '@/lib/format';
import type { ProductOffer, ProductPageData } from '@/lib/product';

const VERDICT_TONE = { good_price: 'good', usual: 'neutral', above_usual: 'high', insufficient_data: 'neutral' } as const;
const VERDICT_LABEL = { good_price: 'Preț bun', usual: 'Preț obișnuit', above_usual: 'Peste obișnuit', insufficient_data: 'Istoric insuficient' } as const;

/** Block 2 of the product page (docs/03 §7.2): best total now, shop, last check, verdict, click-out. */
export function SummaryCard({ best, stats, drop, placement }: { best: ProductOffer | null; stats: ProductPageData['stats']; drop: number | null; placement: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line" data-testid={`summary-${placement}`}>
      <p className="text-sm text-muted">Cel mai mic preț total acum</p>
      <p className="mt-1 text-3xl font-bold tabular text-ink">{best ? formatLeiNumeric(best.total) : '—'}</p>
      {best ? (
        <p className="text-sm text-ink-soft">
          la <strong>{best.shopName}</strong>
          {best.sellerType === 'marketplace' && <span> (vânzător terț{best.sellerName ? `: ${best.sellerName}` : ''})</span>}
          {best.shippingCost === null
            ? ' · livrare de verificat'
            : Number(best.shippingCost) === 0
              ? ' · livrare gratuită'
              : ` · include livrarea de ${formatLeiNumeric(best.shippingCost)}`}
          <br />
          <span className="text-xs text-muted">
            Verificat <RelativeTime iso={best.lastCheckedAt} />
          </span>
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Nicio ofertă nouă în stoc, verificată recent.</p>
      )}
      {stats && (
        <div className="mt-3 space-y-1.5">
          <Badge tone={VERDICT_TONE[stats.verdict]}>{VERDICT_LABEL[stats.verdict]}</Badge>
          {drop !== null && (
            <Badge tone="good" className="ml-1">
              −{formatPercent(drop)} față de minimul ultimelor 30 de zile
            </Badge>
          )}
          <p className="text-sm text-ink-soft">{verdictText(stats.verdict, stats.observationsDays)}</p>
        </div>
      )}
      {best && (
        <a
          href={`/out/${best.id}?p=${placement}`}
          rel={best.hasAffiliate ? 'sponsored nofollow noopener' : 'nofollow noopener'}
          target="_blank"
          className="mt-4 flex h-11 items-center justify-center rounded-lg bg-brand-600 font-semibold text-white hover:bg-brand-700"
        >
          Mergi la {best.shopName}
        </a>
      )}
    </div>
  );
}
