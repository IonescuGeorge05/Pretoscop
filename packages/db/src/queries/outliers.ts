import { CROSS_SHOP_FLOOR } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/**
 * Cross-shop floor (docs/03 §6.4): an in-stock offer whose total is below 30% of its product's
 * cross-shop median (≥ 2 shops) goes back to the matcher before it can be "cel mai mic preț".
 * Returns the offers sent back. Human decisions (manual matches) are left alone.
 */
export async function sendPriceOutliersToMatcher(db: Db): Promise<number[]> {
  const res = await db.execute<{ id: string }>(sql`
    WITH med AS (
      SELECT product_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY total_price) AS m
      FROM offers
      WHERE product_id IS NOT NULL AND active AND availability = 'in_stock' AND match_status = 'auto' AND condition = 'new'
      GROUP BY product_id
      HAVING count(DISTINCT shop_id) >= 2
    )
    UPDATE offers o SET match_status = 'pending', match_reason = 'price below 30% of the cross-shop median', updated_at = now()
    FROM med
    WHERE o.product_id = med.product_id AND o.match_status = 'auto' AND o.active AND o.availability = 'in_stock'
      AND o.total_price < med.m * ${CROSS_SHOP_FLOOR}
    RETURNING o.id::text
  `);
  return res.rows.map((r) => Number(r.id));
}

/** Records a reference rate (RON per unit of `currency`) for a day (idempotent). */
export async function upsertFxRate(db: Db, day: string, currency: string, rate: string, source = 'ecb'): Promise<void> {
  await db.execute(sql`
    INSERT INTO fx_rates (day, currency, rate, source) VALUES (${day}::date, ${currency}, ${rate}, ${source})
    ON CONFLICT (day, currency) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
  `);
}

export async function latestFxRate(db: Db, currency: string): Promise<{ day: string; rate: string } | null> {
  const res = await db.execute<{ day: string; rate: string }>(
    sql`SELECT day::text, rate::text FROM fx_rates WHERE currency = ${currency} ORDER BY day DESC LIMIT 1`,
  );
  return res.rows[0] ?? null;
}
