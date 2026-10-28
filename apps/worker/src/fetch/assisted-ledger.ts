import { type Db, sql } from '@pretoscop/db';
import type { AssistedLedger, AssistedLedgerEntry } from '@pretoscop/fetch/assisted';

/**
 * `access_costs` (day × shop × vendor) as the assisted channel's ledger (M05B). One upsert per
 * vendor call: requests, rendered requests and billable responses are counted, and the row's
 * cost is recomputed from its counters with the same integer formula as `ledgerRowCostCents`
 * (billable responses at the HTTP price, at most `rendered_requests` of them at the browser
 * price, EUR cents rounded up): exact for a shop on one tier all day, an upper bound otherwise.
 * `successes` therefore means "responses the vendor bills"; the success rate of the channel is
 * measured on `request_log`, which also sees challenge pages the vendor relayed.
 */
export class PgAssistedLedger implements AssistedLedger {
  constructor(private readonly db: Db) {}

  async record(e: AssistedLedgerEntry): Promise<void> {
    const http = Math.max(0, Math.round(e.pricing.httpCentsPer1k));
    const render = Math.max(http, Math.round(e.pricing.renderCentsPer1k));
    const rendered = e.rendered ? 1 : 0;
    const billable = e.billable ? 1 : 0;
    const res = await this.db.execute(sql`
      INSERT INTO access_costs AS a (day, shop_id, vendor, requests, rendered_requests, successes, cost_cents)
      SELECT ${e.day}::date, s.id, ${e.vendor}, 1, ${rendered}::int, ${billable}::int,
        ceil((${billable}::int * ${http}::int + least(${rendered}::int, ${billable}::int) * (${render}::int - ${http}::int)) / 1000.0)::int
      FROM shops s WHERE s.slug = ${e.shopSlug}
      ON CONFLICT (day, shop_id, vendor) DO UPDATE SET
        requests = a.requests + 1,
        rendered_requests = a.rendered_requests + EXCLUDED.rendered_requests,
        successes = a.successes + EXCLUDED.successes,
        cost_cents = ceil((
          (a.successes + EXCLUDED.successes) * ${http}::int
          + least(a.rendered_requests + EXCLUDED.rendered_requests, a.successes + EXCLUDED.successes) * (${render}::int - ${http}::int)
        ) / 1000.0)::int
    `);
    if ((res.rowCount ?? 0) === 0) throw new Error(`access_costs: unknown shop "${e.shopSlug}"`);
  }

  async monthToDateCents(monthStartDay: string): Promise<number> {
    const res = await this.db.execute<{ cents: string }>(
      sql`SELECT coalesce(sum(cost_cents), 0)::text AS cents FROM access_costs WHERE day >= ${monthStartDay}::date`,
    );
    return Number(res.rows[0]?.cents ?? 0);
  }
}
