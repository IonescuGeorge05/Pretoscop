import type { BlockReason, Channel } from '../types';

/**
 * Shared per-host crawl state. Hosts are `URL.host` values (lower-case, port only when not the
 * default), e.g. `www.dedeman.ro`. robots.txt entries are keyed by origin (`https://www.dedeman.ro`).
 *
 * Implementations: `MemoryDomainStateStore` (tests, single process), `FileDomainStateStore`
 * (CLI demo, several processes on one machine), and the PostgreSQL store written by the worker
 * (M05). Every method must be atomic per host; the README gives the SQL for each.
 */
export interface DomainStateStore {
  /**
   * Reserves the next request start for `host`: `startAt = max(now, nextFree)`, then
   * `nextFree = startAt + intervalMs`. Two reservations for one host, in any process, are never
   * less than `intervalMs` apart. `waitMs = startAt - now` on the store's own clock, so callers
   * sleep a relative duration and clock skew between processes cannot shrink the gap.
   */
  reserveSlot(host: string, intervalMs: number): Promise<SlotReservation>;

  getPause(host: string): Promise<DomainPause | null>;
  /**
   * `extend` (automatic pauses) keeps whichever pause ends later; `replace` (manual
   * `pauseDomain`) overwrites. Returns the pause now in force.
   */
  setPause(host: string, pause: DomainPause, mode: 'extend' | 'replace'): Promise<DomainPause>;
  clearPause(host: string): Promise<void>;

  /** Increments the consecutive-failure counter and returns the new value. */
  recordFailure(host: string): Promise<number>;
  resetFailures(host: string): Promise<void>;
  getFailures(host: string): Promise<number>;

  /**
   * Counts one request against the host's budget for `day` (Europe/Bucharest date, `YYYY-MM-DD`).
   * When `limit` is a number and the count already reached it, nothing is counted and
   * `allowed` is false. `limit: null` always counts and allows.
   */
  consumeDailyRequest(host: string, day: string, limit: number | null): Promise<DailyBudgetResult>;
  getDailyCount(host: string, day: string): Promise<number>;

  getRobots(origin: string): Promise<RobotsCacheEntry | null>;
  setRobots(origin: string, entry: RobotsCacheEntry): Promise<void>;
}

export interface SlotReservation {
  /** Epoch ms (store clock) at which the request may start. */
  startAt: number;
  /** `startAt - now` on the store clock, never negative. */
  waitMs: number;
}

export interface DomainPause {
  /** Epoch ms. The host is paused while `now < until`. */
  until: number;
  /** Human-readable cause, e.g. `challenge: Cloudflare challenge (cf-mitigated: challenge)`. */
  reason: string;
  /** Epoch ms when the pause was set. */
  setAt: number;
  source: 'auto' | 'manual';
  blockReason?: BlockReason;
}

export interface DailyBudgetResult {
  allowed: boolean;
  /** Requests counted for the day after this call. */
  count: number;
}

export type RobotsOutcome = 'parsed' | 'not_found' | 'unreachable' | 'blocked' | 'too_many_redirects';

/** One robots.txt fetch, cached ≤ 24 h (failures 1 h). */
export interface RobotsCacheEntry {
  origin: string;
  fetchedAt: number;
  expiresAt: number;
  /** HTTP status; 0 when no response. */
  status: number;
  outcome: RobotsOutcome;
  /** Raw robots.txt text when `outcome === 'parsed'` (≤ 512 KiB). */
  body: string | null;
  etag?: string | null;
  lastModified?: string | null;
  finalUrl?: string | null;
  truncated?: boolean;
  htmlBody?: boolean;
  blockReason?: BlockReason | null;
  detail?: string | null;
  channel?: Channel;
}
