import 'server-only';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, type Db } from '@pretoscop/db';

loadRootEnvFile();

// One pool per server process (kept on globalThis so dev hot reloads do not leak connections).
const g = globalThis as unknown as { __pretoscopDb?: Db };

export function db(): Db {
  if (!g.__pretoscopDb) {
    const env = getEnv();
    g.__pretoscopDb = createDb(createPool(env.DATABASE_URL, Math.min(env.DATABASE_POOL_MAX, 10)));
  }
  return g.__pretoscopDb;
}

export function serverEnv() {
  return getEnv();
}
