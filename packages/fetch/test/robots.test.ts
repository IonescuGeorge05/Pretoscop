import { describe, expect, it } from 'vitest';
import { BOT_PRODUCT_TOKEN, FEED_PRODUCT_TOKEN, buildUserAgent } from '../src/identity';
import {
  ROBOTS_PARSE_LIMIT_BYTES,
  evaluateRobots,
  extractProductToken,
  findIgnoredGroups,
  isAllowedByParsedRobots,
  normalizeRobotsPath,
  parseRobotsTxt,
  robotsPatternMatches,
  selectRobotsGroups,
} from '../src/robots';
import { readFixture } from './fixtures';

const PAGE = [BOT_PRODUCT_TOKEN];
const allowed = (robots: string, path: string, tokens: string[] = PAGE) =>
  isAllowedByParsedRobots(parseRobotsTxt(robots), new URL(path, 'https://shop.example.ro'), tokens);

describe('robots.txt parsing', () => {
  it('builds groups from consecutive user-agent lines and ignores comments, BOM and CRLF', () => {
    const parsed = parseRobotsTxt(
      '﻿# shop robots\r\nDisallow: /ignored-before-any-agent\r\nUser-agent: Googlebot\r\nUser-agent: Bingbot # two agents\r\nDisallow: /private\r\n\r\nUser-agent: *\r\nAllow: /\r\nDisallow: /cart\r\n',
    );
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.userAgents).toEqual(['Googlebot', 'Bingbot']);
    expect(parsed.groups[0]?.rules.map((r) => r.raw)).toEqual(['/private']);
    expect(parsed.groups[1]?.userAgents).toEqual(['*']);
    expect(parsed.groups[1]?.rules.map((r) => `${r.allow ? 'A' : 'D'} ${r.raw}`)).toEqual(['A /', 'D /cart']);
  });

  it('starts a new group when a user-agent line follows a rule', () => {
    const parsed = parseRobotsTxt('User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y\n');
    expect(parsed.groups.map((g) => g.userAgents)).toEqual([['a'], ['b']]);
  });

  it('ends a user-agent run at Crawl-delay, so a delay for another bot never leaks into *', () => {
    const parsed = parseRobotsTxt('User-agent: AhrefsBot\nCrawl-delay: 10\nUser-agent: *\nDisallow: /cart\n');
    expect(parsed.groups.map((g) => g.userAgents)).toEqual([['AhrefsBot'], ['*']]);
    expect(selectRobotsGroups(parsed, PAGE).crawlDelaySec).toBeNull();
    const own = parseRobotsTxt('User-agent: *\nCrawl-delay: 5\nDisallow: /x\n');
    expect(own.groups).toHaveLength(1);
    expect(own.groups[0]?.crawlDelaySec).toBe(5);
    expect(own.groups[0]?.rules).toHaveLength(1);
  });

  it('treats an empty Disallow as no restriction', () => {
    expect(allowed('User-agent: *\nDisallow:\n', '/anything')).toBe(true);
  });

  it('accepts lenient syntax: missing colon, odd key casing, a pattern without leading slash', () => {
    const robots = 'USER-AGENT: *\nDisallow /no-colon\ndisallow: index.php?main_page=login\n';
    expect(allowed(robots, '/no-colon/x')).toBe(false);
    expect(allowed(robots, '/index.php?main_page=login')).toBe(false);
    expect(allowed(robots, '/index.php?main_page=product_info')).toBe(true);
  });

  it('collects Sitemap lines anywhere in the file, de-duplicated and resolved', () => {
    const parsed = parseRobotsTxt(
      'Sitemap: https://shop.example.ro/sitemap.xml\nUser-agent: *\nSitemap: /media/sitemap/products.xml\nDisallow: /cart\nSitemap: https://shop.example.ro/sitemap.xml\nsitemap: not a url at all\n',
      'https://shop.example.ro/robots.txt',
    );
    expect(parsed.sitemaps).toEqual([
      'https://shop.example.ro/sitemap.xml',
      'https://shop.example.ro/media/sitemap/products.xml',
    ]);
    expect(parsed.groups[0]?.rules).toHaveLength(1);
  });

  it('parses Crawl-delay (decimal, comma) per group and combines matching groups with the larger value', () => {
    const parsed = parseRobotsTxt(
      'User-agent: *\nCrawl-delay: 2,5\n\nUser-agent: PretoscopBot\nCrawl-delay: 7\nDisallow: /a\n\nUser-agent: pretoscopbot/1.0\nCrawl-delay: 12\nDisallow: /b\n',
    );
    expect(selectRobotsGroups(parsed, ['Nobody']).crawlDelaySec).toBe(2.5);
    const ours = selectRobotsGroups(parsed, PAGE);
    expect(ours.groups).toHaveLength(2);
    expect(ours.crawlDelaySec).toBe(12);
  });

  it('ignores content beyond the 512 KiB parse limit', () => {
    const filler = `# ${'x'.repeat(ROBOTS_PARSE_LIMIT_BYTES)}\n`;
    const robots = `User-agent: *\nDisallow: /early\n${filler}Disallow: /late\n`;
    expect(allowed(robots, '/early')).toBe(false);
    expect(allowed(robots, '/late')).toBe(true);
  });
});

