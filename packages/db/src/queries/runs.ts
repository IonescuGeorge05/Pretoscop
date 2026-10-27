import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { ingestRuns, type RunChannel, type RunStats, type RunStatus } from '../schema/shops';

export async function startRun(
  db: Db,
  input: { sourceId: number; channel: RunChannel; trigger?: 'schedule' | 'manual' | 'replay'; replayOfRunId?: number },
): Promise<{ id: number; startedAt: Date }> {
  const [row] = await db
    .insert(ingestRuns)
    .values({
      sourceId: input.sourceId,
      channel: input.channel,
      trigger: input.trigger ?? 'schedule',
      replayOfRunId: input.replayOfRunId ?? null,
      status: 'running',
    })
    .returning({ id: ingestRuns.id, startedAt: ingestRuns.startedAt });
  if (!row) throw new Error('startRun: no row returned');
  return row;
}

export async function finishRun(
  db: Db,
  runId: number,
  result: {
    status: Exclude<RunStatus, 'running'>;
    stats: RunStats;
    errorSample?: string | null;
    snapshotKey?: string | null;
  },
): Promise<void> {
  await db
    .update(ingestRuns)
    .set({
      status: result.status,
      stats: result.stats,
      errorSample: result.errorSample?.slice(0, 4000) ?? null,
      snapshotKey: result.snapshotKey ?? null,
      finishedAt: sql`now()`,
    })
    .where(eq(ingestRuns.id, runId));
}

export function emptyStats(): RunStats {
  return { fetched: 0, parsed: 0, upserted: 0, changed: 0, blocked: 0, errors: 0, durationMs: 0 };
}
