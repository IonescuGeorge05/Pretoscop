/**
 * Shop domains for the merchant portal (M20). Pure. A merchant proves control of one domain and
 * may only list offers whose product URLs are on it (or a subdomain).
 */
import { slugify } from './text';

/** Free webmail domains: an address there proves nothing about a shop. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.ro',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
]);

/**
 * Public suffixes under which unrelated parties register names, so none of them (and no single
 * label such as `ro`) can ever be a shop domain or be proven by an email address. A curated subset
 * of the Public Suffix List (https://publicsuffix.org), not the whole list: no PSL package is in the
 * lockfile. It covers the second levels of .ro (ROTLD), the common European ones and the hosting
 * platforms shops actually use; anything else is left to the admin who approves the listing.
 */
export const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  // .ro second levels (ROTLD)
  'arts.ro',
  'com.ro',
  'firm.ro',
  'info.ro',
  'nom.ro',
  'nt.ro',
  'org.ro',
  'rec.ro',
  'store.ro',
  'tm.ro',
  'www.ro',
  // .md, .eu neighbours and the usual European second levels
  'com.md',
  'co.uk',
  'org.uk',
  'com.pl',
  'com.de',
  'co.at',
  'or.at',
  'com.es',
  'com.gr',
  'com.cy',
  'co.hu',
  'com.tr',
  // shop and site platforms (PSL private section)
  'myshopify.com',
  'wixsite.com',
  'blogspot.com',
  'github.io',
  'netlify.app',
  'vercel.app',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'herokuapp.com',
  'azurewebsites.net',
  'cloudfront.net',
  'appspot.com',
  'r2.dev',
]);

/** True for a public suffix (or a single label): nobody can own the whole of it. */
export function isPublicSuffix(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.$/, '');
  return !d.includes('.') || PUBLIC_SUFFIXES.has(d);
}

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * "https://www.Magazin.ro/categorie?x=1" → "magazin.ro"; null for anything that is not a public
 * host name (IP addresses, localhost, single labels, public suffixes such as `com.ro`).
 */
export function normalizeShopDomain(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (raw === '') return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  return HOST_RE.test(host) && !isPublicSuffix(host) ? host : null;
}

/** Whether `host` is `domain` or one of its subdomains (case and a trailing dot ignored). */
export function hostOnShopDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase().replace(/\.$/, '');
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Whether the signed-in email address proves control of the shop domain: the address is on the
 * shop domain itself, or the shop is on a subdomain of the address's domain (ion@firma.ro proves
 * shop.firma.ro). A mailbox on a subdomain never proves its parent (ion@student.uni.ro does not
 * prove uni.ro), and neither free webmail nor a public suffix proves anything.
 */
export function emailProvesDomain(email: string, domain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const emailDomain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase().replace(/\.$/, '');
  if (emailDomain === '' || d === '') return false;
  if (FREE_MAIL_DOMAINS.has(emailDomain) || FREE_MAIL_DOMAINS.has(d)) return false;
  if (isPublicSuffix(emailDomain) || isPublicSuffix(d)) return false;
  return hostOnShopDomain(d, emailDomain);
}

/** "magazinul-meu.ro" → "magazinul-meu"; "shop.exemplu.com.ro" → "shop-exemplu". */
export function shopSlugFromDomain(domain: string): string {
  const labels = domain.toLowerCase().split('.');
  const withoutTld = labels.length > 2 && ['com', 'net', 'org', 'co'].includes(labels.at(-2)!) ? labels.slice(0, -2) : labels.slice(0, -1);
  const slug = slugify(withoutTld.join('-')).replace(/^-+|-+$/g, '');
  return slug.slice(0, 40) || 'magazin';
}
