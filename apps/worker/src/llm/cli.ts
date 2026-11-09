import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { type Db, isFlagEnabled } from '@pretoscop/db';
import { type LlmClient, LlmClient as Client, type LlmLedger, MemoryLlmLedger } from '@pretoscop/llm';
import { heuristicResponder, MOCK_API_KEY, MockAnthropicServer } from '@pretoscop/llm/mock';
import { createWorkerLlm, eurPerUsdFrom, type LlmSettings } from './factory';

export const MOCK_BANNER = [
  '================================================================================',
  ' MOCK RUN: answers come from a local stand-in of the API (our own rule-based code),',
  ' not from Claude. Numbers below show that the pipeline works; they are NOT an',
  ' evaluation of the LLM and cost figures are simulated. Nothing is billed.',
  '================================================================================',
].join('\n');

export interface CliLlm {
  llm: LlmClient;
  settings: LlmSettings;
  ledger: LlmLedger | null;
  mock: boolean;
  close(): Promise<void>;
}

/**
 * The client for a CLI: with `--mock`, a local stand-in of the API and an in-memory ledger (nothing
 * billed, nothing written to `llm_usage`); otherwise the real client, which needs ANTHROPIC_API_KEY
 * (setup A9) and, because every call spends money, the flag `llm.matching.enabled`.
 */
export async function cliLlm(env: Env, db: Db, log: Logger, opts: { mock: boolean }): Promise<CliLlm | { error: string }> {
  if (opts.mock) {
    const server = new MockAnthropicServer(heuristicResponder);
    await server.start();
    const ledger = new MemoryLlmLedger();
    const { settings } = createWorkerLlm({ ...env, ANTHROPIC_API_KEY: undefined }, db, log);
    const llm = new Client({ apiKey: MOCK_API_KEY, baseURL: server.url, ledger, capEur: env.LLM_MONTHLY_CAP_EUR, eurPerUsd: eurPerUsdFrom(db, env, log), log });
    return { llm, settings, ledger, mock: true, close: () => server.stop() };
  }
  const w = createWorkerLlm(env, db, log);
  if (!w.llm) return { error: `${w.reason}. Use --mock to see the pipeline work, or --dry-run to see what would be sent.` };
  if (!(await isFlagEnabled(db, 'llm.matching.enabled'))) return { error: 'flag llm.matching.enabled is off: real LLM calls spend money; switch it on in /admin/flaguri first (or use --mock / --dry-run)' };
  return { llm: w.llm, settings: w.settings, ledger: null, mock: false, close: async () => undefined };
}

export const eur = (nanos: number, digits = 4) => `€${(nanos / 1e9).toFixed(digits)}`;
