import { sql } from '@pretoscop/db';
import type { PgBoss } from 'pg-boss';
import { pingHeartbeat } from '../ops/heartbeat';
import { evaluateSlos, type SloAlert } from '../ops/slo';
import { defineJob } from './types';

export const OPS_ALERT = 'ops.alert';
/** Where the worker's data volume lives in the image (free-space checks). */
export const DATA_DIR = '/app/data';

/**
 * Sends one deduplicated ops alert: pg-boss refuses a second job with the same key in the same
 * time slot (`singletonSeconds`), so a lasting breach alerts once per slot, across restarts.
 */
export async function raiseAlert(boss: PgBoss, alert: SloAlert): Promise<boolean> {
  const id = await boss.send(
    OPS_ALERT,
    { message: alert.message, details: { ...alert.details, key: alert.key } },
    { singletonKey: alert.key, singletonSeconds: alert.everySeconds },
  );
  return id !== null;
}

/** Delivers an ops alert (Telegram and/or email, always logged). */
export const opsAlertJob = defineJob<{ message: string; details?: Record<string, unknown> }>({
  name: OPS_ALERT,
  // Kept 8 days: the job rows are what deduplicates weekly alerts.
  queue: { retryLimit: 2, retryDelay: 60, deleteAfterSeconds: 8 * 86_400 },
  handler: async (job, { services }) => {
    await services.alert(job.data.message, job.data.details ?? {});
  },
});

/**
 * Every 5 minutes: proves that the worker, pg-boss and the database work, by pinging
 * OPS_HEARTBEAT_URL (Better Stack heartbeat). If this job stops running, the monitor alerts.
 */
export const opsHeartbeatJob = defineJob({
  name: 'ops.heartbeat',
  queue: { retryLimit: 0, expireInSeconds: 120, deleteAfterSeconds: 86_400 },
  schedule: { cron: '*/5 * * * *' },
  handler: async (_job, { db, env, log }) => {
    await db.execute(sql`SELECT 1`);
    await pingHeartbeat(env.OPS_HEARTBEAT_URL, log);
  },
});

/** Hourly: SLO checks of docs/03 §9 → deduplicated alerts. */
export const opsSloCheckJob = defineJob({
  name: 'ops.slo_check',
  queue: { retryLimit: 1, retryDelay: 300, expireInSeconds: 900, deleteAfterSeconds: 7 * 86_400 },
  schedule: { cron: '7 * * * *' },
  handler: async (_job, { db, env, boss, log, services }) => {
    const alerts = await evaluateSlos(db, env, {
      diskPath: DATA_DIR,
      startedAt: services.startedAt,
      extra: services.sloExtra,
    });
    let sent = 0;
    for (const a of alerts) if (await raiseAlert(boss, a)) sent++;
    log.info({ breaches: alerts.map((a) => a.key), sent }, 'SLO check done');
  },
});
