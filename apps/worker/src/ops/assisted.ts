import { ASSISTED_DESIGNATED_SHOPS } from '@pretoscop/config';
import type { Env } from '@pretoscop/config/env';
import { type Db, auditLog, sql } from '@pretoscop/db';
import { gauge, type MetricFamily } from './prometheus';
import type { SloAlert } from './slo';

/**
 * Health of the assisted-access channel (M05B; docs/03 §9: success ≥ 90% per shop, spend < cap,
 * auto-pause below 80% for 7 days). Success is measured on `request_log`, which records every
 * assisted request after our own block detection: a challenge page the vendor relayed (and
 * billed) is a failure here.
 */

export const SUCCESS_SLO = 0.9;
export const AUTO_PAUSE_BELOW = 0.8;
export const AUTO_PAUSE_DAYS = 7;
/** A day with fewer assisted requests than this says nothing about the success rate. */
export const MIN_ATTEMPTS_PER_DAY = 20;

const SUCCESS_SQL = sql`NOT blocked AND error IS NULL AND status BETWEEN 200 AND 499 AND status NOT IN (403, 429)`;

export interface DailySuccess {
  shop: string;
  day: string;
  attempts: number;
  ok: number;
}

/** Per shop and Bucharest day: assisted requests sent and those that got a usable answer. */
export async function assistedDailySuccess(db: Db, sinceDays: number): Promise<DailySuccess[]> {
  const res = await db.execute<{ shop: string; day: string; attempts: string; ok: string }>(sql`
    SELECT shop_slug AS shop, (ts AT TIME ZONE 'Europe/Bucharest')::date::text AS day,
      count(*)::text AS attempts, count(*) FILTER (WHERE ${SUCCESS_SQL})::text AS ok
    FROM request_log
    WHERE channel = 'assisted' AND attempt > 0 AND shop_slug IS NOT NULL
      AND ts >= (date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest') - make_interval(days => ${sinceDays})) AT TIME ZONE 'Europe/Bucharest'
    GROUP BY 1, 2 ORDER BY 1, 2`);
  return res.rows.map((r) => ({ shop: r.shop, day: r.day, attempts: Number(r.attempts), ok: Number(r.ok) }));
}

export function bucharestDayOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function monthSpend(db: Db, now: Date): Promise<{ month: string; cents: number }> {
  const month = `${bucharestDayOf(now).slice(0, 8)}01`;
  const res = await db.execute<{ cents: string }>(sql`SELECT coalesce(sum(cost_cents), 0)::text AS cents FROM access_costs WHERE day >= ${month}::date`);
  return { month, cents: Number(res.rows[0]?.cents ?? 0) };
}

/** Prometheus families for /metrics. */
export async function assistedMetricFamilies(db: Db, env: Env, now = new Date()): Promise<MetricFamily[]> {
  const [spend, daily] = await Promise.all([monthSpend(db, now), assistedDailySuccess(db, AUTO_PAUSE_DAYS)]);
  const today = bucharestDayOf(now);
  const byShop = new Map<string, { attempts: number; ok: number; today: number }>();
  for (const d of daily) {
    const s = byShop.get(d.shop) ?? { attempts: 0, ok: 0, today: 0 };
    s.attempts += d.attempts;
    s.ok += d.ok;
    if (d.day === today) s.today += d.attempts;
    byShop.set(d.shop, s);
  }
  return [
    gauge('pretoscop_assisted_vendor_configured', 'An assisted-access vendor is configured (ASSISTED_VENDOR)', env.ASSISTED_VENDOR === 'none' ? 0 : 1),
    gauge('pretoscop_assisted_spend_month_cents', 'Assisted-access spend this month (EUR cents, access_costs)', spend.cents),
    gauge('pretoscop_assisted_cap_cents', 'Monthly hard cap of the assisted channel (EUR cents)', Math.round(env.ASSISTED_MONTHLY_CAP_EUR * 100)),
    gauge(
      'pretoscop_assisted_requests_today',
      'Assisted requests sent today (Bucharest day)',
      [...byShop].map(([shop, s]) => ({ labels: { shop }, value: s.today })),
    ),
    gauge(
      'pretoscop_assisted_success_ratio_7d',
      'Share of assisted requests over the last 7 days that got a usable answer (SLO >= 0.9; auto-pause below 0.8 every day for 7 days)',
      [...byShop].filter(([, s]) => s.attempts > 0).map(([shop, s]) => ({ labels: { shop }, value: s.ok / s.attempts })),
    ),
  ];
}

