import { Dispatcher } from 'undici';
import { REQUEST_CAP_ERROR_CODE } from './detect';

/**
 * Hard request caps for one-off tools (M21 `shops:probe`): a wrapper around the fetcher's
 * dispatcher, so the cap holds for every request the fetch layer makes (robots.txt, redirect hops,
 * retries), not only for the calls the tool counts itself.
 */

export class RequestCapError extends Error {
  readonly code = REQUEST_CAP_ERROR_CODE;
  constructor(max: number) {
    super(`request cap reached (${max} requests)`);
    this.name = 'RequestCapError';
  }
}

/**
 * A dispatcher that lets at most `maxRequests` requests through and starts them at least
 * `minGapMs` apart, whatever their host (the fetcher already spaces requests to one host; a
 * redirect to another host would otherwise not be). Over the cap it throws before anything is
 * sent, which the fetcher reports as a transport error. Spaced requests leave one at a time, each
 * measured from the moment the previous one really started (a late timer never shortens the next
 * gap). The gap is a delay after the fetcher reserved the host's slot: with a shared state store,
 * space requests before the reservation instead (M21 `shops:probe` uses `minGapMs: 0`).
 */
export class CappedDispatcher extends Dispatcher {
  private sent = 0;
  private lastStart = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;

  constructor(
    private readonly inner: Dispatcher,
    private readonly opts: { maxRequests: number; minGapMs: number; now?: () => number },
  ) {
    super();
  }

  /** Requests let through so far. */
  get requests(): number {
    return this.sent;
  }

  override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    if (this.sent >= this.opts.maxRequests) throw new RequestCapError(this.opts.maxRequests);
    this.sent++;
    const now = this.opts.now ?? Date.now;
    const gap = this.opts.minGapMs;
    if (gap <= 0) return this.inner.dispatch(options, handler);
    if (this.queued === 0 && now() >= this.lastStart + gap) {
      this.lastStart = now();
      return this.inner.dispatch(options, handler);
    }
    this.queued++;
    this.queue = this.queue
      .then(async () => {
        for (let wait = this.lastStart + gap - now(); wait > 0; wait = this.lastStart + gap - now()) {
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
        this.lastStart = now();
        try {
          this.inner.dispatch(options, handler);
        } catch (err) {
          // The caller already got `true`: report the failure through the handler (undici 7's legacy and new APIs).
          const h = handler as { onError?: (e: Error) => void; onResponseError?: (c: unknown, e: Error) => void };
          if (h.onError) h.onError(err as Error);
          else h.onResponseError?.(null, err as Error);
        }
      })
      .finally(() => {
        this.queued--;
      });
    return true;
  }

  override close(): Promise<void>;
  override close(callback: () => void): void;
  override close(callback?: () => void): Promise<void> | void {
    // The inner dispatcher belongs to the caller, which closes it.
    if (callback) {
      callback();
      return;
    }
    return Promise.resolve();
  }

  override destroy(): Promise<void>;
  override destroy(err: Error | null): Promise<void>;
  override destroy(callback: () => void): void;
  override destroy(err: Error | null, callback: () => void): void;
  override destroy(a?: Error | null | (() => void), b?: () => void): Promise<void> | void {
    const callback = typeof a === 'function' ? a : b;
    if (callback) {
      callback();
      return;
    }
    return Promise.resolve();
  }
}
