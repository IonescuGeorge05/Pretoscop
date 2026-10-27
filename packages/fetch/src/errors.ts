import type { FetchErrorCode } from './types';

/** Error raised by the fetch layer itself (timeouts, size cap, decoding, aborts). */
export class FetchError extends Error {
  readonly fetchCode: FetchErrorCode;

  constructor(code: FetchErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FetchError';
    this.fetchCode = code;
  }
}

export function fetchCodeOf(error: unknown): FetchErrorCode | undefined {
  const code = (error as { fetchCode?: unknown } | null)?.fetchCode;
  return typeof code === 'string' ? (code as FetchErrorCode) : undefined;
}
