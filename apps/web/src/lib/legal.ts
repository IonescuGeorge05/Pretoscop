import { legalContacts } from '@pretoscop/config/legal-texts';
import { TZ } from './format';

/** "Pretoscop <contact@pretoscop.ro>" → "contact@pretoscop.ro". */
export function plainEmail(value: string): string {
  return /<([^>]+)>/.exec(value)?.[1]?.trim() ?? value.trim();
}

export interface Operator {
  /** COMPANY_LEGAL_NAME, e.g. "Pretoscop (în curs de înființare)". */
  name: string;
  /** COMPANY_POSTAL_ADDRESS. */
  address: string;
  /** General contact (MAIL_REPLY_TO). */
  email: string;
  privacyEmail: string;
  botEmail: string;
}

/** Operator identity from the environment (read at build time for prerendered pages). */
export function operatorFrom(env: { COMPANY_LEGAL_NAME: string; COMPANY_POSTAL_ADDRESS: string; MAIL_REPLY_TO: string }): Operator {
  return {
    name: env.COMPANY_LEGAL_NAME,
    address: env.COMPANY_POSTAL_ADDRESS,
    email: plainEmail(env.MAIL_REPLY_TO),
    privacyEmail: legalContacts.privacy,
    botEmail: legalContacts.bot,
  };
}

const longDate = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

/** "2026-10-27" → "27 octombrie 2026" (noon UTC, so the Bucharest date never shifts). */
export function formatLongDate(isoDate: string): string {
  return longDate.format(new Date(`${isoDate}T12:00:00Z`));
}
