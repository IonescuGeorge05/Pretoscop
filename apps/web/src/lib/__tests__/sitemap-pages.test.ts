import { urlsetXml, validateSitemapXml } from '@pretoscop/core';
import { legalDocuments } from '@pretoscop/config/legal-texts';
import { describe, expect, it } from 'vitest';
import { newestLastmod, pagesSitemapEntries, type PagesSitemapInput } from '../sitemap-pages';

const input = (over: Partial<PagesSitemapInput> = {}): PagesSitemapInput => ({
  base: 'https://pretoscop.ro/',
  latestPriceChange: '2026-10-28T06:01:51.536Z',
  dealRoots: [],
  documents: Object.values(legalDocuments),
  reports: [],
  ...over,
});
const locs = (i: PagesSitemapInput) => pagesSitemapEntries(i).map((e) => e.loc.replace('https://pretoscop.ro', ''));

describe('pages.xml (M16)', () => {
  it('lists the home, browse indexes and every trust and legal page with its own date', () => {
    const entries = pagesSitemapEntries(input());
    expect(entries.slice(0, 3)).toEqual([
      { loc: 'https://pretoscop.ro/', lastmod: '2026-10-28T06:01:51Z' },
      { loc: 'https://pretoscop.ro/categorii', lastmod: '2026-10-28T06:01:51Z' },
      { loc: 'https://pretoscop.ro/magazine', lastmod: '2026-10-28T06:01:51Z' },
    ]);
    for (const d of Object.values(legalDocuments)) expect(entries).toContainEqual({ loc: `https://pretoscop.ro${d.path}`, lastmod: d.updatedAt });
    expect(validateSitemapXml(urlsetXml(entries), { host: 'pretoscop.ro' })).toEqual([]);
  });

  it('lists /reduceri and its tabs only while they show verified drops', () => {
    expect(locs(input({ dealRoots: [] })).filter((l) => l.startsWith('/reduceri'))).toEqual([]);
    expect(locs(input({ dealRoots: null })).filter((l) => l.startsWith('/reduceri'))).toEqual([]);
    expect(locs(input({ dealRoots: ['gaming', 'tv-audio', 'gaming'] })).filter((l) => l.startsWith('/reduceri'))).toEqual(['/reduceri', '/reduceri/gaming', '/reduceri/tv-audio']);
  });

  it('lists approved reports only (M23 report:approve), dated by their approval', () => {
    const reports = [
      { id: 'black-friday-2026', approval: { approved: true, at: '2026-12-03T10:00:00.000Z' } },
      { id: 'draft-report', approval: { approved: false, at: null } },
    ];
    const entries = pagesSitemapEntries(input({ reports }));
    expect(entries).toContainEqual({ loc: 'https://pretoscop.ro/rapoarte/black-friday-2026', lastmod: '2026-12-03T10:00:00Z' });
    expect(entries).toContainEqual({ loc: 'https://pretoscop.ro/rapoarte', lastmod: '2026-12-03T10:00:00Z' });
    expect(locs(input({ reports }))).not.toContain('/rapoarte/draft-report');
    // Without an approved report: the index page only, planned reports never.
    expect(locs(input()).filter((l) => l.startsWith('/rapoarte'))).toEqual(['/rapoarte']);
    expect(newestLastmod(entries)).toBe('2026-12-03T10:00:00Z');
  });

  it('newest lastmod compares instants, not strings', () => {
    expect(newestLastmod([{ loc: 'a', lastmod: '2026-10-28' }, { loc: 'b', lastmod: '2026-10-27T23:00:00Z' }, { loc: 'c', lastmod: null }])).toBe('2026-10-28');
    expect(newestLastmod([{ loc: 'a', lastmod: null }])).toBeNull();
  });
});
