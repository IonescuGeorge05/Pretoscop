import type { OutreachChannel, OutreachPurpose, OutreachStatus } from '@pretoscop/db';

/** Labels of the outreach tracker (M21, setup C3). Templates: infra/bot-program/outreach-templates.md. */

export const OUTREACH_PURPOSES: Record<OutreachPurpose, string> = {
  feed: 'Feed de produse (listare gratuită)',
  allowlist: 'Acces pentru PretoscopBot (allowlist)',
  feed_or_allowlist: 'Feed sau acces pentru PretoscopBot',
  partnership: 'Parteneriat / afiliere',
  other: 'Altceva',
};

export const OUTREACH_CHANNELS: Record<OutreachChannel, string> = {
  email: 'Email',
  form: 'Formular de contact',
  phone: 'Telefon',
  meeting: 'Întâlnire',
  other: 'Altul',
};

export const OUTREACH_STATUSES: Record<OutreachStatus, string> = {
  planned: 'De trimis',
  sent: 'Trimis',
  replied: 'Au răspuns',
  agreed: 'Acord (feed sau acces)',
  declined: 'Refuz',
  no_answer: 'Fără răspuns',
};

export const OUTREACH_TEMPLATES: Record<string, string> = {
  'feed-listing-v1': 'Listare gratuită prin feed',
  'allowlist-v1': 'Cerere de acces pentru PretoscopBot',
  'antibot-rule-v1': 'Instrucțiuni pentru serviciul anti-bot (Cloudflare, Akamai, DataDome, Fastly)',
  'follow-up-v1': 'Revenire după 10 zile lucrătoare',
  'stop-confirmation-v1': 'Confirmarea opririi colectării',
};

/** A shop counts as contacted once something was actually sent to it. */
export function isContacted(status: OutreachStatus): boolean {
  return status !== 'planned';
}

/** `value` is an own key of `record` (never `constructor`, `__proto__`, … from the prototype). */
export function isOwnKey<K extends string>(record: Record<K, unknown>, value: string): value is K {
  return Object.hasOwn(record, value);
}

/**
 * Free mailbox providers: an address there is a private person's, not a shop's business channel,
 * so the tracker refuses it (data minimization, docs/legal/ropa.md P12).
 */
const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.ro',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'proton.me',
  'protonmail.com',
]);

export type ContactCheck = { ok: true; value: string | null } | { ok: false; reason: 'format' | 'personal' };

/**
 * The tracker keeps one business channel per contact: a role address (`parteneriate@magazin.ro`),
 * a contact-form URL or a switchboard number. Names of people, free text and addresses at free
 * mailbox providers are refused.
 */
export function checkContact(raw: string): ContactCheck {
  const v = raw.trim();
  if (v === '') return { ok: true, value: null };
  if (v.length > 200) return { ok: false, reason: 'format' };
  if (/^[^\s@<>()",;:]+@([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) {
    const domain = v.slice(v.lastIndexOf('@') + 1).toLowerCase();
    return PERSONAL_MAIL_DOMAINS.has(domain) ? { ok: false, reason: 'personal' } : { ok: true, value: v.toLowerCase() };
  }
  if (/^https?:\/\/\S+$/i.test(v)) {
    try {
      const url = new URL(v);
      return url.username || url.password ? { ok: false, reason: 'format' } : { ok: true, value: url.href };
    } catch {
      return { ok: false, reason: 'format' };
    }
  }
  const digits = v.replace(/\D/g, '');
  if (/^\+?[\d\s().\-/]+$/.test(v) && digits.length >= 6 && digits.length <= 15) return { ok: true, value: v };
  return { ok: false, reason: 'format' };
}
