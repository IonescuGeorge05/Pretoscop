import { CROSS_SHOP_FLOOR } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';

export const PRICE_OUTLIER_HOLD = 'price below 30% of the cross-shop median';

/**
 * Cross-shop floor (docs/03 §6.4): an in-stock offer whose total is below 30% of its product's
 * cross-shop median (≥ 2 shops) is taken off the product before it can be "cel mai mic preț" and
 * held for a human (`review_hold`): it is in the review queue at once, and neither the rules (which
 * would accept the same identity again at their next pass) nor the LLM accept it while the hold is
 * set. A human decision clears it. Returns the offers held. Manual matches are left alone.
 */
export async function sendPriceOutliersToMatcher(db: Db): Promise<number[]> {
  return db.transaction(async (tx) => {
    const res = await tx.execute<{ id: string; product_id: string }>(sql`
      WITH med AS (
        SELECT product_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY total_price) AS m
        FROM offers
        WHERE product_id IS NOT NULL AND active AND availability = 'in_stock' AND match_status = 'auto' AND condition = 'new'
        GROUP BY product_id
        HAVING count(DISTINCT shop_id) >= 2
      )
      UPDATE offers o SET match_status = 'pending', match_reason = ${PRICE_OUTLIER_HOLD}, review_hold = ${PRICE_OUTLIER_HOLD},
        matched_at = now(), updated_at = now()
      FROM med
      WHERE o.product_id = med.product_id AND o.match_status = 'auto' AND o.active AND o.availability = 'in_stock'
        AND o.total_price < med.m * ${CROSS_SHOP_FLOOR}
      RETURNING o.id::text, o.product_id::text
    `);
    for (const r of res.rows) {
      await tx.execute(sql`
        INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
        VALUES (${Number(r.id)}, ${Number(r.product_id)}, 'needs_review', 'outlier', ${PRICE_OUTLIER_HOLD}, NULL)
      `);
    }
    return res.rows.map((r) => Number(r.id));
  });
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
