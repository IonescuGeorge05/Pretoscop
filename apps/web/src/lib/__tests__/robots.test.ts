import { describe, expect, it } from 'vitest';
import { AI_CRAWLERS, DISALLOWED_PATHS, robotsTxt } from '../robots';

describe('robots.txt (M16)', () => {
  it('closes everything while the site is not indexable (prototype, staging)', () => {
    expect(robotsTxt({ indexable: false, baseUrl: 'https://staging.pretoscop.ro' })).toBe(
      '# Pretoscop (prototype/staging): not open to crawlers yet.\nUser-agent: *\nDisallow: /\n',
    );
  });

  it('opens the site to search engines except click-outs, admin, APIs and search results', () => {
    const txt = robotsTxt({ indexable: true, baseUrl: 'https://pretoscop.ro/' });
    const star = txt.slice(txt.indexOf('User-agent: *'));
    for (const p of DISALLOWED_PATHS) expect(star).toContain(`Disallow: ${p}\n`);
    expect(star).toContain('Allow: /\n');
    expect(txt).toContain('Sitemap: https://pretoscop.ro/sitemap.xml');
    expect(txt).not.toContain('Disallow: /p/');
  });

  it('refuses AI crawlers and states the TDM reservation', () => {
    const txt = robotsTxt({ indexable: true, baseUrl: 'https://pretoscop.ro' });
    const aiGroup = txt.slice(0, txt.indexOf('User-agent: *'));
    for (const ua of ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot', 'PerplexityBot', 'Bytespider', 'meta-externalagent']) {
      expect(aiGroup).toContain(`User-agent: ${ua}\n`);
    }
    expect(aiGroup.trimEnd().endsWith('Disallow: /')).toBe(true);
    expect(txt).toContain('/.well-known/tdmrep.json');
    expect(txt).toContain('art. 4(3)');
    expect(new Set(AI_CRAWLERS).size).toBe(AI_CRAWLERS.length);
    // Search engines are never in the AI group.
    for (const se of ['Googlebot', 'Bingbot', 'DuckDuckBot', 'YandexBot', 'Applebot']) expect(AI_CRAWLERS as readonly string[]).not.toContain(se);
  });
});