describe('group selection (RFC 9309 product tokens)', () => {
  it('extracts the product token from a user-agent value', () => {
    expect(extractProductToken('PretoscopBot/1.0')).toBe('PretoscopBot');
    expect(extractProductToken('pretoscopbot (+https://x)')).toBe('pretoscopbot');
    expect(extractProductToken('bot/')).toBe('bot');
    expect(extractProductToken('Pretoscop-Bot')).toBe('Pretoscop-Bot');
  });

  it('matches our token case-insensitively and prefers it over *', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: pretoscopbot\nDisallow: /cart\n';
    expect(allowed(robots, '/produs/1')).toBe(true);
    expect(allowed(robots, '/cart')).toBe(false);
    expect(selectRobotsGroups(parseRobotsTxt(robots), PAGE).label).toBe('PretoscopBot');
  });

  it('falls back to * and, without groups, allows everything', () => {
    expect(allowed('User-agent: Googlebot\nDisallow: /\n', '/x')).toBe(true);
    expect(selectRobotsGroups(parseRobotsTxt('User-agent: Googlebot\nDisallow: /\n'), PAGE).label).toBe('none');
    expect(allowed('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /x\n', '/x')).toBe(false);
  });

  it('does not match generic fragments such as cel.ro uses (bot/, crawl, spider) and reports them', () => {
    const robots = readFixture('robots', 'celro_style_generic_tokens_synthetic.txt');
    const parsed = parseRobotsTxt(robots);
    const selection = selectRobotsGroups(parsed, PAGE);
    expect(selection.label).toBe('*');
    // The generic group says "Disallow: /" — under RFC 9309 it is not ours.
    expect(isAllowedByParsedRobots(parsed, new URL('https://www.cel.example/telefoane/samsung-1.html'), PAGE)).toBe(true);
    expect(isAllowedByParsedRobots(parsed, new URL('https://www.cel.example/cumpara/1'), PAGE)).toBe(false);
    const ignored = findIgnoredGroups(parsed, selection, buildUserAgent('page'));
    const byValue = Object.fromEntries(ignored.map((g) => [g.userAgent, g.reason]));
    expect(byValue['bot/']).toBe('generic_fragment');
    expect(byValue['bot-']).toBe('generic_fragment');
    expect(byValue.crawl).toBe('generic_fragment');
    expect(byValue.spider).toBe('generic_fragment');
    expect(byValue.robot).toBe('generic_fragment');
    expect(byValue.AhrefsBot).toBeUndefined();
  });

  it('reports values that are substrings of our User-Agent and other Pretoscop tokens', () => {
    const parsed = parseRobotsTxt(
      'User-agent: compatible; Pretosc\nDisallow: /\n\nUser-agent: Pretoscop\nDisallow: /\n\nUser-agent: *\nAllow: /\n',
    );
    const ignored = findIgnoredGroups(parsed, selectRobotsGroups(parsed, PAGE), buildUserAgent('page'));
    expect(ignored).toEqual([
      { userAgent: 'compatible; Pretosc', reason: 'substring_of_our_user_agent' },
      { userAgent: 'Pretoscop', reason: 'other_pretoscop_token' },
    ]);
  });

  it('feed requests use PretoscopBot-Feed, then PretoscopBot, then *', () => {
    const FEED = [FEED_PRODUCT_TOKEN, BOT_PRODUCT_TOKEN];
    const both = 'User-agent: PretoscopBot\nDisallow: /\n\nUser-agent: PretoscopBot-Feed\nAllow: /feeds/\nDisallow: /\n';
    expect(allowed(both, '/feeds/x.xml', FEED)).toBe(true);
    expect(allowed(both, '/feeds/x.xml', PAGE)).toBe(false);
    const onlyBot = 'User-agent: PretoscopBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n';
    expect(allowed(onlyBot, '/feeds/x.xml', FEED)).toBe(false);
  });

  it('combines all groups that name our token', () => {
    const robots = 'User-agent: PretoscopBot\nDisallow: /a\n\nUser-agent: Googlebot\nDisallow: /g\n\nUser-agent: PretoscopBot\nDisallow: /b\n';
    expect(allowed(robots, '/a')).toBe(false);
    expect(allowed(robots, '/b')).toBe(false);
    expect(allowed(robots, '/g')).toBe(true);
  });
});

