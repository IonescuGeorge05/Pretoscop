/**
 * M11: Open Icecat enrichment end to end on a throwaway database, against the local Icecat
 * stand-in (synthetic fixtures; nothing is requested from Icecat), with a temporary blob store.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { setFlag } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import type { RequestLogEntry } from '@pretoscop/fetch';
import { imageInfo } from '@pretoscop/icecat';
import { startIcecatMock, type IcecatMock } from '@pretoscop/icecat/mock';
import { FsBlobStore } from '@pretoscop/storage';
import { createWorkerIcecat } from '../src/icecat/client';
import { printedGtin, syncIcecat } from '../src/icecat/sync';
import { icecatSyncJob } from '../src/jobs/icecat';

let t: TestDatabase;
let mock: IcecatMock;
let blobRoot: string;
const log = createLogger('test', { level: 'silent' });
const env = { ...getEnv({}), ICECAT_MIN_INTERVAL_MS: 0 };
const requestLog: RequestLogEntry[] = [];
let gallery: 'full' | 'one' = 'full';

async function product(
  slug: string,
  brand: string | null,
  mpn: string | null,
  gtin14: string | null,
  extra: { provisional?: boolean; status?: string } = {},
): Promise<number> {
  let brandId: number | null = null;
  if (brand) {
    const b = await t.db.execute<{ id: string }>(sql`
      INSERT INTO brands (name, slug) VALUES (${brand}, ${brand.toLowerCase()}) ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
    brandId = Number(b.rows[0]!.id);
  }
  const p = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, brand_id, mpn, provisional, status, created_by, offer_count)
    VALUES (${slug}, ${slug}, ${slug}, ${brandId}, ${mpn}, ${extra.provisional ?? false}, ${extra.status ?? 'active'}, 'matcher', 2)
    RETURNING id::text`);
  const id = Number(p.rows[0]!.id);
  if (gtin14)
    await t.db.execute(
      sql`INSERT INTO product_gtins (gtin14, product_id, source) VALUES (${gtin14}, ${id}, 'offer')`,
    );
  return id;
}

const ids: Record<string, number> = {};
const icecat = () =>
  createWorkerIcecat(env, t.db, log, {
    baseUrl: mock.apiUrl,
    shopname: 'test-account',
    requestLog: { write: (e) => void requestLog.push(e) },
  });
const blob = () => new FsBlobStore(blobRoot);

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-icecat-'));
  const dell = readFileSync(
    new URL(
      '../../../packages/icecat/fixtures/product-dell-g5-5587_ro_synthetic.json',
      import.meta.url,
    ),
    'utf8',
  );
  mock = await startIcecatMock({
    // The refresh test serves a datasheet that lost one of its two pictures.
    respond: (q) => {
      if (gallery !== 'one' || q.path !== '/api' || q.query.GTIN !== '5397184119709')
        return undefined;
      const doc = JSON.parse(dell.replaceAll('https://images.icecat.biz', mock.origin)) as {
        data: { Gallery: unknown[] };
      };
      doc.data.Gallery = doc.data.Gallery.slice(1, 2);
      return { status: 200, body: JSON.stringify(doc) };
    },
  });
  ids.dell = await product('dell-g5', 'Dell', '5587-SYNTH-01', '05397184119709', {
    provisional: true,
  });
  ids.samsung = await product('galaxy-s23', 'Samsung', 'SM-S911BZKDEUE', '08806094724721');
  ids.philips = await product('philips-airfryer', 'Philips', 'HD9252/90', null, {
    provisional: true,
  });
  ids.sony = await product('sony-wh1000xm5', 'Sony', 'WH1000XM5B.CE7', '04548736143111');
  ids.apple = await product('apple-iphone', 'Apple', null, '00194252056813');
  ids.unknown = await product('lenovo-unknown', 'Lenovo', null, '00196802000001');
  ids.merged = await product('merged-dell', 'Dell', null, '05397184119716', { status: 'merged' });
});
afterAll(async () => {
  await mock?.close();
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
});

describe('printedGtin', () => {
  it('turns GTIN-14 back into the printed form', () => {
    expect(printedGtin('05397184119709')).toBe('5397184119709');
    expect(printedGtin('00194252056813')).toBe('194252056813');
    expect(printedGtin('00000040170725')).toBe('40170725');
    expect(printedGtin('15397184119706')).toBe('15397184119706');
  });
});

describe('icecat.sync', () => {
  it('stores datasheets, copies licensed images and remembers misses', async () => {
    const ic = icecat();
    const stats = await syncIcecat(
      { db: t.db, blob: blob(), client: ic.client, log },
      { langs: ['RO', 'EN'], limit: 50 },
    );
    await ic.close();
    expect(stats).toMatchObject({
      candidates: 6,
      looked: 6,
      found: 3,
      notFound: 1,
      restricted: 1,
      fullOnly: 1,
      imagesAdded: 5,
      imageErrors: 0,
      confirmed: 1,
      capReached: false,
      stopped: null,
    });

    const specs = await t.db.execute<{
      product_id: string;
      source: string;
      locale: string;
      data: Record<string, unknown>;
      attribution: string | null;
    }>(
      sql`SELECT product_id::text, source, locale, data, attribution FROM product_specs ORDER BY product_id, source`,
    );
    const byProduct = (id: number, source: string) =>
      specs.rows.find((r) => Number(r.product_id) === id && r.source === source);
    expect(byProduct(ids.dell!, 'icecat')).toMatchObject({
      locale: 'ro',
      attribution: expect.stringMatching(
        /^Specs Icecat \(https:\/\/icecat\.biz\)\. Database Right data-sheet \d{4} Icecat/,
      ),
    });
    expect(byProduct(ids.dell!, 'icecat')?.data).toMatchObject({
      matchedBy: 'gtin',
      matchedKey: '5397184119709',
      icecatId: '56195846',
      source: 'open-icecat',
    });
    expect((byProduct(ids.dell!, 'icecat')?.data.features as unknown[]).length).toBe(8);
    expect(byProduct(ids.philips!, 'icecat')?.data).toMatchObject({
      matchedBy: 'brand_mpn',
      matchedKey: 'Philips HD9252/90',
    });
    expect(byProduct(ids.sony!, 'icecat-miss')?.data).toMatchObject({
      status: 'full_only',
      tried: ['4548736143111', 'Sony WH1000XM5B.CE7'],
    });
    expect(byProduct(ids.apple!, 'icecat-miss')?.data).toMatchObject({ status: 'restricted' });
    expect(byProduct(ids.unknown!, 'icecat-miss')?.data).toMatchObject({ status: 'not_found' });
    expect(specs.rows.some((r) => Number(r.product_id) === ids.merged)).toBe(false);

    const images = await t.db.execute<{
      product_id: string;
      storage_key: string;
      source: string;
      license_note: string;
      width: number;
      is_primary: boolean;
    }>(
      sql`SELECT product_id::text, storage_key, source, license_note, width, is_primary FROM product_images ORDER BY product_id, id`,
    );
    expect(images.rows).toHaveLength(5);
    for (const img of images.rows) {
      expect(img.source).toBe('icecat');
      expect(img.storage_key).toMatch(/^images\/icecat\/\d+\/[0-9a-f]{16}\.webp$/);
      expect(img.license_note).toMatch(/^Open Icecat, Open Content Licence: Specs Icecat/);
      for (const key of [
        img.storage_key,
        ...[120, 400, 800].map((s) => img.storage_key.replace('.webp', `_${s}.webp`)),
      ]) {
        expect(existsSync(join(blobRoot, key)), key).toBe(true);
      }
    }
    const meta = await imageInfo(
      readFileSync(join(blobRoot, images.rows[0]!.storage_key.replace('.webp', '_400.webp'))),
    );
    expect([meta.format, meta.width]).toEqual(['webp', 400]);

    const products = await t.db.execute<{
      id: string;
      provisional: boolean;
      primary_image_id: string | null;
    }>(sql`SELECT id::text, provisional, primary_image_id::text FROM products`);
    const row = (id: number) => products.rows.find((r) => Number(r.id) === id)!;
    // A GTIN match confirms a provisional product; a brand + code match does not.
    expect(row(ids.dell!).provisional).toBe(false);
    expect(row(ids.philips!).provisional).toBe(true);
    for (const id of [ids.dell!, ids.samsung!, ids.philips!])
      expect(row(id).primary_image_id).not.toBeNull();
    expect(images.rows.filter((i) => i.is_primary)).toHaveLength(3);

    // Every datasheet request was counted (Sony: GTIN then brand + code), images were not.
    const usage = await t.db.execute<{ requests: number }>(
      sql`SELECT requests FROM fetch_domain_daily WHERE host = 'icecat:RO'`,
    );
    expect(usage.rows[0]?.requests).toBe(7);
    expect(requestLog.filter((e) => e.attempt > 0 && e.purpose === 'feed').length).toBe(7 + 5);
    expect(requestLog.every((e) => e.shopSlug === 'icecat')).toBe(true);
  });

  it('does nothing again before the monthly refresh is due', async () => {
    const before = mock.requests.length;
    const ic = icecat();
    const stats = await syncIcecat(
      { db: t.db, blob: blob(), client: ic.client, log },
      { langs: ['RO'], limit: 50 },
    );
    await ic.close();
    expect(stats.candidates).toBe(0);
    expect(mock.requests.length).toBe(before);
  });

  it('refreshes a 30-day-old datasheet, keeps unchanged images and drops the ones Icecat removed', async () => {
    await t.db.execute(
      sql`UPDATE product_specs SET fetched_at = now() - interval '40 days' WHERE product_id = ${ids.dell} AND source = 'icecat'`,
    );
    gallery = 'one';
    const ic = icecat();
    const stats = await syncIcecat(
      { db: t.db, blob: blob(), client: ic.client, log },
      { langs: ['RO'], limit: 50 },
    );
    await ic.close();
    gallery = 'full';
    expect(stats).toMatchObject({
      candidates: 1,
      found: 1,
      imagesAdded: 0,
      imagesKept: 1,
      imagesRemoved: 1,
    });
    const left = await t.db.execute<{ storage_key: string; is_primary: boolean }>(
      sql`SELECT storage_key, is_primary FROM product_images WHERE product_id = ${ids.dell}`,
    );
    expect(left.rows).toHaveLength(1);
    // The removed image was the primary one: the remaining image takes its place, the old blobs are gone.
    expect(left.rows[0]!.is_primary).toBe(true);
    const p = await t.db.execute<{ primary_image_id: string | null }>(
      sql`SELECT primary_image_id::text FROM products WHERE id = ${ids.dell}`,
    );
    expect(p.rows[0]!.primary_image_id).not.toBeNull();
  });

  it('stops at the monthly cap without sending the request', async () => {
    await t.db.execute(
      sql`UPDATE product_specs SET fetched_at = now() - interval '40 days' WHERE product_id = ${ids.samsung} AND source = 'icecat'`,
    );
    const before = mock.requests.length;
    const capped = createWorkerIcecat({ ...env, ICECAT_MONTHLY_CAP: 8 }, t.db, log, {
      baseUrl: mock.apiUrl,
      shopname: 'test-account',
      requestLog: { write: () => undefined },
    });
    const stats = await syncIcecat(
      { db: t.db, blob: blob(), client: capped.client, log },
      { langs: ['RO'], limit: 50 },
    );
    await capped.close();
    expect(stats).toMatchObject({ candidates: 1, capReached: true, found: 0 });
    expect(mock.requests.length).toBe(before);
  });
});

describe('icecat.sync job gates', () => {
  const ctx = (envOver: Partial<typeof env>) => ({
    db: t.db,
    env: { ...env, ...envOver },
    log,
    boss: {} as never,
    services: {
      blob: blob(),
      fetcher: {} as never,
      normalize: (() => ({ rejectReason: 'x' })) as never,
      alert: vi.fn(async () => undefined),
      revalidate: async () => 0,
    },
  });
  const job = { id: 'j', name: 'icecat.sync', data: {} } as never;

  it('is off without the flag, and without an account', async () => {
    await setFlag(t.db, 'icecat.enabled', false);
    expect(await icecatSyncJob.handler(job, ctx({ ICECAT_USERNAME: 'x' }))).toEqual({
      skipped: 'flag icecat.enabled is off',
    });
    await setFlag(t.db, 'icecat.enabled', true);
    expect(await icecatSyncJob.handler(job, ctx({ ICECAT_USERNAME: undefined }))).toEqual({
      skipped: 'no Open Icecat account',
    });
    await setFlag(t.db, 'icecat.enabled', false);
  });
});
