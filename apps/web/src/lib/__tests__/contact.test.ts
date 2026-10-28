import { describe, expect, it } from 'vitest';
import {
  CONTACT_KINDS,
  CONTACT_KIND_LABELS,
  contactReference,
  emailRequired,
  normalizeUrl,
  parseContactReference,
  readKindParam,
  storedMessage,
  validateContact,
} from '../contact';

const base = { kind: 'general', message: 'Bună ziua, am o întrebare despre site.' };

function errorsOf(raw: Record<string, unknown>) {
  const r = validateContact(raw);
  if (r.ok) throw new Error('expected a validation error');
  return r.errors;
}

describe('validateContact', () => {
  it('accepts a minimal general question and trims everything', () => {
    const r = validateContact({ ...base, name: '  Ana  Pop ', email: ' ana@example.ro ', message: `  ${base.message}  ` });
    expect(r).toEqual({
      ok: true,
      value: { kind: 'general', name: 'Ana Pop', email: 'ana@example.ro', url: null, message: base.message, goodFaith: false },
    });
  });

  it('requires a known kind', () => {
    expect(errorsOf({ ...base, kind: 'spam' }).kind).toMatch(/tipul solicitării/);
    expect(errorsOf({ message: base.message }).kind).toBeDefined();
  });

  it('requires an email for shop objections and privacy requests only', () => {
    expect(errorsOf({ ...base, kind: 'shop_objection' }).email).toMatch(/adresa ta de email/);
    expect(errorsOf({ ...base, kind: 'privacy' }).email).toBeDefined();
    for (const kind of ['general', 'price_error', 'merchant', 'press'] as const) {
      expect(validateContact({ ...base, kind }).ok).toBe(true);
    }
    expect(emailRequired('shop_objection')).toBe(true);
    expect(emailRequired(null)).toBe(false);
  });

  it('rejects malformed emails', () => {
    for (const email of ['ana', 'ana@', 'ana@example', 'ana @example.ro', 'a<b>@example.ro', `${'a'.repeat(250)}@example.ro`]) {
      expect(errorsOf({ ...base, email }).email, email).toMatch(/nu pare validă/);
    }
  });

  it('normalizes page addresses and rejects other schemes', () => {
    expect(validateContact({ ...base, url: 'emag.ro/telefon-x/pd/ABC' })).toMatchObject({ ok: true, value: { url: 'https://emag.ro/telefon-x/pd/ABC' } });
    expect(normalizeUrl('http://www.altex.ro/p')).toBe('http://www.altex.ro/p');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('ftp://example.ro/x')).toBeNull();
    expect(normalizeUrl('nu este o adresa')).toBeNull();
    expect(errorsOf({ ...base, url: 'javascript:alert(1)' }).url).toMatch(/nu pare validă/);
    expect(errorsOf({ ...base, url: `https://example.ro/${'x'.repeat(2001)}` }).url).toBeDefined();
  });

  it('enforces the message length: at least 10 and at most 5000 characters', () => {
    expect(errorsOf({ ...base, message: 'scurt' }).message).toMatch(/prea scurt/);
    expect(errorsOf({ ...base, message: '          ' }).message).toMatch(/prea scurt/);
    expect(validateContact({ ...base, message: 'x'.repeat(5000) }).ok).toBe(true);
    expect(errorsOf({ ...base, message: 'x'.repeat(5001) }).message).toMatch(/5\.000/);
  });

  it('strips control characters and normalizes line breaks', () => {
    const r = validateContact({ ...base, message: 'Linia unu\r\nlinia doi\u0000\u0007 gata.' });
    expect(r).toMatchObject({ ok: true, value: { message: 'Linia unu\nlinia doi gata.' } });
  });

  it('limits the name length', () => {
    expect(errorsOf({ ...base, name: 'N'.repeat(121) }).name).toMatch(/120/);
  });

  it('illegal-content notices need the exact URL and the good-faith statement (DSA art. 16)', () => {
    const e = errorsOf({ ...base, kind: 'illegal_content' });
    expect(e.url).toMatch(/adresa exactă/);
    expect(e.goodFaith).toMatch(/corecte și complete/);
    const ok = validateContact({ ...base, kind: 'illegal_content', url: 'https://pretoscop.ro/p/x-1', goodFaith: 'on' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(storedMessage(ok.value)).toMatch(/\[Declarație bifată: Confirm, cu bună-credință/);
    const general = validateContact({ ...base, goodFaith: true });
    if (general.ok) expect(storedMessage(general.value)).toBe(base.message);
  });

  it('a filled honeypot is spam, whatever else the payload says', () => {
    expect(validateContact({ ...base, website: 'http://spam.example' })).toEqual({ ok: false, errors: {}, spam: true });
    expect(validateContact({ ...base, website: '   ' }).ok).toBe(true);
  });
});

describe('contact helpers', () => {
  it('labels every kind accepted by the database constraint', () => {
    expect([...CONTACT_KINDS]).toEqual(['general', 'price_error', 'shop_objection', 'illegal_content', 'privacy', 'merchant', 'press']);
    for (const kind of CONTACT_KINDS) expect(CONTACT_KIND_LABELS[kind].length).toBeGreaterThan(3);
  });

  it('reads the ?subiect= parameter', () => {
    expect(readKindParam('price_error')).toBe('price_error');
    expect(readKindParam(['merchant', 'press'])).toBe('merchant');
    expect(readKindParam('eroare')).toBeNull();
    expect(readKindParam(undefined)).toBeNull();
  });

  it('formats and parses reference numbers', () => {
    expect(contactReference(42)).toBe('PS-000042');
    expect(contactReference(1234567)).toBe('PS-1234567');
    expect(parseContactReference('PS-000042')).toBe(42);
    expect(parseContactReference('PS-42')).toBeNull();
    expect(parseContactReference('<script>')).toBeNull();
  });
});
