/**
 * A versioned prompt. The text lives in git next to its version; any change to `system`, `schema`
 * or the user-message layout needs a new version (a test pins each version's fingerprint), because
 * stored answers, the ledger and the eval are keyed by `id@version`. Old versions stay in the
 * registry while batches sent with them may still be collected.
 */
export interface PromptDef<I, O> {
  id: string;
  version: string;
  /** Shared by every request of this prompt: the cached prefix (no per-item data here). */
  system: string;
  /** JSON schema of the answer (structured outputs: every object closed, no numeric bounds). */
  schema: Record<string, unknown>;
  /** The per-item user message, built only from sanitized fields. */
  user(input: I): string;
  /** Validates the decoded JSON answer; throws on anything unexpected. */
  parse(json: unknown): O;
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

export function asObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidOutputError(`${what}: not an object`);
  return v as Record<string, unknown>;
}

export function clamp01(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidOutputError(`${what}: not a number`);
  return Math.min(1, Math.max(0, v));
}
