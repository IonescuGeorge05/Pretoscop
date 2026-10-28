import { ASSISTED_DESIGNATED_SHOPS } from '@pretoscop/config';
import { sql } from '@pretoscop/db';
import { Health, Section, Stat, Table, Td } from '@/components/admin/ui';
import { db, serverEnv } from '@/lib/db';
import { formatDateTime, formatRelative } from '@/lib/format';
import { setFlagAction, setShopKill } from '../../actions';

const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/**
 * Assisted-access channel (M05B, ADR-015): state of the designated shops, success rate, cost
 * against the monthly cap, kill switch per shop. Access mode and legal basis are read-only here:
 * they change only in the registry YAML, reviewed in git (M04).
 */
export default async function AssistedAccessPage() {
  const env = serverEnv();
  const d = db();
  const designated = sql.join(ASSISTED_DESIGNATED_SHOPS.map((s) => sql`${s}`), sql`, `);
  const [shops, totals, flag, events] = await Promise.all([
    d.execute<{
      id: string; slug: string; name: string; status: string; access_mode: string; legal_basis_ref: string | null;
      live: number; killed: number; month_cents: number; today_requests: number; attempts_7d: number; ok_7d: number; tier: string | null;
    }>(sql`
      SELECT p.id::text, p.slug, p.name, p.status, p.access_mode, p.legal_basis_ref, p.crawl_policy->>'assisted_tier' AS tier,
        (SELECT count(*) FROM shop_sources x WHERE x.shop_id = p.id AND x.enabled AND NOT x.kill_switch)::int AS live,
        (SELECT count(*) FROM shop_sources x WHERE x.shop_id = p.id AND x.kill_switch)::int AS killed,
        (SELECT coalesce(sum(cost_cents), 0) FROM access_costs c WHERE c.shop_id = p.id
           AND c.day >= date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS month_cents,
        (SELECT coalesce(sum(requests), 0) FROM access_costs c WHERE c.shop_id = p.id
           AND c.day = (now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS today_requests,
        (SELECT count(*) FROM request_log r WHERE r.shop_slug = p.slug AND r.channel = 'assisted' AND r.attempt > 0
           AND r.ts > now() - interval '7 days')::int AS attempts_7d,
        (SELECT count(*) FROM request_log r WHERE r.shop_slug = p.slug AND r.channel = 'assisted' AND r.attempt > 0
           AND r.ts > now() - interval '7 days'
           AND NOT r.blocked AND r.error IS NULL AND r.status BETWEEN 200 AND 499 AND r.status NOT IN (403, 429))::int AS ok_7d
      FROM shops p WHERE p.slug IN (${designated}) ORDER BY p.slug`),
    d.execute<{ month_cents: number; today_requests: number }>(sql`
      SELECT
        (SELECT coalesce(sum(cost_cents), 0) FROM access_costs WHERE day >= date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS month_cents,
        (SELECT coalesce(sum(requests), 0) FROM access_costs WHERE day = (now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS today_requests`),
    d.execute<{ enabled: boolean }>(sql`SELECT enabled FROM feature_flags WHERE key = 'assisted.enabled'`),
    d.execute<{ ts: string; actor: string; action: string; entity_id: string | null; slug: string | null }>(sql`
      SELECT a.ts::text, a.actor, a.action, a.entity_id, p.slug FROM audit_log a
      LEFT JOIN shops p ON a.entity = 'shops' AND p.id::text = a.entity_id
      WHERE a.action LIKE 'assisted.%' OR (a.entity = 'shops' AND a.action IN ('shop.kill_all', 'shop.unkill_all') AND p.slug IN (${designated}))
         OR (a.entity = 'feature_flags' AND a.entity_id = 'assisted.enabled')
      ORDER BY a.ts DESC LIMIT 15`),
  ]);
  const capCents = Math.round(env.ASSISTED_MONTHLY_CAP_EUR * 100);
  const spent = totals.rows[0]?.month_cents ?? 0;
  const flagOn = flag.rows[0]?.enabled ?? false;
  const vendor = env.ASSISTED_VENDOR === 'none' ? 'neconfigurat' : env.ASSISTED_VENDOR;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Acces asistat</h1>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        Canal printr-un serviciu terț de colectare a datelor (ADR-015), numai pentru magazinele desemnate de fondatori pe 27.10.2026
        (<code>docs/12-blocked-shops-strategy.md</code> §0): aceleași reguli ca PretoscopBot (robots.txt, interval, buget zilnic), doar pagini publice,
        plafon lunar cu oprire automată. Modul de acces și temeiul juridic se schimbă doar în YAML (revizuit în git); aici se vede starea și se oprește un
        magazin. Procedura: <code>infra/runbooks/assisted-access.md</code>.
      </p>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Furnizor" value={vendor} hint={env.ASSISTED_VENDOR === 'none' ? 'ASSISTED_VENDOR=none: canal oprit' : 'cheie în .env pe server'} />
        <Stat label="Flag assisted.enabled" value={flagOn ? 'pornit' : 'oprit'} hint="oprire globală, fără deploy" />
        <Stat label="Cheltuit luna aceasta" value={euro(spent)} hint={capCents > 0 ? `${Math.floor((spent / capCents) * 100)}% din plafon` : 'plafon 0: nimic permis'} />
        <Stat label="Plafon lunar" value={euro(capCents)} hint="oprire la 100%, alertă la 80%" />
        <Stat label="Cereri azi" value={(totals.rows[0]?.today_requests ?? 0).toLocaleString('ro-RO')} hint="toate magazinele" />
      </div>
      <div className="mb-6">
        <form action={setFlagAction}>
          <input type="hidden" name="key" value="assisted.enabled" />
          <input type="hidden" name="enabled" value={flagOn ? '0' : '1'} />
          <button
            className={flagOn ? 'rounded bg-high-bg px-3 py-1.5 text-sm font-semibold text-high' : 'rounded bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-line'}
            data-testid="assisted-flag"
          >
            {flagOn ? 'Oprește canalul asistat (toate magazinele)' : 'Pornește canalul asistat'}
          </button>
        </form>
      </div>
      <Section title="Magazine desemnate">
        <Table head={['Magazin', 'Mod / stare', 'Temei juridic', 'Surse', 'Succes 7 zile', 'Cereri azi', 'Cost luna', '']}>
          {shops.rows.map((s) => {
            const rate = s.attempts_7d > 0 ? s.ok_7d / s.attempts_7d : null;
            const health = rate === null ? 'unknown' : rate >= 0.9 ? 'ok' : rate >= 0.8 ? 'degraded' : 'failing';
            return (
              <tr key={s.slug}>
                <Td>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted">{s.slug}{s.tier ? ` · tier ${s.tier}` : ' · tier 5 (implicit)'}</div>
                </Td>
                <Td>
                  <div className={s.access_mode === 'assisted' ? 'font-semibold' : 'text-muted'}>{s.access_mode}</div>
                  <div className="text-xs text-muted">{s.status}</div>
                </Td>
                <Td className="max-w-[16rem] break-words text-xs">{s.legal_basis_ref ?? <span className="text-high">lipsă</span>}</Td>
                <Td className="text-xs">
                  {s.live} active{s.killed > 0 && <strong className="text-high"> · {s.killed} oprite</strong>}
                </Td>
                <Td>
                  <Health value={health} /> <span className="tabular text-xs">{rate === null ? '—' : `${(rate * 100).toFixed(1)}% din ${s.attempts_7d}`}</span>
                </Td>
                <Td className="tabular">{s.today_requests}</Td>
                <Td className="tabular">{euro(s.month_cents)}</Td>
                <Td>
                  <div className="flex gap-2">
                    <form action={setShopKill}>
                      <input type="hidden" name="shopId" value={s.id} />
                      <input type="hidden" name="on" value="1" />
                      <button className="rounded bg-high-bg px-2 py-1 text-xs font-semibold text-high" data-testid={`assisted-kill-${s.slug}`}>
                        Oprește
                      </button>
                    </form>
                    <form action={setShopKill}>
                      <input type="hidden" name="shopId" value={s.id} />
                      <input type="hidden" name="on" value="0" />
                      <button className="rounded bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-line">Repornește</button>
                    </form>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>
      <Section title="Evenimente (opriri, auto-pauze, flag)">
        <Table head={['Când', 'Cine', 'Ce', 'Magazin']}>
          {events.rows.map((e, i) => (
            <tr key={`${e.ts}-${i}`}>
              <Td className="text-xs">{formatRelative(e.ts)}<br />{formatDateTime(e.ts)}</Td>
              <Td className="text-xs">{e.actor}</Td>
              <Td className="font-mono text-xs">{e.action}</Td>
              <Td className="text-xs">{e.slug ?? e.entity_id ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <p className="text-xs text-muted">
        Succes = răspuns utilizabil de la magazin (fără blocaj, pagină de verificare sau eroare), măsurat în jurnalul de cereri. Sub 90% ieri: alertă; sub
        80% în fiecare din ultimele 7 zile: auto-pauză (toate sursele magazinului oprite, rând de audit). Repornirea o face un fondator.
      </p>
    </div>
  );
}
