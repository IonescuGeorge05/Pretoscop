import { describe, expect, it } from 'vitest';
import {
  buildFilter,
  buildSearchQueries,
  buildSort,
  cleanQuery,
  gtinQuery,
  hasActiveFilters,
  parseLei,
  parseSearchParams,
  readSearchResults,
  toQueryString,
} from '../src/query';

describe('parseSearchParams', () => {
  it('reads the Romanian URL parameters and keeps diacritics in the query', () => {
    const p = parseSearchParams({ q: '  mașină   de spălat  ', categorie: 'electrocasnice-mari', marca: ['samsung', 'lg'], pret_min: '1000', pret_max: '3.000', stoc: '1', istoric: '1', ordine: 'pret-asc', pagina: '3' });
    expect(p).toEqual({
      q: 'mașină de spălat',
      category: 'electrocasnice-mari',
      brands: ['samsung', 'lg'],
      shop: null,
      priceMin: 1000,
      priceMax: 3000,
      inStock: true,
      hasHistory: true,
      sort: 'pret-asc',
      page: 3,
    });
  });

  it('defaults: relevance with a query, popularity without one; page 1', () => {
    expect(parseSearchParams({ q: 'ps5' }).sort).toBe('relevanta');
    expect(parseSearchParams({}).sort).toBe('populare');
    expect(parseSearchParams({ ordine: 'relevanta' }).sort).toBe('populare');
    expect(parseSearchParams({ pagina: '0' }).page).toBe(1);
    expect(parseSearchParams({ pagina: 'abc' }).page).toBe(1);
    expect(parseSearchParams({ pagina: '9999' }).page).toBe(100);
  });

  it('drops invalid slugs, unknown sorts and swaps inverted price bounds', () => {
    const p = parseSearchParams(new URLSearchParams('marca=Samsung&marca=lg"]&marca=sony,lg&categorie=../x&magazin=emag&ordine=hack&pret_min=5000&pret_max=100'));
    expect(p.brands).toEqual(['sony', 'lg']);
    expect(p.category).toBeNull();
    expect(p.shop).toBe('emag');
    expect(p.sort).toBe('populare');
    expect([p.priceMin, p.priceMax]).toEqual([100, 5000]);
  });

  it('caps and cleans the query', () => {
    expect(cleanQuery('a\u0000b\tc')).toBe('a b c');
    expect(cleanQuery('x'.repeat(500))).toHaveLength(100);
  });
});

describe('parseLei', () => {
  it('reads Romanian and plain number formats as whole lei', () => {
    expect(['3000', '3.000', '3 000', '2.999,99', '2999.99', '2999,5', '450 lei', 'abc', '-5', ''].map(parseLei)).toEqual([3000, 3000, 3000, 2999, 2999, 2999, 450, null, null, null]);
  });
});

describe('toQueryString', () => {
  it('round-trips and omits defaults', () => {
    const p = parseSearchParams({ q: 'televizor', marca: ['samsung'], stoc: '1' });
    expect(toQueryString(p)).toBe('q=televizor&marca=samsung&stoc=1');
    expect(toQueryString(p, { page: 2 })).toBe('q=televizor&marca=samsung&stoc=1&pagina=2');
    expect(toQueryString(p, { sort: 'pret-asc', brands: [] })).toBe('q=televizor&stoc=1&ordine=pret-asc');
    expect(parseSearchParams(new URLSearchParams(toQueryString(p)))).toEqual(p);
  });
});

describe('gtinQuery', () => {
  it('recognizes barcodes with a valid check digit only', () => {
    expect(gtinQuery('0711719577034')).toBe('00711719577034');
    expect(gtinQuery('711719577034')).toBe('00711719577034');
    expect(gtinQuery('0711719577035')).toBeNull();
    expect(gtinQuery('iphone 17')).toBeNull();
    expect(gtinQuery('2025')).toBeNull();
  });
});

