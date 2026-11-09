import { describe, expect, it } from 'vitest';
import { formatDay, formatLei, formatRelative, plural } from '../src/format';
import { parseLookupData } from '../src/lookup-data';
import { parseReply } from '../src/messages';
import { sparkline } from '../src/sparkline';
import { sampleBody } from './sample';

describe('parseLookupData', () => {
  it('parses the documented shape', () => {
    const d = parseLookupData(sampleBody())!;
    expect(d).toMatchObject({ productId: 42, slug: 'telefon-samsung-galaxy-s26-fe-42', low30d: '2149.00', matchedBy: 'url', observationsDays: 40 });
    expect(d.bestOffers[1]).toEqual({ shop: 'emag', shopName: 'eMAG', sellerName: 'Gadget SRL', marketplace: true, price: '2180.00', shipping: '19.99', total: '2199.99', checkedAt: '2026-11-09T06:00:00.000Z' });
    expect(d.history).toHaveLength(3);
  });

  const broken: Array<[string, (b: Record<string, unknown>) => void]> = [
    ['a slug that is not ours', (b) => (b.slug = 'javascript:alert(1)-42')],
    ['a slug of another product', (b) => (b.slug = 'telefon-41')],
    ['a float price', (b) => (b.low_30d = 2149)],
    ['a price with a comma', (b) => (b.low_30d = '2.149,00')],
    ['an unknown verdict', (b) => (b.verdict = { code: 'buy_now', label: 'x', text: 'y' })],
    ['too many offers', (b) => (b.best_offers = Array.from({ length: 6 }, () => (sampleBody().best_offers as unknown[])[0]))],
    ['too much history', (b) => (b.history = Array.from({ length: 181 }, (_, i) => [`2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`, '1.00']))],
    ['history out of order', (b) => (b.history = [['2026-10-02', '1.00'], ['2026-10-01', '1.00']])],
    ['a non-string title', (b) => (b.title = { html: '<b>x</b>' })],
    ['an overlong title', (b) => (b.title = 'x'.repeat(301))],
    ['an offer without a total', (b) => ((b.best_offers as Array<Record<string, unknown>>)[0]!.total = null)],
    ['an unknown badge', (b) => (b.badges = [{ kind: 'promo', label: 'x', text: 'y' }])],
  ];
  it.each(broken)('refuses the whole answer on %s', (_name, mutate) => {
    const b = sampleBody();
    mutate(b);
    expect(parseLookupData(b)).toBeNull();
  });
});

describe('parseReply (content script)', () => {
  it('re-checks what the background worker sends', () => {
    expect(parseReply({ ok: true, body: sampleBody() })).toMatchObject({ ok: true, data: { productId: 42 } });
    expect(parseReply({ ok: false, reason: 'not_found' })).toEqual({ ok: false, reason: 'not_found' });
    expect(parseReply({ ok: true, body: { product_id: 1 } })).toBeNull();
    expect(parseReply({ ok: false, reason: 'whatever' })).toBeNull();
    expect(parseReply('ok')).toBeNull();
    expect(parseReply(undefined)).toBeNull();
  });
});

describe('Romanian formatting', () => {
  it('prices: 1.234,56 lei, no floating point', () => {
    expect(formatLei('2249.99')).toBe('2.249,99 lei');
    expect(formatLei('1234567.00')).toBe('1.234.567,00 lei');
    expect(formatLei('0.50')).toBe('0,50 lei');
    expect(formatLei('999.00')).toBe('999,00 lei');
    expect(formatLei(null)).toBe('—');
    expect(formatLei('12,5')).toBe('—');
  });
  it('plurals and dates', () => {
    expect(plural(1, 'zi', 'zile')).toBe('1 zi');
    expect(plural(2, 'zi', 'zile')).toBe('2 zile');
    expect(plural(19, 'zi', 'zile')).toBe('19 zile');
    expect(plural(20, 'zi', 'zile')).toBe('20 de zile');
    expect(plural(101, 'zi', 'zile')).toBe('101 zile');
    expect(formatDay('2026-10-27')).toBe('27 oct. 2026');
    const now = Date.parse('2026-11-09T12:00:00Z');
    expect(formatRelative('2026-11-09T11:59:30Z', now)).toBe('chiar acum');
    expect(formatRelative('2026-11-09T09:00:00Z', now)).toBe('acum 3 ore');
    expect(formatRelative('2026-11-08T12:00:00Z', now)).toBe('ieri');
  });
});

describe('sparkline', () => {
  it('draws observed days only: a gap breaks the line, a lone day is a dot', () => {
    const s = sparkline([
      ['2026-10-01', '100.00'],
      ['2026-10-02', '90.00'],
      ['2026-10-05', '95.00'],
    ])!;
    expect(s.paths).toHaveLength(2);
    expect(s.dots).toHaveLength(1);
    expect(s).toMatchObject({ lowBani: 9000, highBani: 10000, firstDay: '2026-10-01', lastDay: '2026-10-05', observedDays: 3 });
    // Nothing drawn for 3 and 4 October (no interpolation): the second path starts at day 5.
    const step = (280 - 8) / 5;
    expect(s.paths[1]!.startsWith(`M${Math.round((4 + 4 * step) * 100) / 100} `)).toBe(true);
  });
  it('a flat price is a flat line; no history is no chart', () => {
    const s = sparkline([
      ['2026-10-01', '100.00'],
      ['2026-10-02', '100.00'],
    ])!;
    expect(s.paths[0]).toContain(' V28 ');
    expect(sparkline([])).toBeNull();
  });
});
