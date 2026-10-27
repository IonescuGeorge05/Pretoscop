/**
 * Labelling CLI for the matching eval set (M07): shows recent matcher decisions (automatic accepts
 * and review items) as "offer vs product" and asks whether they are the same sellable product.
 * Answers are appended to packages/core/src/matching-eval/human-<date>.json (commit the file).
 *   pnpm --filter @pretoscop/worker match:label [--n 25]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { routePair, type EvalPair } from '@pretoscop/core';
import { createDb, createPool, sql } from '@pretoscop/db';
import { EVAL_DIR, loadPairs, offerSides, productSides } from './eval-data';

loadRootEnvFile();
const { values } = parseArgs({ options: { n: { type: 'string' } } });
const N = Number(values.n ?? 25);
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
const file = join(EVAL_DIR, `human-${new Date().toISOString().slice(0, 10)}.json`);
const rl = createInterface({ input: process.stdin, output: process.stdout });

try {
  const done = new Set(loadPairs().filter((p) => p.source === 'human').map((p) => p.id));
  // Half automatic accepts (precision audit), half review items (the hard cases), newest first.
  const rows = await db.execute<{ offer_id: string; product_id: string; kind: string }>(sql`
    (SELECT o.id::text AS offer_id, o.product_id::text AS product_id, 'auto' AS kind FROM offers o
      WHERE o.match_status = 'auto' AND o.product_id IS NOT NULL AND o.external_id NOT LIKE 'e2e-fixture-%' ORDER BY random() LIMIT ${N})
    UNION ALL
    (SELECT o.id::text, mc.product_id::text, 'review' FROM offers o
      JOIN LATERAL (SELECT product_id FROM match_candidates c WHERE c.offer_id = o.id ORDER BY score DESC LIMIT 1) mc ON true
      WHERE o.match_status = 'pending' AND o.matched_at IS NOT NULL AND o.external_id NOT LIKE 'e2e-fixture-%' LIMIT ${N})`);
  const todo = rows.rows.filter((r) => !done.has(`human:${r.offer_id}:${r.product_id}`)).slice(0, N);
  const offers = await offerSides(db, todo.map((r) => Number(r.offer_id)));
  const products = await productSides(db, todo.map((r) => Number(r.product_id)));
  const out: EvalPair[] = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as EvalPair[]) : [];
  console.log(`${todo.length} pairs. Answer: d = același produs vândut, n = produse diferite, s = sari, q = gata.\n`);
  for (const [i, r] of todo.entries()) {
    const offer = offers.get(Number(r.offer_id));
    const product = products.get(Number(r.product_id));
    if (!offer || !product) continue;
    const routed = routePair({ offer, product });
    console.log(`#${i + 1} (${r.kind}, scor ${routed.score.toFixed(3)} ${routed.via}${routed.conflicts.length ? `, conflicte ${routed.conflicts.join(', ')}` : ''})`);
    console.log(`  oferta:  ${offer.title}\n           ${offer.brand ?? '—'} · MPN ${offer.mpnNorm ?? '—'} · GTIN ${offer.gtin14 ?? '—'} · ${JSON.stringify(offer.attributes)}`);
    console.log(`  produs:  ${product.title}\n           ${product.brand ?? '—'} · MPN ${product.mpnNorm ?? '—'} · GTIN ${product.gtin14 ?? '—'} · ${JSON.stringify(product.attributes)}`);
    const a = (await rl.question('  același produs? [d/n/s/q] ')).trim().toLowerCase();
    if (a === 'q') break;
    if (a !== 'd' && a !== 'n') continue;
    out.push({ id: `human:${r.offer_id}:${r.product_id}`, offer, product, same: a === 'd', source: 'human', note: r.kind });
    writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  }
  console.log(`\n${out.length} labels in ${file}`);
} finally {
  rl.close();
  await pool.end();
}
