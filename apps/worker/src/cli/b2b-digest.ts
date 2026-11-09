/**
 * Sends today's B2B digests now, without the job queue (founder check, M28):
 *   pnpm --filter @pretoscop/worker b2b:digest
 * Same rules as the 07:45 job: off unless the flag `b2b.digest.enabled` is on; one email per member
 * who wants it and per day (a second run the same day sends nothing new); nothing when nothing
 * changed in the last 24 hours. Prints one JSON line.
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, isFlagEnabled } from '@pretoscop/db';
import { runB2bDigest } from '../b2b/digest';
import { createAlertServices } from '../services';

loadRootEnvFile();
const env = getEnv();
const log = createLogger('b2b-digest');
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  if (!(await isFlagEnabled(db, 'b2b.digest.enabled'))) {
    console.error('b2b.digest.enabled is off (turn it on in /admin/flaguri)');
    process.exitCode = 2;
  } else {
    const services = createAlertServices(env, db, log);
    console.log(JSON.stringify(await runB2bDigest({ db, log, mailer: services.mailer, operator: services.operator, secret: services.secret })));
  }
} finally {
  await pool.end();
}
