/* Pretoscop service worker (M27): shows price-alert notifications sent by Web Push and opens the
 * page they point to. No fetch handler, no caching, no offline mode, no tracking: only `push` and
 * `notificationclick`, so it can never serve a stale page. The payload is JSON:
 * { title, body, url, tag }; a URL off this site is replaced by /alerte. Served with
 * Cache-Control: no-cache (next.config.ts) and registered with updateViaCache: 'none'. */
'use strict';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Pretoscop', body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Pretoscop';
  const sameOrigin = (u) => {
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch {
      return false;
    }
  };
  const url = typeof data.url === 'string' && sameOrigin(data.url) ? data.url : '/alerte';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/apple-icon',
      lang: 'ro',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/alerte', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
