import { createServer, type Server } from 'node:http';
import { PROMETHEUS_CONTENT_TYPE } from './prometheus';

export interface HealthServerOptions {
  port: number;
  /** Static facts merged into the /health body. */
  status: () => Record<string, unknown>;
  /** Liveness of what the worker depends on (database); a rejection or `false` means 503. */
  check?: () => Promise<boolean>;
  /** Prometheus text for GET /metrics (M18). */
  metrics?: () => Promise<string>;
  host?: string;
}

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * The worker's HTTP endpoint (port METRICS_PORT, 9464; never published to the internet):
 *   GET /health   → 200 JSON when the database answers within 3 s, else 503 (Docker HEALTHCHECK,
 *                   deploy script; external uptime comes from the ops.heartbeat job instead)
 *   GET /metrics  → Prometheus text format (Grafana Alloy scrapes it)
 */
export function startHealthServer(opts: HealthServerOptions): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (path === '/health') {
      const check = opts.check ? withTimeout(opts.check(), CHECK_TIMEOUT_MS).catch(() => false) : Promise.resolve(true);
      void check.then((ok) => {
        res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ status: ok ? 'ok' : 'error', db: ok ? 'ok' : 'unreachable', uptime_s: Math.round(process.uptime()), ...opts.status() }));
      });
      return;
    }
    if (path === '/metrics' && opts.metrics) {
      void opts.metrics().then(
        (text) => {
          res.writeHead(200, { 'content-type': PROMETHEUS_CONTENT_TYPE, 'cache-control': 'no-store' });
          res.end(text);
        },
        (err: unknown) => {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(`metrics error: ${(err as Error).message}`);
        },
      );
      return;
    }
    res.writeHead(404).end();
  });
  // A second local worker (tests, `make verify`) must not crash on a taken port.
  server.on('error', () => undefined);
  server.listen(opts.port, opts.host);
  return server;
}
