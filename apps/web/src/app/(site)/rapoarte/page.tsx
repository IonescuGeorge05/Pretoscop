import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { PLANNED, PUBLISHED } from '@/content/reports';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Rapoarte',
  description: 'Rapoartele Pretoscop despre reduceri, calculate din prețurile observate zilnic la magazinele din România.',
  alternates: { canonical: '/rapoarte', languages: { 'ro-RO': '/rapoarte' } },
};

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export default function ReportsIndex() {
  const published = PUBLISHED.filter((r) => r.approval.approved);
  const planned = PLANNED.filter((p) => !published.some((r) => r.id === p.id));
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-2xl font-bold">Rapoarte</h1>
      <p className="mt-2 text-ink-soft">
        Analize ale reducerilor, calculate din prețurile pe care le observăm zilnic. Metoda este descrisă pe pagina{' '}
        <Link href="/metodologie#rapoarte" className="text-brand-700 underline">
          Metodologie
        </Link>
        ; fiecare raport are datele complete de descărcat.
      </p>
      <ul className="mt-6 space-y-4">
        {published.map((r) => (
          <li key={r.id} className="rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
            <Link href={`/rapoarte/${r.id}`} className="text-lg font-semibold text-brand-700 hover:underline">
              {r.title}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {formatDate(r.window.from)} – {formatDate(r.window.to)} · {r.headline.withHistory} oferte cu istoric
            </p>
            {r.headline.claims > 0 && (
              <p className="mt-2 text-sm text-ink-soft">
                {pct(r.headline.claimsWithoutRealDropShare)} dintre reducerile afișate nu au fost și scăderi reale față de minimul ultimelor 30 de zile.
              </p>
            )}
          </li>
        ))}
        {planned.map((p) => (
          <li key={p.id} className="rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-line">
            <Link href={`/rapoarte/${p.id}`} className="text-lg font-semibold text-ink hover:underline">
              {p.title}
            </Link>
            <p className="mt-1 text-sm text-muted">În pregătire · publicare estimată: {p.expected}</p>
            <p className="mt-2 text-sm text-ink-soft">{p.summary}</p>
          </li>
        ))}
      </ul>
    </Container>
  );
}
