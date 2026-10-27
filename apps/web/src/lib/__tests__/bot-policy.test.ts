import { describe, expect, it } from 'vitest';
import { BOT_CHANGELOG, BOT_POLICY, botPolicyUpdated, botUserAgents, resolveBotInfoUrl, splitEgressIps } from '../bot-policy';

describe('bot identity', () => {
  it('publishes the exact User-Agent strings of the polite fetcher (M02)', () => {
    expect(botUserAgents()).toEqual({
      page: 'Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)',
      feed: 'Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)',
    });
    expect(botUserAgents('https://staging.pretoscop.ro/bot').page).toBe('Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://staging.pretoscop.ro/bot)');
  });

  it('falls back to the default info URL when the configured one could break the UA', () => {
    expect(resolveBotInfoUrl('not a url')).toBe('https://pretoscop.ro/bot');
    expect(resolveBotInfoUrl('https://x.ro/bot; evil')).toBe('https://pretoscop.ro/bot');
    expect(resolveBotInfoUrl(undefined)).toBe('https://pretoscop.ro/bot');
  });

  it('keeps the politeness numbers the bot page promises', () => {
    expect(BOT_POLICY.minIntervalSeconds).toBeGreaterThanOrEqual(5);
    expect(BOT_POLICY.concurrency).toBe(1);
    expect(BOT_POLICY.stopWithinBusinessDays).toBe(1);
  });

  it('has a dated changelog, newest first, that dates /bot/ips.json', () => {
    const dates = BOT_CHANGELOG.map((e) => e.date);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(botPolicyUpdated()).toBe(dates[0]);
  });
});

describe('splitEgressIps', () => {
  it('splits addresses and prefixes by family', () => {
    expect(splitEgressIps(['203.0.113.10', '2001:db8::1', '198.51.100.0/28', '2001:db8:1::/48'])).toEqual({
      ipv4: ['203.0.113.10', '198.51.100.0/28'],
      ipv6: ['2001:db8::1', '2001:db8:1::/48'],
    });
    expect(splitEgressIps([])).toEqual({ ipv4: [], ipv6: [] });
  });
});
