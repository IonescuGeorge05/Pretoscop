import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, type Db } from './client';
import { MIGRATIONS_FOLDER, runMigrations } from './migrator';

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

/** Identifies the migration set: a new or edited migration builds a new template. */
function migrationsHash(): string {
  const h = createHash('sha256');
  for (const f of readdirSync(MIGRATIONS_FOLDER).filter((x) => x.endsWith('.sql')).sort()) h.update(f).update(readFileSync(join(MIGRATIONS_FOLDER, f)));
  h.update(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json')));
  return h.digest('hex').slice(0, 12);
}

/**
 * A migrated template database per migration set, built once under an advisory lock and then only
 * cloned (`CREATE DATABASE … TEMPLATE`, about a second) instead of migrating every test database
 * (slow when several test runs share one PostgreSQL). Connections to it are disallowed so clones
 * never wait for it.
 */
async function ensureTemplate(adminUrl: string): Promise<string> {
  const tpl = `pretoscop_tpl_${migrationsHash()}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query('SELECT pg_advisory_lock(hashtext($1))', [tpl]);
    const row = (await admin.query<{ datistemplate: boolean }>('SELECT datistemplate FROM pg_database WHERE datname = $1', [tpl])).rows[0];
    if (!row?.datistemplate) {
      if (row) await admin.query(`DROP DATABASE ${tpl} WITH (FORCE)`); // a half-built one
      await admin.query(`CREATE DATABASE ${tpl}`);
      const pool = createPool(withDatabase(adminUrl, tpl), 2);
      try {
        await runMigrations(createDb(pool));
      } finally {
        await pool.end();
      }
      await admin.query(`ALTER DATABASE ${tpl} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`);
    }
    return tpl;
  } finally {
    await admin.query('SELECT pg_advisory_unlock(hashtext($1))', [tpl]).catch(() => undefined);
    await admin.end();
  }
}

/**
 * Creates a throwaway database (migrated) for one test file. Uses TEST_DATABASE_ADMIN_URL;
 * the dev compose Postgres works out of the box. Call `drop()` in `afterAll`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  loadRootEnvFile();
  const env = getEnv();
  const name = `pretoscop_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const template = await ensureTemplate(env.TEST_DATABASE_ADMIN_URL);
  const admin = new pg.Client({ connectionString: env.TEST_DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${template}`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(env.TEST_DATABASE_ADMIN_URL, name);
  const pool = createPool(url, 5);
  const db = createDb(pool);
  await runMigrations(db); // no-op on a clone; kept so a stale template can never miss a migration
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
