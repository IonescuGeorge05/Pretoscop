import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * A local stand-in of the Anthropic API for tests and mock runs (no API key exists yet, setup A9).
 * It serves the endpoints the client uses — POST /v1/messages, POST /v1/messages/batches,
 * GET /v1/messages/batches/{id}, GET …/results (JSONL), POST …/cancel — with response bodies in the
 * documented shape (a thinking block before the JSON text, `usage` with the cache breakdown,
 * `service_tier: batch`), checks what the real API would reject (sampling parameters, prefill,
 * forced tool choice, bad custom ids, a missing key) and records every request for assertions.
 * Its answers come from a responder: scripted per test, or the heuristic stand-in in
 * `responders.ts` — never a measurement of model quality.
 */

export interface MockReply {
  /** The structured answer (serialized as the text block). */
  json?: unknown;
  /** Raw text instead of `json` (to test invalid answers). */
  text?: string;
  stopReason?: 'end_turn' | 'max_tokens' | 'refusal';
  /** Overrides of the computed usage. */
  usage?: Partial<Anthropic.Usage>;
}

export type MockBatchOutcome = MockReply | { batchResult: 'errored' | 'expired' | 'canceled' };

export type MockResponder = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  ctx: { mode: 'sync' | 'batch'; customId?: string },
) => MockBatchOutcome | Promise<MockBatchOutcome>;

/** Queued failures for the next calls (sync messages and batch creation). */
export type MockFailure = { status: number; type: string; message?: string; retryAfterSeconds?: number } | { drop: true };

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface MockBatch {
  id: string;
  createdAt: Date;
  requests: Anthropic.Messages.BatchCreateParams.Request[];
  status: 'in_progress' | 'canceling' | 'ended';
  endedAt: Date | null;
  cancelInitiatedAt: Date | null;
  polls: number;
  results: Array<{ custom_id: string; result: unknown }> | null;
}

const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;
/** Rough token count for mock usage figures (about 3.5 bytes per token). */
const tokens = (s: string) => Math.max(1, Math.ceil(Buffer.byteLength(s, 'utf8') / 3.5));
const MIN_CACHEABLE = 512;

export class MockAnthropicServer {
  readonly requests: RecordedRequest[] = [];
  readonly failures: MockFailure[] = [];
  /** Batches end on the n-th status poll after creation (0 = already ended at the first poll). */
  pollsUntilEnded = 1;
  private readonly batches = new Map<string, MockBatch>();
  private readonly cached = new Set<string>();
  private server: Server | null = null;
  private seq = 0;
  url = '';

  constructor(private responder: MockResponder) {}

  setResponder(r: MockResponder): void {
    this.responder = r;
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((e: unknown) => this.error(res, 500, 'api_error', (e as Error).message));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  /** Every request body the API received, for "never sent" assertions. */
  sentBodies(): string {
    return this.requests.map((r) => r.body).join('\n');
  }

  batchIds(): string[] {
    return [...this.batches.keys()];
  }

  /** Ends every open batch now. */
  async endAll(): Promise<void> {
    for (const b of this.batches.values()) if (b.status !== 'ended') await this.finish(b);
  }

  private async read(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  private json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, { 'content-type': 'application/json', 'request-id': `req_mock_${++this.seq}`, ...headers });
    res.end(JSON.stringify(body));
  }

  private error(res: ServerResponse, status: number, type: string, message: string, headers: Record<string, string> = {}): void {
    if (res.headersSent) return;
    this.json(res, status, { type: 'error', error: { type, message }, request_id: `req_mock_${++this.seq}` }, headers);
  }

  /** Returns true when a queued failure was served. */
  private fail(req: IncomingMessage, res: ServerResponse): boolean {
    const f = this.failures.shift();
    if (!f) return false;
    if ('drop' in f) {
      req.socket.destroy();
      return true;
    }
    this.error(res, f.status, f.type, f.message ?? f.type, f.retryAfterSeconds ? { 'retry-after': String(f.retryAfterSeconds) } : {});
    return true;
  }

