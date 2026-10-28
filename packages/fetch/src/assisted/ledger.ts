import { ledgerRowCostCents } from './pricing';
import type { AssistedPricing } from './types';

/**
 * Cost ledger of the assisted channel (`access_costs`: day × shop × vendor). The fetch layer writes
 * one entry per vendor call and reads the month-to-date total before every call: the monthly cap
 * is enforced here, in packages/fetch, not by callers (docs/03 §5.1). The worker implements it on
 * PostgreSQL (`apps/worker/src/fetch/assisted-ledger.ts`); the memory version serves the tests.
 */
export interface AssistedLedgerEntry {
  /** Bucharest calendar day, `YYYY-MM-DD`. */
  day: string;
  shopSlug: string;
  vendor: string;
  /** Browser-rendered tier. */
  rendered: boolean;
  /** The vendor bills this call. */
  billable: boolean;
  /** Prices of this shop at this vendor (the row's cost is recomputed from its counters). */
  pricing: AssistedPricing;
}

export interface AssistedLedger {
  record(entry: AssistedLedgerEntry): Promise<void>;
  /** Spend in EUR cents from `monthStartDay` (inclusive) on, all shops and vendors. */
  monthToDateCents(monthStartDay: string): Promise<number>;
}

export interface LedgerRow {
  day: string;
  shopSlug: string;
  vendor: string;
  requests: number;
  renderedRequests: number;
  successes: number;
  costCents: number;
}

/** In-memory ledger (tests, demos). Same arithmetic as the PostgreSQL one. */
export class MemoryAssistedLedger implements AssistedLedger {
  readonly rows = new Map<string, LedgerRow>();

  async record(e: AssistedLedgerEntry): Promise<void> {
    const key = `${e.day}|${e.shopSlug}|${e.vendor}`;
    const row = this.rows.get(key) ?? { day: e.day, shopSlug: e.shopSlug, vendor: e.vendor, requests: 0, renderedRequests: 0, successes: 0, costCents: 0 };
    row.requests += 1;
    if (e.rendered) row.renderedRequests += 1;
    if (e.billable) row.successes += 1;
    row.costCents = ledgerRowCostCents(row, e.pricing);
    this.rows.set(key, row);
  }

  async monthToDateCents(monthStartDay: string): Promise<number> {
    let sum = 0;
    for (const r of this.rows.values()) if (r.day >= monthStartDay) sum += r.costCents;
    return sum;
  }
}
