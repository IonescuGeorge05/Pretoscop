import { readFileSync } from 'node:fs';
import { computePosition, splitDelimitedLine } from '@pretoscop/core';
import type { B2bOffer, B2bPositionRow } from '@pretoscop/db';
import { describe, expect, it } from 'vitest';
import { apiChange, apiHistory, apiPosition, apiPositionDetail, nextBucharestMidnight } from '../b2b-api-format';
import { Change, History, openApiDocument, Position, PositionDetail } from '../b2b-api-schema';
import { display, filterRows, machine, OFFER_COLUMNS, offerRows, POSITION_COLUMNS, tableCsv } from '../b2b-table';

const offer = (over: Partial<B2bOffer> = {}): B2bOffer => ({
  offerId: 1,
  shopId: 2,
  shopName: 'Rival A',
  shopSlug: 'rival-a',
  sellerName: null,
  sellerType: 'shop',
  url: 'https://www.rival-a.ro/p/1',
  priceBani: 95_000,
  shippingBani: 2_000,
  totalBani: 97_000,
  availability: 'in_stock',
  condition: 'new',
  lastCheckedAt: '2026-11-09 06:00:00.123+00',
  stale: false,
  comparable: true,
  own: false,
  ...over,
});

function row(over: Partial<B2bPositionRow> = {}): B2bPositionRow {
  const offers = over.offers ?? [offer(), offer({ offerId: 3, shopName: 'Piața', sellerName: 'Vânzător X', sellerType: 'marketplace', totalBani: 98_000, priceBani: 98_000, shippingBani: null })];
  return {
    skuId: 11,
    ref: 'TV-55',
    label: null,
    gtin: '08806095426280',
    mpn: 'QE55Q80D',
    brandRaw: 'Samsung',
    status: 'matched',
    product: { id: 5, slug: 'televizor-5', title: 'Televizor Samsung QLED 55"', brand: 'Samsung', category: 'Televizoare' },
    own: offer({ offerId: 9, shopName: 'Magazinul Meu', totalBani: 100_000, priceBani: 100_000, shippingBani: 0, own: true }),
    referencePriceBani: null,
    ownBasis: 'offer',
    ownTotalBani: 100_000,
    position: computePosition(100_000, [97_000, 98_000]),
    cheapest: { shopName: 'Rival A', sellerName: null, totalBani: 97_000 },
    oldestCheckAt: '2026-11-09 06:00:00.123+00',
    newestCheckAt: '2026-11-09 07:30:00+00',
    offers,
    ...over,
  };
}

