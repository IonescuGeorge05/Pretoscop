import { type Db, sql } from '@pretoscop/db';
import type { DailyBudgetResult, DomainPause, DomainStateStore, RobotsCacheEntry, SlotReservation } from '@pretoscop/fetch';

const ms = (v: string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * PostgreSQL implementation of the M02 `DomainStateStore`, shared by every worker process.
 * Each method is one atomic statement (SQL from packages/fetch/README.md). Times cross the
 * boundary as epoch milliseconds computed by the database clock.
 */
export class PgDomainStateStore implements DomainStateStore {
  constructor(private readonly db: Db) {}

  async reserveSlot(host: string, intervalMs: number): Promise<SlotReservation> {
    const r = await this.db.execute<{ start_ms: string; wait_ms: string }>(sql`
      INSERT INTO fetch_domain_state AS s (host, next_slot_at) VALUES (${host}, now() + ${intervalMs}::float8 * interval '1 millisecond')
      ON CONFLICT (host) DO UPDATE SET next_slot_at = greatest(s.next_slot_at, now()) + ${intervalMs}::float8 * interval '1 millisecond'
      RETURNING (extract(epoch FROM next_slot_at - ${intervalMs}::float8 * interval '1 millisecond') * 1000)::bigint::text AS start_ms,
        greatest(0, extract(epoch FROM next_slot_at - ${intervalMs}::float8 * interval '1 millisecond' - now()) * 1000)::bigint::text AS wait_ms
    `);
    const row = r.rows[0]!;
    return { startAt: Number(row.start_ms), waitMs: Number(row.wait_ms) };
  }

  async getPause(host: string): Promise<DomainPause | null> {
    const r = await this.db.execute<{ until_ms: string; reason: string | null; set_ms: string | null; source: string | null; block: string | null }>(sql`
      SELECT (extract(epoch FROM paused_until) * 1000)::bigint::text AS until_ms, pause_reason AS reason,
        (extract(epoch FROM pause_set_at) * 1000)::bigint::text AS set_ms, pause_source AS source, pause_block_reason AS block
      FROM fetch_domain_state WHERE host = ${host} AND paused_until > now()
    `);
    const row = r.rows[0];
    if (!row) return null;
    return {
      until: Number(row.until_ms),
      reason: row.reason ?? '',
      setAt: ms(row.set_ms) ?? Date.now(),
      source: row.source === 'manual' ? 'manual' : 'auto',
      ...(row.block ? { blockReason: row.block as DomainPause['blockReason'] } : {}),
    };
  }

  async setPause(host: string, pause: DomainPause, mode: 'extend' | 'replace'): Promise<DomainPause> {
    const until = new Date(pause.until);
    const setAt = new Date(pause.setAt);
    const guard = mode === 'extend' ? sql`WHERE s.paused_until IS NULL OR s.paused_until <= now() OR s.paused_until < EXCLUDED.paused_until` : sql``;
    await this.db.execute(sql`
      INSERT INTO fetch_domain_state AS s (host, paused_until, pause_reason, pause_set_at, pause_source, pause_block_reason)
      VALUES (${host}, ${until}, ${pause.reason}, ${setAt}, ${pause.source}, ${pause.blockReason ?? null})
      ON CONFLICT (host) DO UPDATE SET paused_until = EXCLUDED.paused_until, pause_reason = EXCLUDED.pause_reason,
        pause_set_at = EXCLUDED.pause_set_at, pause_source = EXCLUDED.pause_source, pause_block_reason = EXCLUDED.pause_block_reason
      ${guard}
    `);
    return (await this.getPause(host)) ?? pause;
  }

  async clearPause(host: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE fetch_domain_state SET paused_until = NULL, pause_reason = NULL, pause_set_at = NULL, pause_source = NULL, pause_block_reason = NULL
      WHERE host = ${host}
    `);
  }

  async recordFailure(host: string): Promise<number> {
    const r = await this.db.execute<{ n: number }>(sql`
      INSERT INTO fetch_domain_state AS s (host, consecutive_failures) VALUES (${host}, 1)
      ON CONFLICT (host) DO UPDATE SET consecutive_failures = s.consecutive_failures + 1
      RETURNING consecutive_failures AS n
    `);
    return Number(r.rows[0]!.n);
  }

  async resetFailures(host: string): Promise<void> {
    await this.db.execute(sql`UPDATE fetch_domain_state SET consecutive_failures = 0 WHERE host = ${host} AND consecutive_failures <> 0`);
  }

  async getFailures(host: string): Promise<number> {
    const r = await this.db.execute<{ n: number }>(sql`SELECT consecutive_failures AS n FROM fetch_domain_state WHERE host = ${host}`);
    return Number(r.rows[0]?.n ?? 0);
  }

  async consumeDailyRequest(host: string, day: string, limit: number | null): Promise<DailyBudgetResult> {
    const r = await this.db.execute<{ requests: number }>(sql`
      INSERT INTO fetch_domain_daily AS d (host, day, requests)
      SELECT ${host}, ${day}::date, 1 WHERE ${limit}::int IS NULL OR ${limit}::int > 0
      ON CONFLICT (host, day) DO UPDATE SET requests = d.requests + 1 WHERE ${limit}::int IS NULL OR d.requests < ${limit}::int
      RETURNING requests
    `);
    const row = r.rows[0];
    if (row) return { allowed: true, count: Number(row.requests) };
    return { allowed: false, count: await this.getDailyCount(host, day) };
  }

  async getDailyCount(host: string, day: string): Promise<number> {
    const r = await this.db.execute<{ requests: number }>(sql`SELECT requests FROM fetch_domain_daily WHERE host = ${host} AND day = ${day}::date`);
    return Number(r.rows[0]?.requests ?? 0);
  }

  async getRobots(origin: string): Promise<RobotsCacheEntry | null> {
    const r = await this.db.execute<{
      fetched_ms: string; expires_ms: string; status: number; outcome: RobotsCacheEntry['outcome']; body: string | null; etag: string | null;
      last_modified: string | null; final_url: string | null; truncated: boolean; html_body: boolean; block_reason: string | null; detail: string | null; channel: string | null;
    }>(sql`
      SELECT (extract(epoch FROM fetched_at) * 1000)::bigint::text AS fetched_ms, (extract(epoch FROM expires_at) * 1000)::bigint::text AS expires_ms,
        status, outcome, body, etag, last_modified, final_url, truncated, html_body, block_reason, detail, channel
      FROM fetch_robots_cache WHERE origin = ${origin}
    `);
    const row = r.rows[0];
    if (!row) return null;
    return {
      origin,
      fetchedAt: Number(row.fetched_ms),
      expiresAt: Number(row.expires_ms),
      status: row.status,
      outcome: row.outcome,
      body: row.body,
      etag: row.etag,
      lastModified: row.last_modified,
      finalUrl: row.final_url,
      truncated: row.truncated,
      htmlBody: row.html_body,
      blockReason: (row.block_reason as RobotsCacheEntry['blockReason']) ?? null,
      detail: row.detail,
      channel: (row.channel as RobotsCacheEntry['channel']) ?? undefined,
    };
  }

  async setRobots(origin: string, e: RobotsCacheEntry): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO fetch_robots_cache (origin, fetched_at, expires_at, status, outcome, body, etag, last_modified, final_url, truncated, html_body, block_reason, detail, channel)
      VALUES (${origin}, ${new Date(e.fetchedAt)}, ${new Date(e.expiresAt)}, ${e.status}, ${e.outcome}, ${e.body}, ${e.etag ?? null}, ${e.lastModified ?? null},
        ${e.finalUrl ?? null}, ${e.truncated ?? false}, ${e.htmlBody ?? false}, ${e.blockReason ?? null}, ${e.detail ?? null}, ${e.channel ?? null})
      ON CONFLICT (origin) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at, status = EXCLUDED.status,
        outcome = EXCLUDED.outcome, body = EXCLUDED.body, etag = EXCLUDED.etag, last_modified = EXCLUDED.last_modified, final_url = EXCLUDED.final_url,
        truncated = EXCLUDED.truncated, html_body = EXCLUDED.html_body, block_reason = EXCLUDED.block_reason, detail = EXCLUDED.detail, channel = EXCLUDED.channel
    `);
  }
}
