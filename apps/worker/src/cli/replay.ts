/**
 * Replay mode (docs/03 §6.1): re-processes stored raw snapshots through normalize → record with the
 * original observation times, without fetching and without alerts. Observations older than what
 * is stored for an offer are ignored (never regress), so replay is meant for an empty window, e.g.
 * after a normalization fix and deleting the affected events.
 *   pnpm --filter @pretoscop/worker replay --run 123
 *   pnpm --filter @pretoscop/worker replay --source emag:listing:telefoane-mobile --since 2026-10-28
 */
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import type { RawOffer } from '@pretoscop/core';
import { createDb, createPool, finishRun, recordObservation, startRun, emptyStats } from '@pretoscop/db';
import { sql } from 'drizzle-orm';
import { createServices } from '../services';

loadRootEnvFile();
const { values } = parseArgs({ options: { run: { type: 'string' }, source: { type: 'string' }, since: { type: 'string' } } });
const env = getEnv();
const log = createLogger('replay');
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
const services = createServices(env, db, log);
try {
  const runs = await db.execute<{ id: string; source_id: string; snapshot_key: string; shop_id: string; slug: string; shipping_rules: Record<string, number | null>; vat: boolean; tier: number }>(sql`
    SELECT r.id::text, r.source_id::text, r.snapshot_key, s.shop_id::text, p.slug, p.shipping_rules, p.vat_included_default AS vat, s.source_tier AS tier
    FROM ingest_runs r JOIN shop_sources s ON s.id = r.source_id JOIN shops p ON p.id = s.shop_id
    WHERE r.snapshot_key IS NOT NULL AND r.trigger <> 'replay'
      ${values.run ? sql`AND r.id = ${Number(values.run)}` : sql``}
      ${values.source ? sql`AND s.key = ${values.source}` : sql``}
      ${values.since ? sql`AND r.started_at >= ${new Date(values.since)}` : sql``}
    ORDER BY r.started_at`);
  for (const r of runs.rows) {
    const body = await services.blob.get(r.snapshot_key);
    if (!body) {
      log.warn({ key: r.snapshot_key }, 'snapshot missing');
      continue;
    }
    const replay = await startRun(db, { sourceId: Number(r.source_id), channel: 'direct', trigger: 'replay', replayOfRunId: Number(r.id) });
    const stats = { ...emptyStats(), stale: 0, rejected: 0 };
    for (const line of gunzipSync(Buffer.from(body)).toString().split('\n')) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line) as RawOffer;
      stats.parsed++;
      const n = services.normalize(raw, {
        shop: { id: Number(r.shop_id), slug: r.slug, shippingRules: r.shipping_rules, vatIncludedDefault: r.vat },
        sourceId: Number(r.source_id),
        sourceTier: r.tier as 1 | 2 | 3 | 4,
        runId: replay.id,
        observedAt: new Date(raw.observedAt),
      });
      if (!n.observation) {
        stats.rejected++;
        continue;
      }
      const res = await recordObservation(db, n.observation);
      if (res.stale) stats.stale++;
      else {
        stats.upserted++;
        if (res.eventKind) stats.changed++;
      }
    }
    await finishRun(db, replay.id, { status: 'success', stats, snapshotKey: r.snapshot_key });
    console.log(`replayed run ${r.id} → ${replay.id}: ${JSON.stringify(stats)}`);
  }
} finally {
  await services.close?.();
  await pool.end();
}
