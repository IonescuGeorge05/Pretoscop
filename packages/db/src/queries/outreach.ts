import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import type { OutreachStatus } from '../schema/outreach';

/**
 * Exit tracker for the assisted-access channel (M21; docs/12 §2b "Exit per shop", ADR-015): for
 * every shop read through the channel, how it performed over the last 30 days (`request_log`
 * keeps 30 days), what it cost this month (`access_costs`, the M05B ledger), whether a replacement
 * feed already runs, and where the outreach for a feed or an allowlist stands. Once a replacement
 * is live, a founder switches the shop's access mode off `assisted` (shop registry, audited).
 */
export interface AssistedMigrationRow {
  shopId: number;
  slug: string;
  name: string;
  legalBasisRef: string | null;
  /** Requests sent through the channel in the last 30 days. */
  requests30d: number;
  /** Share of them that came back usable (2xx or 304, not blocked, no error); null without requests. */
  successRate30d: number | null;
  /** Vendor cost booked this calendar month (Europe/Bucharest), euro cents, from the `access_costs` ledger. */
  costMonthCents: number;
  /** An enabled, not kill-switched feed source (merchant or affiliate) succeeded in the last 3 days. */
  feedLive: boolean;
  /** The latest outreach entry for the shop. */
  outreachStatus: OutreachStatus | null;
  outreachAt: Date | null;
  nextStepAt: Date | null;
}

interface Row extends Record<string, unknown> {
  id: string | number;
  slug: string;
  name: string;
  legal_basis_ref: string | null;
  requests: number;
  ok: number;
  cost_cents: number;
  feed_live: boolean;
  status: OutreachStatus | null;
  created_at: string | Date | null;
  next_step_at: string | Date | null;
}

const asDate = (v: string | Date | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

export async function assistedMigrationStatus(db: Db): Promise<AssistedMigrationRow[]> {
  const res = await db.execute<Row>(sql`
    SELECT s.id, s.slug, s.name, s.legal_basis_ref,
           coalesce(r.n, 0)::int AS requests, coalesce(r.ok, 0)::int AS ok,
           (SELECT coalesce(sum(c.cost_cents), 0) FROM access_costs c
             WHERE c.shop_id = s.id AND c.day >= date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS cost_cents,
           EXISTS (
             SELECT 1 FROM shop_sources f
              WHERE f.shop_id = s.id AND f.kind = 'feed' AND f.enabled AND NOT f.kill_switch
                AND f.last_success_at > now() - interval '3 days'
           ) AS feed_live,
           o.status, o.created_at, o.next_step_at
      FROM shops s
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               count(*) FILTER (WHERE NOT blocked AND error_code IS NULL AND (status BETWEEN 200 AND 299 OR status = 304)) AS ok
          FROM request_log
         WHERE shop_slug = s.slug AND channel = 'assisted' AND attempt > 0 AND ts > now() - interval '30 days'
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT status, created_at, next_step_at FROM outreach WHERE shop_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1
      ) o ON true
     WHERE s.access_mode = 'assisted'
     ORDER BY s.name`);
  return res.rows.map((r) => ({
    shopId: Number(r.id),
    slug: r.slug,
    name: r.name,
    legalBasisRef: r.legal_basis_ref,
    requests30d: Number(r.requests),
    successRate30d: Number(r.requests) > 0 ? Number(r.ok) / Number(r.requests) : null,
    costMonthCents: Number(r.cost_cents),
    feedLive: r.feed_live,
    outreachStatus: r.status,
    outreachAt: asDate(r.created_at),
    nextStepAt: asDate(r.next_step_at),
  }));
}
