import { classShareChart, dropsChart, lei, roDay, type GroupStats, type ReportData } from '@pretoscop/report';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { findReport, PLANNED, PUBLISHED } from '@/content/reports';
import { formatDate } from '@/lib/format';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return [...PUBLISHED.map((r) => ({ id: r.id })), ...PLANNED.map((p) => ({ id: p.id }))];
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const signed = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)}%`);
const SOURCE = 'Sursa: Pretoscop, prețuri observate pe paginile publice ale magazinelor';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = findReport(id);
  const p = PLANNED.find((x) => x.id === id);
  return {
    title: r?.title ?? p?.title ?? 'Raport',
    description: r ? `Cât de reale au fost reducerile între ${formatDate(r.window.from)} și ${formatDate(r.window.to)}, din prețurile observate de Pretoscop.` : p?.summary,
    alternates: { canonical: `/rapoarte/${id}`, languages: { 'ro-RO': `/rapoarte/${id}` } },
    robots: r ? undefined : { index: false, follow: true },
  };
}

function Chart({ svg, caption }: { svg: string; caption: string }) {
  // Our own SVG built from numbers (text escaped in @pretoscop/report); scales to the column.
  return (
    <figure className="my-6">
      {/* Readable on phones: at least 640px wide, scrolling inside the card (never the page). */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] ring-1 ring-line [&>svg]:h-auto [&>svg]:w-full [&>svg]:min-w-[640px]" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mt-1 text-xs text-muted">{caption} Valorile exacte sunt în tabelele de mai jos și în fișierele CSV.</figcaption>
    </figure>
  );
}

function GroupTable({ caption, groups, first }: { caption: string; groups: GroupStats[]; first: string }) {
  return (
    <div className="my-4 overflow-x-auto rounded-[var(--radius-card)] ring-1 ring-line">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-xs text-muted">
          <tr>
            {[first, 'Oferte cu istoric', 'Reduceri afișate', 'Reduceri fără scădere reală', 'Scădere reală', 'Fără scădere reală', 'Mai scump', 'Variația mediană'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular">
          {groups
            .filter((g) => g.withHistory > 0)
            .map((g) => (
              <tr key={g.key}>
                <th scope="row" className="px-3 py-2 font-medium">
                  {g.label}
                </th>
                <td className="px-3 py-2">{g.withHistory}</td>
                <td className="px-3 py-2">{g.claims}</td>
                <td className="px-3 py-2">{g.claims ? `${g.claimsWithoutRealDrop} (${pct(g.claimsWithoutRealDropShare)})` : '—'}</td>
                <td className="px-3 py-2">{g.realDrop}</td>
                <td className="px-3 py-2">{g.noRealDrop}</td>
                <td className="px-3 py-2">{g.higher}</td>
                <td className="px-3 py-2">{signed(g.medianChangePct)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ r }: { r: ReportData }) {
  const h = r.headline;
  const period = `${roDay(r.window.from)} – ${roDay(r.window.to)} ${r.window.to.slice(0, 4)}`;
  return (
    <Container className="max-w-4xl py-10">
      <p className="text-sm text-muted">
        <Link href="/rapoarte" className="hover:underline">
          Rapoarte
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{r.title}</h1>
      <p className="mt-2 text-sm text-muted">
        Perioada: {period}. Cifre verificate de {r.approval.by} pe {r.approval.at ? formatDate(r.approval.at) : '—'}.{' '}
        <Link href="/metodologie#rapoarte" className="text-brand-700 underline">
          Metoda
        </Link>
      </p>
      {h.claims > 0 && (
        <section className="mt-8 rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line" aria-label="Pe scurt">
          <p className="text-5xl font-bold text-ink">{pct(h.claimsWithoutRealDropShare)}</p>
          <p className="mt-2 max-w-2xl text-ink-soft">
            dintre cele {h.claims} reduceri afișate nu au fost și scăderi reale: prețul din perioadă nu a coborât cu cel puțin 2% sub cel mai mic preț
            observat la același magazin în cele 30 de zile dinainte.
          </p>
        </section>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Oferte în stoc în perioadă', h.offers],
            ['Cu istoric suficient', h.withHistory],
            ['Scăderi reale', h.realDrop],
            ['Mai scumpe', h.higher],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface p-3 ring-1 ring-line">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">Pe magazine</h2>
      <Chart
        svg={classShareChart(r.byShop, { title: 'Prețurile din perioadă față de minimul ultimelor 30 de zile', subtitle: `${period}, pe magazine`, source: SOURCE })}
        caption="Oferte cu istoric suficient, pe magazine."
      />
      <GroupTable caption="Rezultatele pe magazine" groups={r.byShop} first="Magazin" />

      <h2 className="mt-10 text-xl font-semibold">Magazine și vânzători din marketplace</h2>
      <GroupTable caption="Magazine comparativ cu vânzătorii din marketplace" groups={r.bySeller} first="Vânzător" />

      <h2 className="mt-10 text-xl font-semibold">Cele mai mari scăderi reale</h2>
      <Chart svg={dropsChart(r.biggestDrops, { title: 'Cele mai mari scăderi reale', subtitle: `${period}, oferte vândute de magazine`, source: SOURCE })} caption="Primele 10 produse." />
      {r.biggestDrops.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] ring-1 ring-line">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Cele mai mari scăderi reale</caption>
            <thead className="bg-surface text-xs text-muted">
              <tr>
                {['Produs', 'Minimul celor 30 de zile', 'Minimul din perioadă', 'Scădere'].map((x) => (
                  <th key={x} scope="col" className="px-3 py-2 font-semibold">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {r.biggestDrops.slice(0, 15).map((d) => (
                <tr key={d.productId}>
                  <th scope="row" className="px-3 py-2 font-medium">
                    {d.title}
                  </th>
                  <td className="px-3 py-2">{lei(d.min30Bani)}</td>
                  <td className="px-3 py-2">
                    {lei(d.eventMinBani)} <span className="text-muted">({roDay(d.eventMinDay)})</span>
                  </td>
                  <td className="px-3 py-2">−{Math.round(d.dropPct * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-xl font-semibold">Prețuri crescute înainte, apoi reduse</h2>
      <p className="mt-2 text-ink-soft">
        {r.raiseThenCut.evaluated === 0
          ? 'Regula cere 60 de zile de istoric înaintea perioadei și nu a putut fi evaluată.'
          : `${r.raiseThenCut.cases.length} din ${r.raiseThenCut.evaluated} oferte evaluate au avut prețul crescut cu cel puțin 15% în luna dinainte și „redus” în perioadă înapoi la nivelul anterior.`}
      </p>

      {r.notes.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-semibold">Note</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 text-xl font-semibold">Date</h2>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm">
        {['oferte.csv', 'magazine.csv', 'scaderi.csv', 'crescut-redus.csv', 'report.json'].map((f) => (
          <li key={f}>
            <a href={`/rapoarte/${r.id}/date/${f}`} className="rounded-md bg-surface px-3 py-1.5 ring-1 ring-line hover:ring-brand-300" download>
              {f}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Datele pot fi preluate cu mențiunea sursei: „Pretoscop (pretoscop.ro)”.</p>
    </Container>
  );
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const r = findReport(id);
  if (r) return <Report r={r} />;
  const p = PLANNED.find((x) => x.id === id);
  if (!p) notFound();
  return (
    <Container className="max-w-3xl py-10">
      <p className="text-sm text-muted">
        <Link href="/rapoarte" className="hover:underline">
          Rapoarte
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold">{p.title}</h1>
      <p className="mt-3 rounded-[var(--radius-card)] bg-surface p-4 text-ink-soft ring-1 ring-line">
        Raportul este în pregătire (publicare estimată: {p.expected}). Nu publicăm cifre înainte să le verificăm.
      </p>
      <p className="mt-4 text-ink-soft">{p.summary}</p>
      <p className="mt-4">
        <Link href="/metodologie#rapoarte" className="text-brand-700 underline">
          Cum calculăm
        </Link>
      </p>
    </Container>
  );
}
