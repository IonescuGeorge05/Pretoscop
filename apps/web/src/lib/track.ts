'use client';

/**
 * Server-side product analytics (ADR-010): sends an event to /api/events with sendBeacon.
 * No cookies, no identifiers; the server derives a daily-salted session hash.
 */
export function track(name: string, props: Record<string, string | number | boolean | null> = {}): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({ name, props, path: window.location.pathname, referrer: document.referrer || null });
  if (body.length > 4000) return;
  try {
    if (navigator.sendBeacon?.(new URL('/api/events', window.location.origin), new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch('/api/events', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
}
