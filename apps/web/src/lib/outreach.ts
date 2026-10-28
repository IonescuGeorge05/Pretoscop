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
