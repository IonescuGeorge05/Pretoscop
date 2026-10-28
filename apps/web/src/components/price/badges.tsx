import { allTimeLowExplanation, dropBadgeText, dropExplanation, type AllTimeLow, type PriceDrop, type Verdict } from '@pretoscop/core';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatLei } from '@/lib/format';

/**
 * Price badges (M15). Every badge rests on Pretoscop's own observations and says so; the shop's
 * crossed price is never turned into a badge (it is shown separately as "preț de referință afișat de
 * magazin"). Rules: @pretoscop/core `verifiedDrop`, `newAllTimeLow`, `computeVerdict` (README "Verdicts,
 * verified drops and badges"). Green is reserved for good news about the price.
 */

const VERDICT: Record<Exclude<Verdict, 'insufficient_data'>, { label: string; tone: 'good' | 'neutral' | 'high'; title: string }> = {
  good_price: { label: 'Preț bun', tone: 'good', title: 'Cel mai mic preț total din ultimele 30 de zile observate de Pretoscop (cel mult +1%).' },
  usual: { label: 'Preț obișnuit', tone: 'neutral', title: 'Preț obișnuit pentru acest produs în ultimele 90 de zile.' },
  above_usual: { label: 'Peste obișnuit', tone: 'high', title: 'Cu cel puțin 8% peste mediana ultimelor 90 de zile.' },
};

/** Price verdict (M08 rules) on listings; nothing while the history is shorter than 14 days. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === 'insufficient_data') return null;
  const v = VERDICT[verdict];
  return (
    <Badge tone={v.tone} title={v.title}>
      {v.label}
    </Badge>
  );
}

/** "−15% față de minimul din 30 de zile" with the full statement as its accessible description. */
export function DropBadge({ drop }: { drop: PriceDrop }) {
  return (
    <Badge tone="good" title={dropExplanation(drop)} data-testid="drop-badge">
      {dropBadgeText(drop)}
    </Badge>
  );
}

/** Compact variant for listings, from the search document (percentage, reference, start day). */
export function ListingDropBadge({ pct, referenceBani, since }: { pct: number; referenceBani: number | null; since: string | null }) {
  // The listing's price may be a marketplace seller's; the drop is measured on shop-sold offers.
  const title = `Cel mai mic preț total al ofertelor vândute direct de magazine, față de cel mai mic preț observat de Pretoscop în cele 30 de zile dinaintea scăderii${referenceBani ? ` (${formatLei(referenceBani)})` : ''}${since ? `; prețul mai mic observat începând cu ${formatDate(`${since}T12:00:00Z`)}` : ''}.`;
  return (
    <Badge tone="good" title={title} data-testid="drop-badge">
      {dropBadgeText({ pct })}
    </Badge>
  );
}

export function AllTimeLowBadge({ low }: { low?: AllTimeLow | null }) {
  return (
    <Badge tone="good" title={low ? allTimeLowExplanation(low) : 'Cel mai mic preț total observat de Pretoscop pentru acest produs.'} data-testid="all-time-low-badge">
      Minim istoric
    </Badge>
  );
}
