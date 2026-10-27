import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Outcome box of the alert pages (confirmation, unsubscribe, results). */
export function Notice({ tone, title, children, headingLevel = 1 }: { tone: 'good' | 'warn'; title: string; children?: ReactNode; headingLevel?: 1 | 2 }) {
  const Icon = tone === 'good' ? CheckCircle2 : CircleAlert;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div
      role="status"
      data-testid={`notice-${tone}`}
      className={tone === 'good' ? 'rounded-[var(--radius-card)] bg-brand-50 p-5 ring-1 ring-brand-200' : 'rounded-[var(--radius-card)] bg-usual-bg p-5 ring-1 ring-amber-200'}
    >
      <div className="flex items-start gap-3">
        <Icon className={tone === 'good' ? 'mt-0.5 size-6 shrink-0 text-brand-700' : 'mt-0.5 size-6 shrink-0 text-usual'} aria-hidden />
        <div className="space-y-2 text-[15px] text-ink-soft">
          <Heading className="text-lg font-semibold text-ink">{title}</Heading>
          {children}
        </div>
      </div>
    </div>
  );
}
