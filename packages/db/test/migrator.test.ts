import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../src/client';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrator';

// M18: the one-shot `migrate` service, a worker starting at the same moment and a second deploy
// can all call runMigrations at once; the advisory lock makes them take turns.
describe('runMigrations under concurrency', () => {
  loadRootEnvFile();
  const env = getEnv();
  const name = `pretoscop_migr_${process.pid}_${randomBytes(3).toString('hex')}`;
  const url = (() => {
    const u = new URL(env.TEST_DATABASE_ADMIN_URL);
    u.pathname = `/${name}`;
    return u.toString();
  })();
  const pools: pg.Pool[] = [];

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: env.TEST_DATABASE_ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
  });

  afterAll(async () => {
    for (const p of pools) await p.end().catch(() => undefined);
    const admin = new pg.Client({ connectionString: env.TEST_DATABASE_ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  // Three full migration passes in a row (the lock serializes them): generous on a loaded machine.
  it('applies every migration exactly once when three migrators race on an empty database', { timeout: 180_000 }, async () => {
    const dbs = [0, 1, 2].map(() => {
      const pool = createPool(url, 2);
      pools.push(pool);
      return createDb(pool);
    });
    await Promise.all(dbs.map((db) => runMigrations(db)));
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
    const res = await pools[0]!.query<{ n: string }>('SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations');
    expect(Number(res.rows[0]!.n)).toBe(journal.entries.length);
    // The lock is released: a later run is a quick no-op.
    await runMigrations(dbs[0]!);
    const locks = await pools[0]!.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
    );
    expect(Number(locks.rows[0]!.n)).toBe(0);
  });
});
