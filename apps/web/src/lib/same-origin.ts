/**
 * A state-changing request that comes from another site (CSRF, M27): the browser says so
 * (`Sec-Fetch-Site: cross-site`), or the `Origin` header names another host than the one asked
 * (also refusing `same-site` subdomains and the opaque origin "null"). Requests without either
 * header (curl, old browsers) pass to the session check. Pure: no server-only imports.
 */
export function isCrossSite(headers: Headers): boolean {
  if (headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = headers.get('origin');
  if (origin === null) return false;
  if (origin === 'null') return true;
  try {
    return new URL(origin).host !== headers.get('host');
  } catch {
    return true;
  }
}
