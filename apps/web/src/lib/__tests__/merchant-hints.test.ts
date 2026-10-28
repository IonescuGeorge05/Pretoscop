import type { MerchantFeedReport } from '@pretoscop/db/schema';
import { describe, expect, it } from 'vitest';
import { dashboardHints, feedReportHints, REASON_CATEGORIES, rejectLabel, STATUS_LABELS } from '../merchant-hints';

function report(over: Partial<MerchantFeedReport> = {}): MerchantFeedReport {
  return {
    source: 'url',
    fetchedAt: '2026-10-27T10:00:00Z',
    bytes: 1000,
    format: 'google',
    detectedFormat: 'google',
    parserKey: 'feed-google-shopping',
    offers: 10,
    rows: 10,
    skippedRows: 0,
    truncated: false,
    fields: { gtin: 10, shippingCost: 10 },
    priceFormat: { verdict: 'decimal', ambiguousExamples: [], effective: 'decimal', needsChoice: false },
    vat: { included: 0, excluded: 0, unknown: 10 },
    currencies: { RON: 10 },
    domain: { expected: 'magazin.ro', onDomain: 10, offDomain: 0, offDomainExamples: [] },
    duplicateIds: 0,
    parseError: null,
    normalization: { accepted: 10, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: { offer: 10 } },
    preview: [],
    ...over,
  };
}

describe('feedReportHints', () => {
  it('says nothing about a clean feed', () => {
    expect(feedReportHints(report())).toEqual([]);
  });

  it('explains every problem in Romanian, errors first where they block listing', () => {
    const hints = feedReportHints(
      report({
        skippedRows: 3,
        fields: { gtin: 4, shippingCost: 0 },
        priceFormat: { verdict: 'ambiguous', ambiguousExamples: ['12.500'], effective: null, needsChoice: true },
        vat: { included: 0, excluded: 2, unknown: 8 },
        currencies: { RON: 9, EUR: 1 },
        domain: { expected: 'magazin.ro', onDomain: 8, offDomain: 2, offDomainExamples: ['https://alt.ro/x'] },
        duplicateIds: 1,
        normalization: { accepted: 7, rejected: 3, rejectReasons: { price_missing: 2, title_missing: 1 }, warnings: {}, shippingBasis: {} },
        truncated: true,
      }),
    );
    const text = hints.map((h) => h.text).join('\n');
    expect(text).toMatch(/3 rânduri nu au titlu/);
    expect(text).toMatch(/3 produse nu pot fi afișate: fără preț \(2\), fără titlu \(1\)/);
    expect(text).toMatch(/2 produse au adresa în afara domeniului magazin\.ro \(de exemplu, https:\/\/alt\.ro\/x\)/);
    expect(text).toMatch(/„12\.500”/);
    expect(text).toMatch(/fără TVA/);
    expect(text).toMatch(/EUR \(1\)/);
    expect(text).toMatch(/lipsește la 60%/);
    expect(text).toMatch(/nu are costuri de livrare/);
    expect(text).toMatch(/același cod/);
    expect(text).toMatch(/primele 5\.000/);
    expect(hints.filter((h) => h.level === 'error')).toHaveLength(2);
    expect(text).not.toMatch(/[şţŞŢ]/);
  });
});

describe('dashboardHints', () => {
  it('waits for the first run', () => {
    expect(dashboardHints({ activeOffers: 0, withGtin: 0, matched: 0, stale: 0, shippingUnknown: 0, lastRun: null })[0]!.text).toMatch(/Prima citire/);
  });

  it('reports failures, off-domain drops, rejects, unmatched offers and stale ones', () => {
    const text = dashboardHints({
      activeOffers: 100,
      withGtin: 70,
      matched: 40,
      stale: 5,
      shippingUnknown: 12,
      lastRun: { status: 'failed', rejected: 9, offDomain: 4, errorSample: 'HTTP 500 https://m.ro/feed.xml\nmore' },
    })
      .map((h) => h.text)
      .join('\n');
    expect(text).toMatch(/a eșuat: HTTP 500 https:\/\/m\.ro\/feed\.xml\./);
    expect(text).toMatch(/4 produse au adresa în afara domeniului/);
    expect(text).toMatch(/5 produse din ultima citire au fost respinse/);
    expect(text).toMatch(/60% dintre oferte nu sunt încă potrivite/);
    expect(text).toMatch(/codul EAN la 30 oferte/);
    expect(text).toMatch(/5 oferte nu au mai fost confirmate/);
    expect(text).toMatch(/La 12 oferte nu știm costul livrării/);
  });
});

describe('labels', () => {
  it('covers every status, reason category and known reject reason, with comma-below diacritics', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['approved', 'draft', 'pending', 'rejected', 'suspended']);
    expect(Object.keys(REASON_CATEGORIES)).toContain('preturi');
    expect(rejectLabel('price_placeholder')).toMatch(/9\.999\.999/);
    expect(rejectLabel('necunoscut')).toBe('necunoscut');
    expect(JSON.stringify({ STATUS_LABELS, REASON_CATEGORIES })).not.toMatch(/[şţŞŢ]/);
  });
});
