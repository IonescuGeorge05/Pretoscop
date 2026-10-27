import { sql } from '@pretoscop/db';
import { Health, Section, Stat, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDateTime, formatRelative } from '@/lib/format';

export default async function Dashboard() {
  const d = db();
  const [totals, sources, queues, assisted] = await Promise.all([
    d.execute<Record<string, string>>(sql`
      SELECT
        (SELECT count(*) FROM offers WHERE active)::text AS offers,
        (SELECT count(*) FROM offers WHERE active AND last_checked_at > now() - interval '24 hours')::text AS fresh,
        (SELECT count(*) FROM offers WHERE product_id IS NOT NULL AND active)::text AS matched,
        (SELECT count(*) FROM products WHERE status = 'active')::text AS products,
        (SELECT count(*) FROM products WHERE status = 'active' AND offer_count >= 2)::text AS products2,
        (SELECT count(*) FROM price_events WHERE observed_at > date_trunc('day', now()))::text AS events_today,
        (SELECT count(*) FROM price_events)::text AS events_total,
        (SELECT count(*) FROM offers WHERE match_status IN ('pending','unmatched'))::text AS review,
        (SELECT count(*) FROM price_events_quarantine WHERE status = 'pending')::text AS quarantine`),
    d.execute<{
      id: string; key: string; shop: string; kind: string; enabled: boolean; kill_switch: boolean; health: string;
      last_run_at: Date | null; last_success_at: string | null; slo: number; fails: number; stats: Record<string, number> | null; status: string | null;
    }>(sql`
      SELECT s.id::text, s.key, p.slug AS shop, s.kind, s.enabled, s.kill_switch, s.health, s.last_run_at::text AS last_run_at,
        s.last_success_at::text AS last_success_at, s.freshness_slo_hours AS slo, s.consecutive_failures AS fails,
        r.stats, r.status
      FROM shop_sources s JOIN shops p ON p.id = s.shop_id
      LEFT JOIN LATERAL (SELECT stats, status FROM ingest_runs WHERE source_id = s.id ORDER BY id DESC LIMIT 1) r ON true
      WHERE s.enabled OR s.last_run_at IS NOT NULL
      ORDER BY (s.health = 'ok'), s.key`),
    d.execute<{ name: string; queued: string; active: string; failed: string }>(sql`
      SELECT name, count(*) FILTER (WHERE state IN ('created','retry'))::text AS queued,
        count(*) FILTER (WHERE state = 'active')::text AS active,
        count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '24 hours')::text AS failed
      FROM pgboss.job GROUP BY name ORDER BY name`).catch(() => ({ rows: [] as { name: string; queued: string; active: string; failed: string }[] })),
    d.execute<{ requests: string; cost: string }>(sql`
      SELECT coalesce(sum(requests),0)::text AS requests, coalesce(sum(cost_cents),0)::text AS cost
      FROM access_costs WHERE day >= date_trunc('month', now())::date`),
  ]);
  const t = totals.rows[0] ?? {};
  const offers = Number(t.offers ?? 0);
  const fresh = Number(t.fresh ?? 0);
  const now = new Date();
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Panou</h1>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Oferte active" value={offers.toLocaleString('ro-RO')} hint={`${t.matched ?? 0} potrivite`} />
        <Stat label="Prospețime < 24h" value={offers ? `${Math.round((fresh / offers) * 100)}%` : '—'} hint="ținta: ≥ 90%" />
        <Stat label="Produse" value={Number(t.products ?? 0).toLocaleString('ro-RO')} hint={`${t.products2 ?? 0} cu ≥ 2 oferte`} />
        <Stat label="Evenimente azi" value={Number(t.events_today ?? 0).toLocaleString('ro-RO')} hint={`${Number(t.events_total ?? 0).toLocaleString('ro-RO')} în total`} />
        <Stat label="De revizuit" value={Number(t.review ?? 0).toLocaleString('ro-RO')} hint={`${t.quarantine ?? 0} în carantină`} />
        <Stat label="Acces asistat (luna)" value={`€${(Number(assisted.rows[0]?.cost ?? 0) / 100).toFixed(2)}`} hint={`${assisted.rows[0]?.requests ?? 0} cereri; LLM: —`} />
      </div>
      <Section title="Surse">
        <Table head={['Sursă', 'Stare', 'Ultima rulare', 'Prospețime vs SLO', 'Parsate', 'Schimbări', 'Erori', 'Blocaje']}>
          {sources.rows.map((s) => {
            const age = s.last_success_at ? (now.getTime() - new Date(s.last_success_at).getTime()) / 3_600_000 : null;
            return (
              <tr key={s.id}>
                <Td>
                  <div className="font-medium">{s.key}</div>
                  <div className="text-xs text-muted">
                    {s.kind}
                    {s.kill_switch ? ' · OPRITĂ (kill switch)' : s.enabled ? '' : ' · dezactivată'}
                  </div>
                </Td>
                <Td>
                  <Health value={s.health} /> {s.fails > 0 && <span className="text-xs text-high">×{s.fails}</span>}
                </Td>
                <Td>{s.last_run_at ? `${formatRelative(s.last_run_at)} (${s.status ?? '—'})` : '—'}</Td>
                <Td className={age !== null && age > s.slo ? 'text-high' : ''}>{age === null ? '—' : `${age.toFixed(1)} h / ${s.slo} h`}</Td>
                <Td className="tabular">{s.stats?.parsed ?? '—'}</Td>
                <Td className="tabular">{s.stats?.changed ?? '—'}</Td>
                <Td className="tabular">{s.stats?.errors ?? '—'}</Td>
                <Td className="tabular">{s.stats?.blocked ?? '—'}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>
      <Section title="Cozi (pg-boss)">
        <Table head={['Coadă', 'În așteptare', 'Active', 'Eșuate 24h']}>
          {queues.rows.map((q) => (
            <tr key={q.name}>
              <Td>{q.name}</Td>
              <Td className="tabular">{q.queued}</Td>
              <Td className="tabular">{q.active}</Td>
              <Td className="tabular">{q.failed}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <p className="text-xs text-muted">Actualizat {formatDateTime(now)}.</p>
    </div>
  );
}
