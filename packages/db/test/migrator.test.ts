import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool } from '../src/client';
import { MIGRATIONS_FOLDER, MIGRATION_LOCK_KEY, runMigrations } from '../src/migrator';
import { createTestDatabase, type TestDatabase } from '../src/testing';

// M18: the one-shot `migrate` service, a worker starting at the same moment and a second deploy
// can all call runMigrations at once; the session advisory lock makes them take turns.
describe('runMigrations takes the migration lock', () => {
  let t: TestDatabase;
  const pools: pg.Pool[] = [];
  beforeAll(async () => {
    t = await createTestDatabase(); // migrated once here
  });
  afterAll(async () => {
    for (const p of pools) await p.end().catch(() => undefined);
    await t?.drop();
  });

  it('waits while another session holds the lock, then completes', async () => {
    const holder = new pg.Client({ connectionString: t.url });
    await holder.connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      let settled = false;
      const run = runMigrations(t.db).then(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 1500));
      expect(settled).toBe(false);
      await holder.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      await run;
      expect(settled).toBe(true);
    } finally {
      await holder.end();
    }
  });

  it('concurrent runs all succeed, apply nothing twice and leave no lock behind', async () => {
    const dbs = [0, 1, 2].map(() => {
      const pool = createPool(t.url, 2);
      pools.push(pool);
      return createDb(pool);
    });
    await Promise.all(dbs.map((db) => runMigrations(db)));
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
    const res = await t.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations');
    expect(Number(res.rows[0]!.n)).toBe(journal.entries.length);
    const locks = await t.pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
    );
    expect(Number(locks.rows[0]!.n)).toBe(0);
  });
});
