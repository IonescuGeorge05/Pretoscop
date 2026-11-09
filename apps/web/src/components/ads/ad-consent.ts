'use client';

import { useSyncExternalStore } from 'react';
import { currentVersion } from '@pretoscop/config/legal-texts';
import { ADS_CONSENT_KEY } from '@/lib/consent-storage';

/**
 * The visitor's choice about the optional ad slot (M25), separate from the analytics choice: each
 * purpose has its own consent (GDPR art. 4(11), Law 506/2004 art. 4(5)). Versioned like the
 * analytics banner; localStorage, never a cookie of ours.
 */
export { ADS_CONSENT_KEY };
export const ADS_CONSENT_VERSION: string = currentVersion.adsConsent;
export type AdsChoice = 'accepted' | 'rejected' | null;

const listeners = new Set<() => void>();

function read(): AdsChoice {
  try {
    const raw = window.localStorage.getItem(ADS_CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { choice?: string; version?: string };
    if (v.version !== ADS_CONSENT_VERSION) return null;
    return v.choice === 'accepted' || v.choice === 'rejected' ? v.choice : null;
  } catch {
    return null;
  }
}

export function setAdsConsent(choice: 'accepted' | 'rejected'): void {
  try {
    window.localStorage.setItem(ADS_CONSENT_KEY, JSON.stringify({ choice, version: ADS_CONSENT_VERSION, at: new Date().toISOString() }));
  } catch {
    // storage blocked: the question shows again next time
  }
  listeners.forEach((l) => l());
}

/** Forgets the choice; a page that already loaded Google's script reloads, so nothing keeps running. */
export function resetAdsConsent(): void {
  try {
    window.localStorage.removeItem(ADS_CONSENT_KEY);
  } catch {
    // nothing stored either
  }
  if (document.querySelector('script[data-pretoscop="adsense"]')) {
    window.location.reload();
    return;
  }
  listeners.forEach((l) => l());
}

/** `undefined` during server render. */
export function useAdsConsent(): AdsChoice | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => undefined,
  );
}
