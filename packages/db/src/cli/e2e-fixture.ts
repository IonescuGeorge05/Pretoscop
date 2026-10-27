import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../client';
import { createE2eFixture, dropE2eFixture, e2eFixtureClicks } from '../fixtures/e2e';

// Usage: tsx src/cli/e2e-fixture.ts create|drop|clicks — prints JSON on stdout.
loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  const cmd = process.argv[2] ?? 'create';
  if (cmd === 'drop') console.log(JSON.stringify({ dropped: await dropE2eFixture(db) }));
  else if (cmd === 'clicks') console.log(JSON.stringify(await e2eFixtureClicks(db)));
  else console.log(JSON.stringify(await createE2eFixture(db)));
} finally {
  await pool.end();
}
