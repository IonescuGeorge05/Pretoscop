import { sql } from '@pretoscop/db';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime, formatLeiNumeric } from '@/lib/format';
import { rejectQuarantineAction, releaseQuarantineAction } from '../../actions';

export default async function QuarantinePage() {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const res = await db().execute<{ id: string; observed_at: string; price: string; median_price: string | null; ratio: number | null; reason: string; title: string; shop: string; url: string }>(sql`
    SELECT q.id::text, q.observed_at::text, q.price::text, q.median_price::text, q.ratio, q.reason, o.title_raw AS title, s.slug AS shop, o.url
    FROM price_events_quarantine q JOIN offers o ON o.id = q.offer_id JOIN shops s ON s.id = o.shop_id
    WHERE q.status = 'pending' ORDER BY q.observed_at DESC LIMIT 200`);
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Carantină</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Prețuri de peste 3× sau sub 0,33× mediana pe 14 zile. Se publică automat dacă următoarea observație confirmă prețul; altfel le poți
        elibera sau respinge aici.
      </p>
      <Section title={`${res.rows.length} observații în așteptare`}>
        <Table head={['Ofertă', 'Observat', 'Preț', 'Mediana 14 zile', 'Motiv', '']}>
          {res.rows.map((q) => (
            <tr key={q.id}>
              <Td>
                <a href={q.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                  {q.title.slice(0, 80)}
                </a>
                <div className="text-xs text-muted">{q.shop}</div>
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(q.observed_at)}</Td>
              <Td className="tabular">{formatLeiNumeric(q.price)}</Td>
              <Td className="tabular">{formatLeiNumeric(q.median_price)}</Td>
              <Td className="text-xs">{q.reason}</Td>
              <Td>
                <div className="flex gap-2">
                  <form action={releaseQuarantineAction}>
                    <input type="hidden" name="id" value={q.id} />
                    <button className="rounded bg-good-bg px-2 py-1 text-xs font-semibold text-good">Publică</button>
                  </form>
                  <form action={rejectQuarantineAction}>
                    <input type="hidden" name="id" value={q.id} />
                    <button className="rounded bg-high-bg px-2 py-1 text-xs font-semibold text-high">Respinge</button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
