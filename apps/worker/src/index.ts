import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool } from '@pretoscop/db';
import { createBoss, registerJobs } from './boss';
import { jobs } from './jobs';

loadRootEnvFile();
const env = getEnv();
const log = createLogger('worker');

const pool = createPool(env.DATABASE_URL, env.DATABASE_POOL_MAX);
const db = createDb(pool);
const boss = createBoss(env, log);
await boss.start();
await registerJobs(boss, jobs, { boss, db, env, log });
log.info({ jobs: jobs.map((j) => j.name) }, 'worker started');

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker stopping');
  await boss.stop({ graceful: true, timeout: 30_000 });
  await pool.end();
  log.info('worker stopped');
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