  /** Rejects what the real API rejects for Claude Haiku 5.5 / Sonnet 5.5 requests. */
  private invalid(p: Anthropic.MessageCreateParamsNonStreaming): string | null {
    const q = p as unknown as Record<string, unknown>;
    if (!p.model || typeof p.max_tokens !== 'number' || p.max_tokens < 1) return 'model and max_tokens are required';
    for (const k of ['temperature', 'top_p', 'top_k']) if (k in q) return `${k}: not supported on this API version`;
    if (!Array.isArray(p.messages) || p.messages.length === 0) return 'messages: at least one message is required';
    if (p.messages[p.messages.length - 1]!.role !== 'user') return 'assistant prefill is not supported on this model';
    const thinking = q.thinking as { type?: string } | undefined;
    if (thinking?.type === 'enabled') return 'thinking.type.enabled is not supported for this model';
    if (thinking?.type === 'disabled' && p.model === 'claude-sonnet-5-5') return '"thinking.type.disabled" is not supported for this model';
    const choice = q.tool_choice as { type?: string } | undefined;
    if (choice && (choice.type === 'any' || choice.type === 'tool')) return 'tool_choice: type "tool" and "any" are not supported for this model.';
    const format = (q.output_config as { format?: { type?: string; schema?: unknown } } | undefined)?.format;
    if (format && (format.type !== 'json_schema' || !format.schema)) return 'output_config.format: json_schema with a schema is required';
    return null;
  }

  private systemText(p: Anthropic.MessageCreateParamsNonStreaming): string {
    if (typeof p.system === 'string') return p.system;
    return (p.system ?? []).map((b) => b.text).join('\n');
  }

