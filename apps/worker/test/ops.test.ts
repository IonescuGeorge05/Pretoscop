import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { setFlag } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import type { Mailer } from '@pretoscop/mailer';
import { raiseAlert } from '../src/jobs/ops';
import { createOpsAlert } from '../src/ops/alert';
import { startHealthServer } from '../src/ops/health';
import { createMetricsCollector } from '../src/ops/metrics';
import { gauge, renderMetrics } from '../src/ops/prometheus';
import { createRevalidator, revalidateTargets } from '../src/ops/revalidate';
import { evaluateSlos } from '../src/ops/slo';
import { syncShops } from '../src/registry/sync';

const log = createLogger('test', { level: 'silent' });

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    if (server.listening) resolve((server.address() as AddressInfo).port);
    else server.once('listening', () => resolve((server.address() as AddressInfo).port));
  });
}

async function body(req: IncomingMessage): Promise<string> {
  let s = '';
  for await (const chunk of req) s += chunk;
  return s;
}

describe('Prometheus text format', () => {
  it('renders HELP/TYPE lines, escapes label values and skips missing samples', () => {
    const text = renderMetrics([
      gauge('pretoscop_x', 'An "x"\nwith a newline', [
        { labels: { shop: 'a"b\\c', kind: 'listing' }, value: 3 },
        { labels: { shop: 'none' }, value: null },
        { value: Number.NaN },
      ]),
    ]);
    expect(text).toBe(
      ['# HELP pretoscop_x An "x"\\nwith a newline', '# TYPE pretoscop_x gauge', 'pretoscop_x{shop="a\\"b\\\\c",kind="listing"} 3', 'pretoscop_x NaN', ''].join('\n'),
    );
  });

  it('refuses invalid metric and label names', () => {
    expect(() => renderMetrics([gauge('bad-name', 'x', 1)])).toThrow(/invalid metric name/);
    expect(() => renderMetrics([gauge('ok_name', 'x', [{ labels: { 'bad-label': 1 }, value: 1 }])])).toThrow(/invalid label name/);
  });
});

describe('worker HTTP endpoint', () => {
  it('serves /health (200 or 503) and /metrics', async () => {
    let healthy = true;
    const server = startHealthServer({
      port: 0,
      host: '127.0.0.1',
      status: () => ({ version: 'test' }),
      check: async () => healthy,
      metrics: async () => '# HELP up x\n# TYPE up gauge\nup 1\n',
    });
    const port = await listen(server);
    try {
      let res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok', version: 'test' });
      healthy = false;
      res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ status: 'error', db: 'unreachable' });
      res = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(res.headers.get('content-type')).toMatch(/text\/plain; version=0\.0\.4/);
      expect(await res.text()).toContain('up 1');
      expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/health`, { method: 'POST' })).status).toBe(405);
    } finally {
      server.close();
    }
  });

  it('answers 503 when the database check hangs', async () => {
    const server = startHealthServer({ port: 0, host: '127.0.0.1', status: () => ({}), check: () => new Promise<boolean>(() => undefined) });
    const port = await listen(server);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(503);
    } finally {
      server.close();
    }
  });
});

describe('cache revalidation fan-out', () => {
  it('parses WEB_INTERNAL_URL lists and falls back to PUBLIC_BASE_URL', () => {
    expect(revalidateTargets({ WEB_INTERNAL_URL: ' http://web-1:3000/ , http://web-2:3000', PUBLIC_BASE_URL: 'https://x.ro' })).toEqual([
      'http://web-1:3000/api/revalidate',
      'http://web-2:3000/api/revalidate',
    ]);
    expect(revalidateTargets({ WEB_INTERNAL_URL: undefined, PUBLIC_BASE_URL: 'https://x.ro/' })).toEqual(['https://x.ro/api/revalidate']);
  });

  it('posts the same tags to every replica with the bearer token', async () => {
    const seen: { port: number; auth: string | undefined; tags: string[] }[] = [];
    const servers = [0, 1].map(() =>
      createServer(async (req, res) => {
        const port = (req.socket.address() as AddressInfo).port;
        seen.push({ port, auth: req.headers.authorization, tags: (JSON.parse(await body(req)) as { tags: string[] }).tags });
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"revalidated":1}');
      }).listen(0, '127.0.0.1'),
    );
    const ports = await Promise.all(servers.map(listen));
    try {
      const env = { ...getEnv({}), WEB_INTERNAL_URL: ports.map((p) => `http://127.0.0.1:${p}`).join(','), REVALIDATE_TOKEN: 'a-long-enough-test-token' };
      const n = await createRevalidator(env, log)(['product:1', 'product:2']);
      expect(n).toBe(2);
      expect(seen.map((s) => s.port).sort()).toEqual([...ports].sort());
      for (const s of seen) expect(s).toMatchObject({ auth: 'Bearer a-long-enough-test-token', tags: ['product:1', 'product:2'] });
    } finally {
      for (const s of servers) s.close();
    }
  });
});

