import { createHash } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { priceOf } from './models';
import { InvalidOutputError, type PromptDef } from './prompts/types';

/** Body of one Messages API request (also one Message Batch item). */
export type MessageParams = Anthropic.MessageCreateParamsNonStreaming;

/** Model, effort and output budget of one kind of call (ADR-022 model routing). */
export interface Route {
  model: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
}

export interface Routes {
  /** Claude Haiku 5.5 by default (LLM_MODEL_DEFAULT). */
  default: Route;
  /** Claude Sonnet 5.5 for low-confidence answers and high-value products (LLM_MODEL_ESCALATION). */
  escalation: Route;
}

/**
 * Adaptive thinking stays on (the default of both models; it cannot be turned off on Sonnet 5.5)
 * at a low effort for the high-volume route; thinking tokens are billed as output and bounded by
 * `maxTokens`, which the reservation counts in full.
 */
export function defaultRoutes(models: { default: string; escalation: string }): Routes {
  return {
    default: { model: models.default, effort: 'low', maxTokens: 2048 },
    escalation: { model: models.escalation, effort: 'medium', maxTokens: 4096 },
  };
}

/** A request built by a prompt module: the only thing the client sends. */
export interface PreparedRequest {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly params: Anthropic.MessageCreateParamsNonStreaming;
  /** sha256 of the exact request body: identical inputs are answered once. */
  readonly inputHash: string;
  /** Requests with the same key share the cached prefix (model + system + schema + effort). */
  readonly prefixKey: string;
  /** Upper bound of prompt tokens (UTF-8 bytes of the body plus a fixed allowance). */
  readonly maxInputTokens: number;
  readonly maxTokens: number;
}

/** Tokens never outnumber UTF-8 bytes; this covers the API's own framing and the schema's grammar. */
export const INPUT_TOKEN_ALLOWANCE = 2048;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function prepare<I>(prompt: PromptDef<I, unknown>, route: Route, input: I): PreparedRequest {
  priceOf(route.model); // refuses models without a price before anything is built
  const user = prompt.user(input);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: route.model,
    max_tokens: route.maxTokens,
    // The shared instructions are the cached prefix: 1-hour TTL, because batch items sharing it are
    // processed over minutes to an hour (best effort inside Message Batches).
    system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: route.effort, format: { type: 'json_schema', schema: prompt.schema } },
  };
  const body = JSON.stringify(params);
  return {
    promptId: prompt.id,
    promptVersion: prompt.version,
    model: route.model,
    params,
    inputHash: sha256(body),
    prefixKey: `${route.model}|${prompt.id}@${prompt.version}|${route.effort}|${sha256(prompt.system + JSON.stringify(prompt.schema)).slice(0, 16)}`,
    maxInputTokens: Buffer.byteLength(body, 'utf8') + INPUT_TOKEN_ALLOWANCE,
    maxTokens: route.maxTokens,
  };
}

/**
 * Batch order: items sharing a prompt prefix are adjacent (prompt caching inside a batch is best
 * effort, and neighbours are more likely to hit the entry the first one wrote), then by input for a
 * deterministic order.
 */
export function orderByPrefix<T extends { req: PreparedRequest }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.req.prefixKey < b.req.prefixKey ? -1 : a.req.prefixKey > b.req.prefixKey ? 1 : a.req.inputHash < b.req.inputHash ? -1 : a.req.inputHash > b.req.inputHash ? 1 : 0));
}

export type ParsedAnswer<O> = { ok: true; value: O } | { ok: false; error: string };

/** Reads the answer of a Messages API response (thinking blocks first, then the JSON text). */
export function parseAnswer<O>(prompt: PromptDef<unknown, O>, message: Pick<Anthropic.Message, 'content' | 'stop_reason'>): ParsedAnswer<O> {
  if (message.stop_reason === 'refusal') return { ok: false, error: 'refusal' };
  if (message.stop_reason === 'max_tokens') return { ok: false, error: 'truncated (max_tokens)' };
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) return { ok: false, error: 'no text in the answer' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'answer is not JSON' };
  }
  try {
    return { ok: true, value: prompt.parse(json) };
  } catch (e) {
    return { ok: false, error: e instanceof InvalidOutputError ? e.message : `invalid answer: ${(e as Error).message}` };
  }
}
