import { type Db, sql } from '@pretoscop/db';
import type { AssistedLedger, AssistedLedgerEntry } from '@pretoscop/fetch/assisted';

/**
 * Name of the transaction-level advisory lock that serialises every booking against the monthly
 * cap, across connections and processes (worker, `assisted:record`, a second worker by mistake).
 */
export const ASSISTED_LEDGER_LOCK = 'pretoscop:assisted:access_costs';

/**
 * `access_costs` (day × shop × vendor) as the assisted channel's ledger (M05B, ADR-022). A call is
 * booked before it is sent, as billable at the shop's price, inside a transaction that holds
 * `ASSISTED_LEDGER_LOCK` and checks the month's total after the booking against the cap: two
 * calls, jobs or processes can never pass the cap together. After the call, an unbilled one is
 * given back (`successes − 1`). The row's cost is recomputed from its counters with the same
 * integer formula as `ledgerRowCostCents` (billable responses at the HTTP price, at most
 * `rendered_requests` of them at the browser price, EUR cents rounded up): exact for a shop on one
 * tier all day, an upper bound otherwise. `successes` therefore means "responses the vendor bills"
 * (plus calls still in flight); the success rate of the channel is measured on `request_log`,
 * which also sees challenge pages the vendor relayed.
 */
export class PgAssistedLedger implements AssistedLedger {
  constructor(private readonly db: Db) {}

  async reserve(e: AssistedLedgerEntry, monthStartDay: string, capCents: number): Promise<boolean> {
    const http = Math.max(0, Math.round(e.pricing.httpCentsPer1k));
    const render = Math.max(http, Math.round(e.pricing.renderCentsPer1k));
    const rendered = e.rendered ? 1 : 0;
    const cap = Math.max(0, Math.floor(capCents));
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ASSISTED_LEDGER_LOCK}, 0))`);
      const shop = await tx.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = ${e.shopSlug}`);
      const shopId = shop.rows[0]?.id;
      if (shopId === undefined) throw new Error(`access_costs: unknown shop "${e.shopSlug}"`);
      // Month total with this row as it would be after the booking.
      const fit = await tx.execute<{ total: string }>(sql`
        WITH cur AS (
          SELECT coalesce(max(successes), 0) AS successes, coalesce(max(rendered_requests), 0) AS rendered
          FROM access_costs WHERE day = ${e.day}::date AND shop_id = ${Number(shopId)} AND vendor = ${e.vendor}
        ),
        next AS (
          SELECT ceil(((successes + 1) * ${http}::int
            + least(rendered + ${rendered}::int, successes + 1) * (${render}::int - ${http}::int)) / 1000.0)::int AS cost
          FROM cur
        )
        SELECT (
          (SELECT coalesce(sum(cost_cents), 0) FROM access_costs
            WHERE day >= ${monthStartDay}::date AND NOT (day = ${e.day}::date AND shop_id = ${Number(shopId)} AND vendor = ${e.vendor}))
          + CASE WHEN ${e.day}::date >= ${monthStartDay}::date THEN (SELECT cost FROM next) ELSE 0 END
        )::text AS total`);
      if (Number(fit.rows[0]?.total ?? Number.POSITIVE_INFINITY) > cap) return false;
      await tx.execute(sql`
        INSERT INTO access_costs AS a (day, shop_id, vendor, requests, rendered_requests, successes, cost_cents)
        VALUES (${e.day}::date, ${Number(shopId)}, ${e.vendor}, 1, ${rendered}::int, 1,
          ceil((${http}::int + ${rendered}::int * (${render}::int - ${http}::int)) / 1000.0)::int)
        ON CONFLICT (day, shop_id, vendor) DO UPDATE SET
          requests = a.requests + 1,
          rendered_requests = a.rendered_requests + EXCLUDED.rendered_requests,
          successes = a.successes + 1,
          cost_cents = ceil((
            (a.successes + 1) * ${http}::int
            + least(a.rendered_requests + EXCLUDED.rendered_requests, a.successes + 1) * (${render}::int - ${http}::int)
          ) / 1000.0)::int`);
      return true;
    });
  }

  async release(e: AssistedLedgerEntry): Promise<void> {
    const http = Math.max(0, Math.round(e.pricing.httpCentsPer1k));
    const render = Math.max(http, Math.round(e.pricing.renderCentsPer1k));
    await this.db.execute(sql`
      UPDATE access_costs a SET
        successes = a.successes - 1,
        cost_cents = ceil(((a.successes - 1) * ${http}::int
          + least(a.rendered_requests, a.successes - 1) * (${render}::int - ${http}::int)) / 1000.0)::int
      FROM shops s
      WHERE s.slug = ${e.shopSlug} AND a.shop_id = s.id AND a.day = ${e.day}::date AND a.vendor = ${e.vendor} AND a.successes > 0`);
  }

  async monthToDateCents(monthStartDay: string): Promise<number> {
    const res = await this.db.execute<{ cents: string }>(
      sql`SELECT coalesce(sum(cost_cents), 0)::text AS cents FROM access_costs WHERE day >= ${monthStartDay}::date`,
    );
    return Number(res.rows[0]?.cents ?? 0);
  }
}
