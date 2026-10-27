import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/** Creates missing monthly price_events partitions; returns how many were created. */
export async function ensurePriceEventPartitions(db: Db, monthsBack = 0, monthsAhead = 12): Promise<number> {
  const res = await db.execute<{ created: number }>(
    sql`SELECT ensure_price_event_partitions(${monthsBack}::int, ${monthsAhead}::int) AS created`,
  );
  return Number(res.rows[0]?.created ?? 0);
}

export async function listPriceEventPartitions(db: Db): Promise<string[]> {
  const res = await db.execute<{ name: string }>(sql`
    SELECT c.relname AS name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'price_events'
    ORDER BY c.relname
  `);
  return res.rows.map((r) => r.name);
}

/** request_log keeps 30 days (docs/05 M01). */
export async function pruneRequestLog(db: Db, keepDays = 30): Promise<number> {
  const res = await db.execute(
    sql`DELETE FROM request_log WHERE ts < now() - make_interval(days => ${keepDays}::int)`,
  );
  return res.rowCount ?? 0;
}
