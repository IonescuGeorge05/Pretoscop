import { ledgerRowCostCents } from './pricing';
import type { AssistedPricing } from './types';

/**
 * Cost ledger of the assisted channel (`access_costs`: day × shop × vendor). The monthly hard cap
 * is enforced here, in packages/fetch, not by callers (docs/03 §5.1), and it can never be passed:
 *
 *   1. before a vendor call, `reserve()` books it as billable, at its full price, but only if the
 *      month's spend after the booking stays within the cap. Bookings are atomic with respect to
 *      each other (one lock in PostgreSQL), so concurrent calls, retries and other processes can
 *      never pass the cap together: a call that does not fit is never sent;
 *   2. after the call, `release()` gives the booking back when the vendor does not bill it
 *      (blocked, timeout, rate limit, refusal, error). A call whose outcome is unknown (the caller
 *      aborted it, the process died) keeps its booking: the ledger errs on the high side.
 *
 * The worker implements it on PostgreSQL (`apps/worker/src/fetch/assisted-ledger.ts`); the memory
 * version serves the tests and the demo, with the same arithmetic.
 */
export interface AssistedLedgerEntry {
  /** Bucharest calendar day, `YYYY-MM-DD` (of the booking; the release uses the same day). */
  day: string;
  shopSlug: string;
  vendor: string;
  /** Browser-rendered tier. */
  rendered: boolean;
  /** Prices of this shop at this vendor (the row's cost is recomputed from its counters). */
  pricing: AssistedPricing;
}

export interface AssistedLedger {
  /**
   * Books one call before it is sent (requests + 1, rendered + 1 when rendered, billable + 1) if
   * the spend from `monthStartDay` on stays within `capCents` afterwards. Returns false, booking
   * nothing, when it does not fit. Throws when the ledger cannot be written (the call is then not
   * sent: no ledger, no spending).
   */
  reserve(entry: AssistedLedgerEntry, monthStartDay: string, capCents: number): Promise<boolean>;
  /** The vendor did not bill the booked call: billable − 1 and the row's cost recomputed. */
  release(entry: AssistedLedgerEntry): Promise<void>;
  /** Spend in EUR cents from `monthStartDay` (inclusive) on, all shops and vendors. */
  monthToDateCents(monthStartDay: string): Promise<number>;
}

export interface LedgerRow {
  day: string;
  shopSlug: string;
  vendor: string;
  requests: number;
  renderedRequests: number;
  /** Responses the vendor bills (booked calls not yet released included). */
  successes: number;
  costCents: number;
}

/** In-memory ledger (tests, demos). Same arithmetic as the PostgreSQL one; synchronous, hence atomic. */
export class MemoryAssistedLedger implements AssistedLedger {
  readonly rows = new Map<string, LedgerRow>();

  private key(e: Pick<AssistedLedgerEntry, 'day' | 'shopSlug' | 'vendor'>): string {
    return `${e.day}|${e.shopSlug}|${e.vendor}`;
  }

  async reserve(e: AssistedLedgerEntry, monthStartDay: string, capCents: number): Promise<boolean> {
    const key = this.key(e);
    const row = this.rows.get(key) ?? { day: e.day, shopSlug: e.shopSlug, vendor: e.vendor, requests: 0, renderedRequests: 0, successes: 0, costCents: 0 };
    const next = { ...row, requests: row.requests + 1, renderedRequests: row.renderedRequests + (e.rendered ? 1 : 0), successes: row.successes + 1 };
    next.costCents = ledgerRowCostCents(next, e.pricing);
    let others = 0;
    for (const [k, r] of this.rows) if (k !== key && r.day >= monthStartDay) others += r.costCents;
    if (others + (next.day >= monthStartDay ? next.costCents : 0) > capCents) return false;
    this.rows.set(key, next);
    return true;
  }

  async release(e: AssistedLedgerEntry): Promise<void> {
    const row = this.rows.get(this.key(e));
    if (!row || row.successes <= 0) return;
    row.successes -= 1;
    row.costCents = ledgerRowCostCents(row, e.pricing);
  }

  async monthToDateCents(monthStartDay: string): Promise<number> {
    let sum = 0;
    for (const r of this.rows.values()) if (r.day >= monthStartDay) sum += r.costCents;
    return sum;
  }
}
