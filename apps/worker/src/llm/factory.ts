import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { type Db, latestEurPerUsd } from '@pretoscop/db';
import { type GrayPolicy } from '@pretoscop/core';
import { defaultRoutes, type LlmClient, LlmClient as Client, type LlmLedger, priceOf, type Routes } from '@pretoscop/llm';
import { PgLlmLedger } from './ledger';

export interface LlmSettings {
  routes: Routes;
  policy: GrayPolicy;
  autoReject: boolean;
  highValueRon: number;
  maxRequests: number;
}

export function llmSettings(env: Env): LlmSettings {
  const routes = defaultRoutes({ default: env.LLM_MODEL_DEFAULT, escalation: env.LLM_MODEL_ESCALATION });
  // Refuse models without a price at start-up, not mid-batch.
  priceOf(routes.default.model);
  priceOf(routes.escalation.model);
  return {
    routes,
    policy: { acceptAt: env.LLM_ACCEPT_CONFIDENCE, rejectAt: env.LLM_REJECT_CONFIDENCE },
    autoReject: env.LLM_AUTO_REJECT,
    highValueRon: env.LLM_HIGH_VALUE_RON,
    maxRequests: Math.max(1, env.LLM_BATCH_MAX_REQUESTS),
  };
}

/** EUR per USD: the ECB rate stored by fx.rates when recent, else the conservative fallback. */
export function eurPerUsdFrom(db: Db, env: Env, log?: Pick<Logger, 'warn'>): () => Promise<number> {
  let warned = false;
  return async () => {
    const r = await latestEurPerUsd(db).catch(() => null);
    if (r) return r;
    if (!warned) log?.warn({ fallback: env.LLM_EUR_PER_USD_FALLBACK }, 'no recent ECB EUR/USD rate: using LLM_EUR_PER_USD_FALLBACK');
    warned = true;
    return env.LLM_EUR_PER_USD_FALLBACK;
  };
}

/**
 * The worker's Anthropic client, or the reason there is none (no ANTHROPIC_API_KEY: setup A9).
 * The key is read only from the environment and handed to the SDK; it is never logged.
 */
export function createWorkerLlm(
  env: Env,
  db: Db,
  log: Logger,
  opts: { ledger?: LlmLedger; apiKey?: string; baseURL?: string } = {},
): { llm: LlmClient | null; reason: string | null; settings: LlmSettings } {
  const settings = llmSettings(env);
  const apiKey = opts.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) return { llm: null, reason: 'ANTHROPIC_API_KEY is not set (setup A9)', settings };
  const llm = new Client({
    apiKey,
    baseURL: opts.baseURL ?? env.ANTHROPIC_BASE_URL,
    ledger: opts.ledger ?? new PgLlmLedger(db),
    capEur: env.LLM_MONTHLY_CAP_EUR,
    eurPerUsd: eurPerUsdFrom(db, env, log),
    log,
  });
  return { llm, reason: null, settings };
}
