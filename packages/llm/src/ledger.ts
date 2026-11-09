import type { UsageTokens } from './models';

/**
 * Cost ledger of every Anthropic call (`llm_usage`, one row per request: a synchronous Messages
 * call or one item of a Message Batch). Each row is created as a *reservation* at the call's
 * worst-case cost before anything is sent, under a lock that also checks the monthly cap, and is
 * later settled at the billed cost, released (not billed) or kept at the reservation (outcome
 * unknown). Month-to-date spend = settled + estimated + open reservations, so the cap holds with
 * batches in flight, concurrent jobs and retries.
 *
 * The worker implements it on PostgreSQL (`apps/worker/src/llm/ledger.ts`); `MemoryLlmLedger`
 * below has the same semantics for tests and mock runs.
 */
export type LlmPurpose = 'match.verify' | 'attributes.extract' | 'category.suggest' | 'eval';

export type LedgerStatus = 'reserved' | 'billed' | 'released' | 'estimated';

export interface ReservationInput {
  purpose: LlmPurpose;
  model: string;
  promptId: string;
  promptVersion: string;
  mode: 'sync' | 'batch';
  inputHash: string;
  reservedUsdNanos: number;
  reservedEurNanos: number;
  eurPerUsd: number;
  /** What the call is about (offer/product ids…); never personal data. */
  subject?: Record<string, unknown>;
}

export interface Settlement {
  usage: UsageTokens;
  costUsdNanos: number;
  costEurNanos: number;
  /** The call was billed but its answer is unusable (refusal, truncated, invalid JSON). */
  error?: string;
}

export interface MonthToDate {
  /** Billed and estimated rows. */
  spentEurNanos: number;
  /** Open reservations (calls in flight). */
  reservedEurNanos: number;
  calls: number;
}

export interface LlmLedger {
  /**
   * Atomically checks `spent + reserved + Σ new ≤ capEurNanos` for the month that starts at
   * `monthStart` and inserts the reservations. Returns their ids in input order, or null (nothing
   * inserted) when the cap would be exceeded.
   */
  reserve(entries: ReservationInput[], capEurNanos: number, monthStart: Date): Promise<number[] | null>;
  /** Records the Anthropic batch id and each row's custom id (`u<id>`). */
  attachBatch(ids: number[], batchId: string): Promise<void>;
  /** Billed: the actual cost replaces the reservation. No-op unless the row is still reserved. */
  settle(id: number, s: Settlement): Promise<void>;
  /** Not billed (the API refused before processing, a batch item errored, expired or was canceled). */
  release(id: number, error: string): Promise<void>;
  /** Outcome unknown (connection lost after sending): the reservation stays as the cost. */
  estimate(ids: number[], error: string): Promise<void>;
  monthToDate(monthStart: Date): Promise<MonthToDate>;
}

export interface LedgerRow extends ReservationInput {
  id: number;
  createdAt: Date;
  status: LedgerStatus;
  batchId: string | null;
  customId: string | null;
  usage: UsageTokens | null;
  costUsdNanos: number;
  costEurNanos: number;
  error: string | null;
}

/** Cost a row counts against the cap with. */
export function countedEurNanos(r: Pick<LedgerRow, 'status' | 'reservedEurNanos' | 'costEurNanos'>): number {
  if (r.status === 'reserved' || r.status === 'estimated') return r.reservedEurNanos;
  if (r.status === 'billed') return r.costEurNanos;
  return 0;
}

/** In-memory ledger (tests, mock runs). Same rules as the PostgreSQL one; single-threaded JS makes `reserve` atomic. */
export class MemoryLlmLedger implements LlmLedger {
  readonly rows: LedgerRow[] = [];
  constructor(private readonly now: () => Date = () => new Date()) {}

  async reserve(entries: ReservationInput[], capEurNanos: number, monthStart: Date): Promise<number[] | null> {
    // No await between the check and the insert: atomic on the single JS thread.
    const mtd = this.mtd(monthStart);
    const add = entries.reduce((s, e) => s + e.reservedEurNanos, 0);
    if (mtd.spentEurNanos + mtd.reservedEurNanos + add > capEurNanos) return null;
    return entries.map((e) => {
      const id = this.rows.length + 1;
      this.rows.push({ ...e, id, createdAt: this.now(), status: 'reserved', batchId: null, customId: null, usage: null, costUsdNanos: 0, costEurNanos: 0, error: null });
      return id;
    });
  }

  private row(id: number): LedgerRow {
    const r = this.rows[id - 1];
    if (!r) throw new Error(`llm ledger: no row ${id}`);
    return r;
  }

  async attachBatch(ids: number[], batchId: string): Promise<void> {
    for (const id of ids) {
      const r = this.row(id);
      r.batchId = batchId;
      r.customId = `u${id}`;
    }
  }

  async settle(id: number, s: Settlement): Promise<void> {
    const r = this.row(id);
    if (r.status !== 'reserved') return;
    Object.assign(r, { status: 'billed', usage: s.usage, costUsdNanos: s.costUsdNanos, costEurNanos: s.costEurNanos, error: s.error ?? null });
  }

  async release(id: number, error: string): Promise<void> {
    const r = this.row(id);
    if (r.status !== 'reserved') return;
    Object.assign(r, { status: 'released', error });
  }

  async estimate(ids: number[], error: string): Promise<void> {
    for (const id of ids) {
      const r = this.row(id);
      if (r.status !== 'reserved') continue;
      Object.assign(r, { status: 'estimated', costUsdNanos: r.reservedUsdNanos, costEurNanos: r.reservedEurNanos, error });
    }
  }

  async monthToDate(monthStart: Date): Promise<MonthToDate> {
    return this.mtd(monthStart);
  }

  private mtd(monthStart: Date): MonthToDate {
    let spent = 0;
    let reserved = 0;
    let calls = 0;
    for (const r of this.rows) {
      if (r.createdAt < monthStart) continue;
      if (r.status === 'reserved') reserved += r.reservedEurNanos;
      else spent += countedEurNanos(r);
      if (r.status !== 'released') calls++;
    }
    return { spentEurNanos: spent, reservedEurNanos: reserved, calls };
  }
}
