import type { DailyBudgetResult, DomainPause, DomainStateStore, RobotsCacheEntry, SlotReservation } from './types';

/**
 * A `DomainStateStore` for requests we make on someone else's behalf (M20: the feed checks and
 * domain probes a merchant asks for). It shares the politeness of the crawler and nothing else:
 *
 * - `reserveSlot` goes to the shared store under the real host, so the minimum interval between
 *   two requests to a host holds across ALL our requests, the crawler's included;
 * - the crawler's pauses are obeyed (`getPause` returns the later of the shared and the scoped
 *   pause), and a robots.txt the crawler cached is used while it is the fresher one;
 * - everything such a request learns or spends is written under `<namespace>:<host>` keys (pauses,
 *   failure streaks, the daily request count, robots.txt fetched by it), so a refusal provoked
 *   through a merchant-supplied URL can never pause the crawler's access to a host, mark its
 *   robots.txt unreadable or use up its daily budget.
 *
 * The crawler itself keeps using the shared store directly: its behaviour does not change.
 */
export class ScopedDomainStateStore implements DomainStateStore {
  constructor(
    private readonly shared: DomainStateStore,
    readonly namespace: string,
  ) {
    if (!/^[a-z][a-z0-9-]*$/.test(namespace)) throw new RangeError(`invalid state namespace "${namespace}"`);
  }

  /** The key this store writes under for a host or an origin. */
  scopedKey(hostOrOrigin: string): string {
    return `${this.namespace}:${hostOrOrigin}`;
  }

  reserveSlot(host: string, intervalMs: number): Promise<SlotReservation> {
    return this.shared.reserveSlot(host, intervalMs);
  }

  async getPause(host: string): Promise<DomainPause | null> {
    const [shared, own] = await Promise.all([this.shared.getPause(host), this.shared.getPause(this.scopedKey(host))]);
    return later(shared, own);
  }

  async setPause(host: string, pause: DomainPause, mode: 'extend' | 'replace'): Promise<DomainPause> {
    const own = await this.shared.setPause(this.scopedKey(host), pause, mode);
    return later(await this.shared.getPause(host), own) ?? own;
  }

  clearPause(host: string): Promise<void> {
    return this.shared.clearPause(this.scopedKey(host));
  }

  recordFailure(host: string): Promise<number> {
    return this.shared.recordFailure(this.scopedKey(host));
  }

  resetFailures(host: string): Promise<void> {
    return this.shared.resetFailures(this.scopedKey(host));
  }

  getFailures(host: string): Promise<number> {
    return this.shared.getFailures(this.scopedKey(host));
  }

  consumeDailyRequest(host: string, day: string, limit: number | null): Promise<DailyBudgetResult> {
    return this.shared.consumeDailyRequest(this.scopedKey(host), day, limit);
  }

  getDailyCount(host: string, day: string): Promise<number> {
    return this.shared.getDailyCount(this.scopedKey(host), day);
  }

  async getRobots(origin: string): Promise<RobotsCacheEntry | null> {
    const [shared, own] = await Promise.all([this.shared.getRobots(origin), this.shared.getRobots(this.scopedKey(origin))]);
    if (!shared) return own ? { ...own, origin } : null;
    if (!own) return shared;
    return own.fetchedAt > shared.fetchedAt ? { ...own, origin } : shared;
  }

  setRobots(origin: string, entry: RobotsCacheEntry): Promise<void> {
    return this.shared.setRobots(this.scopedKey(origin), entry);
  }
}

function later(a: DomainPause | null, b: DomainPause | null): DomainPause | null {
  if (!a) return b;
  if (!b) return a;
  return b.until > a.until ? b : a;
}
