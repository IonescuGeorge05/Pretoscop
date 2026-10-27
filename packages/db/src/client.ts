import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** One pool per process. numeric and bigint columns come back as strings unless mapped. */
export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, application_name: 'pretoscop' });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
