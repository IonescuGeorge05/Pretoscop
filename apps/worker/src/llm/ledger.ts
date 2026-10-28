import {
  type Db,
  llmAttachBatch,
  llmEstimate,
  llmMonthToDate,
  llmRelease,
  llmReserve,
  llmSettle,
} from '@pretoscop/db';
import type { LlmLedger, MonthToDate, ReservationInput, Settlement } from '@pretoscop/llm';

/**
 * `llm_usage` as the client's ledger (M22). The check-and-reserve runs in one transaction under an
 * advisory lock, so the worker job, the CLIs and a second worker can never pass the monthly cap
 * together; settle/release/estimate only touch rows that are still reserved (idempotent).
 */
export class PgLlmLedger implements LlmLedger {
  constructor(private readonly db: Db) {}

  reserve(entries: ReservationInput[], capEurNanos: number, monthStart: Date): Promise<number[] | null> {
    return llmReserve(this.db, entries, capEurNanos, monthStart);
  }

  attachBatch(ids: number[], batchId: string): Promise<void> {
    return llmAttachBatch(this.db, ids, batchId);
  }

  settle(id: number, s: Settlement): Promise<void> {
    return llmSettle(this.db, id, s);
  }

  release(id: number, error: string): Promise<void> {
    return llmRelease(this.db, id, error);
  }

  estimate(ids: number[], error: string): Promise<void> {
    return llmEstimate(this.db, ids, error);
  }

  monthToDate(monthStart: Date): Promise<MonthToDate> {
    return llmMonthToDate(this.db, monthStart);
  }
}