/** Parses a CSV written by tableCsv (RFC 4180, CRLF, BOM). */
function readCsv(text: string): string[][] {
  expect(text.startsWith('\uFEFF')).toBe(true);
  const out: string[][] = [];
  let cell = '';
  let rowCells: string[] = [];
  let quoted = false;
  const body = text.slice(1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      rowCells.push(cell);
      cell = '';
    } else if (c === '\r' && body[i + 1] === '\n') {
      rowCells.push(cell);
      out.push(rowCells);
      rowCells = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return out;
}

describe('position table and CSV export come from one definition', () => {
  const rows = [
    row(),
    row({ skuId: 12, ref: '=HYPERLINK("http://evil")', label: '+cmd', status: 'unmatched', product: null, own: null, ownBasis: null, ownTotalBani: null, position: computePosition(null, []), cheapest: null, oldestCheckAt: null, newestCheckAt: null, offers: [] }),
  ];

  it('the CSV holds, cell by cell, the machine form of what the page shows', () => {
    const csv = readCsv(tableCsv(POSITION_COLUMNS, rows));
    expect(csv[0]).toEqual(POSITION_COLUMNS.map((c) => c.label));
    rows.forEach((r, i) => {
      POSITION_COLUMNS.forEach((c, j) => {
        const v = c.value(r);
        const m = machine(c.kind, v) ?? '';
        const cell = csv[i + 1]![j]!;
        // Text that starts like a formula carries the apostrophe guard in the file only.
        expect(cell.replace(/^'(?=[=+\-@\t\r])/, ''), `${c.key}`).toBe(m);
        if (c.kind === 'lei' && v !== null) expect(display('lei', v).replace(/\./g, '').replace(',', '.').replace(/\s*lei$/, '')).toBe(m);
      });
    });
  });

  it('guards formula-like text and leaves numbers plain', () => {
    const text = tableCsv(POSITION_COLUMNS, rows);
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(text).toContain(`"'+cmd"`);
    const line = text.split('\r\n')[1]!;
    expect(splitDelimitedLine(line, ',')[3]).toBe('1000.00');
  });

  it('shows Romanian formats on the page', () => {
    const r = rows[0]!;
    const shown = Object.fromEntries(POSITION_COLUMNS.map((c) => [c.key, display(c.kind, c.value(r))]));
    expect(shown).toMatchObject({ pret_tau: '1.000,00 lei', minim: '970,00 lei', mediana: '975,00 lei', diferenta: '+3,1%', pozitie: '3', situatie: 'peste cel mai mic' });
    expect(shown.verificat).toMatch(/9 nov\. 2026, 09:30/);
  });

  it('exports one line per competitor offer in the long format', () => {
    const csv = readCsv(tableCsv(OFFER_COLUMNS, offerRows(rows)));
    expect(csv).toHaveLength(3);
    expect(csv[2]!.slice(2, 6)).toEqual(['Piața (Vânzător X)', '980.00', '', '980.00']);
  });

  it('filters like the page', () => {
    expect(filterRows(rows, 'peste').map((r) => r.skuId)).toEqual([11]);
    expect(filterRows(rows, 'negasite').map((r) => r.skuId)).toEqual([12]);
    expect(filterRows(rows, 'nimic')).toHaveLength(2);
  });
});

describe('API v1 contract', () => {
  it('the committed OpenAPI file is the one the schemas generate (run `pnpm --filter @pretoscop/web b2b:openapi`)', () => {
    const committed = readFileSync(new URL('../../../../../docs/api/b2b-v1.openapi.json', import.meta.url), 'utf8');
    expect(committed).toBe(`${JSON.stringify(openApiDocument(), null, 2)}\n`);
  });

  it('every path answers 401 and 429 and every $ref resolves', () => {
    const doc = openApiDocument() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>>; components: { schemas: Record<string, unknown> } };
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        expect(Object.keys(op.responses), `${method} ${path}`).toEqual(expect.arrayContaining(['401', '403', '429']));
      }
    }
    const refs = JSON.stringify(doc).match(/#\/components\/schemas\/\w+/g) ?? [];
    for (const r of refs) expect(doc.components.schemas[r.split('/').pop()!], r).toBeDefined();
  });

  it('serializers produce exactly the documented fields (nothing stripped, nothing extra)', () => {
    const base = 'https://pretoscop.ro';
    const detail = apiPositionDetail(row(), base);
    expect(PositionDetail.parse(detail)).toEqual(detail);
    const unmatched = apiPosition(row({ status: 'unmatched', product: null, own: null, ownBasis: null, ownTotalBani: null, position: computePosition(null, []), cheapest: null, oldestCheckAt: null, newestCheckAt: null, offers: [] }), base);
    expect(Position.parse(unmatched)).toEqual(unmatched);
    expect(detail).toMatchObject({
      own: { basis: 'offer', total: '1000.00' },
      market: { min: '970.00', median: '975.00', competitors: 2, cheapest_shop: 'Rival A' },
      rank: 3,
      gap_to_min_pct: 3.1,
      newest_check_at: '2026-11-09T07:30:00.000Z',
    });
    expect(detail.sku.product?.url).toBe('https://pretoscop.ro/p/televizor-5');
    const change = apiChange({ skuId: 1, ref: null, label: 'x', shopName: 'A', sellerName: null, own: false, observedAt: '2026-11-09 05:00:00+00', beforeTotalBani: null, afterTotalBani: 1999, beforeAvailability: null, afterAvailability: 'in_stock' });
    expect(Change.parse(change)).toEqual(change);
    const history = apiHistory({ range: '30d', series: { min: [['2026-11-08', 1234.5]], marketplace: [], shops: { a: [['2026-11-08', 1300]] } }, shops: { a: { name: 'A' } }, stats: null });
    expect(History.parse(history)).toEqual(history);
    expect(history.data.min).toEqual([['2026-11-08', '1234.50']]);
  });

  it('an undeclared field (Icecat content, personal data) fails the contract', () => {
    const leaked = { ...apiPosition(row(), 'https://x'), specs: { Greutate: '195 g' } };
    expect(Position.parse(leaked)).not.toEqual(leaked);
  });
});

describe('quota day', () => {
  it('resets at midnight Europe/Bucharest, in winter and in summer time', () => {
    expect(nextBucharestMidnight(new Date('2026-11-09T10:00:00Z')).toISOString()).toBe('2026-11-09T22:00:00.000Z');
    expect(nextBucharestMidnight(new Date('2026-11-09T22:30:00Z')).toISOString()).toBe('2026-11-10T22:00:00.000Z');
    expect(nextBucharestMidnight(new Date('2026-07-01T10:00:00Z')).toISOString()).toBe('2026-07-01T21:00:00.000Z');
    expect(nextBucharestMidnight(new Date('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-24T21:00:00.000Z');
  });
});
