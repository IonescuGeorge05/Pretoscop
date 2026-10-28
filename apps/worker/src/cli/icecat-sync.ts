/**
 * Runs one Icecat enrichment pass now (what the daily `icecat.sync` job does):
 *   pnpm --filter @pretoscop/worker icecat:sync [--limit 50]
 *   pnpm --filter @pretoscop/worker icecat:sync --mock --database-url postgres://…/<scratch db>
 * Live: needs the flag `icecat.enabled` and ICECAT_USERNAME. `--mock` uses the local stand-in with
 * synthetic data and is refused against the main database (synthetic datasheets must never reach
 * real products): pass the URL of a scratch database.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, isFlagEnabled } from '@pretoscop/db';
import { startIcecatMock } from '@pretoscop/icecat/mock';
import { createBlobStore } from '@pretoscop/storage';
import { createWorkerIcecat, icecatLangs } from '../icecat/client';
import { syncIcecat } from '../icecat/sync';

loadRootEnvFile();
const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    mock: { type: 'boolean' },
    'database-url': { type: 'string' },
  },
});
const env = getEnv();
const url = values['database-url'] ?? env.DATABASE_URL;
const dbName = new URL(url).pathname.replace(/^\//, '');
if (values.mock && (dbName === 'pretoscop' || !values['database-url'])) {
  console.error(
    '--mock writes synthetic datasheets: give --database-url of a scratch database (not "pretoscop").',
  );
  process.exit(64);
}
const log = createLogger('icecat-sync');
const pool = createPool(url, 3);
const db = createDb(pool);
const mock = values.mock ? await startIcecatMock() : null;
try {
  if (!mock && !(await isFlagEnabled(db, 'icecat.enabled'))) {
    console.error(
      'flag icecat.enabled is off: nothing done (turn it on in /admin/flaguri once the product page shows the Icecat credit).',
    );
    process.exitCode = 3;
  } else {
    const icecat = createWorkerIcecat(
      mock ? { ...env, ICECAT_MIN_INTERVAL_MS: 0 } : env,
      db,
      log,
      mock ? { baseUrl: mock.apiUrl, shopname: 'demo-mock' } : {},
    );
    try {
      const stats = await syncIcecat(
        { db, blob: createBlobStore(env), client: icecat.client, log },
        {
          langs: icecatLangs(env),
          limit: values.limit ? Number(values.limit) : env.ICECAT_DAILY_BATCH,
        },
      );
      console.log(JSON.stringify(stats, null, 2));
    } finally {
      await icecat.close();
    }
  }
} finally {
  await mock?.close();
  await pool.end();
}
