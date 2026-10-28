/**
 * Offline end-to-end demo of the Icecat enrichment (M11), safe to run anywhere:
 *   pnpm --filter @pretoscop/worker icecat:demo
 * Creates a throwaway database and a temporary blob directory, adds six sample products (Dell,
 * Samsung and Philips found; Sony "Full Icecat only"; Apple restricted; one unknown), runs one
 * `icecat.sync` pass against the local Icecat stand-in (synthetic data), prints the stats, the
 * coverage table and the stored image keys, then drops everything. Nothing reaches Icecat, the
 * dev database or the real blob store.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { icecatCoverage, sql } from '@pretoscop/db';
import { createTestDatabase } from '@pretoscop/db/testing';
import { startIcecatMock } from '@pretoscop/icecat/mock';
import { FsBlobStore } from '@pretoscop/storage';
import { createWorkerIcecat } from '../icecat/client';
import { coverageTable } from '../icecat/report';
import { syncIcecat } from '../icecat/sync';

loadRootEnvFile();
const env = { ...getEnv(), ICECAT_MIN_INTERVAL_MS: 0 };
const log = createLogger('icecat-demo', { level: 'warn' });
const t = await createTestDatabase();
const blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-icecat-demo-'));
const mock = await startIcecatMock();
try {
  const samples: Array<[string, string, string | null, string | null]> = [
    ['Dell G5 5587', 'Dell', '5587-SYNTH-01', '05397184119709'],
    ['Samsung Galaxy S23 128GB Black', 'Samsung', 'SM-S911BZKDEUE', '08806094724721'],
    ['Philips Airfryer HD9252/90', 'Philips', 'HD9252/90', null],
    ['Sony WH-1000XM5', 'Sony', 'WH1000XM5B.CE7', '04548736143111'],
    ['Apple iPhone', 'Apple', null, '00194252056813'],
    ['Lenovo (necunoscut)', 'Lenovo', null, '00196802000001'],
  ];
  for (const [title, brand, mpn, gtin] of samples) {
    const b = await t.db.execute<{ id: string }>(sql`
      INSERT INTO brands (name, slug) VALUES (${brand}, ${brand.toLowerCase()}) ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const p = await t.db.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, brand_id, mpn, provisional, created_by)
      VALUES (${slug}, ${title}, ${title}, ${Number(b.rows[0]!.id)}, ${mpn}, true, 'matcher') RETURNING id::text`);
    if (gtin)
      await t.db.execute(
        sql`INSERT INTO product_gtins (gtin14, product_id, source) VALUES (${gtin}, ${Number(p.rows[0]!.id)}, 'offer')`,
      );
  }
  const icecat = createWorkerIcecat(env, t.db, log, {
    baseUrl: mock.apiUrl,
    shopname: 'demo-mock',
    requestLog: { write: () => undefined },
  });
  const stats = await syncIcecat(
    { db: t.db, blob: new FsBlobStore(blobRoot), client: icecat.client, log },
    { langs: ['RO', 'EN'], limit: 50 },
  );
  await icecat.close();
  console.log('icecat.sync (local mock, synthetic data):');
  console.log(
    `  looked up ${stats.looked}: found ${stats.found}, not in Icecat ${stats.notFound}, restricted ${stats.restricted}, Full Icecat only ${stats.fullOnly}`,
  );
  console.log(
    `  images copied ${stats.imagesAdded} (derivatives 120/400/800 px), provisional products confirmed ${stats.confirmed}, cap reached ${stats.capReached}, stopped ${stats.stopped ?? 'no'}`,
  );
  console.log('\nCoverage (pnpm icecat:coverage):');
  for (const line of coverageTable(await icecatCoverage(t.db))) console.log(`  ${line}`);
  const specs = await t.db.execute<{ title: string; features: string; attribution: string }>(sql`
    SELECT p.title, jsonb_array_length(s.data->'features')::text AS features, s.attribution
    FROM product_specs s JOIN products p ON p.id = s.product_id WHERE s.source = 'icecat' ORDER BY p.id`);
  console.log('\nproduct_specs (source icecat):');
  for (const r of specs.rows) console.log(`  ${r.title}: ${r.features} features`);
  console.log(`  attribution: ${specs.rows[0]?.attribution ?? '-'}`);
  const files = readdirSync(join(blobRoot, 'images', 'icecat'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.webp'))
    .sort();
  console.log(
    `\nBlob store (temporary): ${files.length} files under images/icecat/, e.g. ${files.slice(0, 4).join(', ')}`,
  );
} finally {
  await mock.close();
  await t.drop();
  rmSync(blobRoot, { recursive: true, force: true });
}
