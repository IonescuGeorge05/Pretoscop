import { describe, expect, it } from 'vitest';
import { parseSimulateArgs, simulationTargets } from '../src/alerts/simulate';

const dev = { APP_ENV: 'dev', ADMIN_EMAILS: ['admin@pretoscop.test'] };

describe('alerts:simulate guard rails', () => {
  it('sends only to the addresses given with --email', () => {
    expect(parseSimulateArgs(['12', '10', '--email', 'Fondator@Exemplu.ro'], dev)).toEqual({
      ok: true,
      value: { productId: 12, percent: 10, recipients: ['fondator@exemplu.ro'] },
    });
    expect(parseSimulateArgs(['--', '12', '--email', 'a@exemplu.ro', '--email', 'b@exemplu.ro'], dev)).toMatchObject({
      ok: true,
      value: { percent: 10, recipients: ['a@exemplu.ro', 'b@exemplu.ro'] },
    });
  });

  it('defaults to ADMIN_EMAILS, and refuses when there is nobody to send to', () => {
    expect(parseSimulateArgs(['12'], dev)).toMatchObject({ ok: true, value: { recipients: ['admin@pretoscop.test'] } });
    expect(parseSimulateArgs(['12'], { APP_ENV: 'dev', ADMIN_EMAILS: [] })).toMatchObject({ ok: false, error: expect.stringContaining('--email') });
  });

  it('refuses APP_ENV=prod unless --allow-prod', () => {
    const prod = { APP_ENV: 'prod', ADMIN_EMAILS: ['admin@pretoscop.test'] };
    expect(parseSimulateArgs(['12', '10', '--email', 'a@exemplu.ro'], prod)).toMatchObject({ ok: false, error: expect.stringContaining('APP_ENV=prod') });
    expect(parseSimulateArgs(['12', '10', '--email', 'a@exemplu.ro', '--allow-prod'], prod)).toMatchObject({ ok: true });
  });

  it('refuses bad input', () => {
    expect(parseSimulateArgs(['0', '0'], dev)).toMatchObject({ ok: false });
    expect(parseSimulateArgs(['12', '95'], dev)).toMatchObject({ ok: false });
    expect(parseSimulateArgs(['12', '10', '--email', 'nu-e-adresa'], dev)).toMatchObject({ ok: false });
    expect(parseSimulateArgs(['12', '--everyone'], dev)).toMatchObject({ ok: false });
  });

  it("keeps only the recipients' alerts, never another subscriber's", () => {
    const candidates = [
      { alertId: 1, userId: 'u-founder' },
      { alertId: 2, userId: 'u-customer' },
      { alertId: 3, userId: 'u-unknown' },
    ];
    const emails = new Map([
      ['u-founder', 'Fondator@Exemplu.ro'],
      ['u-customer', 'client@exemplu.ro'],
    ]);
    expect(simulationTargets(candidates, emails, ['fondator@exemplu.ro']).map((c) => c.alertId)).toEqual([1]);
  });
});
