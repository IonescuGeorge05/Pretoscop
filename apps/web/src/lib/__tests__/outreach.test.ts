import { describe, expect, it } from 'vitest';
import { checkContact, isOwnKey, OUTREACH_PURPOSES, OUTREACH_TEMPLATES } from '../outreach';

describe('checkContact', () => {
  it('keeps business channels: role addresses, contact-form URLs, switchboard numbers', () => {
    expect(checkContact('  Parteneriate@PCGarage.ro ')).toEqual({ ok: true, value: 'parteneriate@pcgarage.ro' });
    expect(checkContact('https://www.magazin.ro/contact')).toEqual({ ok: true, value: 'https://www.magazin.ro/contact' });
    expect(checkContact('+40 21 123 45 67')).toEqual({ ok: true, value: '+40 21 123 45 67' });
    expect(checkContact('')).toEqual({ ok: true, value: null });
  });

  it('refuses personal mailboxes, names, free text and credentials in URLs', () => {
    expect(checkContact('ion.popescu@gmail.com')).toEqual({ ok: false, reason: 'personal' });
    expect(checkContact('x@Yahoo.RO')).toEqual({ ok: false, reason: 'personal' });
    expect(checkContact('Ion Popescu')).toEqual({ ok: false, reason: 'format' });
    expect(checkContact('Ion Popescu <ion@magazin.ro>')).toEqual({ ok: false, reason: 'format' });
    expect(checkContact('https://user:parola@magazin.ro/')).toEqual({ ok: false, reason: 'format' });
    expect(checkContact('123')).toEqual({ ok: false, reason: 'format' });
    expect(checkContact(`a@${'b'.repeat(200)}.ro`)).toEqual({ ok: false, reason: 'format' });
  });
});

describe('isOwnKey', () => {
  it('accepts only the listed keys, never inherited ones', () => {
    expect(isOwnKey(OUTREACH_PURPOSES, 'feed')).toBe(true);
    expect(isOwnKey(OUTREACH_TEMPLATES, 'feed-listing-v1')).toBe(true);
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '']) {
      expect(isOwnKey(OUTREACH_PURPOSES, k)).toBe(false);
      expect(isOwnKey(OUTREACH_TEMPLATES, k)).toBe(false);
    }
  });
});
