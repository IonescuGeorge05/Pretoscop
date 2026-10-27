import { describe, expect, it } from 'vitest';
import { analyzeReport, classShareChart, dropsChart, offerHistoryChart, renderCsv, renderMarkdown } from '../src/index';
import { INPUT, WINDOW } from './fixtures';

describe('event analysis (known answers)', () => {
  const r = analyzeReport(INPUT);

  it('classifies every offer seen in stock during the event', () => {
    expect(r.offers.map((o) => [o.offerId, o.class, o.changePct])).toEqual([
      [1, 'real_drop', -0.1],
      [2, 'no_real_drop', -0.005],
      [3, 'real_drop', -0.1667],
      [4, 'higher', 0.1],
      [5, 'insufficient_history', null],
    ]);
    expect(r.offers.find((o) => o.offerId === 6)).toBeUndefined(); // out of stock during the event
  });

  it('counts claims without a real drop', () => {
    expect(r.headline).toMatchObject({ offers: 5, withHistory: 4, claims: 3, claimsWithoutRealDrop: 1, claimsWithoutRealDropShare: 0.3333, realDrop: 2, noRealDrop: 1, higher: 1 });
    expect(r.offers.find((o) => o.offerId === 2)).toMatchObject({ discountClaimed: true, referenceBani: 130_000, referenceAboveMin30: true });
  });

  it('finds raise-then-cut with its dates', () => {
    expect(r.raiseThenCut.cases).toEqual([
      { offerId: 3, shop: 'itgalaxy', productTitle: 'Televizor C 55"', earlierMedianBani: 100_000, peakBani: 120_000, peakDay: '2026-10-21', eventMinBani: 100_000, eventMinDay: WINDOW.from, raisePct: 0.2 },
    ]);
    expect(r.raiseThenCut.evaluated).toBe(4);
  });

  it('product drops use shop-sold offers only', () => {
    expect(r.biggestDrops).toEqual([
      { productId: 12, title: 'Televizor C 55"', category: 'televizoare', min30Bani: 120_000, eventMinBani: 100_000, eventMinDay: WINDOW.from, dropPct: 0.1667, shops: 1 },
      { productId: 10, title: 'Telefon A 128GB', category: 'telefoane-mobile', min30Bani: 100_000, eventMinBani: 90_000, eventMinDay: WINDOW.from, dropPct: 0.1, shops: 1 },
    ]);
  });

  it('groups by shop, seller type and category with stable order', () => {
    expect(r.byShop.map((g) => [g.key, g.withHistory, g.claimsWithoutRealDrop])).toEqual([
      ['emag', 3, 1],
      ['forit', 0, 0],
      ['itgalaxy', 1, 0],
    ]);
    expect(r.bySeller.map((g) => g.key)).toEqual(['marketplace', 'shop']);
  });

  it('is deterministic and never names marketplace sellers', () => {
    const again = analyzeReport({ ...INPUT, offers: [...INPUT.offers].reverse() });
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
    expect(r.notes.join(' ')).toContain('marketplace nu sunt publicate');
  });
});

describe('renderers', () => {
  const r = analyzeReport(INPUT);

  it('markdown states the headline in Romanian and flags unapproved data', () => {
    const md = renderMarkdown(r);
    expect(md).toContain('**1 (33%)**');
    expect(md).toContain('Date preliminare');
    expect(md).not.toMatch(/[şţŞŢ]/);
  });

  it('CSV files are RFC 4180 with dot decimals', () => {
    const files = renderCsv(r);
    expect(Object.keys(files)).toEqual(['oferte.csv', 'magazine.csv', 'scaderi.csv', 'crescut-redus.csv']);
    const lines = files['oferte.csv']!.trim().split('\r\n');
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe('1,emag,shop,10,Telefon A 128GB,telefoane-mobile,1000.00,1,900.00,2026-11-20,1200.00,true,-0.1,real_drop,true');
    expect(files['crescut-redus.csv']).toContain('"Televizor C 55"""');
  });

  it('charts are self-describing SVG with escaped text', () => {
    const svg = classShareChart(r.byShop, { title: 'Reduceri & realitate', subtitle: 's', source: 'Sursa: Pretoscop' });
    expect(svg).toMatch(/^<svg [^>]*role="img"/);
    expect(svg).toContain('Reduceri &amp; realitate');
    expect(svg).toContain('#2a78d6');
    expect(dropsChart(r.biggestDrops, { title: 't', subtitle: 's', source: 'x' })).toContain('−10%');
    const line = offerHistoryChart(
      [{ day: '2026-11-19', bani: 100_000 }, { day: '2026-11-20', bani: 90_000 }],
      [{ day: '2026-11-20', bani: 120_000 }],
      { title: 't', subtitle: 's', source: 'x', window: WINDOW, windowLabel: 'Black Friday' },
    );
    expect(line).toContain('stroke="#2a78d6"');
    expect(line).toContain('stroke="#eb6834"');
  });
});
