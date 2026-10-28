import { describe, expect, it } from 'vitest';
import { emailComplianceProblems, envWarnings, getEnv, isIpOrCidr } from './env';

/** A real-looking sender identity (production refuses the dev placeholders). */
const identity = { COMPANY_LEGAL_NAME: 'Pretoscop SRL', COMPANY_POSTAL_ADDRESS: 'Str. Exemplu nr. 1, București 010101, România' };

describe('getEnv', () => {
  it('applies dev defaults', () => {
    const env = getEnv({});
    expect(env.APP_ENV).toBe('dev');
    expect(env.FETCH_DEFAULT_MIN_INTERVAL_MS).toBe(5000);
    expect(env.CRAWL_ENABLED).toBe(false);
    expect(env.ADMIN_EMAILS).toEqual([]);
  });

  it('parses booleans, numbers and lists', () => {
    const env = getEnv({
      CRAWL_ENABLED: 'true',
      FETCH_DEFAULT_MIN_INTERVAL_MS: '8000',
      ADMIN_EMAILS: ' A@x.ro, b@y.ro ,',
      ZYTE_API_KEY: '  ',
    });
    expect(env.CRAWL_ENABLED).toBe(true);
    expect(env.FETCH_DEFAULT_MIN_INTERVAL_MS).toBe(8000);
    expect(env.ADMIN_EMAILS).toEqual(['a@x.ro', 'b@y.ro']);
    expect(env.ZYTE_API_KEY).toBeUndefined();
  });

  it('refuses dev secrets in production', () => {
    expect(() => getEnv({ APP_ENV: 'prod' })).toThrow(/BETTER_AUTH_SECRET must be set/);
    const others = { BETTER_AUTH_SECRET: 'a'.repeat(32), REVALIDATE_TOKEN: 'b'.repeat(32), HASH_SALT_SECRET: 'c'.repeat(32) };
    expect(() => getEnv({ APP_ENV: 'prod', ...others })).toThrow(/ALERTS_SECRET must be set/);
    expect(getEnv({ APP_ENV: 'prod', ...others, ALERTS_SECRET: 'd'.repeat(32), ...identity }).RESEND_WEBHOOK_SECRET).toBeUndefined();
  });

  it('refuses a production start without a real sender identity or, on Resend, the bounce webhook', () => {
    const secrets = { BETTER_AUTH_SECRET: 'a'.repeat(32), REVALIDATE_TOKEN: 'b'.repeat(32), HASH_SALT_SECRET: 'c'.repeat(32), ALERTS_SECRET: 'd'.repeat(32) };
    expect(() => getEnv({ APP_ENV: 'prod', ...secrets })).toThrow(/COMPANY_LEGAL_NAME must be the legal name[\s\S]*COMPANY_POSTAL_ADDRESS must be the full postal address/);
    expect(() => getEnv({ APP_ENV: 'prod', ...secrets, COMPANY_LEGAL_NAME: '  ', COMPANY_POSTAL_ADDRESS: 'România' })).toThrow(/COMPANY_LEGAL_NAME/);
    expect(() => getEnv({ APP_ENV: 'prod', ...secrets, ...identity, MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_x' })).toThrow(/RESEND_WEBHOOK_SECRET must be set with MAIL_DRIVER=resend/);
    const ok = getEnv({ APP_ENV: 'prod', ...secrets, ...identity, MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_x', RESEND_WEBHOOK_SECRET: 'whsec_x' });
    expect(ok.COMPANY_POSTAL_ADDRESS).toBe(identity.COMPANY_POSTAL_ADDRESS);
  });

  it('only warns about the same problems in staging, and says nothing in dev', () => {
    const secrets = { BETTER_AUTH_SECRET: 'a'.repeat(32), REVALIDATE_TOKEN: 'b'.repeat(32), HASH_SALT_SECRET: 'c'.repeat(32), ALERTS_SECRET: 'd'.repeat(32) };
    const staging = getEnv({ APP_ENV: 'staging', ...secrets, MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_x' });
    expect(envWarnings(staging)).toEqual([
      expect.stringMatching(/^COMPANY_LEGAL_NAME: /),
      expect.stringMatching(/^COMPANY_POSTAL_ADDRESS: /),
      expect.stringMatching(/^RESEND_WEBHOOK_SECRET: /),
    ]);
    expect(envWarnings(getEnv({}))).toEqual([]);
    expect(emailComplianceProblems({ ...identity, MAIL_DRIVER: 'smtp' })).toEqual([]);
  });

  it('reports invalid enums readably', () => {
    expect(() => getEnv({ APP_ENV: 'qa' })).toThrow(/APP_ENV/);
  });

  it('parses the published crawler IPs (empty by default)', () => {
    expect(getEnv({}).BOT_EGRESS_IPS).toEqual([]);
    expect(getEnv({ BOT_EGRESS_IPS: ' , ' }).BOT_EGRESS_IPS).toEqual([]);
    const env = getEnv({ BOT_EGRESS_IPS: ' 203.0.113.10, 2001:db8::1 ,198.51.100.0/28,2001:db8:1::/48' });
    expect(env.BOT_EGRESS_IPS).toEqual(['203.0.113.10', '2001:db8::1', '198.51.100.0/28', '2001:db8:1::/48']);
  });

  it('refuses invalid crawler IPs with the offending value', () => {
    expect(() => getEnv({ BOT_EGRESS_IPS: '203.0.113.10,crawl-1.bot.pretoscop.ro' })).toThrow(
      /BOT_EGRESS_IPS: "crawl-1.bot.pretoscop.ro" is not an IPv4\/IPv6 address/,
    );
    expect(() => getEnv({ BOT_EGRESS_IPS: '203.0.113.0/33' })).toThrow(/BOT_EGRESS_IPS/);
    expect(() => getEnv({ BOT_EGRESS_IPS: '2001:db8::/129' })).toThrow(/BOT_EGRESS_IPS/);
    expect(() => getEnv({ BOT_EGRESS_IPS: '256.1.1.1' })).toThrow(/BOT_EGRESS_IPS/);
  });

  it('parses the e2e fixture allowlist of the SSRF guard, and refuses it (and the open switch) outside development', () => {
    expect(getEnv({}).FETCH_PRIVATE_ALLOWLIST).toEqual([]);
    expect(getEnv({ FETCH_PRIVATE_ALLOWLIST: ' 127.0.0.1:3399 ,' }).FETCH_PRIVATE_ALLOWLIST).toEqual(['127.0.0.1:3399']);
    expect(() => getEnv({ FETCH_PRIVATE_ALLOWLIST: 'localhost:3399' })).toThrow(/FETCH_PRIVATE_ALLOWLIST/);
    const prod = {
      APP_ENV: 'prod',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      REVALIDATE_TOKEN: 'b'.repeat(32),
      HASH_SALT_SECRET: 'c'.repeat(32),
      ALERTS_SECRET: 'd'.repeat(32),
    };
    expect(() => getEnv({ ...prod, FETCH_PRIVATE_ALLOWLIST: '127.0.0.1:3399' })).toThrow(/FETCH_PRIVATE_ALLOWLIST is for local development only/);
    expect(() => getEnv({ ...prod, FETCH_ALLOW_PRIVATE_HOSTS: 'true' })).toThrow(/FETCH_ALLOW_PRIVATE_HOSTS is for local development only/);
  });
});

describe('isIpOrCidr', () => {
  it.each([
    ['192.0.2.1', true],
    ['192.0.2.0/24', true],
    ['::1', true],
    ['2001:db8::/32', true],
    ['192.0.2.0/', false],
    ['192.0.2.0/24/1', false],
    ['192.0.2.0/x', false],
    ['example.com', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isIpOrCidr(value)).toBe(expected);
  });
});
