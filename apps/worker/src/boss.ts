import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { PgBoss } from 'pg-boss';
import type { JobContext, JobDefinition } from './jobs/types';

export const DEFAULT_TZ = 'Europe/Bucharest';

export function createBoss(env: Env, log: Logger): PgBoss {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    application_name: 'pretoscop-worker',
    max: 5,
  });
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'));
  return boss;
}

/** Creates queues, attaches workers and (re)applies schedules for every job definition. */
export async function registerJobs(
  boss: PgBoss,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defs: JobDefinition<any>[],
  ctx: Omit<JobContext, 'log'> & { log: Logger },
): Promise<void> {
  for (const def of defs) {
    await boss.createQueue(def.name, def.queue ?? {});
    const log = ctx.log.child({ job: def.name });
    await boss.work(def.name, def.work ?? {}, async (batch) => {
      for (const job of batch) {
        const started = Date.now();
        try {
          await def.handler(job, { ...ctx, log });
        } catch (err) {
          log.error({ err, job_id: job.id, duration_ms: Date.now() - started }, 'job failed');
          throw err;
        }
      }
    });
    if (def.schedule) {
      await boss.schedule(def.name, def.schedule.cron, def.schedule.data ?? null, {
        tz: def.schedule.tz ?? DEFAULT_TZ,
      });
    } else {
      // A schedule removed from code must not keep firing from the database.
      await boss.unschedule(def.name).catch(() => undefined);
    }
    if (def.runOnStart) await boss.send(def.name, def.schedule?.data ?? {});
  }
}