describe('rule matching', () => {
  it('supports * wildcards anywhere in the pattern', () => {
    const robots = 'User-agent: *\nDisallow: /*?sort=\nDisallow: /*/filtre/*/*/*\nDisallow: *SID=\n';
    expect(allowed(robots, '/laptopuri?sort=price')).toBe(false);
    expect(allowed(robots, '/laptopuri?page=2')).toBe(true);
    expect(allowed(robots, '/tv/filtre/a/b/c')).toBe(false);
    expect(allowed(robots, '/tv/filtre/a/b')).toBe(true);
    expect(allowed(robots, '/x?SID=1')).toBe(false);
  });

  it('anchors with $ at the end only', () => {
    const robots = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /cart$\nDisallow: /a$b\n';
    expect(allowed(robots, '/docs/manual.pdf')).toBe(false);
    expect(allowed(robots, '/docs/manual.pdf?x=1')).toBe(true);
    expect(allowed(robots, '/cart')).toBe(false);
    expect(allowed(robots, '/cart/items')).toBe(true);
    // A $ inside the pattern is a literal character.
    expect(allowed(robots, '/a$b/c')).toBe(false);
    expect(allowed(robots, '/ab')).toBe(true);
  });

  it('uses the longest matching rule', () => {
    const robots = 'User-agent: *\nDisallow: /folder/\nAllow: /folder/page\nAllow: /page\nDisallow: /*.html\n';
    expect(allowed(robots, '/folder/page')).toBe(true);
    expect(allowed(robots, '/folder/other')).toBe(false);
    expect(allowed(robots, '/page.html')).toBe(false); // "/*.html" (7) beats "/page" (5)
  });

  it('lets Allow win a tie of equal length', () => {
    expect(allowed('User-agent: *\nDisallow: /p\nAllow: /p\n', '/p/1')).toBe(true);
    expect(allowed('User-agent: *\nAllow: /p\nDisallow: /p\n', '/p/1')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /\nAllow: /$\n', '/')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /\nAllow: /$\n', '/x')).toBe(false);
  });

  it('normalizes percent-encoding the same way for paths and patterns (RFC 9309 §2.2.2)', () => {
    expect(normalizeRobotsPath('/foo/bar/%62%61%7A')).toBe('/foo/bar/baz');
    expect(normalizeRobotsPath('/foo/bar/ツ')).toBe('/foo/bar/%E3%83%84');
    expect(normalizeRobotsPath('/a%2fb')).toBe('/a%2Fb');
    expect(normalizeRobotsPath('/100%')).toBe('/100%25');
    expect(allowed('User-agent: *\nDisallow: /foo/bar/%62%61%7A\n', '/foo/bar/baz')).toBe(false);
    expect(allowed('User-agent: *\nDisallow: /produse/căutare\n', '/produse/căutare?q=1')).toBe(false);
    expect(allowed('User-agent: *\nDisallow: /produse/c%c4%83utare\n', '/produse/căutare')).toBe(false);
    // An encoded slash is not a path separator.
    expect(allowed('User-agent: *\nDisallow: /a/b\n', '/a%2Fb')).toBe(true);
  });

  it('always allows /robots.txt', () => {
    expect(allowed('User-agent: *\nDisallow: /\n', '/robots.txt')).toBe(true);
    expect(evaluateRobots(parseRobotsTxt('User-agent: *\nDisallow: /\n').groups, '/robots.txt').allowed).toBe(true);
  });

  it('matches like the reference implementation on edge patterns', () => {
    expect(robotsPatternMatches('/', '/')).toBe(true);
    expect(robotsPatternMatches('/abc', '*')).toBe(true);
    expect(robotsPatternMatches('/abc', '/a*c$')).toBe(true);
    expect(robotsPatternMatches('/abcd', '/a*c$')).toBe(false);
    expect(robotsPatternMatches('/x/y/z', '/*/*/z')).toBe(true);
    expect(robotsPatternMatches('/x', '/x/')).toBe(false);
  });
});
