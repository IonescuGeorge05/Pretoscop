import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '@pretoscop/db';
import { syncShops } from '../registry/sync';

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const r = await syncShops(createDb(pool));
  const fmt = (c: { inserted: number; updated: number; unchanged: number }) =>
    `${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged`;
  console.log(`shops:   ${fmt(r.shops)}`);
  console.log(`sources: ${fmt(r.sources)}, ${r.sources.disabled} disabled`);
  console.log(`programs: ${fmt(r.programs)}`);
  for (const c of r.changes.slice(0, 40)) console.log(`  · ${c}`);
  if (r.changes.length > 40) console.log(`  … ${r.changes.length - 40} more`);
} finally {
  await pool.end();
}
