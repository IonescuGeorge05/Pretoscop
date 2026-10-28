import { isAssistedDesignated } from '@pretoscop/config/assisted';
import type { FetchPurpose } from '../types';

/**
 * What the assisted channel may read (docs/12-blocked-shops-strategy.md §0 condition 2, layer 2b;
 * CLAUDE.md "Assisted-access channel"): public product, category and sitemap pages of a shop the
 * founders designated, on that shop's own web host, plus the robots.txt we need to obey. Never
 * login, account, cart or checkout pages, never internal or undocumented APIs (Altex's
 * `fenrir.altex.ro`, Magento's `/rest/V1/`, GraphQL), never feeds or probes, never eMAG.
 *
 * Pure. The channel applies it before any slot, budget or vendor call; a refusal is
 * `assisted_refused`.
 */

/** Purposes the channel serves: robots.txt (to obey it), sitemaps, category listings, product pages. */
export const ASSISTED_PURPOSES: ReadonlySet<FetchPurpose> = new Set<FetchPurpose>(['robots', 'sitemap', 'listing', 'product']);

/**
 * Path segments (or query values) that name a non-public page or an API, matched whole and
 * case-insensitively, with a `.php`/`.html`/`.aspx` extension ignored. Whole segments only: a
 * product slug such as `cos-de-rufe-…` is not the cart page `cos`.
 */
export const NON_PUBLIC_SEGMENTS: ReadonlySet<string> = new Set([
  // login, accounts, personal pages
  'login', 'logout', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'registration', 'inregistrare', 'autentificare',
  'auth', 'oauth', 'sso', 'authentication', 'password', 'parola', 'recuperare-parola', 'account', 'accounts', 'my-account',
  'myaccount', 'customer', 'cont', 'contul-meu', 'contul_meu', 'profil', 'profile', 'wishlist', 'favorite', 'favorites',
  'create_account', 'create_account_success', 'login_page',
  // cart, checkout, orders, payment
  'cart', 'basket', 'cos', 'cosul-meu', 'cosul_meu', 'cos-cumparaturi', 'cos-de-cumparaturi', 'shopping_cart', 'shopping-cart',
  'checkout', 'onepage', 'order', 'orders', 'order-opc', 'comanda', 'comenzi', 'finalizare-comanda', 'plata', 'payment',
  // internal or undocumented APIs
  'api', 'apis', 'graphql', 'rest', 'ajax', 'wp-json', 'xmlrpc', 'rpc', 'json', 'services',
]);

/** Query parameters whose value names the page in PHP shops (Zen Cart `main_page`, OpenCart `route`, PrestaShop `controller`). */
const PAGE_PARAMS = new Set(['main_page', 'route', 'controller', 'page', 'action', 'module', 'fc']);

function segmentNames(raw: string): string[] {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  return decoded
    .toLowerCase()
    .split('/')
    .filter((s) => s !== '')
    .map((s) => s.replace(/\.(php|html?|aspx?|jsp)$/, ''));
}

/** The first non-public segment of a URL's path or page-naming query values, if any. */
export function nonPublicSegment(url: URL): string | null {
  for (const seg of segmentNames(url.pathname)) if (NON_PUBLIC_SEGMENTS.has(seg)) return seg;
  for (const [key, value] of url.searchParams) {
    if (!PAGE_PARAMS.has(key.toLowerCase())) continue;
    for (const seg of segmentNames(value)) if (NON_PUBLIC_SEGMENTS.has(seg)) return seg;
  }
  return null;
}

export interface ScopeInput {
  /** Registry slug of the shop (from the domain policy). */
  shopSlug?: string;
  /** Host of the request (`hostKey`: lower case, with a non-default port). */
  host: string;
  purpose: FetchPurpose;
  /** The request URL, when known (every request the fetcher makes). */
  url?: string;
  /** The shop's own web hosts (registry domain and `www.` of it); unset skips the host check (tests). */
  hosts?: readonly string[];
}

/** Why the channel may not read this URL, or null when it may. */
export function assistedScopeRefusal(input: ScopeInput): string | null {
  if (!input.shopSlug) return 'no shop: the assisted channel serves only registry shops the founders designated';
  if (!isAssistedDesignated(input.shopSlug)) {
    return `${input.shopSlug} is not designated for assisted access (founder decision needed; eMAG never: ADR-013)`;
  }
  if (!ASSISTED_PURPOSES.has(input.purpose)) {
    return `purpose "${input.purpose}" is not served by the assisted channel (public robots.txt, sitemap, listing and product pages only)`;
  }
  if (input.hosts && !input.hosts.includes(input.host)) {
    return `${input.host} is not ${input.shopSlug}'s web host (${input.hosts.join(', ')}): no subdomains or internal API hosts through the assisted channel`;
  }
  if (input.url) {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      return `not a valid URL: ${input.url}`;
    }
    if (url.username || url.password) return 'URLs with credentials are never read through the assisted channel';
    const seg = input.purpose === 'robots' ? null : nonPublicSegment(url);
    if (seg) return `"${seg}" names a login, account, cart, checkout or API page: never read through the assisted channel`;
  }
  return null;
}
