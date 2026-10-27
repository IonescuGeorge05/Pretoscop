'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';

/** Versioned consent choice in localStorage (no cookie). Bump the version when the text changes. */
export const CONSENT_KEY = 'pretoscop.consent';
export const CONSENT_VERSION = 'analytics.v1';
export type ConsentChoice = 'accepted' | 'rejected' | null;

const listeners = new Set<() => void>();

function read(): ConsentChoice {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { choice?: string; version?: string };
    if (v.version !== CONSENT_VERSION) return null;
    return v.choice === 'accepted' || v.choice === 'rejected' ? v.choice : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: 'accepted' | 'rejected'): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, version: CONSENT_VERSION, at: new Date().toISOString() }));
  } catch {
    // storage blocked: the banner will show again next time
  }
  listeners.forEach((l) => l());
}

/** Current consent choice; `undefined` during server render. */
export function useConsent(): ConsentChoice | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => undefined,
  );
}

/** Loads Plausible only after an explicit Accept (ADR-010). Nothing loads before a choice. */
function Analytics({ src, domain }: { src?: string; domain?: string }) {
  const consent = useConsent();
  useEffect(() => {
    if (consent !== 'accepted' || !src || !domain) return;
    if (document.querySelector('script[data-pretoscop="plausible"]')) return;
    const s = document.createElement('script');
    s.defer = true;
    s.src = src;
    s.dataset.domain = domain;
    s.dataset.pretoscop = 'plausible';
    document.head.appendChild(s);
  }, [consent, src, domain]);
  return null;
}

// Inlined at build time (static pages are prerendered): set them in the build environment.
const PLAUSIBLE_SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL || undefined;
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || undefined;

/** Equal-weight Accept / Reject banner (no pre-ticked boxes, no dark patterns). */
export function ConsentBanner({ plausibleSrc = PLAUSIBLE_SRC, plausibleDomain = PLAUSIBLE_DOMAIN }: { plausibleSrc?: string; plausibleDomain?: string }) {
  const consent = useConsent();
  // undefined while rendering on the server: the banner appears only once the choice is known.
  const open = consent === null;
  return (
    <>
      <Analytics src={plausibleSrc} domain={plausibleDomain} />
      {open && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Statistici anonime"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white shadow-[0_-4px_16px_rgb(15_23_42/0.08)]"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
            <p className="flex-1 text-[13px] leading-snug text-ink-soft">
              Statistici anonime (Plausible) doar cu acordul tău; site-ul funcționează la fel oricum.{' '}
              <Link href="/cookies" className="text-brand-700 underline">
                Detalii
              </Link>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConsent('rejected')}
                className="h-10 flex-1 rounded-lg bg-surface px-5 text-sm font-semibold text-ink ring-1 ring-line hover:bg-slate-100 sm:flex-none"
                data-testid="consent-reject"
              >
                Refuz
              </button>
              <button
                type="button"
                onClick={() => setConsent('accepted')}
                className="h-10 flex-1 rounded-lg bg-surface px-5 text-sm font-semibold text-ink ring-1 ring-line hover:bg-slate-100 sm:flex-none"
                data-testid="consent-accept"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
