import http from 'node:http';
import https from 'node:https';

/**
 * Minimal Meilisearch client (REST, JSON) on node:http. Deliberately not `fetch`: inside Next.js
 * the global fetch is patched, and an uncached fetch would turn an ISR page dynamic. Only the
 * handful of endpoints Pretoscop uses are wrapped; everything else goes through `request`.
 */
export interface MeiliConfig {
  /** e.g. http://localhost:7700 */
  url: string;
  apiKey?: string;
  /** Per-request timeout (default 10 s). */
  timeoutMs?: number;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class MeiliError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MeiliError';
  }
}

export interface EnqueuedTask {
  taskUid: number;
  indexUid: string | null;
  status: string;
  type: string;
}

export interface Task {
  uid: number;
  indexUid: string | null;
  status: 'enqueued' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  type: string;
  error: { message: string; code: string } | null;
  details?: Record<string, unknown>;
}

export interface Meili {
  readonly url: string;
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
  /** Polls a task until it succeeds; throws on failure, cancellation or timeout. */
  waitForTask(task: EnqueuedTask | number, opts?: { timeoutMs?: number }): Promise<Task>;
  /** True when GET /health answers `available`. */
  healthy(): Promise<boolean>;
  close(): void;
}

export function createMeili(cfg: MeiliConfig): Meili {
  const base = new URL(cfg.url.replace(/\/+$/, '') + '/');
  const isHttps = base.protocol === 'https:';
  const agent = isHttps ? new https.Agent({ keepAlive: true, maxSockets: 16 }) : new http.Agent({ keepAlive: true, maxSockets: 16 });
  const timeoutMs = cfg.timeoutMs ?? 10_000;

  function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const target = new URL(path.replace(/^\//, ''), base);
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const headers: Record<string, string> = { accept: 'application/json' };
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.length);
    }
    if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
    return new Promise<T>((resolve, reject) => {
      const req = (isHttps ? https : http).request(target, { method, headers, agent, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: unknown = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
          }
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve(json as T);
            return;
          }
          const err = (json ?? {}) as { message?: string; code?: string };
          reject(new MeiliError(`Meilisearch ${method} ${target.pathname}: ${status} ${err.message ?? text.slice(0, 200)}`, status, err.code ?? null));
        });
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new MeiliError(`Meilisearch ${method} ${target.pathname}: timeout after ${timeoutMs} ms`, 0, 'timeout')));
      req.on('error', (e) => reject(e instanceof MeiliError ? e : new MeiliError(`Meilisearch ${method} ${target.pathname}: ${(e as Error).message}`, 0, 'network')));
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function waitForTask(task: EnqueuedTask | number, opts: { timeoutMs?: number } = {}): Promise<Task> {
    const uid = typeof task === 'number' ? task : task.taskUid;
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    let delay = 25;
    for (;;) {
      const t = await request<Task>('GET', `/tasks/${uid}`);
      if (t.status === 'succeeded') return t;
      if (t.status === 'failed' || t.status === 'canceled') {
        throw new MeiliError(`Meilisearch task ${uid} (${t.type}) ${t.status}: ${t.error?.message ?? 'no detail'}`, 0, t.error?.code ?? t.status);
      }
      if (Date.now() > deadline) throw new MeiliError(`Meilisearch task ${uid} (${t.type}) still ${t.status} after the timeout`, 0, 'task_timeout');
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 500);
    }
  }

  async function healthy(): Promise<boolean> {
    try {
      const h = await request<{ status: string }>('GET', '/health');
      return h?.status === 'available';
    } catch {
      return false;
    }
  }

  return { url: base.toString(), request, waitForTask, healthy, close: () => agent.destroy() };
}
