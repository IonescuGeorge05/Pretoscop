import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../client';
import { seedDev } from '../seed';

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
try {
  const result = await seedDev(createDb(pool));
  console.log(`seed done: ${result.shops} shops, known flags ensured`);
} finally {
  await pool.end();
}
