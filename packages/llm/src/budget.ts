import type { LlmLedger, MonthToDate } from './ledger';
import { NANOS } from './models';

/** Warning level (docs/03 §9: 80 % warning, 100 % hard stop). */
export const WARN_RATIO = 0.8;

export class LlmBudgetExceededError extends Error {
  constructor(readonly status: BudgetStatus) {
    super(
      `LLM monthly cap reached: €${(status.usedEurNanos / NANOS).toFixed(2)} of €${status.capEur.toFixed(2)} used or reserved this month; no call is sent until next month or a higher LLM_MONTHLY_CAP_EUR`,
    );
    this.name = 'LlmBudgetExceededError';
  }
}

/** The calendar month in Europe/Bucharest that contains `now`, as the UTC instant it starts at. */
export function monthStartBucharest(now: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const get = (d: Date) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const p = get(now);
  const y = Number(p.year);
  const m = Number(p.month);
  // Romania is UTC+2 in winter and UTC+3 in summer: midnight on the 1st is 21:00 or 22:00 UTC.
  for (const offset of [2, 3]) {
    const d = new Date(Date.UTC(y, m - 1, 1, -offset));
    const q = get(d);
    if (Number(q.year) === y && Number(q.month) === m && q.day === '01' && q.hour === '00') return d;
  }
  throw new Error(`monthStartBucharest: no local midnight found for ${now.toISOString()}`);
}

export interface BudgetStatus {
  capEur: number;
  capEurNanos: number;
  spentEurNanos: number;
  reservedEurNanos: number;
  /** spent + reserved. */
  usedEurNanos: number;
  /** used / cap (1 when the cap is zero). */
  ratio: number;
  level: 'ok' | 'warn' | 'stop';
  calls: number;
  monthStart: Date;
}

export function budgetStatusOf(mtd: MonthToDate, capEur: number, monthStart: Date): BudgetStatus {
  const capEurNanos = Math.max(0, Math.floor(capEur * NANOS));
  const used = mtd.spentEurNanos + mtd.reservedEurNanos;
  const ratio = capEurNanos > 0 ? used / capEurNanos : 1;
  return {
    capEur,
    capEurNanos,
    spentEurNanos: mtd.spentEurNanos,
    reservedEurNanos: mtd.reservedEurNanos,
    usedEurNanos: used,
    ratio,
    level: ratio >= 1 ? 'stop' : ratio >= WARN_RATIO ? 'warn' : 'ok',
    calls: mtd.calls,
    monthStart,
  };
}

/**
 * The budget guard of the plan's interface contract (`llmBudget.assert()`). The authoritative check
 * is the ledger's atomic `reserve` before every call; `assert()` is the cheap early exit for jobs
 * (nothing to prepare when the month's cap is already used up).
 */
export class LlmBudget {
  constructor(
    private readonly ledger: LlmLedger,
    readonly capEur: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(): Promise<BudgetStatus> {
    const monthStart = monthStartBucharest(this.now());
    return budgetStatusOf(await this.ledger.monthToDate(monthStart), this.capEur, monthStart);
  }

  /** Throws `LlmBudgetExceededError` at 100 % of the monthly cap (spent + in flight). */
  async assert(): Promise<BudgetStatus> {
    const s = await this.status();
    if (s.level === 'stop') throw new LlmBudgetExceededError(s);
    return s;
  }
}
