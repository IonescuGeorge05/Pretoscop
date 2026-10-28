import { describe, expect, it } from 'vitest';
import { describeAlert, maskEmail, validateAlertForm } from '../alert-form';
import { eventAction, eventRecipients, svixSign, verifySvix } from '../svix';

const base = { productId: '12', email: 'ana@exemplu.ro', kind: 'below', target: '1.999', consent: 'on', consentVersion: 'alertConsent.v1' };
const opts = { currentBestBani: 210_000, consentVersion: 'alertConsent.v1' };

describe('validateAlertForm', () => {
  it('accepts a complete form and parses the Romanian target', () => {
    expect(validateAlertForm(base, opts)).toEqual({
      ok: true,
      value: { productId: 12, email: 'ana@exemplu.ro', kind: 'below', targetBani: 199_900, anyVariant: false, consentVersion: 'alertConsent.v1' },
    });
    expect(validateAlertForm({ ...base, kind: 'any_drop', target: '', anyVariant: 'on' }, opts)).toMatchObject({ ok: true, value: { kind: 'any_drop', targetBani: null, anyVariant: true } });
  });

  it('requires the unticked consent box and the version that was shown', () => {
    expect(validateAlertForm({ ...base, consent: undefined }, opts)).toMatchObject({ ok: false, errors: { consent: expect.stringMatching(/Bifează acordul/) } });
    expect(validateAlertForm({ ...base, consentVersion: 'alertConsent.v0' }, opts)).toMatchObject({ ok: false, errors: { consent: expect.stringMatching(/s-a schimbat/) } });
  });

  it('explains wrong addresses and targets that would fire at once', () => {
    expect(validateAlertForm({ ...base, email: 'ana@exemplu' }, opts)).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(validateAlertForm({ ...base, target: '2.200' }, opts)).toMatchObject({ ok: false, errors: { target: expect.stringMatching(/deja sub acest prag/) } });
    expect(validateAlertForm({ ...base, kind: 'often' }, opts)).toMatchObject({ ok: false, errors: { kind: expect.any(String) } });
  });

  it('flags the honeypot as spam without telling why', () => {
    expect(validateAlertForm({ ...base, website: 'http://spam' }, opts)).toEqual({ ok: false, errors: {}, spam: true });
  });

  it('masks addresses and describes alerts in Romanian', () => {
    expect(maskEmail('ana.pop@exemplu.ro')).toBe('a***@exemplu.ro');
    expect(describeAlert('below', '1.999,00 lei', true)).toBe('Prețul total ajunge la 1.999,00 lei sau mai jos · orice variantă a modelului');
    expect(describeAlert('any_drop', null, false)).toBe('Orice scădere a prețului total de cel puțin 1%');
  });
});

describe('Resend webhook (Svix) signatures', () => {
  const secret = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;
  const body = JSON.stringify({ type: 'email.complained', data: { to: ['ana@exemplu.ro'] } });
  const now = 1_793_200_000;
  const ts = String(now);

  it('accepts a valid signature, among several, within five minutes', () => {
    const sig = svixSign(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA v1,${sig}` }, body, now + 299)).toBe(true);
  });

  it('refuses tampering, other ids, old timestamps and missing headers', () => {
    const sig = svixSign(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, `${body} `, now)).toBe(false);
    expect(verifySvix(secret, { id: 'msg_2', timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(false);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, now + 301)).toBe(false);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v2,${sig}` }, body, now)).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(false);
  });

  it('maps events: complaints and permanent bounces stop alerts, the rest is ignored', () => {
    expect(eventAction({ type: 'email.complained' })).toBe('complaint');
    expect(eventAction({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } })).toBe('bounce');
    expect(eventAction({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } })).toBeNull();
    expect(eventAction({ type: 'email.delivered' })).toBeNull();
    expect(eventRecipients({ type: 'x', data: { to: ['a@b.ro', 42, 'nope'] } })).toEqual(['a@b.ro']);
  });
});
