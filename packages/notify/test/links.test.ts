import { describe, expect, it } from 'vitest';
import { alertLinks, emailHash, signLink, verifyLink } from '../src/links';

const SECRET = 'test-secret-0123456789abcdef';

describe('signed links', () => {
  it('verifies its own tokens and nothing else', () => {
    const t = signLink(SECRET, 'confirm', 42);
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyLink(SECRET, 'confirm', 42, t)).toBe(true);
    expect(verifyLink(SECRET, 'confirm', '42', t)).toBe(true);
    expect(verifyLink(SECRET, 'confirm', 43, t)).toBe(false);
    expect(verifyLink(SECRET, 'unsub-alert', 42, t)).toBe(false); // purpose is bound
    expect(verifyLink('another-secret-0123456789', 'confirm', 42, t)).toBe(false);
    expect(verifyLink(SECRET, 'confirm', 42, `${t.slice(0, 21)}A`)).toBe(t.endsWith('A'));
    expect(verifyLink(SECRET, 'confirm', 42, undefined)).toBe(false);
    expect(verifyLink(SECRET, 'confirm', 42, 'short')).toBe(false);
    expect(verifyLink(SECRET, 'confirm', 42, `${t}x`)).toBe(false);
  });

  it('builds absolute URLs on the public base', () => {
    const l = alertLinks(SECRET, 'https://pretoscop.ro/');
    expect(l.confirm(7)).toMatch(/^https:\/\/pretoscop\.ro\/alerte\/confirmare\?a=7&t=[A-Za-z0-9_-]{22}$/);
    expect(l.unsubscribeAll('usr_AbC')).toMatch(/^https:\/\/pretoscop\.ro\/alerte\/dezabonare\?u=usr_AbC&t=/);
    expect(l.oneClick('usr_AbC')).toMatch(/^https:\/\/pretoscop\.ro\/api\/alerts\/unsubscribe\?u=usr_AbC&t=/);
    expect(l.out(99)).toBe('https://pretoscop.ro/out/99?p=alert');
    expect(l.product('telefon-x-12')).toBe('https://pretoscop.ro/p/telefon-x-12');
    const token = new URL(l.unsubscribeAlert(7)).searchParams.get('t');
    expect(verifyLink(SECRET, 'unsub-alert', 7, token)).toBe(true);
  });
});

describe('emailHash', () => {
  it('is stable across case and spaces, and differs per secret', () => {
    const a = emailHash(SECRET, 'Ana.Pop@Exemplu.ro');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(emailHash(SECRET, '  ana.pop@exemplu.RO ')).toBe(a);
    expect(emailHash(SECRET, 'ana.pop2@exemplu.ro')).not.toBe(a);
    expect(emailHash('another-secret-0123456789', 'ana.pop@exemplu.ro')).not.toBe(a);
  });
});