describe('filters and sorts', () => {
  it('ANDs the parts and quotes values', () => {
    const p = parseSearchParams({ categorie: 'televizoare', marca: ['samsung', 'lg'], magazin: 'emag', pret_min: '1000', pret_max: '2000', stoc: '1', istoric: '1' });
    expect(buildFilter(p)).toEqual([
      'category_slugs = "televizoare"',
      'brand_slug IN ["samsung", "lg"]',
      'shop_slugs = "emag"',
      'min_total_bani >= 100000',
      'min_total_bani <= 200000',
      'in_stock = true',
      'has_history = true',
    ]);
    expect(buildFilter(p, { except: 'brands' })).not.toContain('brand_slug IN ["samsung", "lg"]');
    expect(buildFilter(parseSearchParams({}), { gtin: '00711719577034' })).toEqual(['gtins = "00711719577034"']);
    expect(hasActiveFilters(p)).toBe(true);
    expect(hasActiveFilters(parseSearchParams({ q: 'x' }))).toBe(false);
  });

  it('maps every sort key', () => {
    expect(buildSort('relevanta')).toBeUndefined();
    expect(buildSort('populare')).toEqual(['popularity:desc', 'min_total_bani:asc']);
    expect(buildSort('pret-asc')).toEqual(['min_total_bani:asc']);
    expect(buildSort('pret-desc')).toEqual(['min_total_bani:desc']);
    expect(buildSort('magazine')?.[0]).toBe('shop_count:desc');
    expect(buildSort('reducere')?.[0]).toBe('drop_pct:desc');
    expect(buildFilter(parseSearchParams({ ordine: 'reducere' }))).toContain('drop_pct > 0');
  });
});

describe('buildSearchQueries / readSearchResults', () => {
  it('asks for hits plus disjunctive brand and category facet counts', () => {
    const p = parseSearchParams({ q: 'televizor', marca: ['samsung'], categorie: 'televizoare' });
    const [main, brands, cats] = buildSearchQueries('products', p);
    expect(main).toMatchObject({ indexUid: 'products', q: 'televizor', page: 1, hitsPerPage: 24, matchingStrategy: 'all' });
    expect(main!.filter).toEqual(['category_slugs = "televizoare"', 'brand_slug IN ["samsung"]']);
    expect(brands).toMatchObject({ facets: ['brand_slug'], limit: 0, filter: ['category_slugs = "televizoare"'] });
    expect(cats).toMatchObject({ facets: ['category_slug'], limit: 0, filter: ['brand_slug IN ["samsung"]'] });
  });

  it('sends a barcode as a filter, not as words', () => {
    const [main] = buildSearchQueries('products', parseSearchParams({ q: '0711719577034' }));
    expect(main!.q).toBe('');
    expect(main!.filter).toEqual(['gtins = "00711719577034"']);
  });

  it('reads counts, facets and price bounds in lei', () => {
    const p = parseSearchParams({ q: 'tv' });
    const r = readSearchResults(
      [
        { hits: [], totalHits: 30, totalPages: 2, page: 1, facetDistribution: { in_stock: { true: 25, false: 5 }, has_history: { true: 4 } }, facetStats: { min_total_bani: { min: 99_999, max: 1_234_501 } }, processingTimeMs: 2 },
        { hits: [], facetDistribution: { brand_slug: { lg: 3, samsung: 12, sony: 3 } }, processingTimeMs: 1 },
        { hits: [], facetDistribution: { category_slug: { televizoare: 30 } } },
      ],
      p,
      'all',
    );
    expect(r.total).toBe(30);
    expect(r.facets.brands.map((b) => b.value)).toEqual(['samsung', 'lg', 'sony']);
    expect(r.facets.inStock).toBe(25);
    expect(r.facets.hasHistory).toBe(4);
    expect(r.facets.price).toEqual({ min: 999, max: 12346 });
    expect(r.processingMs).toBe(3);
  });
});
