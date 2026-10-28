import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../client';
import { affiliateAllow, affiliateRestore, affiliateSyncForbidden, createE2eFixture, dropE2eFixture, e2eFixtureClicks } from '../fixtures/e2e';

// Usage: tsx src/cli/e2e-fixture.ts create|drop|clicks|affiliate-allow|affiliate-sync-forbidden|affiliate-restore [true|false] — prints JSON.
loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  const cmd = process.argv[2] ?? 'create';
  if (cmd === 'drop') console.log(JSON.stringify({ dropped: await dropE2eFixture(db) }));
  else if (cmd === 'clicks') console.log(JSON.stringify(await e2eFixtureClicks(db)));
  else if (cmd === 'affiliate-allow') console.log(JSON.stringify(await affiliateAllow(db)));
  else if (cmd === 'affiliate-sync-forbidden') console.log(JSON.stringify({ changes: await affiliateSyncForbidden(db) }));
  else if (cmd === 'affiliate-restore') console.log(JSON.stringify({ restored: await affiliateRestore(db, process.argv[3] === 'true') }));
  else console.log(JSON.stringify(await createE2eFixture(db)));
} finally {
  await pool.end();
}
