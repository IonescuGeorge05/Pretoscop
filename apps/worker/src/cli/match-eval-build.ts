/**
 * Builds the automatic part of the matching eval set (M07) from the database:
 *   - `gtin` / `mpn` positives: offers of two different shops agreeing on a valid GTIN, or on brand +
 *     field MPN (the strongest evidence we have without a human);
 *   - `family` hard negatives: variants of one model (same family) with different field MPNs;
 *   - easy negatives: same brand and category, different family;
 *   - `synthetic` positives: real product titles rewritten the way other shops write them.
 * Writes packages/core/src/matching-eval/auto.json (human labels live in human-*.json).
 *   pnpm --filter @pretoscop/worker match:eval:build [--max 150]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { rewriteTitle, type EvalPair } from '@pretoscop/core';
import { createDb, createPool, sql } from '@pretoscop/db';
import { EVAL_DIR, offerSides, productSides } from './eval-data';

loadRootEnvFile();
const { values } = parseArgs({ options: { max: { type: 'string' } } });
const MAX = Number(values.max ?? 150);
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);

try {
  const pairs: EvalPair[] = [];

  const gtin = await db.execute<{ a: string; b: string }>(sql`
    SELECT DISTINCT ON (a.gtin14) a.id::text AS a, b.id::text AS b FROM offers a JOIN offers b ON b.gtin14 = a.gtin14 AND b.shop_id > a.shop_id
    WHERE a.gtin14 IS NOT NULL AND a.external_id NOT LIKE 'e2e-fixture-%' AND b.external_id NOT LIKE 'e2e-fixture-%'
      AND a.condition = 'new' AND b.condition = 'new' AND NOT a.is_bundle AND NOT b.is_bundle
    LIMIT ${MAX}`);
  const mpn = await db.execute<{ a: string; b: string }>(sql`
    SELECT DISTINCT ON (a.mpn_norm) a.id::text AS a, b.id::text AS b FROM offers a JOIN offers b
      ON b.mpn_norm = a.mpn_norm AND lower(b.brand_name) = lower(a.brand_name) AND b.shop_id > a.shop_id
    WHERE a.mpn_source = 'field' AND b.mpn_source = 'field' AND a.external_id NOT LIKE 'e2e-fixture-%' AND b.external_id NOT LIKE 'e2e-fixture-%'
      AND a.condition = 'new' AND b.condition = 'new' AND NOT a.is_bundle AND NOT b.is_bundle
    LIMIT ${MAX}`);
  const offerIds = [...gtin.rows, ...mpn.rows].flatMap((r) => [Number(r.a), Number(r.b)]);
  const offers = await offerSides(db, offerIds);
  for (const [rows, source] of [
    [gtin.rows, 'gtin'],
    [mpn.rows, 'mpn'],
  ] as const) {
    for (const r of rows) {
      const a = offers.get(Number(r.a));
      const b = offers.get(Number(r.b));
      if (a && b) pairs.push({ id: `${source}:${r.a}:${r.b}`, offer: a, product: b, same: true, source });
    }
  }

  const fam = await db.execute<{ a: string; b: string }>(sql`
    SELECT a.id::text AS a, b.id::text AS b FROM products a JOIN products b ON b.family_id = a.family_id AND b.id > a.id
    WHERE a.family_id IS NOT NULL AND a.status = 'active' AND b.status = 'active' AND a.mpn_source = 'field' AND b.mpn_source = 'field'
      AND a.mpn_norm <> b.mpn_norm AND a.title NOT LIKE '%(produs de test E2E)%'
    ORDER BY md5(a.id::text || b.id::text) LIMIT ${MAX}`);
  const easy = await db.execute<{ a: string; b: string }>(sql`
    SELECT a.id::text AS a, b.id::text AS b FROM products a JOIN products b
      ON b.brand_id = a.brand_id AND b.category_id = a.category_id AND b.id > a.id AND b.family_id IS DISTINCT FROM a.family_id
    WHERE a.status = 'active' AND b.status = 'active' AND a.title NOT LIKE '%(produs de test E2E)%'
    ORDER BY md5(a.id::text || '/' || b.id::text) LIMIT ${Math.ceil(MAX / 2)}`);
  const synth = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM products WHERE status = 'active' AND mpn_source = 'field' AND title NOT LIKE '%(produs de test E2E)%'
    ORDER BY md5(id::text) LIMIT ${MAX}`);
  const productIds = [...fam.rows, ...easy.rows].flatMap((r) => [Number(r.a), Number(r.b)]).concat(synth.rows.map((r) => Number(r.id)));
  const products = await productSides(db, productIds);
  for (const [rows, label] of [
    [fam.rows, 'family'],
    [easy.rows, 'other model'],
  ] as const) {
    for (const r of rows) {
      const a = products.get(Number(r.a));
      const b = products.get(Number(r.b));
      if (a && b) pairs.push({ id: `neg:${r.a}:${r.b}`, offer: a, product: b, same: false, source: 'family', note: label });
    }
  }
  for (const r of synth.rows) {
    const p = products.get(Number(r.id));
    if (!p) continue;
    const id = Number(r.id);
    // Other shops rarely carry the manufacturer code: two in three synthetic offers have none.
    pairs.push({
      id: `syn:${id}`,
      offer: { ...p, title: rewriteTitle(p.title, id * 2654435761), mpnNorm: id % 3 === 0 ? p.mpnNorm : null, gtin14: null },
      product: p,
      same: true,
      source: 'synthetic',
    });
  }

  writeFileSync(join(EVAL_DIR, 'auto.json'), `${JSON.stringify(pairs, null, 1)}\n`);
  const count = (s: string) => pairs.filter((p) => p.source === s).length;
  console.log(
    `auto.json: ${pairs.length} pairs (gtin ${count('gtin')}, mpn ${count('mpn')}, family/other negatives ${count('family')}, synthetic ${count('synthetic')})`,
  );
} finally {
  await pool.end();
}
