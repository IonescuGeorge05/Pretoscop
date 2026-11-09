'use client';

import { Button } from '@/components/ui/button';
import { resetAdsConsent, setAdsConsent, useAdsConsent } from './ad-consent';

const TEXT = {
  accepted: 'ai acceptat reclama Google în spațiul „Publicitate”.',
  rejected: 'ai refuzat reclama Google; spațiul nu se afișează.',
  none: 'încă nu ai ales, deci nu se încarcă nicio reclamă.',
} as const;

/** The ad-slot choice on /cookies (M25): shows it and lets the visitor withdraw or change it. */
export function AdsPreferences() {
  const consent = useAdsConsent();
  const text = consent === undefined ? 'nu se încarcă nicio reclamă fără acordul tău.' : TEXT[consent ?? 'none'];
  return (
    <div className="my-5 flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <p className="m-0 text-sm text-ink-soft" role="status" data-testid="ads-consent-current">
        <span className="font-semibold text-ink">Alegerea ta: </span>
        {text}
      </p>
      <div className="flex gap-2">
        {consent === 'accepted' && (
          <Button type="button" variant="secondary" onClick={() => setAdsConsent('rejected')} data-testid="ads-withdraw">
            Retrage acordul
          </Button>
        )}
        {consent !== null && consent !== undefined && (
          <Button type="button" variant="secondary" onClick={() => resetAdsConsent()} data-testid="ads-reset">
            Întreabă-mă din nou
          </Button>
        )}
      </div>
    </div>
  );
}
