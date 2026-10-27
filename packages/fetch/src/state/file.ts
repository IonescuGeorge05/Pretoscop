import { link, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { KeyedMutex } from '../mutex';
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

interface FileState {
  version: 1;
  hosts: Record<string, HostRecord>;
  robots: Record<string, RobotsCacheEntry>;
}

export interface FileDomainStateStoreOptions {
  now?: () => number;
  /** Give up acquiring the lock after this long. Default 10 s. */
  lockTimeoutMs?: number;
  /** A lock file older than this is considered abandoned. Default 30 s. */
  staleLockMs?: number;
}

const emptyState = (): FileState => ({ version: 1, hosts: {}, robots: {} });

/**
 * State in one JSON file, shared by several processes on one machine (the CLI demo: two
 * invocations within 5 s are throttled). Each update takes an exclusive lock file
 * (`<file>.lock`, created with O_EXCL), reads, changes and atomically replaces the JSON file.
 * Not meant for production: the worker uses the PostgreSQL store.
 */
export class FileDomainStateStore implements DomainStateStore {
  private readonly now: () => number;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private readonly inProcess = new KeyedMutex();

  constructor(
    readonly filePath: string,
    options: FileDomainStateStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 10_000;
    this.staleLockMs = options.staleLockMs ?? 30_000;
  }

  private get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  private async load(): Promise<FileState> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw error;
    }
    try {
      const parsed = JSON.parse(text) as Partial<FileState>;
      if (parsed && parsed.version === 1 && typeof parsed.hosts === 'object' && typeof parsed.robots === 'object') {
        return { version: 1, hosts: parsed.hosts ?? {}, robots: parsed.robots ?? {} };
      }
    } catch {
      // fall through: keep the unreadable file aside and start again
    }
    await rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`).catch(() => undefined);
    return emptyState();
  }

  private async save(state: FileState): Promise<void> {
    const tmp = `${this.filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tmp, this.filePath);
  }

  /** True when the lock file at `path` was left by a dead process or is older than `staleLockMs`. */
  private async isStale(path: string): Promise<boolean> {
    try {
      const info = await stat(path);
      if (Date.now() - info.mtimeMs > this.staleLockMs) return true;
      const owner = JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown };
      if (typeof owner.pid === 'number' && owner.pid !== process.pid) {
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
        }
      }
      return false;
    } catch {
      return false; // lock vanished or is being written: just retry
    }
  }

  /**
   * Breaks a stale lock without racing another process doing the same: the lock is moved aside
   * atomically (only one mover wins), then checked again; if what was moved turns out to be a
   * live lock (another process re-created it in between), it is put back with `link`, which fails
   * instead of overwriting when a newer lock already exists.
   */
  private async breakStaleLock(): Promise<void> {
    const aside = `${this.lockPath}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      await rename(this.lockPath, aside);
    } catch {
      return; // someone else moved or released it
    }
    if (await this.isStale(aside)) {
      await rm(aside, { force: true });
      return;
    }
    await link(aside, this.lockPath).catch(() => undefined);
    await rm(aside, { force: true });
  }

  private async lockFile(): Promise<() => Promise<void>> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        const handle = await open(this.lockPath, 'wx');
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
        } finally {
          await handle.close();
        }
        return () => rm(this.lockPath, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (await this.isStale(this.lockPath)) {
        await this.breakStaleLock();
        continue;
      }
      if (Date.now() > deadline) throw new Error(`FileDomainStateStore: could not lock ${this.lockPath}`);
      await delay(10 + Math.floor(Math.random() * 20));
    }
  }

  /** Runs `fn` on the current state under the lock and saves the result. */
  private async update<T>(fn: (state: FileState) => T): Promise<T> {
    const releaseLocal = await this.inProcess.acquire(this.filePath);
    try {
      const unlock = await this.lockFile();
      try {
        const state = await this.load();
        const result = fn(state);
        await this.save(state);
        return result;
      } finally {
        await unlock();
      }
    } finally {
      releaseLocal();
    }
  }

  private static rec(state: FileState, host: string): HostRecord {
    return (state.hosts[host] ??= {});
  }

  async reserveSlot(host: string, intervalMs: number): Promise<SlotReservation> {
    return this.update((s) => applyReserveSlot(FileDomainStateStore.rec(s, host), intervalMs, this.now()));
  }

  async getPause(host: string): Promise<DomainPause | null> {
    const state = await this.load();
    return activePause(state.hosts[host], this.now());
  }

  async setPause(host: string, pause: DomainPause, mode: 'extend' | 'replace'): Promise<DomainPause> {
    return this.update((s) => ({ ...applySetPause(FileDomainStateStore.rec(s, host), pause, mode, this.now()) }));
  }

  async clearPause(host: string): Promise<void> {
    await this.update((s) => {
      FileDomainStateStore.rec(s, host).pause = null;
    });
  }

  async recordFailure(host: string): Promise<number> {
    return this.update((s) => {
      const rec = FileDomainStateStore.rec(s, host);
      rec.failures = (rec.failures ?? 0) + 1;
      return rec.failures;
    });
  }

  async resetFailures(host: string): Promise<void> {
    await this.update((s) => {
      FileDomainStateStore.rec(s, host).failures = 0;
    });
  }

  async getFailures(host: string): Promise<number> {
    const state = await this.load();
    return state.hosts[host]?.failures ?? 0;
  }

  async consumeDailyRequest(host: string, day: string, limit: number | null): Promise<DailyBudgetResult> {
    return this.update((s) => applyConsumeDaily(FileDomainStateStore.rec(s, host), day, limit));
  }

  async getDailyCount(host: string, day: string): Promise<number> {
    const state = await this.load();
    return state.hosts[host]?.daily?.[day] ?? 0;
  }

  async getRobots(origin: string): Promise<RobotsCacheEntry | null> {
    const state = await this.load();
    return state.robots[origin] ?? null;
  }

  async setRobots(origin: string, entry: RobotsCacheEntry): Promise<void> {
    await this.update((s) => {
      s.robots[origin] = { ...entry };
    });
  }
}
