/**
 * Event report generator (M23): Markdown + CSV + JSON (schema pretoscop.report/v1) + charts
 * (SVG and PNG) for a period, from Pretoscop's own observations. Output is unapproved until a
 * founder runs report:approve after the review checklist (docs/press-kit/review-checklist.md).
 *   pnpm --filter @pretoscop/worker report --from 2026-11-20 --to 2026-11-30 [--id black-friday-2026]
 *     [--title "…"] [--category telefoane-mobile,laptopuri] [--out data/reports] [--now 2026-12-01T09:00:00Z]
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findRepoRoot, getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '@pretoscop/db';
import { generateReport } from '../report/generate';

loadRootEnvFile();
const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    id: { type: 'string' },
    title: { type: 'string' },
    category: { type: 'string' },
    out: { type: 'string' },
    now: { type: 'string' },
    label: { type: 'string' },
    'no-png': { type: 'boolean' },
  },
});
const day = /^\d{4}-\d{2}-\d{2}$/;
if (!values.from || !values.to || !day.test(values.from) || !day.test(values.to) || values.from > values.to) {
  console.error('usage: report --from YYYY-MM-DD --to YYYY-MM-DD [--id …] [--title …] [--category a,b] [--out dir] [--now ISO]');
  process.exit(2);
}
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const r = await generateReport(createDb(pool), {
    id: values.id ?? `raport-${values.from}`,
    title: values.title ?? `Reducerile din perioada ${values.from} – ${values.to}`,
    from: values.from,
    to: values.to,
    categories: values.category ? values.category.split(',').map((s) => s.trim()).filter(Boolean) : null,
    now: values.now ?? new Date().toISOString(),
    outDir: resolve(findRepoRoot(), values.out ?? 'data/reports'),
    png: !values['no-png'],
    windowLabel: values.label,
  });
  const h = r.data.headline;
  console.log(`${r.dir}\n  ${r.files.join('\n  ')}`);
  console.log(
    `\n${h.offers} offers in stock, ${h.withHistory} with history; ${h.claims} displayed a reduction, ${h.claimsWithoutRealDrop} without a real drop; real drops ${h.realDrop}, no real drop ${h.noRealDrop}, higher ${h.higher}; raise-then-cut ${r.data.raiseThenCut.cases.length}/${r.data.raiseThenCut.evaluated}.`,
  );
  console.log('Not approved: review with docs/press-kit/review-checklist.md, then report:approve.');
} finally {
  await pool.end();
}
