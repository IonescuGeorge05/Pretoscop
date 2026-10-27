import { createServer, type Server } from 'node:http';

/** Minimal liveness endpoint for uptime checks: GET /health → 200 JSON. */
export function startHealthServer(port: number, status: () => Record<string, unknown>): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime_s: Math.round(process.uptime()), ...status() }));
      return;
    }
    res.writeHead(404).end();
  });
  server.on('error', () => undefined);
  server.listen(port);
  return server;
}