/** Extra checks for the hourly SLO job: spend at 80% and 100% of the cap, yesterday's success rate. */
export async function assistedSloAlerts(db: Db, env: Env, now = new Date()): Promise<SloAlert[]> {
  const alerts: SloAlert[] = [];
  const capCents = Math.round(env.ASSISTED_MONTHLY_CAP_EUR * 100);
  const spend = await monthSpend(db, now);
  if (capCents > 0 && spend.cents >= capCents) {
    alerts.push({
      key: `assisted-spend-100:${spend.month}`,
      message: `Assisted-access spend reached the monthly cap: €${(spend.cents / 100).toFixed(2)} of €${(capCents / 100).toFixed(2)}; no assisted request is sent until the 1st`,
      details: { runbook: 'infra/runbooks/assisted-access.md' },
      everySeconds: 31 * 86_400,
    });
  } else if (capCents > 0 && spend.cents >= 0.8 * capCents) {
    alerts.push({
      key: `assisted-spend-80:${spend.month}`,
      message: `Assisted-access spend at ${Math.floor((spend.cents / capCents) * 100)}% of the monthly cap (€${(spend.cents / 100).toFixed(2)} of €${(capCents / 100).toFixed(2)})`,
      details: { runbook: 'infra/runbooks/assisted-access.md' },
      everySeconds: 31 * 86_400,
    });
  }
  const yesterday = addDays(bucharestDayOf(now), -1);
  for (const d of await assistedDailySuccess(db, 2)) {
    if (d.day !== yesterday || d.attempts < MIN_ATTEMPTS_PER_DAY) continue;
    const rate = d.ok / d.attempts;
    if (rate < SUCCESS_SLO) {
      alerts.push({
        key: `assisted-success:${d.shop}`,
        message: `Assisted access to ${d.shop}: ${(rate * 100).toFixed(1)}% of ${d.attempts} requests succeeded yesterday (SLO ≥ 90%; auto-pause after 7 days below 80%)`,
        details: { shop: d.shop, day: d.day },
        everySeconds: 86_400,
      });
    }
  }
  return alerts;
}

export interface AutoPauseDecision {
  shop: string;
  days: DailySuccess[];
  paused: boolean;
  sources: number[];
}

/**
 * Auto-pause (docs/03 §6.2): a designated shop whose assisted success rate was below 80% on each of
 * the last 7 complete days (with at least MIN_ATTEMPTS_PER_DAY requests each) is stopped by turning
 * on the kill switch of all its sources, with an audit row. Never an escalation to other tooling;
 * a founder resumes it from /admin/acces-asistat after looking at why.
 */
export async function autoPauseAssistedShops(db: Db, now = new Date()): Promise<AutoPauseDecision[]> {
  const yesterday = addDays(bucharestDayOf(now), -1);
  const window = Array.from({ length: AUTO_PAUSE_DAYS }, (_, i) => addDays(yesterday, -i));
  const daily = await assistedDailySuccess(db, AUTO_PAUSE_DAYS + 1);
  const shops = await db.execute<{ id: string; slug: string }>(sql`
    SELECT p.id::text, p.slug FROM shops p
    WHERE p.access_mode = 'assisted' AND p.slug IN (${sql.join(ASSISTED_DESIGNATED_SHOPS.map((s) => sql`${s}`), sql`, `)})
      AND EXISTS (SELECT 1 FROM shop_sources x WHERE x.shop_id = p.id AND x.enabled AND NOT x.kill_switch)`);
  const out: AutoPauseDecision[] = [];
  for (const shop of shops.rows) {
    const days = window.map((day) => daily.find((d) => d.shop === shop.slug && d.day === day) ?? { shop: shop.slug, day, attempts: 0, ok: 0 });
    const failing = days.every((d) => d.attempts >= MIN_ATTEMPTS_PER_DAY && d.ok / d.attempts < AUTO_PAUSE_BELOW);
    if (!failing) {
      out.push({ shop: shop.slug, days, paused: false, sources: [] });
      continue;
    }
    const killed = await db.execute<{ id: string }>(sql`
      UPDATE shop_sources SET kill_switch = true, updated_at = now()
      WHERE shop_id = ${Number(shop.id)} AND NOT kill_switch RETURNING id::text`);
    const sources = killed.rows.map((r) => Number(r.id));
    await db.insert(auditLog).values({
      actor: 'system:assisted.health',
      action: 'assisted.auto_pause',
      entity: 'shops',
      entityId: shop.id,
      before: { killSwitch: false, sources },
      after: { killSwitch: true, reason: `assisted success below ${AUTO_PAUSE_BELOW * 100}% on each of the last ${AUTO_PAUSE_DAYS} days`, days },
    });
    out.push({ shop: shop.slug, days, paused: true, sources });
  }
  return out;
}
