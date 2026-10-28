import { isAllowedByParsedRobots, parseRobotsTxt } from '@pretoscop/fetch';
import { ICECAT_ROBOTS_DISALLOW_AGENTS } from '@pretoscop/icecat/attribution';
import { describe, expect, it } from 'vitest';
import { AI_CRAWLERS, DISALLOWED_PATHS, robotsTxt } from '../robots';

const BASE = 'https://pretoscop.ro';
// Decisions as an RFC 9309 crawler takes them (the parser our own crawler obeys, M02).
const allowed = (txt: string, agent: string, path: string) => isAllowedByParsedRobots(parseRobotsTxt(txt), new URL(path, BASE), [agent]);

describe('robots.txt (M16)', () => {
  it('closes everything while the site is not indexable (prototype, staging)', () => {
    const txt = robotsTxt({ indexable: false, baseUrl: 'https://staging.pretoscop.ro' });
    expect(txt).toBe('# Pretoscop (prototype/staging): not open to crawlers yet.\nUser-agent: *\nDisallow: /\n');
    for (const agent of ['Googlebot', 'Bingbot', 'GPTBot', 'PretoscopBot']) {
      for (const path of ['/', '/p/televizor-samsung-55-12', '/c/tv-audio', '/sitemap.xml']) expect(allowed(txt, agent, path), `${agent} ${path}`).toBe(false);
    }
  });

  it('opens the site to search engines except click-outs, admin and APIs (search pages carry noindex instead)', () => {
    const txt = robotsTxt({ indexable: true, baseUrl: 'https://pretoscop.ro/' });
    const star = txt.slice(txt.indexOf('User-agent: *'));
    for (const p of DISALLOWED_PATHS) expect(star).toContain(`Disallow: ${p}\n`);
    expect(star).toContain('Allow: /\n');
    expect(txt).toContain('Sitemap: https://pretoscop.ro/sitemap.xml');
    expect(txt).not.toContain('Disallow: /p/');
    for (const agent of ['Googlebot', 'Bingbot', 'DuckDuckBot', 'YandexBot', 'Applebot']) {
      for (const path of ['/', '/p/televizor-samsung-55-12', '/c/tv-audio/televizoare', '/b/samsung', '/magazin/emag', '/reduceri', '/rapoarte/black-friday-2026', '/sitemaps/products-1.xml', '/_next/static/chunks/a.js', '/cauta?q=televizor']) {
        expect(allowed(txt, agent, path), `${agent} ${path}`).toBe(true);
      }
      for (const path of ['/out/123?p=offers_table', '/admin', '/admin/produse', '/api/suggest?q=tv']) {
        expect(allowed(txt, agent, path), `${agent} ${path}`).toBe(false);
      }
    }
  });

  it('refuses every AI crawler the Open Icecat licence names (M11), on product pages and everywhere else', () => {
    const txt = robotsTxt({ indexable: true, baseUrl: BASE });
    const aiGroup = txt.slice(0, txt.indexOf('User-agent: *'));
    // Product tokens match case-insensitively (RFC 9309), so Icecat's "omgili" is our "Omgili" line.
    const aiAgents = [...aiGroup.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1]!.toLowerCase());
    for (const ua of ICECAT_ROBOTS_DISALLOW_AGENTS) {
      expect(aiAgents).toContain(ua.toLowerCase());
      for (const path of ['/p/televizor-samsung-55-12', '/', '/c/tv-audio', '/reduceri']) expect(allowed(txt, ua, path), `${ua} ${path}`).toBe(false);
    }
    // And the training, dataset and answer-engine crawlers on our own list.
    for (const ua of ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot', 'PerplexityBot', 'Bytespider', 'meta-externalagent', 'Applebot-Extended']) {
      expect(allowed(txt, ua, '/p/televizor-samsung-55-12'), ua).toBe(false);
    }
    expect(aiGroup.trimEnd().endsWith('Disallow: /')).toBe(true);
    expect(txt).toContain('/.well-known/tdmrep.json');
    expect(txt).toContain('art. 4(3)');
  });

  it('lists each crawler once (tokens match case-insensitively) and never a search engine', () => {
    const lower = AI_CRAWLERS.map((ua) => ua.toLowerCase());
    expect(new Set(lower).size).toBe(AI_CRAWLERS.length);
    expect(lower).toEqual(expect.arrayContaining(ICECAT_ROBOTS_DISALLOW_AGENTS.map((ua) => ua.toLowerCase())));
    for (const se of ['Googlebot', 'Bingbot', 'DuckDuckBot', 'YandexBot', 'Applebot']) expect(lower).not.toContain(se.toLowerCase());
  });
});
