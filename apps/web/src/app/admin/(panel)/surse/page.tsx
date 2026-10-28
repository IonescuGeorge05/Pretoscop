import { sql } from '@pretoscop/db';
import { Health, Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import { runSourceNow, setKillSwitch, setShopKill } from '../../actions';

export default async function SourcesPage() {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const res = await db().execute<{
    id: string; shop_id: string; key: string; shop: string; status: string; access: string; kind: string; parser: string;
    schedule: string | null; enabled: boolean; kill_switch: boolean; health: string; last_run_at: string | null; next_run_at: string | null;
  }>(sql`
    SELECT s.id::text, p.id::text AS shop_id, s.key, p.slug AS shop, p.status, p.access_mode AS access, s.kind, s.parser_key AS parser,
      s.schedule, s.enabled, s.kill_switch, s.health, s.last_run_at::text, s.next_run_at::text
    FROM shop_sources s JOIN shops p ON p.id = s.shop_id ORDER BY p.slug, s.key`);
  const byShop = new Map<string, typeof res.rows>();
  for (const r of res.rows) byShop.set(r.shop, [...(byShop.get(r.shop) ?? []), r]);
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Surse</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Configurația vine din <code>packages/config/shops/*.yaml</code>; aici se opresc/pornesc sursele (kill switch) și se pornește o rulare manuală.
        Accesul la eMAG cere și flagul <code>source.emag.enabled</code>.
      </p>
      {[...byShop.entries()].map(([shop, rows]) => (
        <Section
          key={shop}
          title={`${shop} · ${rows[0]!.status} · ${rows[0]!.access}`}
          right={
            <div className="flex gap-2">
              <form action={setShopKill}>
                <input type="hidden" name="shopId" value={rows[0]!.shop_id} />
                <input type="hidden" name="on" value="1" />
                <button className="rounded bg-high-bg px-2 py-1 text-xs font-semibold text-high">Oprește tot magazinul</button>
              </form>
              <form action={setShopKill}>
                <input type="hidden" name="shopId" value={rows[0]!.shop_id} />
                <input type="hidden" name="on" value="0" />
                <button className="rounded bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-line">Repornește</button>
              </form>
            </div>
          }
        >
          <Table head={['Sursă', 'Parser', 'Program', 'Stare', 'Ultima / următoarea', 'Acțiuni']}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="font-medium">{s.key}</div>
                  <div className="text-xs text-muted">
                    {s.kind} · {s.enabled ? 'activată' : 'dezactivată în YAML'}
                    {s.kill_switch && <strong className="text-high"> · OPRITĂ</strong>}
                  </div>
                </Td>
                <Td>{s.parser}</Td>
                <Td className="font-mono text-xs">{s.schedule ?? 'la cerere'}</Td>
                <Td>
                  <Health value={s.health} />
                </Td>
                <Td className="text-xs">
                  {s.last_run_at ? formatRelative(s.last_run_at) : '—'}
                  <br />
                  {s.next_run_at ? `următoarea ${formatRelative(s.next_run_at)}` : ''}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <form action={setKillSwitch}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <input type="hidden" name="on" value={s.kill_switch ? '0' : '1'} />
                      <button className={s.kill_switch ? 'rounded bg-surface px-2 py-1 text-xs ring-1 ring-line' : 'rounded bg-high-bg px-2 py-1 text-xs font-semibold text-high'} data-testid={`kill-${s.key}`}>
                        {s.kill_switch ? 'Pornește' : 'Oprește'}
                      </button>
                    </form>
                    <form action={runSourceNow}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <button className="rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800" disabled={s.kill_switch || !s.enabled}>
                        Rulează acum
                      </button>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      ))}
    </div>
  );
}
