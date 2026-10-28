import { comparatorPolicyFrom2P, type ComparatorPolicy } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric } from '../money';

/** Affiliate programs, commissions and revenue (M24). */

export interface ProgramRow {
  shopId: number;
  shopSlug: string;
  shopDomain: string;
  network: string;
  status: string;
  comparatorPolicy: ComparatorPolicy;
  programExternalId: string | null;
  linkTemplate: string | null;
}

/** The program each shop's click-outs use (one per shop: an approved one first). */
export async function programsByShop(db: Db, shopIds?: number[]): Promise<Map<number, ProgramRow>> {
  const r = await db.execute<{ shop_id: string; slug: string; domain: string; network: string; status: string; policy: ComparatorPolicy; ext: string | null; tpl: string | null }>(sql`
    SELECT DISTINCT ON (ap.shop_id) ap.shop_id::text, s.slug, s.domain, ap.network, ap.status, ap.comparator_policy AS policy,
      ap.program_external_id AS ext, ap.link_template AS tpl
    FROM affiliate_programs ap JOIN shops s ON s.id = ap.shop_id
    ${shopIds ? sql`WHERE ap.shop_id = ANY(${sql.param(shopIds)}::bigint[])` : sql``}
    ORDER BY ap.shop_id, (ap.status = 'approved') DESC, (ap.comparator_policy IN ('allowed','written_ok')) DESC, ap.id`);
  return new Map(
    r.rows.map((x) => [
      Number(x.shop_id),
      { shopId: Number(x.shop_id), shopSlug: x.slug, shopDomain: x.domain, network: x.network, status: x.status, comparatorPolicy: x.policy, programExternalId: x.ext, linkTemplate: x.tpl },
    ]),
  );
}

/** One program as the 2Performant affiliate API returns it (fields we read; others ignored). */
export interface TwoPerformantProgram {
  id: number;
  name: string;
  main_url?: string | null;
  base_url?: string | null;
  unique_code?: string | null;
  cookie_life?: number | null;
  default_sale_commission_rate?: string | number | null;
  default_sale_commission_type?: string | null;
  /** Our relation to the program: accepted, pending, rejected… */
  affrequest?: { status?: string | null } | null;
  traffic_sources?: Array<{ name: string; usage: string; status?: string | null; end_at?: string | null }> | null;
}

export interface ProgramChange {
  shopSlug: string;
  network: string;
  before: { status: string; comparatorPolicy: string } | null;
  after: { status: string; comparatorPolicy: string; endsOn: string | null };
}

const hostOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(u.startsWith('http') ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

/**
 * Applies a 2Performant program list (the nightly sync, M24): each program is matched to a shop by
 * domain; status and comparator policy follow the network (Price Comparison Services yes → allowed,
 * no → forbidden, maybe/unset → unknown; a withdrawn permission becomes forbidden on its end date).
 * Every change is audited. Programs of unknown shops are returned for the admin to look at.
 */
export async function applyTwoPerformantPrograms(db: Db, programs: TwoPerformantProgram[], actor: string, today: string): Promise<{ changes: ProgramChange[]; unmatched: string[] }> {
  const shops = await db.execute<{ id: string; slug: string; domain: string }>(sql`SELECT id::text, slug, domain FROM shops`);
  const byDomain = new Map(shops.rows.map((s) => [s.domain.toLowerCase().replace(/^www\./, ''), s]));
  const changes: ProgramChange[] = [];
  const unmatched: string[] = [];
  for (const p of programs) {
    const host = hostOf(p.main_url) ?? hostOf(p.base_url);
    const shop = host ? (byDomain.get(host) ?? [...byDomain.entries()].find(([d]) => host.endsWith(`.${d}`))?.[1]) : undefined;
    if (!shop) {
      unmatched.push(`${p.name} (${host ?? 'no url'})`);
      continue;
    }
    const rel = p.affrequest?.status ?? null;
    const status = rel === 'accepted' ? 'approved' : rel === 'pending' ? 'pending' : rel === 'rejected' ? 'rejected' : 'none';
    // eMAG never gets an affiliate relationship (ADR-013), whatever the network says.
    const { policy, endsOn } = shop.slug === 'emag' ? { policy: 'forbidden' as const, endsOn: null } : comparatorPolicyFrom2P(p.traffic_sources ?? [], today);
    const rate = p.default_sale_commission_rate;
    const commission = rate != null ? `${rate}${p.default_sale_commission_type === 'fixed' ? ' lei' : '%'} / vânzare` : null;
    const cur = await db.execute<{ status: string; policy: string }>(sql`
      SELECT status, comparator_policy AS policy FROM affiliate_programs WHERE shop_id = ${Number(shop.id)} AND network = '2performant'`);
    const before = cur.rows[0] ? { status: cur.rows[0].status, comparatorPolicy: cur.rows[0].policy } : null;
    const notes = endsOn ? `Price Comparison Services allowed until ${endsOn} (180-day notice given)` : null;
    await db.execute(sql`
      INSERT INTO affiliate_programs (shop_id, network, program_external_id, commission_text, cookie_days, comparator_policy, status, notes)
      VALUES (${Number(shop.id)}, '2performant', ${p.unique_code ?? String(p.id)}, ${commission}, ${p.cookie_life ?? null}, ${policy}, ${status}, ${notes})
      ON CONFLICT (shop_id, network) DO UPDATE SET program_external_id = EXCLUDED.program_external_id, commission_text = EXCLUDED.commission_text,
        cookie_days = EXCLUDED.cookie_days, comparator_policy = EXCLUDED.comparator_policy, status = EXCLUDED.status,
        notes = coalesce(EXCLUDED.notes, affiliate_programs.notes), updated_at = now()`);
    if (!before || before.status !== status || before.comparatorPolicy !== policy) {
      const change = { shopSlug: shop.slug, network: '2performant', before, after: { status, comparatorPolicy: policy, endsOn } };
      changes.push(change);
      await db.execute(sql`
        INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
        VALUES (${actor}, 'affiliate.program_sync', 'affiliate_programs', ${shop.slug}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(change.after)}::jsonb)`);
    }
  }
  return { changes, unmatched };
}

export interface CommissionInput {
  network: string;
  networkCommissionId: string;
  shopId: number | null;
  programExternalId: string | null;
  clickId: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'paid';
  amountBani: number;
  saleAmountBani: number | null;
  currency: string;
  occurredAt: Date;
  networkUpdatedAt: Date | null;
  raw: Record<string, unknown> | null;
}

/** Idempotent import: a commission is keyed by (network, network id); status and amounts follow the network. */
export async function upsertCommissions(db: Db, rows: CommissionInput[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const c of rows) {
    const r = await db.execute<{ inserted: boolean }>(sql`
      INSERT INTO commissions (network, network_commission_id, shop_id, program_external_id, click_id, status, amount, sale_amount, currency, occurred_at, network_updated_at, raw)
      VALUES (${c.network}, ${c.networkCommissionId}, ${c.shopId}, ${c.programExternalId}, ${c.clickId}, ${c.status}, ${baniToNumeric(c.amountBani)},
        ${c.saleAmountBani === null ? null : baniToNumeric(c.saleAmountBani)}, ${c.currency}, ${c.occurredAt}, ${c.networkUpdatedAt}, ${c.raw ? JSON.stringify(c.raw) : null}::jsonb)
      ON CONFLICT (network, network_commission_id) DO UPDATE SET status = EXCLUDED.status, amount = EXCLUDED.amount, sale_amount = EXCLUDED.sale_amount,
        click_id = coalesce(EXCLUDED.click_id, commissions.click_id), shop_id = coalesce(EXCLUDED.shop_id, commissions.shop_id),
        network_updated_at = EXCLUDED.network_updated_at, raw = EXCLUDED.raw, imported_at = now()
      RETURNING (xmax = 0) AS inserted`);
    if (r.rows[0]?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/** Shop for a network program code (commission import). */
export async function shopForProgram(db: Db, network: string, programExternalId: string): Promise<number | null> {
  const r = await db.execute<{ shop_id: string }>(sql`SELECT shop_id::text FROM affiliate_programs WHERE network = ${network} AND program_external_id = ${programExternalId} LIMIT 1`);
  return r.rows[0] ? Number(r.rows[0].shop_id) : null;
}

export interface RevenueRow {
  key: string;
  label: string;
  clicks: number;
  affiliateClicks: number;
  commissions: number;
  pendingBani: number;
  acceptedBani: number;
  rejectedBani: number;
  /** Earnings per affiliate click: (accepted + paid) / affiliate clicks. */
  epcBani: number | null;
  /** Commissions per affiliate click. */
  conversion: number | null;
}

/** Revenue by shop and by day for the last `days` days (admin dashboard). */
export async function revenueSummary(db: Db, days = 30): Promise<{ byShop: RevenueRow[]; byDay: RevenueRow[] }> {
  const run = (group: 'shop' | 'day') =>
    db.execute<{ key: string; label: string; clicks: string; aff: string; n: string; pending: string; accepted: string; rejected: string }>(sql`
      WITH c AS (
        SELECT ${group === 'shop' ? sql`s.slug` : sql`(k.ts AT TIME ZONE 'Europe/Bucharest')::date::text`} AS key,
          ${group === 'shop' ? sql`s.name` : sql`(k.ts AT TIME ZONE 'Europe/Bucharest')::date::text`} AS label,
          count(*) AS clicks, count(*) FILTER (WHERE k.is_affiliate) AS aff
        FROM clicks k JOIN shops s ON s.id = k.shop_id
        WHERE k.ts > now() - make_interval(days => ${days}::int) GROUP BY 1, 2
      ),
      m AS (
        SELECT ${group === 'shop' ? sql`s.slug` : sql`(x.occurred_at AT TIME ZONE 'Europe/Bucharest')::date::text`} AS key,
          ${group === 'shop' ? sql`s.name` : sql`(x.occurred_at AT TIME ZONE 'Europe/Bucharest')::date::text`} AS label,
          count(*) AS n,
          coalesce(sum(x.amount) FILTER (WHERE x.status = 'pending'), 0) AS pending,
          coalesce(sum(x.amount) FILTER (WHERE x.status IN ('accepted','paid')), 0) AS accepted,
          coalesce(sum(x.amount) FILTER (WHERE x.status = 'rejected'), 0) AS rejected
        FROM commissions x LEFT JOIN shops s ON s.id = x.shop_id
        WHERE x.occurred_at > now() - make_interval(days => ${days}::int) GROUP BY 1, 2
      )
      SELECT coalesce(c.key, m.key) AS key, coalesce(c.label, m.label, '—') AS label, coalesce(c.clicks, 0)::text AS clicks, coalesce(c.aff, 0)::text AS aff,
        coalesce(m.n, 0)::text AS n, coalesce(m.pending, 0)::text AS pending, coalesce(m.accepted, 0)::text AS accepted, coalesce(m.rejected, 0)::text AS rejected
      FROM c FULL JOIN m ON m.key = c.key
      ORDER BY 1`);
  const map = (r: { key: string; label: string; clicks: string; aff: string; n: string; pending: string; accepted: string; rejected: string }): RevenueRow => {
    const aff = Number(r.aff);
    const accepted = Math.round(Number(r.accepted) * 100);
    return {
      key: r.key ?? '—',
      label: r.label,
      clicks: Number(r.clicks),
      affiliateClicks: aff,
      commissions: Number(r.n),
      pendingBani: Math.round(Number(r.pending) * 100),
      acceptedBani: accepted,
      rejectedBani: Math.round(Number(r.rejected) * 100),
      epcBani: aff ? Math.round(accepted / aff) : null,
      conversion: aff ? Math.round((Number(r.n) / aff) * 10_000) / 10_000 : null,
    };
  };
  const [shops, daysRows] = await Promise.all([run('shop'), run('day')]);
  return { byShop: shops.rows.map(map), byDay: daysRows.rows.map(map) };
}

/** Monthly totals per network for the accountant (accepted and paid commissions by occurrence month). */
export async function invoiceTotals(db: Db, month: string): Promise<Array<{ network: string; commissions: number; acceptedBani: number; paidBani: number; pendingBani: number }>> {
  const r = await db.execute<{ network: string; n: string; accepted: string; paid: string; pending: string }>(sql`
    SELECT network, count(*)::text AS n,
      coalesce(sum(amount) FILTER (WHERE status = 'accepted'), 0)::text AS accepted,
      coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::text AS paid,
      coalesce(sum(amount) FILTER (WHERE status = 'pending'), 0)::text AS pending
    FROM commissions
    WHERE to_char(occurred_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM') = ${month}
    GROUP BY network ORDER BY network`);
  return r.rows.map((x) => ({
    network: x.network,
    commissions: Number(x.n),
    acceptedBani: Math.round(Number(x.accepted) * 100),
    paidBani: Math.round(Number(x.paid) * 100),
    pendingBani: Math.round(Number(x.pending) * 100),
  }));
}

/** Shops whose program is approved and allows comparators (the live list on /cum-castigam-bani). */
export async function partnerShops(db: Db): Promise<Array<{ name: string; network: string }>> {
  const r = await db.execute<{ name: string; network: string }>(sql`
    SELECT s.name, ap.network FROM affiliate_programs ap JOIN shops s ON s.id = ap.shop_id
    WHERE ap.status = 'approved' AND ap.comparator_policy IN ('allowed','written_ok') AND s.slug <> 'emag' AND s.status = 'active'
    ORDER BY s.name`);
  return r.rows;
}
