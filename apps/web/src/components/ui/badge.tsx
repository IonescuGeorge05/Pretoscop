import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-surface text-ink-soft ring-1 ring-line',
      brand: 'bg-brand-50 text-brand-800 ring-1 ring-brand-200',
      good: 'bg-good-bg text-good ring-1 ring-green-200',
      usual: 'bg-usual-bg text-usual ring-1 ring-amber-200',
      high: 'bg-high-bg text-high ring-1 ring-red-200',
      info: 'bg-info-bg text-blue-800 ring-1 ring-blue-200',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
