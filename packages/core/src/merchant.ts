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

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * "https://www.Magazin.ro/categorie?x=1" → "magazin.ro"; null for anything that is not a public
 * host name (IP addresses, localhost, single labels).
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
  return HOST_RE.test(host) ? host : null;
}

/** Whether an email address is on the shop's domain (or the shop is on a subdomain of the email's domain). */
export function emailProvesDomain(email: string, domain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const emailDomain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase();
  if (emailDomain === '' || FREE_MAIL_DOMAINS.has(emailDomain) || FREE_MAIL_DOMAINS.has(d)) return false;
  return emailDomain === d || emailDomain.endsWith(`.${d}`) || d.endsWith(`.${emailDomain}`);
}

/** "magazinul-meu.ro" → "magazinul-meu"; "shop.exemplu.com.ro" → "shop-exemplu". */
export function shopSlugFromDomain(domain: string): string {
  const labels = domain.toLowerCase().split('.');
  const withoutTld = labels.length > 2 && ['com', 'net', 'org', 'co'].includes(labels.at(-2)!) ? labels.slice(0, -2) : labels.slice(0, -1);
  const slug = slugify(withoutTld.join('-')).replace(/^-+|-+$/g, '');
  return slug.slice(0, 40) || 'magazin';
}
