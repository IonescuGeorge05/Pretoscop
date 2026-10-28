/**
 * Imports a network's commission report (CSV export) into `commissions` (M24) and prints the
 * reconciliation: rows and totals per status, as the network's report shows them.
 *   pnpm --filter @pretoscop/worker commissions:import --network 2performant --file report.csv [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, shopForProgram, upsertCommissions } from '@pretoscop/db';
import { commissionsFromCsv } from '../affiliate/csv';

loadRootEnvFile();
const { values } = parseArgs({ options: { network: { type: 'string' }, file: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
if (!values.network || !values.file) {
  console.error('usage: commissions:import --network 2performant|profitshare|awin|… --file report.csv [--dry-run]');
  process.exit(2);
}
const { rows, errors } = commissionsFromCsv(readFileSync(values.file, 'utf8'));
const totals = new Map<string, { n: number; bani: number }>();
for (const r of rows) {
  const t = totals.get(r.status) ?? { n: 0, bani: 0 };
  t.n++;
  t.bani += r.amountBani;
  totals.set(r.status, t);
}
for (const [status, t] of [...totals].sort()) console.log(`${status.padEnd(9)} ${String(t.n).padStart(5)} commissions  ${(t.bani / 100).toFixed(2)} lei`);
for (const e of errors) console.error(`skipped ${e}`);
if (values['dry-run']) process.exit(errors.length && rows.length === 0 ? 1 : 0);

const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const input = [];
  for (const r of rows) {
    input.push({
      network: values.network,
      networkCommissionId: r.networkCommissionId,
      shopId: r.programExternalId ? await shopForProgram(db, values.network, r.programExternalId) : null,
      programExternalId: r.programExternalId,
      clickId: r.clickId,
      status: r.status,
      amountBani: r.amountBani,
      saleAmountBani: r.saleAmountBani,
      currency: r.currency,
      occurredAt: r.occurredAt,
      networkUpdatedAt: null,
      raw: r.raw,
    });
  }
  const res = await upsertCommissions(db, input);
  console.log(`imported: ${res.inserted} new, ${res.updated} updated`);
} finally {
  await pool.end();
}
