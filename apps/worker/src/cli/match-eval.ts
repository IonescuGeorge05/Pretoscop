/**
 * Matching v1 evaluation (M07): routes every labelled pair in packages/core/src/matching-eval/*.json
 * the way the matcher would and prints precision on accepts, recall and the review rate per label
 * source, with identifiers and with identifiers masked (title scorer alone). Exits 1 when an
 * acceptance threshold fails:
 *   - precision on automatic accepts ≥ 98% over real labels (human, gtin, mpn, family);
 *   - no accept across two variants of one model (family negatives);
 *   - accepts decided by GTIN/MPN ≥ 99% on human labels (checked once there are ≥ 20 of them).
 *   pnpm --filter @pretoscop/worker match:eval [--show]
 */
import { evaluatePairs, type EvalStats } from '@pretoscop/core';
import { loadPairs } from './eval-data';

const show = process.argv.includes('--show');
const pairs = loadPairs();
if (pairs.length === 0) {
  console.error('no labelled pairs: run match:eval:build and/or match:label first');
  process.exit(2);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);
function line(label: string, s: EvalStats | undefined) {
  if (!s) return;
  console.log(
    `${label.padEnd(22)} ${String(s.pairs).padStart(5)} pairs  ${String(s.accepts).padStart(4)} accepts  precision ${pct(s.precision)}  recall ${pct(s.recall)}  review ${pct(s.reviewRate)}  false accepts ${s.falseAccepts.length}`,
  );
}

const byId = new Map(pairs.map((p) => [p.id, p]));
for (const mask of [false, true]) {
  const r = evaluatePairs(pairs, { mask });
  console.log(`\n== ${mask ? 'identifiers masked (title + attributes only)' : 'as the matcher sees them'}`);
  line('all', r);
  for (const [src, s] of Object.entries(r.bySource)) line(src, s);
  line('GTIN/MPN accepts', r.identifierAccepts);
  if (show) {
    for (const id of r.falseAccepts) {
      const p = byId.get(id)!;
      console.log(`  FALSE ACCEPT ${id} [${p.source}]\n    offer:   ${p.offer.title}\n    product: ${p.product.title}`);
    }
  }
}

const real = evaluatePairs(pairs.filter((p) => p.source !== 'synthetic'));
const failures: string[] = [];
if (real.precision < 0.98) failures.push(`precision on real labels ${pct(real.precision).trim()} < 98%`);
const fam = real.bySource.family;
if (fam && fam.falseAccepts.length > 0) failures.push(`${fam.falseAccepts.length} accepts across variants of one model`);
const human = evaluatePairs(pairs.filter((p) => p.source === 'human'));
if (human.identifierAccepts.accepts >= 20 && human.identifierAccepts.precision < 0.99) {
  failures.push(`GTIN/MPN accepts on human labels ${pct(human.identifierAccepts.precision).trim()} < 99%`);
}
const humanCount = pairs.filter((p) => p.source === 'human').length;
console.log(`\nhuman labels: ${humanCount}${humanCount < 100 ? ' (the plan asks for 100: pnpm --filter @pretoscop/worker match:label)' : ''}`);
if (failures.length) {
  console.error(`FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('PASS');
