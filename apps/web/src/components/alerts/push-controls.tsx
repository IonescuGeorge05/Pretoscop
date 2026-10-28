'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

type Support = 'checking' | 'ok' | 'unsupported' | 'ios-install' | 'denied';

function base64UrlToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const noopSubscribe = () => () => {};

function detect(): Support {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !standalone ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/**
 * Web Push on this device (M27): the explicit consent box (pushConsent, versioned), then the
 * browser's own permission prompt, then the subscription stored on our side. Off again at any time
 * here or in the browser settings. On iPhone, notifications work only from the Home Screen app.
 */
export function PushControls({ vapidPublicKey, consent }: { vapidPublicKey: string; consent: { key: string; text: string; link: { href: string; label: string } } }) {
  // What the browser can do, read on the client only ('checking' on the server and before hydration).
  const detected = useSyncExternalStore(noopSubscribe, detect, () => 'checking' as Support);
  const [override, setSupport] = useState<Support | null>(null);
  const support = override ?? detected;
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (detected !== 'ok') return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEndpoint(sub?.endpoint ?? null))
      .catch(() => setSupport('unsupported'));
  }, [detected]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setSupport(permission === 'denied' ? 'denied' : 'ok');
        setMessage('Fără permisiunea browserului nu putem trimite notificări.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(vapidPublicKey) });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), consent: true, consentVersion: consent.key }),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setMessage('Nu am putut activa notificările. Încearcă din nou.');
        return;
      }
      setEndpoint(sub.endpoint);
      setMessage('Notificările sunt active pe acest dispozitiv.');
      window.location.reload();
    } catch {
      setMessage('Nu am putut activa notificările. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe().catch(() => undefined);
      if (ep) await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: ep }) });
      setEndpoint(null);
      setMessage('Notificările sunt oprite pe acest dispozitiv.');
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { sent?: number } | null;
      setMessage(res.ok && (body?.sent ?? 0) > 0 ? 'Am trimis o notificare de test.' : 'Notificarea de test nu a putut fi trimisă.');
    } finally {
      setBusy(false);
    }
  }

  if (support === 'checking') return <p className="text-sm text-muted">Verificăm dacă browserul acceptă notificări…</p>;
  if (support === 'ios-install')
    return (
      <p className="text-sm text-ink-soft" data-testid="push-ios-note">
        Pe iPhone și iPad, notificările web funcționează doar după ce adaugi Pretoscop pe ecranul principal: în Safari apasă „Partajează”, apoi „Adaugă pe ecranul
        principal”, și deschide Pretoscop de acolo (iOS 16.4 sau mai nou).
      </p>
    );
  if (support === 'unsupported') return <p className="text-sm text-ink-soft">Browserul acesta nu acceptă notificări web. Folosește emailul sau Telegram.</p>;
  if (support === 'denied')
    return <p className="text-sm text-ink-soft">Ai blocat notificările pentru Pretoscop în setările browserului. Le poți permite din nou de acolo.</p>;

  return (
    <div className="space-y-3" data-testid="push-controls">
      {endpoint ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={test} disabled={busy}>
            Trimite o notificare de test
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={disable} disabled={busy}>
            Oprește notificările pe acest dispozitiv
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <input
              id="push-consent"
              aria-labelledby="push-consent-label"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-brand-600"
            />
            <label id="push-consent-label" htmlFor="push-consent" className="text-[13px] leading-snug text-ink-soft">
              {consent.text}{' '}
              <Link href={consent.link.href} className="text-brand-700 underline">
                {consent.link.label}
              </Link>
            </label>
          </div>
          <Button type="button" size="sm" onClick={enable} disabled={busy || !agreed}>
            Activează notificările pe acest dispozitiv
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
