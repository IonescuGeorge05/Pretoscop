import { describe, expect, it } from 'vitest';
import { getEnv } from './env';

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
  });

  it('reports invalid enums readably', () => {
    expect(() => getEnv({ APP_ENV: 'qa' })).toThrow(/APP_ENV/);
  });
});
