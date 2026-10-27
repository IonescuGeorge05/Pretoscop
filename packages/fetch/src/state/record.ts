import type { DailyBudgetResult, DomainPause, SlotReservation } from './types';

/** Per-host state as the memory and file stores keep it. Transitions below are pure. */
export interface HostRecord {
  nextSlotAt?: number;
  pause?: DomainPause | null;
  failures?: number;
  daily?: Record<string, number>;
}

/** Days of request counters kept per host (older ones are pruned). */
const DAILY_KEEP = 7;

export function applyReserveSlot(rec: HostRecord, intervalMs: number, now: number): SlotReservation {
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0;
  const startAt = Math.max(now, rec.nextSlotAt ?? 0);
  rec.nextSlotAt = startAt + interval;
  return { startAt, waitMs: startAt - now };
}

export function applySetPause(rec: HostRecord, pause: DomainPause, mode: 'extend' | 'replace', now: number): DomainPause {
  const current = rec.pause && rec.pause.until > now ? rec.pause : null;
  if (mode === 'extend' && current && current.until >= pause.until) return current;
  rec.pause = { ...pause };
  return rec.pause;
}

export function activePause(rec: HostRecord | undefined, now: number): DomainPause | null {
  return rec?.pause && rec.pause.until > now ? rec.pause : null;
}

export function applyConsumeDaily(rec: HostRecord, day: string, limit: number | null): DailyBudgetResult {
  const daily = (rec.daily ??= {});
  const count = daily[day] ?? 0;
  if (limit !== null && count >= limit) return { allowed: false, count };
  daily[day] = count + 1;
  const days = Object.keys(daily).sort();
  for (const old of days.slice(0, Math.max(0, days.length - DAILY_KEEP))) delete daily[old];
  return { allowed: true, count: count + 1 };
}
