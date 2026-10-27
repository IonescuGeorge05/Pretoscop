import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideManually, recordObservation, sql, syncTaxonomy, type OfferObservation } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncShops } from '../src/registry/sync';
import { generateReport } from '../src/report/generate';

// Event window 20–22 Jan 2027 with daily checks from 21 Nov 2026 (60 days before), at noon in Bucharest.
const FROM = '2027-01-20';
const TO = '2027-01-22';
const START = '2026-11-21';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let t: TestDatabase;
let shops: Record<string, number>;

async function daily(shop: string, ext: string, title: string, price: (day: string) => [number, number | null], extra: Partial<OfferObservation> = {}) {
  for (let d = START; d <= TO; d = addDays(d, 1)) {
    const [p, old] = price(d);
    await recordObservation(t.db, {
      shopId: shops[shop]!,
      sourceId: null,
      sourceTier: 1,
      runId: null,
      externalId: ext,
      url: `https://example.com/${ext}`,
      titleRaw: title,
      titleClean: title,
      brandName: 'Samsung',
      priceBani: p,
      oldPriceBani: old,
      totalBani: p,
      availability: 'in_stock',
      condition: 'new',
      contentHash: createHash('sha256').update(`${p}|${old}`).digest('hex'),
      observedAt: new Date(`${d}T10:00:00Z`),
      ...extra,
    });
  }
}

const inEvent = (d: string) => d >= FROM && d <= TO;

beforeAll(async () => {
  t = await createTestDatabase();
  await syncShops(t.db);
  await syncTaxonomy(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  shops = Object.fromEntries(r.rows.map((x) => [x.slug, Number(x.id)]));
  // Real drop with a reduction shown; reduction shown without a real drop; raised for a month then "cut"; marketplace higher.
  await daily('emag', 'A', 'Telefon mobil Samsung Galaxy A57, 256GB', (d) => (inEvent(d) ? [180_000, 220_000] : [200_000, null]));
  await daily('itgalaxy', 'B', 'Telefon mobil Samsung Galaxy A57 256GB', (d) => (inEvent(d) ? [199_000, 260_000] : [200_000, null]));
  await daily('forit', 'C', 'Televizor Samsung 55Q80, 138 cm', (d) => (inEvent(d) ? [300_000, 380_000] : d >= addDays(FROM, -30) ? [360_000, null] : [300_000, null]));
  await daily('emag', 'D', 'Telefon mobil Samsung Galaxy A57, 256GB', (d) => (inEvent(d) ? [210_000, null] : [190_000, null]), { sellerType: 'marketplace', sellerName: 'Vânzător SRL' });
  const a = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = 'A'`);
  const p = await decideManually(t.db, Number(a.rows[0]!.id), { kind: 'new_product' }, 'test');
  for (const ext of ['B', 'D']) {
    const o = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = ${ext}`);
    await decideManually(t.db, Number(o.rows[0]!.id), { kind: 'accept', productId: p! }, 'test');
  }
}, 120_000);
afterAll(async () => t?.drop());

const opts = (outDir: string) => ({ id: 'test-event', title: 'Test', from: FROM, to: TO, categories: null, now: '2027-01-23T08:00:00.000Z', outDir });

describe('report generator (M23)', () => {
  it('produces byte-identical output on the same data (JSON, Markdown, CSV, SVG, PNG)', async () => {
    const a = await generateReport(t.db, opts(mkdtempSync(join(tmpdir(), 'rep-a-'))));
    const b = await generateReport(t.db, opts(mkdtempSync(join(tmpdir(), 'rep-b-'))));
    expect(a.files.sort()).toEqual(b.files.sort());
    for (const f of a.files) expect(readFileSync(join(b.dir, f)).equals(readFileSync(join(a.dir, f))), f).toBe(true);
    expect(readdirSync(join(a.dir, 'charts')).sort()).toEqual([
      'clase-pe-magazine.png',
      'clase-pe-magazine.svg',
      'exemplu-oferta.png',
      'exemplu-oferta.svg',
      'magazin-vs-marketplace.png',
      'magazin-vs-marketplace.svg',
      'scaderi-reale.png',
      'scaderi-reale.svg',
    ]);
    expect(readFileSync(join(a.dir, 'charts/clase-pe-magazine.png')).subarray(1, 4).toString()).toBe('PNG');
  }, 60_000);

  it('reconciles with direct SQL on price_events', async () => {
    const r = await generateReport(t.db, { ...opts(mkdtempSync(join(tmpdir(), 'rep-c-'))), png: false });
    const claims = await t.db.execute<{ n: string }>(sql`
      SELECT count(DISTINCT offer_id)::text AS n FROM price_events
      WHERE old_price > price AND observed_at >= '2027-01-19T22:00:00Z' AND observed_at < '2027-01-22T22:00:00Z'`);
    expect(r.data.headline.claims).toBe(Number(claims.rows[0]!.n));
    const before = await t.db.execute<{ price: string }>(sql`
      SELECT e.price::text FROM price_events e JOIN offers o ON o.id = e.offer_id
      WHERE o.external_id = 'A' AND e.observed_at < '2027-01-19T22:00:00Z' ORDER BY e.observed_at DESC LIMIT 1`);
    expect(r.data.offers.find((o) => o.shop === 'emag' && o.sellerType === 'shop')?.min30Bani).toBe(Math.round(Number(before.rows[0]!.price) * 100));
    expect(r.data.headline).toMatchObject({ offers: 4, withHistory: 4, claims: 3, claimsWithoutRealDrop: 1, realDrop: 2, noRealDrop: 1, higher: 1 });
    expect(r.data.raiseThenCut.cases.map((c) => c.shop)).toEqual(['forit']);
    expect(r.data.biggestDrops.map((d) => d.dropPct)).toEqual([0.1]);
    // Marketplace seller names never leave the database.
    expect(readFileSync(join(r.dir, 'oferte.csv'), 'utf8')).not.toContain('Vânzător SRL');
  }, 60_000);
});
