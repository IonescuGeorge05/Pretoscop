import Anthropic from '@anthropic-ai/sdk';
import { LlmBudget, LlmBudgetExceededError, monthStartBucharest } from './budget';
import type { LlmLedger, LlmPurpose, ReservationInput } from './ledger';
import { costUsdNanos, NANOS, usageFromApi, usdToEurNanos, worstCaseUsdNanos, type UsageTokens } from './models';
import { promptByVersion } from './prompts';
import type { PromptDef } from './prompts/types';
import { orderByPrefix, parseAnswer, type ParsedAnswer, type PreparedRequest } from './request';

/** pino-compatible subset; the API key is never passed to it. */
export interface LlmLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export class LlmDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmDisabledError';
  }
}

export type FailureKind = 'retry' | 'ambiguous' | 'fatal';

export class LlmCallError extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

export interface LlmClientOptions {
  /** From ANTHROPIC_API_KEY only (setup A9). Never logged. */
  apiKey: string | undefined;
  /** Tests and mock runs: a local stand-in of the API. */
  baseURL?: string;
  ledger: LlmLedger;
  /** LLM_MONTHLY_CAP_EUR */
  capEur: number;
  /** EUR per USD for the ledger (ECB reference rate, or a conservative fallback). */
  eurPerUsd: () => Promise<number> | number;
  timeoutMs?: number;
  /** Attempts of a synchronous call (each attempt reserves anew). */
  maxAttempts?: number;
  log?: LlmLogger;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface CallMeta {
  purpose: LlmPurpose;
  subject?: Record<string, unknown>;
}

export interface CallResult<O> {
  answer: ParsedAnswer<O>;
  usageId: number;
  model: string;
  usage: UsageTokens;
  costUsdNanos: number;
  costEurNanos: number;
}

export interface BatchItem {
  req: PreparedRequest;
  meta: CallMeta;
}

export interface BatchSubmission<T extends BatchItem> {
  batchId: string | null;
  /** Items sent, each with its ledger row id (custom id `u<id>`). */
  submitted: Array<T & { usageId: number }>;
  /** Items left out because the monthly cap would have been exceeded. */
  deferred: T[];
}

/** What the collector knows about each reserved row of a batch. */
export interface BatchRowInfo {
  usageId: number;
  promptId: string;
  promptVersion: string;
  model: string;
  eurPerUsd: number;
}

export interface BatchItemResult {
  customId: string;
  row: BatchRowInfo;
  outcome: 'succeeded' | 'errored' | 'expired' | 'canceled';
  answer: ParsedAnswer<unknown>;
  billed: boolean;
  usage: UsageTokens;
  costUsdNanos: number;
  costEurNanos: number;
}

export interface BatchCollection {
  status: 'in_progress' | 'canceling' | 'ended' | 'missing';
  processed: number;
}

/** Retries only what the API says it did not process; a lost connection may have been billed. */
export function classifyFailure(e: unknown): { kind: FailureKind; status: number | null; message: string; retryAfterMs: number | null } {
  if (e instanceof Anthropic.APIConnectionError) return { kind: 'ambiguous', status: null, message: `connection: ${e.message}`, retryAfterMs: null };
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === 'number' ? e.status : null;
    const ra = Number(e.headers?.get?.('retry-after'));
    const retryAfterMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : null;
    const message = `HTTP ${status ?? '?'} ${e.name}: ${e.message}`.slice(0, 300);
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || status === 408 || status === 409 || status === 529) {
      return { kind: 'retry', status, message, retryAfterMs };
    }
    return { kind: 'fatal', status, message, retryAfterMs: null };
  }
  return { kind: 'ambiguous', status: null, message: `unexpected: ${(e as Error)?.message ?? String(e)}`.slice(0, 300), retryAfterMs: null };
}

/**
 * Anthropic client of Pretoscop (M22, ADR-011, ADR-022). Every call goes through the ledger:
 * reserve the worst case under the monthly cap → send → settle at the billed cost. Synchronous calls
 * use the Messages API; bulk work uses Message Batches (half price, prompt prefix cached for an hour).
 * The SDK's own retries are off: each retry here reserves again, so retries cannot overrun the cap.
 */
