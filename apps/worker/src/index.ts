import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, ensureKnownFlags, syncTaxonomy } from '@pretoscop/db';
import { runMigrations } from '@pretoscop/db/migrator';
import { createBoss, registerJobs } from './boss';
import { jobs } from './jobs';
import { startHealthServer } from './ops/health';
import { syncShops } from './registry/sync';
import { createServices } from './services';

loadRootEnvFile();
const env = getEnv();
const log = createLogger('worker');

const pool = createPool(env.DATABASE_URL, env.DATABASE_POOL_MAX);
const db = createDb(pool);

// The database schema and the registry follow the deployed code (both steps are idempotent).
await runMigrations(db);
const sync = await syncShops(db);
await syncTaxonomy(db);
await ensureKnownFlags(db);
log.info({ shops: sync.shops, sources: sync.sources, changes: sync.changes.length }, 'registry synced');

const services = createServices(env, db, log);
const boss = createBoss(env, log);
await boss.start();
await registerJobs(boss, jobs, { boss, db, env, log, services });
const startedAt = new Date().toISOString();
const health = startHealthServer(env.METRICS_PORT, () => ({ crawl_enabled: env.CRAWL_ENABLED, started_at: startedAt }));
log.info({ jobs: jobs.map((j) => j.name), crawl_enabled: env.CRAWL_ENABLED }, 'worker started');

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker stopping');
  health.close();
  await boss.stop({ graceful: true, timeout: 30_000 });
  await services.close();
  await pool.end();
  log.info('worker stopped');
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