describe('ops alerts', () => {
  it('emails every OPS_ALERT_EMAIL address and never throws', async () => {
    const sent: string[] = [];
    const mailer: Mailer = {
      async send(msg) {
        if (msg.to === 'down@example.test') throw new Error('smtp down');
        sent.push(`${msg.to}|${msg.subject}`);
        return { id: '1' };
      },
    };
    const env = { ...getEnv({}), OPS_ALERT_EMAIL: 'a@example.test, down@example.test,b@example.test' };
    await createOpsAlert(env, log, mailer)('Backup failed', { error: 'x' });
    expect(sent).toEqual(['a@example.test|[Pretoscop dev] Backup failed', 'b@example.test|[Pretoscop dev] Backup failed']);
  });
});

describe('metrics and SLO checks (database)', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
    await syncShops(t.db);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('exports source freshness, offers, queues and process metrics', async () => {
    const env = { ...getEnv({}), CRAWL_ENABLED: true };
    const m = createMetricsCollector({ db: t.db, env, startedAt: new Date('2026-10-27T00:00:00Z') });
    try {
      const text = await m.collect();
      for (const name of [
        'pretoscop_build_info',
        'pretoscop_crawl_enabled 0',
        'pretoscop_source_live{source="emag:listing:telefoane-mobile",shop="emag",kind="listing"} 1',
        'pretoscop_source_freshness_slo_seconds{source="emag:listing:telefoane-mobile",shop="emag",kind="listing"} 93600',
        'pretoscop_price_events_24h 0',
        'pretoscop_review_queue_offers 0',
        'pretoscop_pg_database_size_bytes',
        'process_resident_memory_bytes',
      ]) {
        expect(text).toContain(name);
      }
      // A source that never succeeded has no age sample (absent, not zero).
      expect(text).not.toMatch(/pretoscop_source_last_success_age_seconds\{source="emag:listing:telefoane-mobile"/);
    } finally {
      m.close();
    }
  });

  it('alerts on stale sources, high reject rates, a missing nightly dump; nothing while crawling is off', async () => {
    const env = { ...getEnv({}), CRAWL_ENABLED: true };
    const now = new Date();
    const old = new Date(now.getTime() - 30 * 86_400_000); // older than every SLO in the registry (at most 8 days)
    // Crawling off (flag): no source alerts at all.
    let alerts = await evaluateSlos(t.db, env, { now, startedAt: now });
    expect(alerts.filter((a) => a.key.startsWith('freshness:'))).toEqual([]);

    await setFlag(t.db, 'crawl.enabled', true);
    await t.db.execute(sql`UPDATE shop_sources SET created_at = ${old}, last_success_at = NULL`);
    // The sources the recorder runs today (the registry changes as shops are added): every one of them
    // must alert, except eMAG, which is gated by its own flag (ADR-013).
    const live = await t.db.execute<{ id: string; key: string; shop: string }>(sql`
      SELECT s.id::text, s.key, p.slug AS shop FROM shop_sources s JOIN shops p ON p.id = s.shop_id
      WHERE s.enabled AND NOT s.kill_switch AND s.schedule IS NOT NULL AND p.status = 'active'
        AND p.access_mode NOT IN ('off', 'assisted') AND p.slug <> 'emag' ORDER BY s.key`);
    expect(live.rows.length).toBeGreaterThan(5);
    const rejecting = live.rows[0]!;
    const sourceId = Number(rejecting.id);
    await t.db.execute(
      sql`INSERT INTO ingest_runs (source_id, status, stats, finished_at) VALUES (${sourceId}, 'partial', ${JSON.stringify({ parsed: 100, rejected: 7 })}::jsonb, now())`,
    );
    alerts = await evaluateSlos(t.db, env, { now, startedAt: new Date(now.getTime() - 2 * 86_400_000) });
    const keys = alerts.map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(live.rows.map((r) => `freshness:${r.key}`)));
    expect(keys.some((k) => k.startsWith('freshness:emag:'))).toBe(false); // eMAG is gated by its own flag (ADR-013)
    expect(keys).toContain(`rejects:${rejecting.key}`);
    expect(keys).toContain('backup-nightly');
    expect(keys).not.toContain('backup-restore-test'); // the worker has run for 2 days, not 8
    for (const a of alerts) expect(a.everySeconds).toBeGreaterThanOrEqual(6 * 3600);
  });

  it('deduplicates alerts per key and time slot through pg-boss', async () => {
    const boss = new PgBoss({ connectionString: t.url, schema: 'pgboss' });
    boss.on('error', () => undefined);
    await boss.start();
    try {
      await boss.createQueue('ops.alert');
      const a = { key: 'disk', message: 'Disk almost full', details: {}, everySeconds: 3600 };
      expect(await raiseAlert(boss, a)).toBe(true);
      expect(await raiseAlert(boss, a)).toBe(false);
      expect(await raiseAlert(boss, { ...a, key: 'wal-archiving' })).toBe(true);
      const jobs = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM pgboss.job WHERE name = 'ops.alert'`);
      expect(Number(jobs.rows[0]!.n)).toBe(2);
    } finally {
      await boss.stop({ graceful: false }).catch(() => undefined);
    }
  });
});

describe('ops alert delivery', () => {
  it('logs every alert even with no channel configured', async () => {
    const warn = vi.fn();
    const fakeLog = { warn, error: vi.fn() } as unknown as typeof log;
    await createOpsAlert(getEnv({}), fakeLog)('Something broke', { a: 1 });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ alert: true, a: 1 }), 'Something broke');
  });
});
