/** pnpm --filter @pretoscop/worker backup [--restore-test] */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createBlobStore } from '@pretoscop/storage';
import { backupDatabase, pruneBackups, restoreTest } from '../ops/backup';

loadRootEnvFile();
const env = getEnv();
const log = createLogger('backup');
const blob = createBlobStore(env);
if (process.argv.includes('--restore-test')) {
  const r = await restoreTest(env, blob, log);
  console.log(`restore test OK from ${r.key}: ${JSON.stringify(r.tables)}`);
} else {
  const r = await backupDatabase(env, blob, log);
  const pruned = await pruneBackups(blob, 14);
  console.log(`backup written: ${blob.describe(r.key)} (${r.bytes} bytes); pruned ${pruned}`);
}
