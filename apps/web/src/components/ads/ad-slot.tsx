'use client';

import { currentConsentText } from '@pretoscop/config/legal-texts';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { setAdsConsent, useAdsConsent } from './ad-consent';

const TEXT = currentConsentText('adsConsent');
const SCRIPT_SELECTOR = 'script[data-pretoscop="adsense"]';

type AdsQueue = unknown[] & { requestNonPersonalizedAds?: number };
declare global {
  interface Window {
    adsbygoogle?: AdsQueue;
  }
}

/**
 * The optional ad slot (M25), outside the offers table and labelled "Publicitate". Rendered only by
 * `AdSlotGate` (build with an AdSense publisher id, flag `ads.slots.enabled` on). Nothing from
 * Google loads until the visitor accepts in the slot itself; a refusal hides the slot. Ads are
 * requested non-personalized (no profile-based targeting) until a certified consent platform (TCF)
 * is in place (docs/13).
 */
export function AdSlot({ client, slot, placement }: { client: string; slot: string | null; placement: string }) {
  const consent = useAdsConsent();
  const pushed = useRef(false);
  useEffect(() => {
    if (consent !== 'accepted' || pushed.current) return;
    const queue: AdsQueue = (window.adsbygoogle = window.adsbygoogle ?? []);
    queue.requestNonPersonalizedAds = 1;
    if (!document.querySelector(SCRIPT_SELECTOR)) {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.dataset.pretoscop = 'adsense';
      document.head.appendChild(s);
    }
    queue.push({});
    pushed.current = true;
  }, [consent, client]);

  // Server render and refusal: nothing at all (no layout box, no request).
  if (consent === undefined || consent === 'rejected') return null;
  return (
    <aside aria-label="Publicitate" data-testid="ad-slot" data-placement={placement} className="rounded-[var(--radius-card)] bg-surface p-3 ring-1 ring-line">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Publicitate</p>
      {consent === 'accepted' ? (
        <ins className="adsbygoogle mt-2 block min-h-[100px]" data-ad-client={client} {...(slot ? { 'data-ad-slot': slot } : {})} data-ad-format="auto" data-full-width-responsive="true" />
      ) : (
        <div className="mt-2 space-y-2 text-[13px] leading-snug text-ink-soft" data-consent-version={TEXT.key}>
          <p>
            {TEXT.text}{' '}
            <Link href={TEXT.link.href} className="text-brand-700 underline">
              {TEXT.link.label}
            </Link>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdsConsent('rejected')} className="h-9 flex-1 rounded-lg bg-white px-4 text-sm font-semibold text-ink ring-1 ring-line hover:bg-slate-100 sm:flex-none" data-testid="ads-reject">
              {TEXT.rejectLabel}
            </button>
            <button type="button" onClick={() => setAdsConsent('accepted')} className="h-9 flex-1 rounded-lg bg-white px-4 text-sm font-semibold text-ink ring-1 ring-line hover:bg-slate-100 sm:flex-none" data-testid="ads-accept">
              {TEXT.acceptLabel}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
