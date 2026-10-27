import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import { MockAgent } from 'undici';
import { createFetcher, MemoryDomainStateStore } from '../src/index';
import type { FetcherDeps, RequestLogEntry, RequestLogSink } from '../src/types';

export { fixturePath, readFixture } from './fixtures';

/** A clock that only moves when someone sleeps (or the test advances it). */
export function fakeClock(startIso = '2026-10-28T10:00:00.000Z') {
  const clock = {
    t: Date.parse(startIso),
    sleeps: [] as number[],
    now: () => clock.t,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      clock.sleeps.push(ms);
      clock.t += ms;
      await Promise.resolve();
    },
    advance: (ms: number) => {
      clock.t += ms;
    },
  };
  return clock;
}

export function collectLog() {
  const entries: RequestLogEntry[] = [];
  const sink: RequestLogSink = { write: (e) => void entries.push(e) };
  return { entries, sink, network: () => entries.filter((e) => e.attempt > 0) };
}

export interface TestServer {
  origin: string;
  host: string;
  port: number;
  hits: Array<{ path: string; headers: http.IncomingHttpHeaders; at: number }>;
  close: () => Promise<void>;
  server: http.Server;
}

/** A node:http server on 127.0.0.1 with an ephemeral port. */
export async function startServer(handler: http.RequestListener): Promise<TestServer> {
  const hits: TestServer['hits'] = [];
  const server = http.createServer((req, res) => {
    hits.push({ path: req.url ?? '', headers: req.headers, at: Date.now() });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    host: `127.0.0.1:${port}`,
    port,
    hits,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function mockAgent() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  return agent;
}

export const ROBOTS_ALLOW_ALL = 'User-agent: *\nDisallow:\n';

/** Fetcher with a fake clock, memory store and collected request log. */
export function testFetcher(overrides: Partial<FetcherDeps> & { policy?: Partial<DomainPolicy> } = {}) {
  const clock = fakeClock();
  const store = new MemoryDomainStateStore({ now: clock.now });
  const log = collectLog();
  const { policy, ...deps } = overrides;
  const fetcher = createFetcher({
    stateStore: store,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    crawlEnabled: true,
    requestLog: log.sink,
    retry: { maxRetries: 2, baseDelayMs: 10_000 },
    policyFor: (host) => defaultDomainPolicy(host, policy),
    ...deps,
  });
  return { fetcher, clock, store, log };
}
