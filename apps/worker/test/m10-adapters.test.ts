/**
 * M10: every new adapter runs through the real recorder (`source.run`) with the real normalizer
 * (M06), against recorded fixtures served by a fake fetcher. Nothing leaves the machine.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { setFlag } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FsBlobStore } from '@pretoscop/storage';
import { runSource } from '../src/recorder/run-source';
import type { FetchLike } from '../src/recorder/types';
import { syncShops } from '../src/registry/sync';
import { createNormalize } from '../src/services';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/', import.meta.url));
const fixture = (p: string) => readFileSync(FIX + p, 'utf8');

/** A VTEX page whose only product is unavailable (price 0): what Auchan serves after page 1. */
const VTEX_UNAVAILABLE_PAGE = `<template data-type="json" data-varname="__STATE__"><script>${JSON.stringify(
  {
    'Product:sp-9': {
      productId: '9',
      productName: 'Televizor indisponibil',
      link: '/televizor-indisponibil/p',
    },
    'Product:sp-9.items({"filter":"ALL_AVAILABLE"}).0': {
      itemId: '9',
      sellers: [{ type: 'id', id: 's9' }],
    },
    s9: {
      sellerId: '1',
      sellerName: 'Auchan Romania',
      sellerDefault: true,
      commertialOffer: { type: 'id', id: 'co9' },
    },
    co9: { Price: 0, ListPrice: 0, AvailableQuantity: 0 },
  },
)}</script></template>`;

const FLIP_PRODUCT =
  'https://flip.ro/magazin/apple/telefon-mobil-apple-iphone-12-128gb-black/1105/';

const PAGES: Record<string, string> = {
  'https://www.itgalaxy.ro/televizoare/': fixture('itgalaxy/listing-televizoare_2026-10-27.html'),
  'https://www.forit.ro/televizoare/': fixture('forit/listing-televizoare_2026-10-27.html'),
  'https://www.dedeman.ro/ro/frigidere/c/1147': fixture(
    'dedeman/listing-frigidere_2026-10-27.html',
  ),
  'https://carrefour.ro/tv-audio-home-cinema/televizoare-accesorii/televizoare-smart': fixture(
    'carrefour/listing-televizoare-smart_2026-10-27.html',
  ),
  'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c':
    fixture('auchan/listing-televizoare_2026-10-27.html'),
  'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c?page=2':
    VTEX_UNAVAILABLE_PAGE,
  'https://www.bonami.ro/c/aparate-de-bucatarie': fixture(
    'bonami/listing-aparate-de-bucatarie_2026-10-27.html',
  ),
  'https://flip.ro/sitemap.xml': `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${FLIP_PRODUCT}</loc></url></urlset>`,
  [FLIP_PRODUCT]: fixture('flip/product_2026-10-27.html'),
  // A page that lists no product at all (a redesign, a soft error page).
  'https://www.bonami.ro/c/electrocasnice-pentru-curatenie':
    '<!doctype html><html><body><h1>Pagina nu a fost găsită</h1></body></html>',
};

