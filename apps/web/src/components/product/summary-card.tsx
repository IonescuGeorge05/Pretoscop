import { allTimeLowExplanation, dropExplanation, verdictText } from '@pretoscop/core';
import type { PriceFacts } from '@pretoscop/db';
import { AllTimeLowBadge, DropBadge } from '@/components/price/badges';
import { Badge } from '@/components/ui/badge';
import { RelativeTime } from '@/components/ui/relative-time';
import { formatLeiNumeric } from '@/lib/format';
import type { ProductOffer, ProductPageData } from '@/lib/product';

const VERDICT_TONE = { good_price: 'good', usual: 'neutral', above_usual: 'high', insufficient_data: 'neutral' } as const;
const VERDICT_LABEL = { good_price: 'Preț bun', usual: 'Preț obișnuit', above_usual: 'Peste obișnuit', insufficient_data: 'Istoric insuficient' } as const;

/** Block 2 of the product page (docs/03 §7.2): best total now, shop, last check, verdict, click-out. */
export function SummaryCard({ best, stats, facts, placement }: { best: ProductOffer | null; stats: ProductPageData['stats']; facts: PriceFacts | null; placement: string }) {
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
          <div className="flex flex-wrap gap-1">
            <Badge tone={VERDICT_TONE[stats.verdict]}>{VERDICT_LABEL[stats.verdict]}</Badge>
            {facts?.drop && <DropBadge drop={facts.drop} />}
            {facts?.allTimeLow && <AllTimeLowBadge low={facts.allTimeLow} />}
          </div>
          <p className="text-sm text-ink-soft">{verdictText(stats.verdict, stats.observationsDays)}</p>
          {facts?.drop && (
            <p className="text-xs leading-relaxed text-ink-soft" data-testid="drop-explanation">
              {best?.sellerType === 'marketplace' ? 'La ofertele vândute direct de magazine: ' : ''}
              {dropExplanation(facts.drop)}{' '}
              <a href="/metodologie#reduceri" className="text-brand-700 underline">
                Cum verificăm
              </a>
            </p>
          )}
          {facts?.allTimeLow && <p className="text-xs leading-relaxed text-ink-soft">{allTimeLowExplanation(facts.allTimeLow)}</p>}
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
