import { VERDICT_MIN_DAYS } from '@pretoscop/core';
import { addDaysIso, bucharestToday, getDeals, type DealItem, type DealsResult } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { DealCard } from '@/components/deals/deal-card';
import { NotFoundResponse } from '@/components/http/not-found-status';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { Breadcrumbs, type Crumb } from '@/components/listing/breadcrumbs';
import { AllTimeLowBadge } from '@/components/price/badges';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { getCategoryTree, type CategoryNode } from '@/lib/catalog';
import { db, serverEnv } from '@/lib/db';
import { cn } from '@/lib/cn';
import { formatDate, inSentence, plural } from '@/lib/format';
import { forMetadata, pageOrNotFound, robotsFor, unresolvedMetadata } from '@/lib/seo';
import { breadcrumbList, itemList } from '@/lib/structured-data';

// docs/03 §7.1: ISR 15 min, rendered on first request (never at build time).
export const revalidate = 900;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ categorie?: string[] }> };

interface DealsPage {
  all: DealsResult;
  root: CategoryNode | null;
  roots: CategoryNode[];
  drops: DealItem[];
  lows30: DealItem[];
  crumbs: Crumb[];
  href: string;
}

/** Cards shown per list (the counts in the tabs cover every deal). */
const MAX_DROPS = 120;
const MAX_LOWS = 48;

/**
 * All deals are computed once, uncapped; a category tab filters them and then keeps the first
 * MAX_DROPS / MAX_LOWS, so a category is never empty because other categories had bigger drops, and
 * the tab counts are exact. Cached per request by the path string (generateMetadata and the page share it).
 */
const load = cache(async (key: string): Promise<DealsPage> => {
  const segments = key ? key.split('/') : [];
  if (segments.length > 1) notFound();
  const tree = await getCategoryTree();
  const root = segments[0] ? (tree.roots.find((r) => r.slug === segments[0]) ?? notFound()) : null;
  const all = await getDeals(db(), { windowDays: 7, limit: Infinity, lowsLimit: Infinity }, bucharestToday());
  const inRoot = (d: DealItem) => !root || d.rootSlug === root.slug;
  const href = root ? `/reduceri/${root.slug}` : '/reduceri';
  const crumbs: Crumb[] = [
    { name: 'Pretoscop', href: '/' },
    { name: 'Reduceri verificate', href: '/reduceri' },
    ...(root ? [{ name: root.name, href }] : []),
  ];
  return {
    all,
    root,
    roots: tree.roots,
    drops: all.drops.filter(inRoot).slice(0, MAX_DROPS),
    lows30: all.lows30.filter(inRoot).slice(0, MAX_LOWS),
    crumbs,
    href,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorie } = await params;
  const p = await forMetadata(() => load((categorie ?? []).join('/')));
  if (!p) return unresolvedMetadata();
  const title = p.root ? `Reduceri verificate: ${p.root.name}` : 'Reduceri verificate – scăderi reale de preț';
  return {
    title,
    description:
      'Scăderi de preț verificate în istoricul Pretoscop: prețul total de azi față de cel mai mic preț observat în cele 30 de zile dinaintea scăderii. Nu preluăm reducerile anunțate de magazine.',
    alternates: { canonical: p.href, languages: { 'ro-RO': p.href } },
    // An empty deals page is thin: indexable only while it lists verified drops.
    robots: robotsFor(p.drops.length > 0),
    openGraph: { title, url: p.href, type: 'website' },
  };
}

function Filters() {
  const pill =
    'cursor-pointer rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line has-[:checked]:bg-brand-600 has-[:checked]:text-white has-[:checked]:ring-brand-600 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500';
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--radius-card)] bg-surface p-3 ring-1 ring-line" data-testid="deal-filters">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Perioada</legend>
        <span className="text-sm text-muted" aria-hidden>
          Perioada:
        </span>
        <label className={pill}>
          <input type="radio" name="perioada" id="perioada-7" aria-label="Ultimele 7 zile" defaultChecked className="sr-only" /> Ultimele 7 zile
        </label>
        <label className={pill}>
          <input type="radio" name="perioada" id="perioada-azi" aria-label="Azi" className="sr-only" /> Azi
        </label>
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Scădere minimă</legend>
        <span className="text-sm text-muted" aria-hidden>
          Scădere de cel puțin:
        </span>
        {[3, 10, 20, 30].map((n) => (
          <label key={n} className={pill}>
            <input type="radio" name="scadere" id={`scadere-${n}`} aria-label={`Scădere de cel puțin ${n}%`} defaultChecked={n === 3} className="sr-only" /> {n}%
          </label>
        ))}
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" id="doar-minime" aria-label="Doar minime istorice" className="size-4 accent-brand-600" /> Doar minime istorice
      </label>
    </div>
  );
}

