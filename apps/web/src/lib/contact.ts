/**
 * Contact form contract (M17), shared by the client form and `POST /api/contact`. Pure: no I/O.
 * The form doubles as the DSA single point of contact / notice-and-action channel (arts 11, 12, 16)
 * and as the shops' channel to stop collection (one business day, docs/07 §9).
 */

/** Same values as the `contact_requests_kind_ck` constraint (migration 0008). */
export const CONTACT_KINDS = ['general', 'price_error', 'shop_objection', 'illegal_content', 'privacy', 'merchant', 'press'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  general: 'Întrebare generală',
  price_error: 'Eroare de preț',
  shop_objection: 'Magazin: cerere de oprire a colectării',
  illegal_content: 'Conținut ilegal (DSA)',
  privacy: 'Date personale',
  merchant: 'Colaborare magazin',
  press: 'Presă',
};

export const CONTACT_LIMITS = { name: 120, email: 254, url: 2000, messageMin: 10, messageMax: 5000 } as const;

/** Name of the hidden honeypot input: people never see it, bots fill it. */
export const HONEYPOT_FIELD = 'website';

/** A reply address is required where we must answer: shop objections and privacy requests. */
export function emailRequired(kind: ContactKind | null | undefined): boolean {
  return kind === 'shop_objection' || kind === 'privacy';
}

/** DSA art. 16(2): a notice names the exact location of the content and is made in good faith. */
export function urlRequired(kind: ContactKind | null | undefined): boolean {
  return kind === 'illegal_content';
}

export function goodFaithRequired(kind: ContactKind | null | undefined): boolean {
  return kind === 'illegal_content';
}

/** Kinds that receive an automatic confirmation of receipt by email (DSA art. 16(4); shop objections). */
export function sendsReceipt(kind: ContactKind): boolean {
  return kind === 'illegal_content' || kind === 'shop_objection';
}

export function isContactKind(value: unknown): value is ContactKind {
  return typeof value === 'string' && (CONTACT_KINDS as readonly string[]).includes(value);
}

/** `?subiect=price_error` → `price_error`; anything else → null. */
export function readKindParam(value: string | string[] | undefined): ContactKind | null {
  const v = Array.isArray(value) ? value[0] : value;
  return isContactKind(v) ? v : null;
}

export type ContactField = 'kind' | 'name' | 'email' | 'url' | 'message' | 'goodFaith';
export type ContactErrors = Partial<Record<ContactField, string>>;

export interface ContactInput {
  kind: ContactKind;
  name: string | null;
  email: string | null;
  url: string | null;
  message: string;
  goodFaith: boolean;
}

export type ContactValidation =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: ContactErrors; spam: boolean };

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
// Control characters except tab and newline (carriage returns are normalized first).
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').trim() : '';
}

function oneLine(value: unknown): string {
  return text(value).replace(/\s+/g, ' ');
}

function truthy(value: unknown): boolean {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

/** Adds `https://` to a bare host ("emag.ro/telefon"); returns null when it is not an http(s) URL. */
export function normalizeUrl(raw: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Validates a submission (JSON body or form fields). Strings are trimmed and stripped of control
 * characters; messages in Romanian, ready to show next to the field. A filled honeypot is spam.
 */
export function validateContact(raw: Record<string, unknown>): ContactValidation {
  if (text(raw[HONEYPOT_FIELD]) !== '') return { ok: false, errors: {}, spam: true };

  const errors: ContactErrors = {};
  const kind = isContactKind(raw.kind) ? raw.kind : null;
  if (!kind) errors.kind = 'Alege tipul solicitării.';

  const name = oneLine(raw.name);
  if (name.length > CONTACT_LIMITS.name) errors.name = `Numele poate avea cel mult ${CONTACT_LIMITS.name} de caractere.`;

  const email = oneLine(raw.email);
  if (email) {
    if (email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email)) errors.email = 'Adresa de email nu pare validă.';
  } else if (emailRequired(kind)) {
    errors.email = 'Avem nevoie de adresa ta de email ca să-ți putem răspunde la această solicitare.';
  }

  const urlRaw = oneLine(raw.url);
  let url: string | null = null;
  if (urlRaw) {
    url = urlRaw.length > CONTACT_LIMITS.url ? null : normalizeUrl(urlRaw);
    if (!url) errors.url = 'Adresa paginii nu pare validă (de exemplu, https://www.magazin.ro/produs).';
  } else if (urlRequired(kind)) {
    errors.url = 'Indică adresa exactă (URL) a conținutului pe care îl semnalezi.';
  }

  const message = text(raw.message);
  if (message.length < CONTACT_LIMITS.messageMin) {
    errors.message = `Mesajul este prea scurt (cel puțin ${CONTACT_LIMITS.messageMin} caractere).`;
  } else if (message.length > CONTACT_LIMITS.messageMax) {
    errors.message = 'Mesajul poate avea cel mult 5.000 de caractere.';
  }

  const goodFaith = truthy(raw.goodFaith);
  if (goodFaithRequired(kind) && !goodFaith) {
    errors.goodFaith = 'Confirmă că informațiile din sesizare sunt corecte și complete.';
  }

  if (!kind || Object.keys(errors).length > 0) return { ok: false, errors, spam: false };
  return { ok: true, value: { kind, name: name || null, email: email || null, url, message, goodFaith } };
}

/** The good-faith statement recorded with an illegal-content notice (DSA art. 16(2)(d)). */
export const GOOD_FAITH_STATEMENT = 'Confirm, cu bună-credință, că informațiile din această sesizare sunt corecte și complete.';

/** Text stored in `contact_requests.message`: the message, plus the statement when one was made. */
export function storedMessage(input: ContactInput): string {
  return input.goodFaith && goodFaithRequired(input.kind) ? `${input.message}\n\n[Declarație bifată: ${GOOD_FAITH_STATEMENT}]` : input.message;
}

/** 42 → "PS-000042" (the number we quote back to the sender). */
export function contactReference(id: number): string {
  return `PS-${String(id).padStart(6, '0')}`;
}

/** "PS-000042" → 42; null for anything else. */
export function parseContactReference(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^PS-(\d{6,12})$/.exec(value);
  return m ? Number(m[1]) : null;
}
