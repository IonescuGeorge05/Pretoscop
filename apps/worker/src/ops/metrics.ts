import { statfs } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Env } from '@pretoscop/config/env';
import { type Db, isFlagEnabled, sql } from '@pretoscop/db';
import { gauge, counter, type MetricFamily, renderMetrics } from './prometheus';

/**
 * Worker metrics for Prometheus/Grafana (docs/03 §9): source freshness against its SLO, failures,
 * runs, offer freshness, events per day, queue depth, review queue, last success of the scheduled
 * maintenance and backup jobs, WAL archiving, database size, free disk, process health. Computed
 * when /metrics is scraped; cheap reads every time, whole-table counts at most every 5 minutes.
 */

/** Jobs whose last successful completion is exported (backup and maintenance SLOs). */
export const TRACKED_JOBS = ['backup.nightly', 'backup.restore_test', 'rollup.daily', 'maintenance.partitions', 'scheduler.tick', 'ops.heartbeat'];

type Rows<T> = { rows: T[] };

async function rows<T>(p: Promise<Rows<T>>): Promise<T[]> {
  try {
    return (await p).rows;
  } catch {
    return [];
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export interface MetricsOptions {
  db: Db;
  env: Env;
  startedAt: Date;
  /** Extra families from other modules (e.g. the assisted channel, M05B). */
  extra?: () => Promise<MetricFamily[]>;
  /** Filesystem whose free space is reported (the volume holding snapshots and dumps). */
  diskPath?: string;
  slowTtlMs?: number;
  now?: () => number;
}

export function createMetricsCollector(opts: MetricsOptions) {
  const { db, env } = opts;
  const now = opts.now ?? Date.now;
  const slowTtl = opts.slowTtlMs ?? 5 * 60_000;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let slow: { at: number; families: MetricFamily[] } | null = null;

  async function slowFamilies(): Promise<MetricFamily[]> {
    if (slow && now() - slow.at < slowTtl) return slow.families;
    const [offers, events, review, quarantine] = await Promise.all([
      rows(
        db.execute<{ shop: string; active: string; fresh: string }>(sql`
          SELECT p.slug AS shop,
            count(*) FILTER (WHERE o.active)::text AS active,
            count(*) FILTER (WHERE o.active AND o.last_checked_at > now() - interval '26 hours')::text AS fresh
          FROM offers o JOIN shops p ON p.id = o.shop_id GROUP BY p.slug`),
      ),
      rows(db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM price_events WHERE observed_at > now() - interval '24 hours'`)),
      rows(db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offers WHERE active AND match_status IN ('pending','unmatched')`)),
      rows(db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM price_events_quarantine WHERE status = 'pending'`)),
    ]);
    const families = [
      gauge('pretoscop_offers_active', 'Active offers per shop', offers.map((r) => ({ labels: { shop: r.shop }, value: Number(r.active) }))),
      gauge(
        'pretoscop_offers_checked_26h',
        'Active offers per shop observed within the last 26 hours (freshness SLO: >= 95% of active)',
        offers.map((r) => ({ labels: { shop: r.shop }, value: Number(r.fresh) })),
      ),
      gauge('pretoscop_price_events_24h', 'Price events (changes and first sightings) recorded in the last 24 hours', num(events[0]?.n)),
      gauge('pretoscop_review_queue_offers', 'Active offers waiting for a matching decision (SLO: < 500)', num(review[0]?.n)),
      gauge('pretoscop_quarantine_pending', 'Price observations held by the anomaly filter', num(quarantine[0]?.n)),
    ];
    slow = { at: now(), families };
    return families;
  }

  async function fastFamilies(): Promise<MetricFamily[]> {
    const [sources, runs, queues, jobs, archiver, dbSize, crawlFlag] = await Promise.all([
      rows(
        db.execute<{
          key: string; shop: string; kind: string; live: boolean; health: string; failures: number; slo_hours: number; age_s: string | null;
        }>(sql`
          SELECT s.key, p.slug AS shop, s.kind,
            (s.enabled AND NOT s.kill_switch AND p.status = 'active' AND p.access_mode <> 'off') AS live,
            s.health, s.consecutive_failures AS failures, s.freshness_slo_hours AS slo_hours,
            extract(epoch FROM now() - s.last_success_at)::text AS age_s
          FROM shop_sources s JOIN shops p ON p.id = s.shop_id`),
      ),
      rows(
        db.execute<{ shop: string; status: string; n: string }>(sql`
          SELECT p.slug AS shop, r.status, count(*)::text AS n
          FROM ingest_runs r JOIN shop_sources s ON s.id = r.source_id JOIN shops p ON p.id = s.shop_id
          WHERE r.started_at > now() - interval '24 hours' GROUP BY p.slug, r.status`),
      ),
      rows(
        db.execute<{ name: string; state: string; n: string }>(sql`
          SELECT name, state::text, count(*)::text AS n FROM pgboss.job
          WHERE state IN ('created','retry','active') OR (state = 'failed' AND completed_on > now() - interval '24 hours')
          GROUP BY name, state`),
      ),
      rows(
        db.execute<{ name: string; at: string | null }>(sql`
          SELECT name, extract(epoch FROM max(completed_on))::text AS at FROM pgboss.job
          WHERE state = 'completed' AND name IN (${sql.join(TRACKED_JOBS.map((j) => sql`${j}`), sql`, `)})
          GROUP BY name`),
      ),
      rows(
        db.execute<{ archived: string; failed: string; last_archived: string | null; last_failed: string | null; mode: string }>(sql`
          SELECT archived_count::text AS archived, failed_count::text AS failed,
            extract(epoch FROM last_archived_time)::text AS last_archived,
            extract(epoch FROM last_failed_time)::text AS last_failed,
            current_setting('archive_mode') AS mode
          FROM pg_stat_archiver`),
      ),
      rows(db.execute<{ bytes: string }>(sql`SELECT pg_database_size(current_database())::text AS bytes`)),
      isFlagEnabled(db, 'crawl.enabled').catch(() => false),
    ]);
    const a = archiver[0];
    return [
      gauge('pretoscop_crawl_enabled', 'Crawling switched on (env CRAWL_ENABLED and flag crawl.enabled)', env.CRAWL_ENABLED && crawlFlag ? 1 : 0),
      gauge(
        'pretoscop_source_live',
        'Source configured to run (enabled, kill switch off, shop active and readable)',
        sources.map((s) => ({ labels: { source: s.key, shop: s.shop, kind: s.kind }, value: s.live ? 1 : 0 })),
      ),
      gauge(
        'pretoscop_source_last_success_age_seconds',
        'Seconds since the source last finished without failing (absent when it never did)',
        sources.map((s) => ({ labels: { source: s.key, shop: s.shop, kind: s.kind }, value: num(s.age_s) })),
      ),
      gauge(
        'pretoscop_source_freshness_slo_seconds',
        'Freshness SLO of the source (shop registry freshness_slo_hours)',
        sources.map((s) => ({ labels: { source: s.key, shop: s.shop, kind: s.kind }, value: s.slo_hours * 3600 })),
      ),
      gauge(
        'pretoscop_source_consecutive_failures',
        'Failed runs in a row (alert at 2)',
        sources.map((s) => ({ labels: { source: s.key, shop: s.shop, kind: s.kind }, value: s.failures })),
      ),
      gauge(
        'pretoscop_source_health',
        'Source health as last recorded (1 for the current state)',
        sources.map((s) => ({ labels: { source: s.key, shop: s.shop, health: s.health }, value: 1 })),
      ),
      gauge('pretoscop_ingest_runs_24h', 'Source runs started in the last 24 hours by status', runs.map((r) => ({ labels: { shop: r.shop, status: r.status }, value: Number(r.n) }))),
      gauge('pretoscop_queue_jobs', 'pg-boss jobs waiting, running, or failed in the last 24 hours', queues.map((q) => ({ labels: { queue: q.name, state: q.state }, value: Number(q.n) }))),
      gauge(
        'pretoscop_job_last_success_timestamp_seconds',
        'Unix time of the last successful run of scheduled jobs (backup.nightly, backup.restore_test, ...)',
        jobs.map((j) => ({ labels: { job: j.name }, value: num(j.at) })),
      ),
      gauge('pretoscop_pg_archive_mode_on', 'PostgreSQL archive_mode is on (WAL shipped by pgBackRest)', a ? (a.mode === 'on' || a.mode === 'always' ? 1 : 0) : null),
      counter('pretoscop_pg_archived_wal_total', 'WAL segments archived since the server started', num(a?.archived) ?? 0),
      counter('pretoscop_pg_archive_failures_total', 'Failed WAL archive attempts since the server started', num(a?.failed) ?? 0),
      gauge('pretoscop_pg_last_archived_timestamp_seconds', 'Unix time of the last archived WAL segment', num(a?.last_archived)),
      gauge('pretoscop_pg_last_archive_failure_timestamp_seconds', 'Unix time of the last failed WAL archive attempt', num(a?.last_failed)),
      gauge('pretoscop_pg_database_size_bytes', 'Size of the database', num(dbSize[0]?.bytes)),
    ];
  }

  async function processFamilies(): Promise<MetricFamily[]> {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const p99 = loop.percentile(99) / 1e9;
    const max = loop.max / 1e9;
    loop.reset();
    const families = [
      gauge('pretoscop_build_info', 'Running release', [{ labels: { version: process.env.APP_VERSION ?? 'dev', app_env: env.APP_ENV }, value: 1 }]),
      gauge('pretoscop_worker_start_timestamp_seconds', 'Unix time the worker process started', Math.round(opts.startedAt.getTime() / 1000)),
      gauge('process_resident_memory_bytes', 'Resident memory', mem.rss),
      gauge('nodejs_heap_used_bytes', 'V8 heap in use', mem.heapUsed),
      counter('process_cpu_seconds_total', 'User and system CPU time', (cpu.user + cpu.system) / 1e6),
      gauge('nodejs_eventloop_delay_p99_seconds', 'Event loop delay, 99th percentile since the last scrape', Number.isFinite(p99) ? p99 : 0),
      gauge('nodejs_eventloop_delay_max_seconds', 'Event loop delay, maximum since the last scrape', Number.isFinite(max) ? max : 0),
    ];
    if (opts.diskPath) {
      try {
        const s = await statfs(opts.diskPath);
        families.push(
          gauge('pretoscop_disk_free_bytes', 'Free bytes on the filesystem of the worker data volume', [{ labels: { path: opts.diskPath }, value: s.bavail * s.bsize }]),
          gauge('pretoscop_disk_size_bytes', 'Size of the filesystem of the worker data volume', [{ labels: { path: opts.diskPath }, value: s.blocks * s.bsize }]),
        );
      } catch {
        // path missing (tests): no disk metrics
      }
    }
    return families;
  }

  return {
    async collect(): Promise<string> {
      const parts = await Promise.all([processFamilies(), fastFamilies(), slowFamilies(), opts.extra ? opts.extra().catch(() => []) : Promise.resolve([])]);
      return renderMetrics(parts.flat());
    },
    close(): void {
      loop.disable();
    },
  };
}
