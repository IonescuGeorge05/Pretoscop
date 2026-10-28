/**
 * Versioned legal and consent texts (M17). Romanian UI text, comma-below diacritics (ș, ț) only.
 * Pure data: safe to import from client components through `@pretoscop/config/legal-texts`.
 *
 * Rules:
 * - A published consent text is never edited in place. To change one, add `v2`, point
 *   `currentVersion` at it and keep `v1`: every stored consent references the exact version the
 *   person saw (`alerts.consent_text_version` in M19, the `version` field of the consent choice in
 *   localStorage), so old evidence must stay resolvable with `consentTextByKey()`.
 * - `reviewed` stays false until the Romanian lawyer review (setup task B5). Pages show
 *   "Document provizoriu, în curs de revizuire juridică" for legal documents until then.
 */

export type ConsentName = 'alertConsent' | 'analyticsConsent' | 'merchantTerms' | 'pushConsent' | 'telegramConsent';
export type ConsentTextKey = `${ConsentName}.v${number}`;

export interface ConsentText {
  /** Stored with every consent, e.g. `alertConsent.v1`. */
  readonly key: ConsentTextKey;
  readonly version: number;
  /** ISO date (Europe/Bucharest) from which this text is shown. */
  readonly effectiveFrom: string;
  /** True once the lawyer has reviewed this exact text (setup B5). */
  readonly reviewed: boolean;
  /** Short title: dialog label or heading. */
  readonly title: string;
  /** The sentence(s) shown next to the control, verbatim. */
  readonly text: string;
  /** Label of the affirmative control (button). Absent when the text itself labels a checkbox. */
  readonly acceptLabel?: string;
  /** Label of the refusal control, shown with the same weight as `acceptLabel`. */
  readonly rejectLabel?: string;
  /** Link shown right after the text. */
  readonly link: { readonly href: string; readonly label: string };
}

/**
 * Price-alert consent (M19): the unticked checkbox next to the alert form. Explicit consent for
 * email alerts about the chosen product, double opt-in, unsubscribe link in every email
 * (Law 506/2004 art. 12; docs/07 §3.1). The checkbox label is `text`; `link` follows it.
 */
const alertConsentV1: ConsentText = {
  key: 'alertConsent.v1',
  version: 1,
  effectiveFrom: '2026-10-27',
  reviewed: false,
  title: 'Acord pentru alerte de preț pe email',
  text:
    'Vreau să primesc pe email alerte de preț de la Pretoscop pentru produsul ales. ' +
    'Înțeleg că alerta devine activă doar după ce confirm abonarea din emailul pe care îl primesc acum ' +
    '(dublă confirmare) și că mă pot dezabona oricând, din linkul aflat în fiecare email.',
  link: { href: '/confidentialitate#alerte', label: 'Cum folosim adresa ta de email' },
};

/** Analytics consent banner (M12 wording, now versioned): Plausible loads only after "Accept". */
const analyticsConsentV1: ConsentText = {
  key: 'analyticsConsent.v1',
  version: 1,
  effectiveFrom: '2026-10-27',
  reviewed: false,
  title: 'Statistici anonime',
  text: 'Statistici anonime (Plausible) doar cu acordul tău; site-ul funcționează la fel oricum.',
  acceptLabel: 'Accept',
  rejectLabel: 'Refuz',
  link: { href: '/cookies', label: 'Detalii' },
};

/**
 * Merchant portal (M20): the unticked checkbox before a shop submits its listing. Stored in
 * `merchants.terms_version` as `merchantTerms.v1@<version of the terms page>`.
 */
const merchantTermsV1: ConsentText = {
  key: 'merchantTerms.v1',
  version: 1,
  effectiveFrom: '2026-10-27',
  reviewed: false,
  title: 'Acceptarea termenilor pentru magazine',
  text:
    'Am citit și accept Termenii pentru magazine. Confirm că am dreptul să reprezint acest magazin și ' +
    'că datele din feed (prețuri, disponibilitate, livrare) sunt corecte și actualizate.',
  acceptLabel: 'Trimite spre aprobare',
  link: { href: '/pentru-magazine/termeni', label: 'Termenii pentru magazine' },
};

/**
 * Web Push consent (M27): the box next to "Activează notificările pe acest dispozitiv" on /alerte,
 * before the browser's own permission prompt (Law 506/2004 art. 4(5): the subscription is stored
 * on the device). Withdrawn by turning notifications off there or in the browser.
 */
