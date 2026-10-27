import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../client';
import { runMigrations } from '../migrator';
import { ensurePriceEventPartitions, listPriceEventPartitions } from '../queries/maintenance';

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  await runMigrations(db);
  const created = await ensurePriceEventPartitions(db, 0, 12);
  const parts = await listPriceEventPartitions(db);
  console.log(`migrations applied; price_events partitions: ${parts.length} (${created} created now)`);
} finally {
  await pool.end();
}
