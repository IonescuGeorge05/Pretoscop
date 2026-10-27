/**
 * Runs one source now, in this process (manual trigger), and prints the stats.
 *   pnpm --filter @pretoscop/worker run:source emag:listing:telefoane-mobile [--pages 2] [--budget 20]
 * All gates apply (CRAWL_ENABLED, flags, kill switch); politeness is enforced by the fetch layer.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, shopSources } from '@pretoscop/db';
import { eq } from 'drizzle-orm';
import { runSource } from '../recorder/run-source';
import { createServices } from '../services';

loadRootEnvFile();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { pages: { type: 'string' }, budget: { type: 'string' } },
});
const key = positionals[0];
if (!key) {
  console.error('usage: run:source <source key> [--pages N] [--budget N]');
  process.exit(2);
}
const env = getEnv();
const log = createLogger('run-source');
const pool = createPool(env.DATABASE_URL, 4);
const db = createDb(pool);
try {
  const [src] = await db.select({ id: shopSources.id }).from(shopSources).where(eq(shopSources.key, key));
  if (!src) throw new Error(`unknown source ${key}`);
  const services = createServices(env, db, log);
  const out = await runSource({ db, env, log, ...services }, src.id, {
    trigger: 'manual',
    maxPages: values.pages ? Number(values.pages) : undefined,
    budget: values.budget ? Number(values.budget) : undefined,
  });
  console.log(JSON.stringify(out, null, 2));
  await services.close?.();
} finally {
  await pool.end();
}
