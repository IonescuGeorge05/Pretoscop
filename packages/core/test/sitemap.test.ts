import { describe, expect, it } from 'vitest';
import { chunk, sitemapIndexXml, SITEMAP_MAX_URLS, urlsetXml, validateSitemapXml, w3cDate, xmlEscape } from '../src/sitemap';

describe('sitemap XML (sitemaps.org 0.9)', () => {
  it('builds a valid urlset with escaped locations and W3C dates', () => {
    const xml = urlsetXml([
      { loc: 'https://pretoscop.ro/p/televizor-samsung-55-12', lastmod: w3cDate('2026-10-27T20:54:56.775Z') },
      { loc: 'https://pretoscop.ro/cauta?q=a&b=c' },
      { loc: 'https://pretoscop.ro/c/tv-audio', lastmod: '2026-10-27' },
    ]);
    expect(xml).toContain('<lastmod>2026-10-27T20:54:56Z</lastmod>');
    expect(xml).toContain('q=a&amp;b=c');
    expect(validateSitemapXml(xml, { host: 'pretoscop.ro' })).toEqual([]);
  });

  it('builds a valid index', () => {
    const xml = sitemapIndexXml([{ loc: 'https://pretoscop.ro/sitemaps/products-1.xml', lastmod: '2026-10-27T10:00:00Z' }, { loc: 'https://pretoscop.ro/sitemaps/pages.xml' }]);
    expect(validateSitemapXml(xml)).toEqual([]);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it('finds protocol problems', () => {
    expect(validateSitemapXml('<urlset></urlset>')).toEqual(expect.arrayContaining(['missing XML declaration']));
    const bad = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>/relative</loc></url>\n<url><loc>https://x.ro/a?b=1&c=2</loc><lastmod>27 oct</lastmod></url>\n<url><loc>https://other.ro/</loc></url>\n</urlset>\n';
    const issues = validateSitemapXml(bad, { host: 'x.ro' });
    expect(issues).toEqual(expect.arrayContaining(['unescaped "&"', 'not an absolute URL: /relative', 'other host: https://other.ro/']));
    expect(issues.some((i) => i.startsWith('invalid lastmod'))).toBe(true);
    const dup = urlsetXml([{ loc: 'https://x.ro/a' }, { loc: 'https://x.ro/a' }]);
    expect(validateSitemapXml(dup)).toEqual(['duplicate loc: https://x.ro/a']);
  });

  it('enforces the 50,000-URL limit and chunks', () => {
    const many = Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => ({ loc: `https://x.ro/p/${i}` }));
    expect(() => urlsetXml(many)).toThrow();
    const parts = chunk(many);
    expect(parts.map((p) => p.length)).toEqual([SITEMAP_MAX_URLS, 1]);
    expect(validateSitemapXml(urlsetXml(parts[0]!))).toEqual([]);
    expect(xmlEscape(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });
});