export default async function DealsPageView({ params }: Props) {
  const key = ((await params).categorie ?? []).join('/');
  const p = await pageOrNotFound(() => load(key));
  if (!p) {
    return (
      <NotFoundResponse>
        <NotFoundContent />
      </NotFoundResponse>
    );
  }
  const { all } = p;
  const base = serverEnv().PUBLIC_BASE_URL;
  const countByRoot = new Map<string, number>();
  for (const d of all.drops) if (d.rootSlug) countByRoot.set(d.rootSlug, (countByRoot.get(d.rootSlug) ?? 0) + 1);
  const firstPossible = all.historyStartedAt ? addDaysIso(all.historyStartedAt, VERDICT_MIN_DAYS) : null;

  return (
    <Container className="py-6">
      <JsonLd data={[breadcrumbList(base, p.crumbs), ...(p.drops.length ? [itemList(base, 'Reduceri verificate', p.drops.map((d) => `/p/${d.slug}`))] : [])]} />
      <Breadcrumbs items={p.crumbs} />
      <h1 className="text-2xl font-bold text-ink">Reduceri verificate{p.root ? `: ${p.root.name}` : ''}</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Scăderi de preț pe care le-am verificat în istoricul nostru: prețul total de acum este cu cel puțin 3% sub cel mai mic preț observat de Pretoscop
        în cele 30 de zile dinaintea scăderii, din cel puțin {VERDICT_MIN_DAYS} zile observate. Nu preluăm reducerile anunțate de magazine.{' '}
        <Link href="/metodologie#reduceri" className="text-brand-700 underline">
          Cum verificăm reducerile
        </Link>
      </p>

      <nav aria-label="Categorii" className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto pb-1 text-sm">
        <Link href="/reduceri" aria-current={!p.root ? 'page' : undefined} className={cn('shrink-0 rounded-full px-3 py-1 ring-1', !p.root ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-line hover:bg-brand-50')}>
          Toate <span className={!p.root ? 'opacity-90' : 'text-muted'}>{all.drops.length}</span>
        </Link>
        {p.roots.map((r) => {
          const n = countByRoot.get(r.slug) ?? 0;
          const current = p.root?.slug === r.slug;
          return n > 0 || current ? (
            <Link key={r.slug} href={`/reduceri/${r.slug}`} aria-current={current ? 'page' : undefined} className={cn('shrink-0 rounded-full px-3 py-1 ring-1', current ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-line hover:bg-brand-50')}>
              {r.name} <span className={current ? 'opacity-90' : 'text-muted'}>{n}</span>
            </Link>
          ) : (
            <span key={r.slug} className="shrink-0 rounded-full px-3 py-1 text-muted ring-1 ring-line">
              {r.name} <span>0</span>
            </span>
          );
        })}
      </nav>

      {p.drops.length > 0 ? (
        <section aria-labelledby="scaderi" className="deals mt-4 space-y-4">
          <h2 id="scaderi" className="sr-only">
            Scăderi verificate în ultimele 7 zile
          </h2>
          <Filters />
          <ul className="grid gap-3 md:grid-cols-2" data-testid="deals">
            {p.drops.map((d, i) => (
              <DealCard key={d.id} d={d} today={all.today} priority={i < 2} />
            ))}
          </ul>
          <p className="text-xs text-muted">Filtrele ascund pe loc reducerile care nu se potrivesc; dacă nu mai vezi nimic, alege un prag mai mic.</p>
        </section>
      ) : (
        <div className="mt-6 max-w-3xl rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-line" data-testid="no-deals">
          <p className="font-semibold text-ink">Nicio reducere verificată în ultimele 7 zile{p.root ? ` la ${inSentence(p.root.name)}` : ''}.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {all.eligibleProducts === 0
              ? `Avem încă prea puțin istoric: o reducere se poate verifica doar după ce am observat prețul cel puțin ${VERDICT_MIN_DAYS} zile.${
                  firstPossible ? ` Istoricul nostru a început pe ${formatDate(`${all.historyStartedAt}T12:00:00Z`)}; primele reduceri verificate pot apărea după ${formatDate(`${firstPossible}T12:00:00Z`)}.` : ''
                }`
              : `Urmărim ${plural(all.eligibleProducts, 'produs', 'produse')} cu istoric suficient; când prețul unuia scade sub minimul celor 30 de zile dinainte, apare aici.`}
          </p>
        </div>
      )}

      {p.lows30.length > 0 && (
        <section aria-labelledby="minime" className="mt-10">
          <h2 id="minime" className="text-lg font-semibold">
            La minimul ultimelor 30 de zile
          </h2>
          <p className="mb-3 text-sm text-ink-soft">Produse la cel mai mic preț din ultimele 30 de zile observate, după o perioadă cu prețuri mai mari, sau cu o scădere verificată mai veche de 7 zile.</p>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="lows30">
            {p.lows30.map((d) => (
              <DealCard key={d.id} d={d} today={all.today} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="etichete" className="mt-10 max-w-3xl rounded-[var(--radius-card)] bg-white p-5 text-sm text-ink-soft ring-1 ring-line">
        <h2 id="etichete" className="mb-2 font-semibold text-ink">
          Ce înseamnă etichetele
        </h2>
        <dl className="space-y-2">
          <div>
            <dt className="inline">
              <Badge tone="good">−X% față de minimul din 30 de zile</Badge>
            </dt>
            <dd className="mt-1">
              Prețul total de acum (preț + livrare cunoscută) față de cel mai mic preț observat de Pretoscop în cele 30 de zile dinaintea scăderii, pentru
              ofertele noi, în stoc, vândute direct de magazine. Rotunjim procentul în jos.
            </dd>
          </div>
          <div>
            <dt className="inline">
              <AllTimeLowBadge />
            </dt>
            <dd className="mt-1">Cel mai mic preț pe care l-am observat pentru produs de când îl urmărim (cel puțin {VERDICT_MIN_DAYS} zile de istoric).</dd>
          </div>
          <div>
            <dt className="inline font-medium text-ink">Prețul tăiat al magazinului</dt>
            <dd className="mt-1">
              Îl arătăm doar pe pagina produsului, ca „preț de referință afișat de magazin”; nu îl folosim pentru reducerile de aici.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Ești magazin și crezi că o informație e greșită?{' '}
          <Link href="/contact?subiect=merchant" className="text-brand-700 underline">
            Scrie-ne
          </Link>{' '}
          și verificăm observațiile pe care se sprijină.
        </p>
      </section>
    </Container>
  );
}