export class LlmClient {
  private readonly sdk: Anthropic;
  readonly budget: LlmBudget;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: LlmClientOptions) {
    if (!opts.apiKey) throw new LlmDisabledError('ANTHROPIC_API_KEY is not set (setup A9): the LLM stays off');
    this.sdk = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 120_000,
      // Requests are logged by us (without the key); the SDK must not print them even if ANTHROPIC_LOG is set.
      logLevel: 'off',
    });
    this.now = opts.now ?? (() => new Date());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.budget = new LlmBudget(opts.ledger, opts.capEur, this.now);
  }

  private capNanos(): number {
    return Math.max(0, Math.floor(this.opts.capEur * NANOS));
  }

  private reservation(req: PreparedRequest, meta: CallMeta, mode: 'sync' | 'batch', eurPerUsd: number): ReservationInput {
    const usd = worstCaseUsdNanos(req.model, { maxInputTokens: req.maxInputTokens, maxTokens: req.maxTokens, batch: mode === 'batch' });
    return {
      purpose: meta.purpose,
      model: req.model,
      promptId: req.promptId,
      promptVersion: req.promptVersion,
      mode,
      inputHash: req.inputHash,
      reservedUsdNanos: usd,
      reservedEurNanos: usdToEurNanos(usd, eurPerUsd),
      eurPerUsd,
      subject: meta.subject,
    };
  }

  private async rate(): Promise<number> {
    const r = await this.opts.eurPerUsd();
    if (!(r > 0) || r > 10) throw new Error(`implausible EUR per USD rate ${r}`);
    return r;
  }

  /** One synchronous Messages API call. Throws `LlmBudgetExceededError` when the cap is reached. */
  async call<O>(prompt: PromptDef<never, O>, req: PreparedRequest, meta: CallMeta): Promise<CallResult<O>> {
    if (prompt.id !== req.promptId || prompt.version !== req.promptVersion) throw new Error('call: prompt and request do not match');
    const eurPerUsd = await this.rate();
    const maxAttempts = Math.max(1, this.opts.maxAttempts ?? 3);
    for (let attempt = 1; ; attempt++) {
      const entry = this.reservation(req, meta, 'sync', eurPerUsd);
      const monthStart = monthStartBucharest(this.now());
      const ids = await this.opts.ledger.reserve([entry], this.capNanos(), monthStart);
      if (!ids) throw new LlmBudgetExceededError(await this.budget.status());
      const id = ids[0]!;
      let message: Anthropic.Message;
      try {
        message = await this.sdk.messages.create(req.params);
      } catch (e) {
        const f = classifyFailure(e);
        if (f.kind === 'ambiguous') await this.opts.ledger.estimate([id], f.message);
        else await this.opts.ledger.release(id, f.message);
        this.opts.log?.warn({ model: req.model, prompt: `${req.promptId}@${req.promptVersion}`, attempt, kind: f.kind, status: f.status, error: f.message }, 'llm call failed');
        if (f.kind !== 'fatal' && attempt < maxAttempts) {
          await this.sleep(f.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** attempt));
          continue;
        }
        throw new LlmCallError(f.message, f.kind, f.status);
      }
      const usage = usageFromApi(message.usage);
      const usd = costUsdNanos(req.model, usage, { batch: false });
      const eur = usdToEurNanos(usd, eurPerUsd);
      if (eur > entry.reservedEurNanos) this.opts.log?.warn({ usageId: id, reserved: entry.reservedEurNanos, cost: eur }, 'llm call cost more than its reservation');
      const answer = parseAnswer(prompt as PromptDef<unknown, O>, message);
      await this.opts.ledger.settle(id, { usage, costUsdNanos: usd, costEurNanos: eur, error: answer.ok ? undefined : answer.error });
      return { answer, usageId: id, model: req.model, usage, costUsdNanos: usd, costEurNanos: eur };
    }
  }

  /**
   * Sends a Message Batch with as many items as the month's remaining budget allows (each reserved
   * at its worst case; the rest is returned as `deferred`). Items are ordered by prompt prefix.
   */
  async submitBatch<T extends BatchItem>(items: T[]): Promise<BatchSubmission<T>> {
    if (items.length === 0) return { batchId: null, submitted: [], deferred: [] };
    if (items.length > 100_000) throw new Error('a Message Batch holds at most 100,000 requests');
    const eurPerUsd = await this.rate();
    const ordered = orderByPrefix(items);
    const entries = ordered.map((it) => this.reservation(it.req, it.meta, 'batch', eurPerUsd));
    const cap = this.capNanos();
    let ids: number[] | null = null;
    let take = 0;
    for (let tries = 0; tries < 3 && !ids; tries++) {
      const monthStart = monthStartBucharest(this.now());
      const mtd = await this.opts.ledger.monthToDate(monthStart);
      const room = cap - mtd.spentEurNanos - mtd.reservedEurNanos;
      let sum = 0;
      take = 0;
      while (take < entries.length && sum + entries[take]!.reservedEurNanos <= room) sum += entries[take++]!.reservedEurNanos;
      if (take === 0) return { batchId: null, submitted: [], deferred: ordered };
      // Another process may have reserved meanwhile: `reserve` re-checks under its lock.
      ids = await this.opts.ledger.reserve(entries.slice(0, take), cap, monthStart);
    }
    if (!ids) return { batchId: null, submitted: [], deferred: ordered };
    const requests = ids.map((id, i) => ({ custom_id: `u${id}`, params: ordered[i]!.req.params }));
    let batchId: string;
    try {
      batchId = (await this.sdk.messages.batches.create({ requests })).id;
    } catch (e) {
      const f = classifyFailure(e);
      // A lost connection may have created the batch: keep the reservations as its cost.
      if (f.kind === 'ambiguous') await this.opts.ledger.estimate(ids, `batch create: ${f.message}`);
      else for (const id of ids) await this.opts.ledger.release(id, `batch create: ${f.message}`);
      this.opts.log?.warn({ items: ids.length, kind: f.kind, status: f.status, error: f.message }, 'llm batch create failed');
      throw new LlmCallError(f.message, f.kind, f.status);
    }
    await this.opts.ledger.attachBatch(ids, batchId);
    this.opts.log?.info({ batchId, items: ids.length, deferred: ordered.length - take }, 'llm batch submitted');
    return {
      batchId,
      submitted: ordered.slice(0, take).map((it, i) => ({ ...it, usageId: ids![i]! })),
      deferred: ordered.slice(take),
    };
  }

  /**
   * Reads an ended batch: each result is handed to `onResult` (store it first), then its ledger row
   * is settled (succeeded: billed at half price) or released (errored, expired, canceled: not
   * billed). Rows of an ended batch without a result line keep their reservation as the cost.
   * Idempotent: settled rows are skipped by the ledger, so a crash midway is repaired by the next run.
   */
  async collectBatch(batchId: string, rows: Map<string, BatchRowInfo>, onResult: (r: BatchItemResult) => Promise<void>): Promise<BatchCollection> {
    let batch: Anthropic.Messages.MessageBatch;
    try {
      batch = await this.sdk.messages.batches.retrieve(batchId);
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError) {
        await this.opts.ledger.estimate([...rows.values()].map((r) => r.usageId), 'batch not found');
        this.opts.log?.warn({ batchId }, 'llm batch not found: its reservations stay as cost');
        return { status: 'missing', processed: 0 };
      }
      throw e;
    }
    if (batch.processing_status !== 'ended') return { status: batch.processing_status, processed: 0 };
    const seen = new Set<string>();
    for await (const line of await this.sdk.messages.batches.results(batchId)) {
      const row = rows.get(line.custom_id);
      if (!row || seen.has(line.custom_id)) continue;
      seen.add(line.custom_id);
      if (line.result.type === 'succeeded') {
        const usage = usageFromApi(line.result.message.usage);
        const usd = costUsdNanos(row.model, usage, { batch: true });
        const eur = usdToEurNanos(usd, row.eurPerUsd);
        const prompt = promptByVersion(row.promptId, row.promptVersion);
        const answer: ParsedAnswer<unknown> = prompt ? parseAnswer(prompt, line.result.message) : { ok: false, error: `unknown prompt ${row.promptId}@${row.promptVersion}` };
        await onResult({ customId: line.custom_id, row, outcome: 'succeeded', answer, billed: true, usage, costUsdNanos: usd, costEurNanos: eur });
        await this.opts.ledger.settle(row.usageId, { usage, costUsdNanos: usd, costEurNanos: eur, error: answer.ok ? undefined : answer.error });
      } else {
        const detail = line.result.type === 'errored' ? `${line.result.error?.error?.type ?? 'error'}: ${line.result.error?.error?.message ?? ''}` : '';
        const error = `batch item ${line.result.type}${detail ? ` (${detail})` : ''}`.slice(0, 300);
        await onResult({ customId: line.custom_id, row, outcome: line.result.type, answer: { ok: false, error }, billed: false, usage: usageFromApi(null), costUsdNanos: 0, costEurNanos: 0 });
        await this.opts.ledger.release(row.usageId, error);
      }
    }
    const missing = [...rows.entries()].filter(([cid]) => !seen.has(cid)).map(([, r]) => r.usageId);
    if (missing.length) await this.opts.ledger.estimate(missing, 'no result line in the ended batch');
    return { status: 'ended', processed: seen.size };
  }

  /** Stops a batch (the kill switch): requests not yet processed are not billed. */
  async cancelBatch(batchId: string): Promise<void> {
    await this.sdk.messages.batches.cancel(batchId);
  }
}
