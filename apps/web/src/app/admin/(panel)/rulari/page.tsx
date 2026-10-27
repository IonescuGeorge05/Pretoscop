import { sql } from '@pretoscop/db';
import { Section, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { source } = await searchParams;
  const res = await db().execute<{
    id: string; key: string; started_at: string; finished_at: string | null; status: string; channel: string; trigger: string;
    stats: Record<string, number>; error_sample: string | null; snapshot_key: string | null;
  }>(sql`
    SELECT r.id::text, s.key, r.started_at::text, r.finished_at::text, r.status, r.channel, r.trigger, r.stats, r.error_sample, r.snapshot_key
    FROM ingest_runs r JOIN shop_sources s ON s.id = r.source_id
    ${source ? sql`WHERE s.key = ${source}` : sql``}
    ORDER BY r.id DESC LIMIT 200`);
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Rulări</h1>
      <Section title={source ? `Ultimele rulări pentru ${source}` : 'Ultimele 200 de rulări'}>
        <Table head={['#', 'Sursă', 'Început', 'Durată', 'Stare', 'Statistici', 'Erori (eșantion)']}>
          {res.rows.map((r) => {
            const dur = r.finished_at ? (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000 : null;
            return (
              <tr key={r.id}>
                <Td className="tabular">{r.id}</Td>
                <Td>
                  <a href={`/admin/rulari?source=${encodeURIComponent(r.key)}`} className="text-brand-700 hover:underline">
                    {r.key}
                  </a>
                  <div className="text-xs text-muted">
                    {r.channel} · {r.trigger}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{formatDateTime(r.started_at)}</Td>
                <Td className="tabular">{dur === null ? 'în curs' : `${Math.round(dur)} s`}</Td>
                <Td>{r.status}</Td>
                <Td className="font-mono text-[11px]">
                  {['fetched', 'parsed', 'upserted', 'changed', 'rejected', 'quarantined', 'blocked', 'errors'].map((k) => (r.stats[k] !== undefined ? `${k} ${r.stats[k]} ` : '')).join('')}
                </Td>
                <Td className="max-w-md whitespace-pre-wrap break-words text-[11px] text-ink-soft">{r.error_sample?.slice(0, 400) ?? ''}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}
