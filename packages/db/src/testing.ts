import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, type Db } from './client';
import { runMigrations } from './migrator';

export interface TestDatabase {
  name: string;
  url: string;
  pool: pg.Pool;
  db: Db;
  drop(): Promise<void>;
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * Creates a throwaway database (migrated) for one test file. Uses TEST_DATABASE_ADMIN_URL;
 * the dev compose Postgres works out of the box. Call `drop()` in `afterAll`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  loadRootEnvFile();
  const env = getEnv();
  const name = `pretoscop_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: env.TEST_DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(env.TEST_DATABASE_ADMIN_URL, name);
  const pool = createPool(url, 5);
  const db = createDb(pool);
  await runMigrations(db);
  return {
    name,
    url,
    pool,
    db,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: env.TEST_DATABASE_ADMIN_URL });
      await a.connect();
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
