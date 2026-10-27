import {
  activePause,
  applyConsumeDaily,
  applyReserveSlot,
  applySetPause,
  type HostRecord,
} from './record';
import type {
  DailyBudgetResult,
  DomainPause,
  DomainStateStore,
  RobotsCacheEntry,
  SlotReservation,
} from './types';

/** In-process state store (tests, single-process tools). State is lost on exit. */
export class MemoryDomainStateStore implements DomainStateStore {
  private readonly hosts = new Map<string, HostRecord>();
  private readonly robots = new Map<string, RobotsCacheEntry>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  private rec(host: string): HostRecord {
    let rec = this.hosts.get(host);
    if (!rec) {
      rec = {};
      this.hosts.set(host, rec);
    }
    return rec;
  }

  async reserveSlot(host: string, intervalMs: number): Promise<SlotReservation> {
    return applyReserveSlot(this.rec(host), intervalMs, this.now());
  }

  async getPause(host: string): Promise<DomainPause | null> {
    const pause = activePause(this.hosts.get(host), this.now());
    return pause ? { ...pause } : null;
  }

  async setPause(host: string, pause: DomainPause, mode: 'extend' | 'replace'): Promise<DomainPause> {
    return { ...applySetPause(this.rec(host), pause, mode, this.now()) };
  }

  async clearPause(host: string): Promise<void> {
    this.rec(host).pause = null;
  }

  async recordFailure(host: string): Promise<number> {
    const rec = this.rec(host);
    rec.failures = (rec.failures ?? 0) + 1;
    return rec.failures;
  }

  async resetFailures(host: string): Promise<void> {
    this.rec(host).failures = 0;
  }

  async getFailures(host: string): Promise<number> {
    return this.hosts.get(host)?.failures ?? 0;
  }

  async consumeDailyRequest(host: string, day: string, limit: number | null): Promise<DailyBudgetResult> {
    return applyConsumeDaily(this.rec(host), day, limit);
  }

  async getDailyCount(host: string, day: string): Promise<number> {
    return this.hosts.get(host)?.daily?.[day] ?? 0;
  }

  async getRobots(origin: string): Promise<RobotsCacheEntry | null> {
    const entry = this.robots.get(origin);
    return entry ? { ...entry } : null;
  }

  async setRobots(origin: string, entry: RobotsCacheEntry): Promise<void> {
    this.robots.set(origin, { ...entry });
  }
}
