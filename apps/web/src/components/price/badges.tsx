import type { Verdict } from '@pretoscop/core';
import { Badge } from '@/components/ui/badge';

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