  private async message(p: Anthropic.MessageCreateParamsNonStreaming, mode: 'sync' | 'batch', customId?: string): Promise<{ message: Anthropic.Message } | { batchResult: 'errored' | 'expired' | 'canceled' }> {
    const reply = await this.responder(p, { mode, customId });
    if ('batchResult' in reply) return reply;
    const text = reply.text ?? JSON.stringify(reply.json ?? {});
    const system = this.systemText(p);
    const sysTokens = tokens(system);
    const cacheable = Array.isArray(p.system) && p.system.some((b) => b.cache_control) && sysTokens >= MIN_CACHEABLE;
    const key = createHash('sha256').update(`${p.model}\n${system}`).digest('hex');
    const hit = cacheable && this.cached.has(key);
    if (cacheable) this.cached.add(key);
    const userText = p.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    const schemaTokens = tokens(JSON.stringify((p.output_config as { format?: unknown } | undefined)?.format ?? ''));
    const thinkingTokens = 24;
    const usage: Anthropic.Usage = {
      input_tokens: tokens(userText) + schemaTokens + (cacheable ? 0 : sysTokens),
      output_tokens: tokens(text) + thinkingTokens,
      cache_creation_input_tokens: cacheable && !hit ? sysTokens : 0,
      cache_read_input_tokens: hit ? sysTokens : 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: cacheable && !hit ? sysTokens : 0 },
      inference_geo: null,
      output_tokens_details: { thinking_tokens: thinkingTokens },
      server_tool_use: null,
      service_tier: mode === 'batch' ? 'batch' : 'standard',
      speed: null,
      ...reply.usage,
    } as Anthropic.Usage;
    const message = {
      id: `msg_mock_${String(++this.seq).padStart(6, '0')}`,
      type: 'message',
      role: 'assistant',
      model: p.model,
      content: [
        { type: 'thinking', thinking: '', signature: 'mock-signature' },
        { type: 'text', text, citations: null },
      ],
      stop_reason: reply.stopReason ?? 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage,
    } as unknown as Anthropic.Message;
    return { message };
  }

  private batchJson(b: MockBatch): Anthropic.Messages.MessageBatch {
    const counts = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
    if (b.status !== 'ended') counts.processing = b.requests.length;
    else for (const r of b.results ?? []) counts[((r.result as { type: keyof typeof counts }).type)]++;
    return {
      id: b.id,
      type: 'message_batch',
      processing_status: b.status,
      request_counts: counts,
      created_at: b.createdAt.toISOString(),
      expires_at: new Date(b.createdAt.getTime() + 86_400_000).toISOString(),
      ended_at: b.endedAt?.toISOString() ?? null,
      archived_at: null,
      cancel_initiated_at: b.cancelInitiatedAt?.toISOString() ?? null,
      results_url: b.status === 'ended' ? `${this.url}/v1/messages/batches/${b.id}/results` : null,
    };
  }

  private async finish(b: MockBatch): Promise<void> {
    const results: MockBatch['results'] = [];
    for (const r of b.requests) {
      if (b.cancelInitiatedAt) {
        results.push({ custom_id: r.custom_id, result: { type: 'canceled' } });
        continue;
      }
      const out = await this.message(r.params, 'batch', r.custom_id);
      if ('batchResult' in out) {
        results.push({
          custom_id: r.custom_id,
          result:
            out.batchResult === 'errored'
              ? { type: 'errored', error: { type: 'error', error: { type: 'invalid_request_error', message: 'mock error' }, request_id: null } }
              : { type: out.batchResult },
        });
      } else results.push({ custom_id: r.custom_id, result: { type: 'succeeded', message: out.message } });
    }
    b.results = results;
    b.status = 'ended';
    b.endedAt = new Date();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.read(req);
    const path = (req.url ?? '').split('?')[0]!;
    this.requests.push({ method: req.method ?? '', path, headers: req.headers, body });
    const auth = req.headers.authorization ?? req.headers['x-api-key'];
    if (!auth || auth === 'Bearer ') return this.error(res, 401, 'authentication_error', 'invalid x-api-key');

    if (req.method === 'POST' && path === '/v1/messages') {
      if (this.fail(req, res)) return;
      const p = JSON.parse(body) as Anthropic.MessageCreateParamsNonStreaming;
      const bad = this.invalid(p);
      if (bad) return this.error(res, 400, 'invalid_request_error', bad);
      const out = await this.message(p, 'sync');
      if ('batchResult' in out) return this.error(res, 500, 'api_error', 'batch outcome on a sync call');
      return this.json(res, 200, out.message);
    }
    if (req.method === 'POST' && path === '/v1/messages/batches') {
      if (this.fail(req, res)) return;
      const p = JSON.parse(body) as Anthropic.Messages.BatchCreateParams;
      if (!Array.isArray(p.requests) || p.requests.length === 0) return this.error(res, 400, 'invalid_request_error', 'requests: at least one request is required');
      const ids = new Set<string>();
      for (const r of p.requests) {
        if (!CUSTOM_ID.test(r.custom_id) || ids.has(r.custom_id)) return this.error(res, 400, 'invalid_request_error', `custom_id ${r.custom_id}: invalid or duplicated`);
        ids.add(r.custom_id);
        const bad = this.invalid(r.params);
        if (bad) return this.error(res, 400, 'invalid_request_error', `requests.${r.custom_id}: ${bad}`);
      }
      const b: MockBatch = { id: `msgbatch_mock_${String(++this.seq).padStart(6, '0')}`, createdAt: new Date(), requests: p.requests, status: 'in_progress', endedAt: null, cancelInitiatedAt: null, polls: 0, results: null };
      this.batches.set(b.id, b);
      return this.json(res, 200, this.batchJson(b));
    }
    const m = /^\/v1\/messages\/batches\/([^/]+)(\/results|\/cancel)?$/.exec(path);
    if (m) {
      const b = this.batches.get(m[1]!);
      if (!b) return this.error(res, 404, 'not_found_error', `message batch ${m[1]} not found`);
      if (req.method === 'GET' && !m[2]) {
        if (b.status !== 'ended' && b.polls++ >= this.pollsUntilEnded - 1) await this.finish(b);
        return this.json(res, 200, this.batchJson(b));
      }
      if (req.method === 'GET' && m[2] === '/results') {
        if (b.status !== 'ended' || !b.results) return this.error(res, 400, 'invalid_request_error', 'batch has not ended');
        res.writeHead(200, { 'content-type': 'application/binary' });
        res.end(b.results.map((r) => JSON.stringify(r)).join('\n') + '\n');
        return;
      }
      if (req.method === 'POST' && m[2] === '/cancel') {
        if (b.status === 'in_progress') {
          b.cancelInitiatedAt = new Date();
          b.status = 'canceling';
        }
        return this.json(res, 200, this.batchJson(b));
      }
    }
    this.error(res, 404, 'not_found_error', `${req.method} ${path}`);
  }
}
