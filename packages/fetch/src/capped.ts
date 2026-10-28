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
 * sent, which the fetcher reports as a transport error.
 */
export class CappedDispatcher extends Dispatcher {
  private sent = 0;
  private lastStart = Number.NEGATIVE_INFINITY;

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
    const now = (this.opts.now ?? Date.now)();
    const wait = Math.max(0, this.lastStart + this.opts.minGapMs - now);
    this.lastStart = now + wait;
    if (wait === 0) return this.inner.dispatch(options, handler);
    setTimeout(() => this.inner.dispatch(options, handler), wait);
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