const requested: string[] = [];
const fetcher: FetchLike = {
  async fetchPolite(url) {
    requested.push(url);
    const body = PAGES[url];
    return body
      ? { status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' }
      : { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};

let t: TestDatabase;
let blobRoot: string;
const alert = vi.fn(async () => undefined);
const env = { ...getEnv({}), CRAWL_ENABLED: true };
const log = createLogger('test', { level: 'silent' });
const deps = () => ({
  db: t.db,
  env,
  log,
  blob: new FsBlobStore(blobRoot),
  fetcher,
  normalize: createNormalize(() => 5),
  alert,
});

async function sourceId(key: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(
    sql`SELECT id::text FROM shop_sources WHERE key = ${key}`,
  );
  if (!r.rows[0]) throw new Error(`no source ${key}`);
  return Number(r.rows[0].id);
}

async function offers(shop: string) {
  const r = await t.db.execute<{
    external_id: string;
    price: string;
    old_price: string | null;
    availability: string;
    condition: string;
    gtin14: string | null;
    brand_name: string | null;
    shipping_cost: string | null;
    total_price: string;
  }>(sql`
    SELECT o.external_id, o.price::text, o.old_price::text, o.availability, o.condition, o.gtin14, o.brand_name, o.shipping_cost::text, o.total_price::text
    FROM offers o JOIN shops s ON s.id = o.shop_id WHERE s.slug = ${shop} ORDER BY o.external_id`);
  return r.rows;
}

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-m10-'));
  await syncShops(t.db);
  await setFlag(t.db, 'crawl.enabled', true);
});
afterAll(async () => {
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
});

describe('M10 listing sources through source.run', () => {
  it('IT Galaxy: 36 offers from one listing page, EAN kept as GTIN-14', async () => {
    const r = await runSource(deps(), await sourceId('itgalaxy:listing:televizoare'), {
      trigger: 'manual',
      maxPages: 1,
    });
    expect(r).toMatchObject({
      status: 'success',
      stats: { fetched: 1, parsed: 36, upserted: 36, changed: 36, errors: 0 },
    });
    const rows = await offers('itgalaxy');
    expect(rows).toHaveLength(36);
    expect(rows.find((o) => o.external_id === '932454')).toMatchObject({
      price: '868.99',
      old_price: '1199.99',
      availability: 'in_stock',
      gtin14: '09120106663334',
    });
  });

  it('forit: 60 offers through the generic parser with the offer-stated delivery cost in the total', async () => {
    const r = await runSource(deps(), await sourceId('forit:listing:televizoare'), {
      trigger: 'manual',
      maxPages: 1,
    });
    expect(r).toMatchObject({ status: 'success', stats: { parsed: 60, upserted: 60 } });
    expect((await offers('forit')).find((o) => o.external_id === 'LEDV24MFZHN')).toMatchObject({
      price: '410.49',
      shipping_cost: '21.99',
      total_price: '432.48',
    });
  });

  it('Dedeman: a one-page category completes; locality-dependent stock is recorded as unknown', async () => {
    const r = await runSource(deps(), await sourceId('dedeman:listing:frigidere'), {
      trigger: 'manual',
    });
    expect(r).toMatchObject({
      status: 'success',
      stats: { fetched: 1, parsed: 23, upserted: 23, errors: 0 },
    });
    const rows = await offers('dedeman');
    expect(rows).toHaveLength(23);
    expect(rows.find((o) => o.external_id === '3051493')).toMatchObject({
      price: '919.00',
      old_price: '1049.00',
      availability: 'unknown',
      brand_name: 'Candy',
    });
  });

  it('Carrefour: 24 offers, the brand from the card', async () => {
    const r = await runSource(deps(), await sourceId('carrefour:listing:televizoare-smart'), {
      trigger: 'manual',
      maxPages: 1,
    });
    expect(r).toMatchObject({ status: 'success', stats: { parsed: 24, upserted: 24 } });
    expect((await offers('carrefour')).find((o) => o.external_id === '44503250')).toMatchObject({
      price: '4099.99',
      old_price: '5399.99',
      brand_name: 'TCL',
    });
  });

  it('Auchan: priced products only; a following page of unavailable products ends the run as complete', async () => {
    requested.length = 0;
    const r = await runSource(deps(), await sourceId('auchan:listing:televizoare'), {
      trigger: 'manual',
    });
    expect(r).toMatchObject({
      status: 'success',
      stats: { fetched: 2, parsed: 4, upserted: 4, errors: 0 },
    });
    expect(requested).toEqual([
      'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c',
      'https://www.auchan.ro/electro-climatizare-si-aparate-ingrijire/electronice/televizoare/c?page=2',
    ]);
    const rows = await offers('auchan');
    expect(rows.map((o) => o.external_id)).toEqual(['322312', '322314', '351428', '351429']);
    // The brand field says "AEC" (a supplier); the normalizer takes TCL from the title.
    expect(rows.find((o) => o.external_id === '351429')).toMatchObject({
      gtin14: '05901292526894',
      brand_name: 'TCL',
      availability: 'in_stock',
    });
  });

  it('Bonami: 48 offers from __NEXT_DATA__', async () => {
    const r = await runSource(deps(), await sourceId('bonami:listing:aparate-de-bucatarie'), {
      trigger: 'manual',
      maxPages: 1,
    });
    expect(r).toMatchObject({ status: 'success', stats: { parsed: 48, upserted: 48 } });
    expect((await offers('bonami')).find((o) => o.external_id === '1932698')).toMatchObject({
      price: '717.00',
      old_price: '844.00',
    });
  });

  it('Flip: the sitemap source reads product pages with flip-product (refurbished, delivery from the shop rules)', async () => {
    const r = await runSource(deps(), await sourceId('flip:sitemap:produse'), {
      trigger: 'manual',
      budget: 5,
    });
    expect(r).toMatchObject({ status: 'success', stats: { parsed: 1, upserted: 1 } });
    const [o] = await offers('flip');
    expect(o).toMatchObject({
      external_id: '7991',
      price: '1419.99',
      condition: 'refurbished',
      availability: 'in_stock',
      shipping_cost: null,
    });
    // Delivery is not stated by the offer: the total uses the registry's courier fee (19,99 lei).
    expect(o?.total_price).toBe('1439.98');
  });

  it('a first page that lists no product at all is still reported as a layout problem', async () => {
    const id = await sourceId('bonami:listing:electrocasnice-pentru-curatenie');
    const r = await runSource(deps(), id, { trigger: 'manual', maxPages: 1 });
    expect(r).toMatchObject({ status: 'failed', stats: { fetched: 1, parsed: 0, errors: 1 } });
    const run = await t.db.execute<{ error_sample: string }>(
      sql`SELECT error_sample FROM ingest_runs WHERE id = ${r.runId}`,
    );
    expect(run.rows[0]?.error_sample).toMatch(/no offers parsed on the first page/);
  });
});
