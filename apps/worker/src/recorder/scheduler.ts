import { CronExpressionParser } from 'cron-parser';
import { type Db, shopSources, shops } from '@pretoscop/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { checkGates } from './gates';
import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';

export const TZ = 'Europe/Bucharest';
export const SOURCE_RUN = 'source.run';

export function nextRun(cron: string, after: Date): Date {
  return CronExpressionParser.parse(cron, { tz: TZ, currentDate: after }).next().toDate();
}

/** Queues one `source.run` per shop group at most once (singleton per source). */
export async function enqueueSourceRun(
  boss: PgBoss,
  source: { id: number; key: string; shopSlug: string },
  trigger: 'schedule' | 'manual',
): Promise<string | null> {
  return boss.send(
    SOURCE_RUN,
    { sourceId: source.id, trigger },
    { singletonKey: source.key, group: { id: source.shopSlug }, retryLimit: 1, retryDelay: 600 },
  );
}

/**
 * Called every minute: for every enabled source with a schedule, initialises `next_run_at` and,
 * when it is due, queues a run (if the gates allow it) and advances `next_run_at`. Missed slots
 * are not replayed: after downtime, each source runs once and continues on its schedule.
 */
export async function schedulerTick(db: Db, boss: PgBoss, env: Env, log: Logger, now = new Date()): Promise<number> {
  const rows = await db
    .select({ source: shopSources, shop: shops })
    .from(shopSources)
    .innerJoin(shops, eq(shops.id, shopSources.shopId))
    .where(and(eq(shopSources.enabled, true), eq(shopSources.killSwitch, false), isNotNull(shopSources.schedule)));
  let queued = 0;
  for (const { source, shop } of rows) {
    const cron = source.schedule!;
    let next: Date;
    try {
      next = nextRun(cron, now);
    } catch (err) {
      log.error({ err, key: source.key }, 'invalid schedule');
      continue;
    }
    if (!source.nextRunAt) {
      await db.update(shopSources).set({ nextRunAt: next }).where(eq(shopSources.id, source.id));
      continue;
    }
    if (source.nextRunAt.getTime() > now.getTime()) continue;
    await db.update(shopSources).set({ nextRunAt: next }).where(eq(shopSources.id, source.id));
    const gate = await checkGates(db, env, { shop, source });
    if (!gate.ok) {
      log.debug({ key: source.key, reason: gate.reason }, 'scheduled run gated');
      continue;
    }
    const id = await enqueueSourceRun(boss, { id: source.id, key: source.key, shopSlug: shop.slug }, 'schedule');
    if (id) queued++;
    log.info({ key: source.key, job_id: id, next_run_at: next.toISOString() }, 'source run queued');
  }
  return queued;
}
