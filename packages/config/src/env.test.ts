import { describe, expect, it } from 'vitest';
import { getEnv, isIpOrCidr } from './env';

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
    expect(getEnv({ APP_ENV: 'prod', ...others, ALERTS_SECRET: 'd'.repeat(32) }).RESEND_WEBHOOK_SECRET).toBeUndefined();
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
