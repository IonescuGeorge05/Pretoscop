import { statfs } from 'node:fs/promises';
import type { Env } from '@pretoscop/config/env';
import { type Db, isFlagEnabled, sql } from '@pretoscop/db';

/**
 * Service-level checks from docs/03 §9 that the worker can see from the database, evaluated by the
 * hourly `ops.slo_check` job. Each breach becomes an ops alert (Telegram/email), deduplicated per
 * `key` for `everySeconds` through pg-boss throttling, so a lasting problem alerts once a day (or
 * week) instead of every hour. Things the worker cannot see itself (the site down, the worker or
 * the server dead) are covered by external uptime checks and heartbeats (infra/monitoring/README.md).
 */
export interface SloAlert {
  key: string;
  message: string;
  details: Record<string, unknown>;
  /** Minimum time between two alerts with this key. */
  everySeconds: number;
}

export interface SloOptions {
  now?: Date;
  /** Filesystem holding the worker data volume (free-space check). */
  diskPath?: string;
  /** Worker start time: backup checks wait until the worker has had a chance to run them. */
  startedAt?: Date;
  /** Extra checks contributed by other modules (the assisted channel, M05B). */
  extra?: () => Promise<SloAlert[]>;
}

const DAY = 86_400;
const HOUR = 3600;

/** Grace on top of a source's freshness SLO before alerting (a run can be late by its duration). */
export const FRESHNESS_GRACE_HOURS = 2;
export const REJECT_RATE_MAX = 0.02;
export const OFFER_FRESH_RATIO_MIN = 0.95;
export const REVIEW_QUEUE_MAX = 500;
export const DISK_FREE_RATIO_MIN = 0.15;

async function gatesOpen(db: Db, env: Env) {
  const [crawl, emag, assisted] = await Promise.all([
    isFlagEnabled(db, 'crawl.enabled'),
    isFlagEnabled(db, 'source.emag.enabled'),
    isFlagEnabled(db, 'assisted.enabled'),
  ]);
  return { crawl: env.CRAWL_ENABLED && crawl, emag, assisted };
}

