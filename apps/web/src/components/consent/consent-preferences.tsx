'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resetConsent, useConsent } from './consent';

const CHOICE_TEXT = {
  accepted: 'Ai acceptat statisticile anonime (Plausible).',
  rejected: 'Ai refuzat statisticile anonime.',
  none: 'Nu ai ales încă: statisticile anonime sunt oprite.',
} as const;

/** "Schimbă preferințele": shows the stored choice, clears it and re-opens the consent banner. */
export function ConsentPreferences() {
  const consent = useConsent();
  const text = consent === undefined ? 'Se citește alegerea ta…' : CHOICE_TEXT[consent ?? 'none'];
  return (
    <div className="my-5 flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <p className="m-0 text-sm text-ink-soft" role="status" data-testid="consent-current">
        <span className="font-semibold text-ink">Alegerea ta: </span>
        {text}
      </p>
      <Button
        type="button"
        variant="secondary"
        data-testid="consent-reset"
        onClick={() => {
          resetConsent();
          // Move keyboard focus to the re-opened banner.
          window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-testid="consent-reject"]')?.focus(), 0);
        }}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Schimbă preferințele
      </Button>
    </div>
  );
}