const pushConsentV1: ConsentText = {
  key: 'pushConsent.v1',
  version: 1,
  effectiveFrom: '2026-10-28',
  reviewed: false,
  title: 'Acord pentru notificări de preț în browser',
  text:
    'Vreau să primesc pe acest dispozitiv notificări de la Pretoscop cu alertele mele de preț. ' +
    'Înțeleg că notificările trec prin serviciul de notificări al browserului și că le pot opri oricând, din pagina Alertele mele sau din setările browserului.',
  link: { href: '/confidentialitate#notificari', label: 'Cum funcționează notificările' },
};

/**
 * Telegram consent (M27): the box next to "Conectează Telegram" on /alerte; it travels with the
 * one-time link token and is stored when the chat sends /start. Withdrawn with /oprire or on /alerte.
 */
const telegramConsentV1: ConsentText = {
  key: 'telegramConsent.v1',
  version: 1,
  effectiveFrom: '2026-10-28',
  reviewed: false,
  title: 'Acord pentru alerte de preț pe Telegram',
  text:
    'Vreau să primesc pe Telegram, de la robotul Pretoscop, alertele mele de preț. ' +
    'Înțeleg că Telegram este un serviciu separat, cu propria politică de confidențialitate, și că pot opri oricând alertele cu comanda /oprire sau din pagina Alertele mele.',
  link: { href: '/confidentialitate#telegram', label: 'Ce date ajung la Telegram' },
};

/** Every published version, by name. Never remove an entry. */
export const legalTexts = {
  alertConsent: { v1: alertConsentV1 },
  analyticsConsent: { v1: analyticsConsentV1 },
  merchantTerms: { v1: merchantTermsV1 },
  pushConsent: { v1: pushConsentV1 },
  telegramConsent: { v1: telegramConsentV1 },
} as const satisfies Record<ConsentName, Record<`v${number}`, ConsentText>>;

/** The version shown today for each consent. */
export const currentVersion = {
  alertConsent: 'alertConsent.v1',
  analyticsConsent: 'analyticsConsent.v1',
  merchantTerms: 'merchantTerms.v1',
  pushConsent: 'pushConsent.v1',
  telegramConsent: 'telegramConsent.v1',
} as const satisfies Record<ConsentName, ConsentTextKey>;

/** All published consent texts (every version). */
export function allConsentTexts(): ConsentText[] {
  return Object.values(legalTexts).flatMap((versions) => Object.values(versions) as ConsentText[]);
}

/** Resolves a stored version key (e.g. `alertConsent.v1`); undefined for unknown keys. */
export function consentTextByKey(key: string): ConsentText | undefined {
  return allConsentTexts().find((t) => t.key === key);
}

/** The text currently shown for a consent. */
export function currentConsentText(name: ConsentName): ConsentText {
  const text = consentTextByKey(currentVersion[name]);
  if (!text) throw new Error(`currentVersion.${name} points to a missing text`);
  return text;
}

/**
 * Versions of the public legal and trust pages. Bump `version` and `updatedAt` with every
 * substantive change; `kind: 'legal'` pages carry the provisional note until `reviewed`.
 */
export interface LegalDocumentVersion {
  readonly path: string;
  readonly kind: 'legal' | 'trust';
  readonly version: string;
  /** ISO date of the last substantive change. */
  readonly updatedAt: string;
  readonly reviewed: boolean;
}

export const legalDocuments = {
  about: { path: '/despre', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  ranking: { path: '/cum-functioneaza', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  money: { path: '/cum-castigam-bani', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  bot: { path: '/bot', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  methodology: { path: '/metodologie', kind: 'trust', version: '0.3', updatedAt: '2026-10-28', reviewed: false },
  merchants: { path: '/pentru-magazine', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  contact: { path: '/contact', kind: 'trust', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  terms: { path: '/termeni', kind: 'legal', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  privacy: { path: '/confidentialitate', kind: 'legal', version: '0.3', updatedAt: '2026-10-28', reviewed: false },
  cookies: { path: '/cookies', kind: 'legal', version: '0.3', updatedAt: '2026-10-28', reviewed: false },
  accessibility: { path: '/accesibilitate', kind: 'legal', version: '0.1', updatedAt: '2026-10-27', reviewed: false },
  merchantTerms: { path: '/pentru-magazine/termeni', kind: 'legal', version: '0.2', updatedAt: '2026-10-28', reviewed: false },
} as const satisfies Record<string, LegalDocumentVersion>;

export type LegalDocumentName = keyof typeof legalDocuments;

/** Public mailboxes named on the legal pages (the general address is `MAIL_REPLY_TO`). */
export const legalContacts = {
  privacy: 'privacy@pretoscop.ro',
  bot: 'bot@pretoscop.ro',
} as const;

/** Romanian data-protection authority (privacy policy, right to complain). */
export const supervisoryAuthority = {
  name: 'Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)',
  address: 'B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București',
  website: 'https://www.dataprotection.ro',
} as const;
