/**
 * Host identity. Every per-host rule (policy, lock, slot, pause, budget, robots.txt origin) keys on
 * the canonical host, so `https://shop.ro./p` and `https://SHOP.ro/p` are the same shop.
 */

/** Lower-case, no trailing dot (the URL parser already lower-cases and drops default ports). */
export function canonicalUrl(url: URL): URL {
  const out = new URL(url.href);
  if (out.hostname.endsWith('.')) out.hostname = out.hostname.replace(/\.+$/, '');
  out.hash = '';
  return out;
}

/** `URL.host` of the canonical URL: `www.dedeman.ro`, or `127.0.0.1:8080` with a non-default port. */
export function hostKey(url: URL): string {
  return url.host.toLowerCase().replace(/\.+(?=:\d+$|$)/, '');
}

/** `www.x.ro`, `https://www.x.ro/any/path` or `http://x.ro:8080` to a canonical origin. */
export function toOrigin(hostOrUrl: string): string {
  const s = hostOrUrl.trim();
  return canonicalUrl(new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)).origin;
}

export function normalizeHost(hostOrUrl: string): string {
  return hostKey(new URL(toOrigin(hostOrUrl)));
}

const SECOND_LEVEL_LABELS = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac', 'nom', 'info', 'firm', 'store', 'tm', 'www', 'arts', 'rec', 'nt']);

/** Registrable-domain approximation (`www.dedeman.ro` and `dedeman.ro` share `dedeman.ro`). */
export function siteKey(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.+$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[')) return h;
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const tld = labels[labels.length - 1] as string;
  const sld = labels[labels.length - 2] as string;
  return tld.length === 2 && SECOND_LEVEL_LABELS.has(sld) ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
}

export function sameSite(a: URL, b: URL): boolean {
  return siteKey(a.hostname) === siteKey(b.hostname);
}
