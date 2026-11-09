import { describe, expect, it } from 'vitest';
import { buildLookupResponse, CORS_HEADERS, createLookupLimiter, historyFrom, parseLookupQuery, RATE_LIMIT } from '../ext-lookup';
import type { ProductOffer, ProductPageData } from '../product';

const q = (s: string) => parseLookupQuery(new URLSearchParams(s));

describe('parseLookupQuery', () => {
  it('keeps origin + path of the page and the identifiers, trimmed', () => {
    expect(q('url=https://www.emag.ro/telefon/pd/DF1MLR2BM/?ref=x%23y&gtin=%20880-6097640226%20&brand=Samsung&mpn=SM-S741BZVDEUE')).toEqual({
      ok: true,
      query: { url: 'https://www.emag.ro/telefon/pd/DF1MLR2BM/', gtin: '8806097640226', brand: 'Samsung', mpn: 'SM-S741BZVDEUE' },
    });
    expect(q('gtin=4006381333931')).toEqual({ ok: true, query: { url: null, gtin: '4006381333931', brand: null, mpn: null } });
  });

  it('refuses anything malformed instead of guessing', () => {
    const err = (s: string) => {
      const r = q(s);
      return r.ok ? null : r.error;
    };
    expect(err('')).toBe('no_identifier');
    expect(err('url=javascript:alert(1)')).toBe('invalid_url');
    expect(err('url=https://user:pw@emag.ro/x')).toBe('invalid_url');
    expect(err('url=http://localhost/x')).toBe('invalid_url');
    expect(err(`url=https://emag.ro/${'a'.repeat(2100)}`)).toBe('invalid_url');
    expect(err('gtin=12345')).toBe('invalid_gtin');
    expect(err('gtin=880609764022x')).toBe('invalid_gtin');
    expect(err('brand=Samsung')).toBe('brand_and_mpn_go_together');
    expect(err('mpn=SM-1')).toBe('brand_and_mpn_go_together');
    expect(err('brand=Samsung&mpn=<script>')).toBe('invalid_mpn');
    expect(err(`brand=${'b'.repeat(81)}&mpn=X1`)).toBe('invalid_brand');
    expect(err('brand=Sam%0Asung&mpn=X1')).toBe('invalid_brand');
    expect(err('gtin=4006381333931&gtin=8806097640226')).toBe('duplicate_gtin');
    expect(err('gtin=4006381333931&email=a@b.ro')).toBe('unknown_parameter');
  });
});

describe('createLookupLimiter', () => {
  it(`allows ${RATE_LIMIT.perMinute} lookups a minute per client, then answers with Retry-After`, () => {
    const l = createLookupLimiter();
    const t0 = 10_000_000;
    for (let i = 0; i < RATE_LIMIT.perMinute; i++) expect(l.hit('a', t0 + i).allowed).toBe(true);
    const over = l.hit('a', t0 + 100);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSec).toBe(60);
    expect(l.hit('b', t0 + 100).allowed).toBe(true);
    expect(l.hit('a', t0 + 60_000).allowed).toBe(true);
  });

  it('also caps an hour, and the retry waits for the hour', () => {
    const l = createLookupLimiter({ perMinute: 1000, perHour: 3 });
    for (let i = 0; i < 3; i++) expect(l.hit('a', i * 1000).allowed).toBe(true);
    const over = l.hit('a', 5000);
    expect(over).toMatchObject({ allowed: false });
    expect(over.retryAfterSec).toBe(3595);
  });
});

describe('CORS', () => {
  it('allows any origin, without credentials, for GET only', () => {
    expect(CORS_HEADERS['access-control-allow-origin']).toBe('*');
    expect(CORS_HEADERS['access-control-allow-methods']).toBe('GET, OPTIONS');
    expect(Object.keys(CORS_HEADERS)).not.toContain('access-control-allow-credentials');
  });
});

const TODAY = '2026-11-09';

