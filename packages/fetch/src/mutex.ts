import { FetchError } from './errors';

/**
 * FIFO mutex per key (one per host). Holders run one at a time, in arrival order. Used for the
 * "concurrency 1 per host" rule inside a process; across processes only the slot interval holds.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseCurrent();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    };

    if (!signal) {
      await previous;
      return release;
    }
    if (signal.aborted) {
      void previous.then(release);
      throw new FetchError('aborted', 'aborted while waiting for the host lock');
    }
    let onAbort: (() => void) | undefined;
    try {
      await Promise.race([
        previous,
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new FetchError('aborted', 'aborted while waiting for the host lock'));
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } catch (error) {
      // Keep the queue order: our turn is released as soon as the previous holder finishes.
      void previous.then(release);
      throw error;
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
    return release;
  }

  /** Number of keys with a holder or waiters (tests). */
  get size(): number {
    return this.tails.size;
  }
}

/** One lock registry per process, shared by every fetcher instance. */
export const processHostLocks = new KeyedMutex();
