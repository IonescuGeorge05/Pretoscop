import { autoMatchSample, matchMetrics, reviewQueue } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditMatchAction } from '../../catalog-actions';
import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const { q = '' } = await searchParams;
  const [queue, sample, metrics] = await Promise.all([reviewQueue(db(), 50, { q }), autoMatchSample(db(), 10), matchMetrics(db(), 7)]);
  const bySource = new Map<string, Record<string, number>>();
  for (const m of metrics) bySource.set(m.source, { ...(bySource.get(m.source) ?? {}), [m.decision]: m.n });
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Potriviri</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Oferte din zona gri a potrivirii automate ({queue.total} în total), ordonate după trafic estimat × incertitudine. Fiecare decizie devine un
        alias fix: re-potrivirea nu o mai schimbă până când identitatea ofertei se schimbă.
      </p>
      <form className="mb-3 flex items-center gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Filtrează după titlu" aria-label="Filtrează coada după titlu" className="w-72 max-w-full rounded border border-line px-2 py-1.5" />
        <button className="rounded bg-surface px-3 py-1.5 ring-1 ring-line">Filtrează</button>
      </form>
      <Section title={`Coada de verificare (${queue.items.length} din ${queue.total})`}>
        <div className="p-3">
          <ReviewQueue items={queue.items} />
        </div>
      </Section>

      <Section title="Verificare aleatorie: 10 potriviri automate" right={<Link href="/admin/potriviri" className="text-xs text-brand-700">alt eșantion</Link>}>
        <Table head={['Ofertă', 'Produs', 'Scor / motiv', '']}>
          {sample.map((s) => (
            <tr key={s.offerId} data-testid="audit-row">
              <Td>
                <div className="text-xs text-muted">{s.shop}</div>
                {s.offerTitle}
              </Td>
              <Td>
                <a href={`/p/${s.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                  {s.productTitle}
                </a>
              </Td>
              <Td className="text-xs">
                {s.score?.toFixed(3) ?? '—'} · {s.reason}
              </Td>
              <Td>
                <div className="flex gap-2">
                  {(['correct', 'wrong'] as const).map((v) => (
                    <form key={v} action={auditMatchAction}>
                      <input type="hidden" name="offerId" value={s.offerId} />
                      <input type="hidden" name="productId" value={s.productId} />
                      <input type="hidden" name="verdict" value={v} />
                      <button className={v === 'correct' ? 'rounded bg-good-bg px-2 py-1 text-xs font-semibold text-good' : 'rounded bg-high-bg px-2 py-1 text-xs font-semibold text-high'}>
                        {v === 'correct' ? 'Corect' : 'Greșit'}
                      </button>
                    </form>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Decizii pe sursă (ultimele 7 zile)">
        <Table head={['Sursă', 'accept', 'produs nou', 'de verificat', 'nepotrivite', 'respinse']}>
          {[...bySource.entries()].map(([src, d]) => (
            <tr key={src}>
              <Td className="font-mono text-xs">{src}</Td>
              <Td className="tabular">{d.accept ?? 0}</Td>
              <Td className="tabular">{d.new_product ?? 0}</Td>
              <Td className="tabular">{d.needs_review ?? 0}</Td>
              <Td className="tabular">{d.unmatched ?? 0}</Td>
              <Td className="tabular">{d.reject ?? 0}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