function offer(over: Partial<ProductOffer>): ProductOffer {
  return {
    id: 1,
    shopSlug: 'emag',
    shopName: 'eMAG',
    shopKind: 'retail',
    sellerName: null,
    sellerType: 'shop',
    url: 'https://www.emag.ro/x/pd/DABC123/',
    hasAffiliate: true,
    price: '2249.99',
    oldPrice: '2499.99',
    shopLowest30d: null,
    shippingCost: '0.00',
    shippingEstimated: false,
    shippingNote: null,
    shippingRulesNote: null,
    total: '2249.99',
    availability: 'in_stock',
    condition: 'new',
    lastCheckedAt: '2026-11-09 07:00:00+00',
    freshnessSloHours: 26,
    stale: false,
    facts: [],
    ...over,
  };
}

function page(over: Partial<ProductPageData> = {}): ProductPageData {
  return {
    id: 42,
    slug: 'telefon-testoscop-x1-42',
    title: 'Telefon Testoscop X1',
    status: 'active',
    mergedIntoSlug: null,
    provisional: false,
    brand: { name: 'Testoscop', slug: 'testoscop' },
    category: null,
    mpn: 'TX1-128',
    gtins: ['08806097640226'],
    attributes: { ram: '8GB' },
    imageKey: 'products/42/icecat.jpg',
    imageSource: 'icecat',
    icecatSpecs: true,
    stats: {
      currentMinTotal: '2149.00',
      min30d: '2149.00',
      min30dAt: '2026-11-08',
      minAllTime: '2099.00',
      minAllTimeAt: '2026-10-01',
      median90d: '2299.99',
      verdict: 'good_price',
      observationsDays: 40,
      historyStartedAt: '2026-09-30',
      dropPct7d: null,
    },
    offers: [
      offer({ id: 2, shopSlug: 'itgalaxy', shopName: 'IT Galaxy', total: '2149.00', price: '2149.00', shippingCost: null, url: 'https://www.itgalaxy.ro/p/1' }),
      offer({ id: 1 }),
      offer({ id: 3, shopSlug: 'emag', sellerType: 'marketplace', sellerName: 'Gadget SRL', total: '2100.00', price: '2080.01', shippingCost: '19.99', stale: true }),
      offer({ id: 4, shopSlug: 'flip', shopName: 'Flip', condition: 'refurbished', total: '1799.00' }),
      offer({ id: 5, shopSlug: 'forit', shopName: 'forIT', availability: 'out_of_stock', total: '1999.00', lastCheckedAt: '2026-11-09 08:00:00+00' }),
    ],
    variants: [],
    notCovered: [],
    priceFacts: {
      currentBani: 214_900,
      drop: { pct: 0.1, currentBani: 214_900, referenceBani: 238_800, referenceFrom: '2026-09-30', referenceTo: '2026-10-29', referenceDays: 30, since: '2026-10-30', savedBani: 23_900 },
      allTimeLow: null,
      thirtyDayLow: null,
    },
    updatedAt: '2026-11-09T08:00:00.000Z',
    ...over,
  };
}

