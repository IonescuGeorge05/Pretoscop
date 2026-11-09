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

  it('push and Telegram settings come in pairs (M27)', () => {
    expect(getEnv({}).VAPID_SUBJECT).toBe('mailto:alerte@pretoscop.ro');
    expect(() => getEnv({ VAPID_PUBLIC_KEY: 'abc' })).toThrow(/VAPID_PRIVATE_KEY/);
    expect(() => getEnv({ TELEGRAM_BOT_TOKEN: '1:x' })).toThrow(/TELEGRAM_BOT_USERNAME/);
    expect(getEnv({ TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_BOT_USERNAME: 'PretoscopBot' }).TELEGRAM_API_BASE).toBe('https://api.telegram.org');
  });

  it('checks the shape of the M27 settings (keys, contact, bot username) and keeps the token on TLS outside dev', () => {
    const pub = `B${'A'.repeat(86)}`;
    const priv = 'A'.repeat(43);
    expect(getEnv({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv }).VAPID_PUBLIC_KEY).toBe(pub);
    expect(() => getEnv({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: priv })).toThrow(/VAPID_PUBLIC_KEY must be/);
    expect(() => getEnv({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: 'x' })).toThrow(/VAPID_PRIVATE_KEY must be/);
    expect(() => getEnv({ VAPID_SUBJECT: 'alerte@pretoscop.ro' })).toThrow(/VAPID_SUBJECT must be/);
    expect(getEnv({ VAPID_SUBJECT: 'https://pretoscop.ro/contact' }).VAPID_SUBJECT).toBe('https://pretoscop.ro/contact');
    expect(() => getEnv({ TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_BOT_USERNAME: '@PretoscopBot' })).toThrow(/without @/);
    expect(() => getEnv({ TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_BOT_USERNAME: 'Pretoscop?start=x' })).toThrow(/without @/);
    const prod = {
      APP_ENV: 'staging',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      REVALIDATE_TOKEN: 'b'.repeat(32),
      HASH_SALT_SECRET: 'c'.repeat(32),
      ALERTS_SECRET: 'd'.repeat(32),
    };
    expect(() => getEnv({ ...prod, TELEGRAM_API_BASE: 'http://127.0.0.1:3481' })).toThrow(/TELEGRAM_API_BASE must be https/);
    expect(getEnv({ ...prod, TELEGRAM_API_BASE: 'http://127.0.0.1:3481', APP_ENV: 'dev' }).TELEGRAM_API_BASE).toBe('http://127.0.0.1:3481');
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

  it('keeps Web Bot Auth off by default and refuses signing without a well-formed key, never echoing it', () => {
    expect(getEnv({}).WEB_BOT_AUTH).toBe(false);
    expect(getEnv({}).WEB_BOT_AUTH_PRIVATE_KEY).toBeUndefined();
    expect(() => getEnv({ WEB_BOT_AUTH: 'true' })).toThrow(/WEB_BOT_AUTH is on but WEB_BOT_AUTH_PRIVATE_KEY is not set/);
    const secret = 'abc-not-a-key-0123456789';
    let message = '';
    try {
      getEnv({ WEB_BOT_AUTH_PRIVATE_KEY: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/must be a base64url Ed25519 seed/);
    expect(message).not.toContain(secret);
    const seed = 'A'.repeat(43);
    expect(getEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: seed })).toMatchObject({ WEB_BOT_AUTH: true, WEB_BOT_AUTH_PRIVATE_KEY: seed });
  });

  it('signs only for an https Signature-Agent (http on loopback for local tests)', () => {
    const seed = 'A'.repeat(43);
    expect(() => getEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: seed, BOT_INFO_URL: 'http://pretoscop.ro/bot' })).toThrow(/https BOT_INFO_URL/);
    expect(() => getEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: seed, BOT_INFO_URL: 'http://localhost.evil.example/bot' })).toThrow(/https BOT_INFO_URL/);
    expect(getEnv({ WEB_BOT_AUTH: '1', WEB_BOT_AUTH_PRIVATE_KEY: seed, BOT_INFO_URL: 'http://localhost:3450/bot' }).WEB_BOT_AUTH).toBe(true);
    // Signing off: any BOT_INFO_URL is accepted as before.
    expect(getEnv({ BOT_INFO_URL: 'http://pretoscop.test/bot' }).WEB_BOT_AUTH).toBe(false);
  });

  it('accepts the public RFC 9421 test key in dev only', () => {
    const testKey = 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU';
    expect(getEnv({ WEB_BOT_AUTH_PRIVATE_KEY: testKey }).WEB_BOT_AUTH_PRIVATE_KEY).toBe(testKey);
    expect(() => getEnv({ APP_ENV: 'staging', WEB_BOT_AUTH_PRIVATE_KEY: testKey })).toThrow(/public RFC 9421 test key/);
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

  it('keeps the assisted channel off by default and its vendor endpoint on https (M05B)', () => {
    const env = getEnv({});
    expect(env).toMatchObject({ ASSISTED_VENDOR: 'none', ASSISTED_MONTHLY_CAP_EUR: 150, ZYTE_API_URL: 'https://api.zyte.com/v1/extract' });
    expect(getEnv({ ZYTE_API_URL: 'http://127.0.0.1:4010/v1/extract' }).ZYTE_API_URL).toBe('http://127.0.0.1:4010/v1/extract');
    expect(() => getEnv({ ZYTE_API_URL: 'http://api.zyte.com/v1/extract' })).toThrow(/ZYTE_API_URL must be an https URL/);
    expect(() => getEnv({ ZYTE_API_URL: 'not a url' })).toThrow(/ZYTE_API_URL/);
    expect(() => getEnv({ ASSISTED_MONTHLY_CAP_EUR: '-1' })).toThrow(/ASSISTED_MONTHLY_CAP_EUR/);
    const prod = {
      APP_ENV: 'prod',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      REVALIDATE_TOKEN: 'b'.repeat(32),
      HASH_SALT_SECRET: 'c'.repeat(32),
      ALERTS_SECRET: 'd'.repeat(32),
    };
    expect(() => getEnv({ ...prod, ZYTE_API_URL: 'http://127.0.0.1:4010/v1/extract' })).toThrow(/ZYTE_API_URL must be https outside development/);
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
