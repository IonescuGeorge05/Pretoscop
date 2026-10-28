/**
 * Re-normalizes stored offers with the current normalizer after a rule change (M06), rewriting
 * the normalized columns and re-queuing offers whose identity changed (human decisions are kept).
 * Never touches prices or price events. See src/recorder/renormalize.ts.
 *
 *   pnpm --filter @pretoscop/worker renormalize [--shop emag] [--dry-run] [--limit 1000] [--samples 20]
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '@pretoscop/db';
import {
  type OfferChange,
  type RenormalizeSummary,
  renormalizeOffers,
} from '../recorder/renormalize';

loadRootEnvFile();
const { values } = parseArgs({
  options: {
    shop: { type: 'string' },
    'dry-run': { type: 'boolean' },
    limit: { type: 'string' },
    samples: { type: 'string' },
  },
});
const env = getEnv();
const target = new URL(env.DATABASE_URL);
const dryRun = values['dry-run'] ?? false;
const sampleLimit = Number(values.samples ?? 20);

function show(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? 'null' : s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function printSummary(s: RenormalizeSummary): void {
  const row = (label: string, before: number, after: number) =>
    `  ${label.padEnd(22)} ${String(before).padStart(7)} → ${String(after).padStart(7)}`;
  console.log(`\n${s.scanned} offers scanned${s.dryRun ? ' (dry run: nothing written)' : ''}`);
  console.log(`  changed               ${s.changed}`);
  console.log(`  rejected by normalizer ${s.rejected} (left as stored)`);
  console.log(`  raced with recorder   ${s.raced} (skipped; run again)`);
  console.log(`  MPN fields from slugs ${s.urlDerivedMpnFields} (re-read as URL hints)`);
  console.log(
    `  identity changed      ${s.identityChanged}: ${s.requeued} back to pending, ${s.linksKept} kept (link still holds), ${s.locked} kept (human decision)`,
  );
  console.log(`  products synced       ${s.productsSynced} (matcher-made products following their offer)`);
  console.log('\nColumns changed:');
  for (const [k, n] of Object.entries(s.columns)) console.log(`  ${k.padEnd(22)} ${n}`);
  console.log('\nBefore → after:');
  console.log(row('MPN from a field', s.before.mpnField, s.after.mpnField));
  console.log(row('MPN guessed', s.before.mpnTitle, s.after.mpnTitle));
  console.log(row('no MPN', s.before.mpnNone, s.after.mpnNone));
  console.log(row('no brand', s.before.noBrand, s.after.noBrand));
  console.log(row('bundles', s.before.bundles, s.after.bundles));
  console.log(row('accessories', s.before.accessories, s.after.accessories));
}

console.log(
  `Re-normalizing offers in ${target.host}${target.pathname}${values.shop ? ` (shop ${values.shop})` : ''}${dryRun ? ', dry run' : ''}`,
);
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
let shown = 0;
try {
  const summary = await renormalizeOffers(db, {
    shopSlug: values.shop,
    dryRun,
    limit: values.limit ? Number(values.limit) : undefined,
    onChange(c: OfferChange) {
      if (shown >= sampleLimit) return;
      shown++;
      const parts = Object.entries(c.changes).map(([k, [a, b]]) => `${k}: ${show(a)} → ${show(b)}`);
      const tag = c.requeued ? '  [pending]' : c.identityChanged ? '  [link kept]' : '';
      const product = c.productSynced ? `  [product #${c.productSynced} follows]` : '';
      console.log(`#${c.id} ${c.title.slice(0, 70)}\n    ${parts.join('; ')}${tag}${product}`);
    },
  });
  printSummary(summary);
} finally {
  await pool.end();
}