describe('buildLookupResponse', () => {
  const lows: Array<[string, string]> = [
    ['2026-05-01', '2600.00'], // older than 180 days: left out
    ['2026-10-01', '2399.99'],
    ['2026-10-02', '2399.99'],
    ['2026-10-20', '2299.5'],
    ['2026-11-08', '2149.00'],
    ['2026-11-09', '2149.00'],
    ['2026-11-10', '1.00'], // after today: left out
  ];

  it('answers with what the product page shows: ranked fresh new in-stock offers, stats, verdict, M15 badges', () => {
    const r = buildLookupResponse(page(), lows, 'url', 'https://pretoscop.ro/', TODAY);
    expect(r).toMatchObject({
      product_id: 42,
      slug: 'telefon-testoscop-x1-42',
      url: 'https://pretoscop.ro/p/telefon-testoscop-x1-42',
      matched_by: 'url',
      low_30d: '2149.00',
      low_all_time: '2099.00',
      verdict: { code: 'good_price', label: 'Preț bun' },
      observations_days: 40,
      history_started_at: '2026-09-30',
      updated_at: '2026-11-09T08:00:00.000Z',
    });
    // Stale, refurbished and out-of-stock offers are not "best offers".
    expect(r.best_offers).toEqual([
      { shop: 'itgalaxy', shop_name: 'IT Galaxy', seller_name: null, marketplace: false, price: '2149.00', shipping: null, total: '2149.00', checked_at: '2026-11-09T07:00:00.000Z' },
      { shop: 'emag', shop_name: 'eMAG', seller_name: null, marketplace: false, price: '2249.99', shipping: '0.00', total: '2249.99', checked_at: '2026-11-09T07:00:00.000Z' },
    ]);
    expect(r.badges).toEqual([expect.objectContaining({ kind: 'drop', label: '−10% față de minimul din 30 de zile' })]);
    expect(r.history).toEqual([
      ['2026-10-01', '2399.99'],
      ['2026-10-02', '2399.99'],
      ['2026-10-20', '2299.50'],
      ['2026-11-08', '2149.00'],
      ['2026-11-09', '2149.00'],
    ]);
    // Median of the observed daily lows of the last 30 days (2299.50, 2149.00, 2149.00): no interpolation.
    expect(r.median_30d).toBe('2149.00');
  });

  it('never carries Icecat data, images, codes we hold, offer URLs or ids, or affiliate data', () => {
    const json = JSON.stringify(buildLookupResponse(page(), lows, 'gtin', 'https://pretoscop.ro', TODAY));
    for (const leak of ['icecat', 'products/42', '08806097640226', 'TX1-128', 'itgalaxy.ro/p/1', 'pd/DABC123', 'hasAffiliate', 'affiliate', '8GB', 'provisional', '"id"']) {
      expect(json).not.toContain(leak);
    }
  });

  it('says "Istoric insuficient" under 14 days and shows no badge then', () => {
    const r = buildLookupResponse(page({ stats: { ...page().stats!, verdict: 'insufficient_data', observationsDays: 9 } }), lows, 'url', 'https://pretoscop.ro', TODAY);
    expect(r.verdict).toEqual({ code: 'insufficient_data', label: 'Istoric insuficient', text: 'Istoric de 9 zile: prea scurt pentru o evaluare.' });
    expect(r.badges).toEqual([]);
  });

  it('shows no badge for a provisional product, like its page', () => {
    expect(buildLookupResponse(page({ provisional: true }), lows, 'url', 'https://pretoscop.ro', TODAY).badges).toEqual([]);
  });

  it('notes when the cheapest offer is a marketplace seller’s while the drop is measured on shop-sold offers', () => {
    const p = page();
    p.offers[0] = offer({ id: 9, sellerType: 'marketplace', sellerName: 'Gadget SRL', total: '2000.00', price: '2000.00' });
    const r = buildLookupResponse(p, lows, 'url', 'https://pretoscop.ro', TODAY);
    expect(r.best_offers[0]).toMatchObject({ marketplace: true, seller_name: 'Gadget SRL' });
    expect(r.badges[0]!.text.startsWith('La ofertele vândute direct de magazine: ')).toBe(true);
  });

  it('copes with no stats, no offers and no history', () => {
    const r = buildLookupResponse(page({ stats: null, offers: [], priceFacts: null }), [], 'brand_mpn', 'https://pretoscop.ro', TODAY);
    expect(r).toMatchObject({ low_30d: null, low_all_time: null, median_30d: null, verdict: { code: 'insufficient_data', label: 'Istoric insuficient' }, observations_days: 0 });
    expect(r.verdict.text).toBe('Încă nu avem istoric pentru acest produs.');
    expect(r).toMatchObject({ best_offers: [], history: [], badges: [], updated_at: null, history_started_at: null });
  });

  it('keeps at most 5 offers and 180 days', () => {
    const many = Array.from({ length: 8 }, (_, i) => offer({ id: 10 + i, total: `${2000 + i}.00`, price: `${2000 + i}.00` }));
    const days = Array.from({ length: 400 }, (_, i) => [new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10), '100.00'] as [string, string]).reverse();
    const r = buildLookupResponse(page({ offers: many }), days, 'url', 'https://pretoscop.ro', TODAY);
    expect(r.best_offers).toHaveLength(5);
    expect(r.history).toHaveLength(180);
    expect(r.history[0]![0]).toBe(historyFrom(TODAY));
  });
});
