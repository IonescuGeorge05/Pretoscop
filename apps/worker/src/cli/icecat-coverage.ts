/**
 * Icecat coverage per brand (M11 founder check): products that can be looked up (GTIN or brand +
 * MPN) and what Open Icecat answered. Read-only.
 *   pnpm icecat:coverage [--database-url postgres://…] [--json]
 * Target (docs/05 M11): ≥ 60% for the brands Open Icecat sponsors (Samsung, LG, Lenovo, Dell,
 * Philips, Kingston); Sony, Xiaomi, Logitech and AMD need Full Icecat, Apple is restricted.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, icecatCoverage, icecatUsage } from '@pretoscop/db';
import { coverageTable } from '../icecat/report';

loadRootEnvFile();
const { values } = parseArgs({
  options: { 'database-url': { type: 'string' }, json: { type: 'boolean' } },
});
const env = getEnv();
const pool = createPool(values['database-url'] ?? env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const rows = await icecatCoverage(db);
  if (values.json) {
    console.log(JSON.stringify(rows));
  } else {
    for (const line of coverageTable(rows)) console.log(line);
    const now = new Date();
    const langs = env.ICECAT_LANGS.split(',')
      .map((l) => l.trim().toUpperCase())
      .filter(Boolean);
    const usage = await Promise.all(
      langs.map(async (l) => `${l} ${await icecatUsage(db, l, now)}`),
    );
    console.log(
      `\nDatasheet requests this month (cap ${env.ICECAT_MONTHLY_CAP} per language): ${usage.join(', ')}`,
    );
  }
} finally {
  await pool.end();
}