export async function evaluateSlos(db: Db, env: Env, opts: SloOptions = {}): Promise<SloAlert[]> {
  const now = opts.now ?? new Date();
  const alerts: SloAlert[] = [];
  const gates = await gatesOpen(db, env);

  // ---- sources: freshness against their SLO, parse-reject rate of the last run
  if (gates.crawl) {
    const sources = await db.execute<{
      key: string; shop: string; slo_hours: number; age_h: string; kind: string; stats: Record<string, number> | null; run_status: string | null;
    }>(sql`
      SELECT s.key, p.slug AS shop, s.kind, s.freshness_slo_hours AS slo_hours,
        (extract(epoch FROM ${now}::timestamptz - coalesce(s.last_success_at, s.created_at)) / 3600)::text AS age_h,
        r.stats, r.status AS run_status
      FROM shop_sources s JOIN shops p ON p.id = s.shop_id
      LEFT JOIN LATERAL (
        SELECT stats, status FROM ingest_runs WHERE source_id = s.id AND status <> 'running' ORDER BY id DESC LIMIT 1
      ) r ON true
      WHERE s.enabled AND NOT s.kill_switch AND s.schedule IS NOT NULL
        AND p.status = 'active' AND p.access_mode <> 'off'
        AND (p.slug <> 'emag' OR ${gates.emag})
        AND (p.access_mode <> 'assisted' OR ${gates.assisted})`);
    for (const s of sources.rows) {
      const age = Number(s.age_h);
      if (age > s.slo_hours + FRESHNESS_GRACE_HOURS) {
        alerts.push({
          key: `freshness:${s.key}`,
          message: `Source ${s.key} has not completed a run for ${Math.round(age)} h (SLO ${s.slo_hours} h)`,
          details: { shop: s.shop, last_run_status: s.run_status ?? 'never ran' },
          everySeconds: DAY,
        });
      }
      const parsed = Number(s.stats?.parsed ?? 0);
      const rejected = Number(s.stats?.rejected ?? 0);
      if (parsed >= 50 && rejected / parsed > REJECT_RATE_MAX) {
        alerts.push({
          key: `rejects:${s.key}`,
          message: `Source ${s.key}: ${((rejected / parsed) * 100).toFixed(1)}% of parsed rows rejected in the last run (SLO < 2%)`,
          details: { shop: s.shop, parsed, rejected },
          everySeconds: DAY,
        });
      }
    }

    // ---- offers: share of active offers observed within 26 h
    const fresh = await db.execute<{ active: string; fresh: string }>(sql`
      SELECT count(*)::text AS active, count(*) FILTER (WHERE o.last_checked_at > ${now}::timestamptz - interval '26 hours')::text AS fresh
      FROM offers o JOIN shops p ON p.id = o.shop_id
      WHERE o.active AND p.status = 'active' AND p.access_mode <> 'off'
        AND (p.slug <> 'emag' OR ${gates.emag})`);
    const active = Number(fresh.rows[0]?.active ?? 0);
    const ratio = active > 0 ? Number(fresh.rows[0]?.fresh ?? 0) / active : 1;
    if (active >= 100 && ratio < OFFER_FRESH_RATIO_MIN) {
      alerts.push({
        key: 'offer-freshness',
        message: `Only ${(ratio * 100).toFixed(1)}% of ${active} active offers were observed in the last 26 h (SLO ≥ 95%)`,
        details: {},
        everySeconds: DAY,
      });
    }
  }

  // ---- matching: human review queue
  const review = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offers WHERE active AND match_status IN ('pending','unmatched')`);
  const queue = Number(review.rows[0]?.n ?? 0);
  if (queue > REVIEW_QUEUE_MAX) {
    alerts.push({ key: 'review-queue', message: `Match review queue holds ${queue} offers (SLO < 500)`, details: {}, everySeconds: 7 * DAY });
  }

  // ---- backups: nightly logical dump and weekly restore test (scheduled pg-boss jobs)
  const startedAt = opts.startedAt ?? new Date(0);
  const uptimeH = (now.getTime() - startedAt.getTime()) / 3_600_000;
  const jobs = await db
    .execute<{ name: string; age_h: string | null }>(sql`
      SELECT name, (extract(epoch FROM ${now}::timestamptz - max(completed_on)) / 3600)::text AS age_h FROM pgboss.job
      WHERE state = 'completed' AND name IN ('backup.nightly', 'backup.restore_test') GROUP BY name`)
    .catch(() => ({ rows: [] as { name: string; age_h: string | null }[] }));
  const ageOf = (name: string) => {
    const r = jobs.rows.find((j) => j.name === name);
    return r?.age_h === null || r?.age_h === undefined ? null : Number(r.age_h);
  };
  const dumpAge = ageOf('backup.nightly');
  if ((dumpAge === null && uptimeH > 26) || (dumpAge !== null && dumpAge > 26)) {
    alerts.push({
      key: 'backup-nightly',
      message: dumpAge === null ? 'No nightly database dump has completed yet' : `Last nightly database dump completed ${Math.round(dumpAge)} h ago (SLO: every night)`,
      details: {},
      everySeconds: 12 * HOUR,
    });
  }
  const restoreAge = ageOf('backup.restore_test');
  if ((restoreAge === null && uptimeH > 8 * 24) || (restoreAge !== null && restoreAge > 8 * 24)) {
    alerts.push({
      key: 'backup-restore-test',
      message: restoreAge === null ? 'The weekly restore test has never completed' : `Last restore test completed ${Math.round(restoreAge / 24)} days ago (SLO: weekly)`,
      details: {},
      everySeconds: DAY,
    });
  }

  // ---- WAL archiving (pgBackRest): failing or stalled while archive_mode is on
  const arch = await db
    .execute<{ mode: string; last_archived_age_m: string | null; failing: boolean; failed: string }>(sql`
      SELECT current_setting('archive_mode') AS mode,
        (extract(epoch FROM ${now}::timestamptz - last_archived_time) / 60)::text AS last_archived_age_m,
        coalesce(last_failed_time > coalesce(last_archived_time, '-infinity'), false) AS failing,
        failed_count::text AS failed
      FROM pg_stat_archiver`)
    .catch(() => ({ rows: [] as { mode: string; last_archived_age_m: string | null; failing: boolean; failed: string }[] }));
  const a = arch.rows[0];
  if (a && (a.mode === 'on' || a.mode === 'always')) {
    const ageM = a.last_archived_age_m === null ? null : Number(a.last_archived_age_m);
    if (a.failing || (ageM !== null && ageM > 30)) {
      alerts.push({
        key: 'wal-archiving',
        message: a.failing
          ? 'WAL archiving is failing (pgBackRest archive-push): point-in-time recovery is at risk and pg_wal grows'
          : `No WAL segment archived for ${Math.round(ageM ?? 0)} min (archive_timeout is 5 min)`,
        details: { failed_count: Number(a.failed) },
        everySeconds: 6 * HOUR,
      });
    }
  }

  // ---- disk
  if (opts.diskPath) {
    try {
      const s = await statfs(opts.diskPath);
      const free = s.blocks > 0 ? s.bavail / s.blocks : 1;
      if (free < DISK_FREE_RATIO_MIN) {
        alerts.push({
          key: 'disk',
          message: `Disk almost full: ${(free * 100).toFixed(1)}% free on the server's data filesystem`,
          details: { free_gb: Math.round((s.bavail * s.bsize) / 1e9) },
          everySeconds: 6 * HOUR,
        });
      }
    } catch {
      // no such path (tests, dev): skip
    }
  }

  if (opts.extra) alerts.push(...(await opts.extra()));
  return alerts;
}
