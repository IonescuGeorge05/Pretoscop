import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, ensureKnownFlags, sql, syncTaxonomy } from '@pretoscop/db';
import { runMigrations } from '@pretoscop/db/migrator';
import { createBoss, registerJobs } from './boss';
import { DATA_DIR } from './jobs/ops';
import { jobs } from './jobs';
import { startHealthServer } from './ops/health';
import { createMetricsCollector } from './ops/metrics';
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
const startedAt = services.startedAt ?? new Date();
const metrics = createMetricsCollector({ db, env, startedAt, diskPath: DATA_DIR, extra: services.metricsExtra });
const health = startHealthServer({
  port: env.METRICS_PORT,
  status: () => ({ crawl_enabled: env.CRAWL_ENABLED, started_at: startedAt.toISOString(), version: process.env.APP_VERSION ?? 'dev' }),
  check: async () => {
    await db.execute(sql`SELECT 1`);
    return true;
  },
  metrics: () => metrics.collect(),
});
log.info({ jobs: jobs.map((j) => j.name), crawl_enabled: env.CRAWL_ENABLED }, 'worker started');

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker stopping');
  health.close();
  metrics.close();
  await boss.stop({ graceful: true, timeout: 30_000 });
  await services.close();
  await pool.end();
  log.info('worker stopped');
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
