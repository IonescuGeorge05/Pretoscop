import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { Db } from './client';

// Plain path arithmetic (bundlers treat `new URL(…, import.meta.url)` as an asset import).
export const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Session-level advisory lock held while migrations run (M18): the one-shot `migrate` service, a
 * worker starting at the same moment, or two deploys can never apply the same migration twice.
 */
export const MIGRATION_LOCK_KEY = 4_811_620_271;

/** Applies pending migrations (drizzle journal in `migrations/meta`) under the lock. Idempotent. */
export async function runMigrations(db: Db): Promise<void> {
  const pool = (db as unknown as { $client?: pg.Pool }).$client;
  const connectionString = pool?.options?.connectionString;
  if (!connectionString) {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'drizzle' });
    return;
  }
  // A dedicated connection holds the lock, so a small pool cannot starve the migrator.
  const lock = new pg.Client({ connectionString, application_name: 'pretoscop-migrate-lock' });
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'drizzle' });
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await lock.end();
  }
}
