import { events } from '@pretoscop/db';
import { facetCounts, hasActiveFilters, parseSearchParams, searchProducts, toQueryString, type SearchParams, type SearchResult } from '@pretoscop/search';
import { SlidersHorizontal, X } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { ProductGrid } from '@/components/listing/product-card';
import { Pagination } from '@/components/listing/pagination';
import { Facets, SortLinks, activeFilterChips, searchHref } from '@/components/search/facets';
import { Container } from '@/components/ui/container';
import { categoryHref, getBrands, getCategoryTree, type CategoryTree } from '@/lib/catalog';
import { db, serverEnv } from '@/lib/db';
import { plural } from '@/lib/format';
import { clientIp, hashWithDailySalt, isBot } from '@/lib/privacy';
import { meili, names } from '@/lib/search';
import { robotsFor } from '@/lib/seo';

// Search results are rendered per request (Meilisearch answers in milliseconds) and never indexed.
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = parseSearchParams(await searchParams);
  return {
    title: p.q ? `Căutare: ${p.q}` : 'Caută produse',
    description: 'Caută un produs și compară prețul total (preț + livrare) din magazinele online din România.',
    robots: robotsFor(false),
  };
}

const POPULAR = ['iPhone 17 Pro', 'PlayStation 5', 'televizor 55', 'laptop gaming', 'Samsung Galaxy', 'MacBook Air'];

async function logSearch(p: SearchParams, r: SearchResult | null, ip: string, ua: string | null) {
  if (!serverEnv().EVENTS_ENABLED || isBot(ua)) return;
  try {
    await db()
      .insert(events)
      .values({
        name: 'search',
        props: { q: p.q.slice(0, 100), hits: r?.total ?? -1, matching: r?.matching ?? 'error', filters: hasActiveFilters(p), page: p.page, gtin: !!r?.gtin },
        sessionHash: hashWithDailySalt(ip, ua),
        path: '/cauta',
      });
  } catch {
    // Analytics never breaks search.
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const p = parseSearchParams(await searchParams);
  const [tree, brands] = await Promise.all([getCategoryTree(), getBrands()]);
  if (!p.q && !hasActiveFilters(p)) return <Landing tree={tree} />;

  let r: SearchResult | null = null;
  try {
    r = await searchProducts(meili(), names(), p);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'web.search', error: err instanceof Error ? err.message : String(err) }));
  }
  const h = await headers();
  after(() => logSearch(p, r, clientIp(h), h.get('user-agent')));
  // A barcode that names exactly one product goes straight to it.
  if (r?.gtin && r.total === 1 && r.hits[0]) redirect(`/p/${r.hits[0].slug}`);

  const chips = activeFilterChips(p, tree, brands);
  const heading = p.q ? `„${p.q}”` : 'Produse';
  return (
    <Container className="py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">
          {r && r.total > 0 && r.matching === 'all' ? `${plural(r.total, 'produs', 'produse')} pentru ${heading}` : `Căutare: ${heading}`}
        </h1>
        {r?.matching === 'last' && r.total > 0 && (
          <p className="mt-1 text-sm text-ink-soft" data-testid="relaxed-note">
            Niciun produs nu conține toate cuvintele căutate. Îți arătăm cele mai apropiate rezultate.
          </p>
        )}
        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Filtre active">
            {chips.map((c) => (
              <li key={c.to}>
                <a href={c.to} rel="nofollow" className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
                  {c.label} <X className="size-3.5" aria-hidden />
                  <span className="sr-only">(elimină)</span>
                </a>
              </li>
            ))}
            <li>
              <a href={p.q ? `/cauta?${toQueryString({ ...p, category: null, brands: [], shop: null, priceMin: null, priceMax: null, inStock: false, hasHistory: false, page: 1 })}` : '/cauta'} rel="nofollow" className="inline-block px-2 py-1 text-sm text-brand-700 underline">
                Șterge filtrele
              </a>
            </li>
          </ul>
        )}
      </div>

      {!r ? (
        <SearchUnavailable />
      ) : r.total === 0 && p.sort === 'reducere' ? (
        <NoVerifiedDrops p={p} />
      ) : r.total === 0 ? (
        <NoResults p={p} tree={tree} filtered={hasActiveFilters(p)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filtre">
            <Facets p={p} r={r} tree={tree} brands={brands} idPrefix="f-desktop" />
          </aside>
          <div className="min-w-0">
            <details className="mb-3 rounded-[var(--radius-card)] ring-1 ring-line lg:hidden">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
                <SlidersHorizontal className="size-4" aria-hidden /> Filtre{chips.length ? ` (${chips.length} active)` : ''}
              </summary>
              <div className="border-t border-line px-2 pb-2">
                <Facets p={p} r={r} tree={tree} brands={brands} idPrefix="f-mobile" />
              </div>
            </details>
            <div className="mb-3">
              <SortLinks p={p} options={p.q ? ['relevanta', 'pret-asc', 'pret-desc', 'magazine', 'reducere'] : ['populare', 'pret-asc', 'pret-desc', 'magazine', 'reducere']} />
            </div>
            <ProductGrid products={r.hits} placement="search" />
            <Pagination page={r.page} totalPages={Math.min(r.totalPages, 100)} href={(n) => searchHref(p, { page: n })} rel="nofollow" />
            <p className="mt-6 text-xs text-muted">
              Prețurile din listă sunt cele mai mici prețuri totale (preț + livrare cunoscută) ale ofertelor noi, în stoc, verificate recent. Pe pagina
              produsului vezi toate ofertele și momentul ultimei verificări.
            </p>
          </div>
        </div>
      )}
    </Container>
  );
}

async function Landing({ tree }: { tree: CategoryTree }) {
  let counts: Record<string, number> = {};
  try {
    counts = (await facetCounts(meili(), names(), [], ['category_slugs'])).facets.category_slugs ?? {};
  } catch {
    counts = {};
  }
  const roots = tree.roots.filter((c) => (counts[c.slug] ?? 0) > 0);
  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold text-ink">Ce cauți?</h1>
      <p className="mt-1 text-ink-soft">Scrie numele produsului, modelul sau codul de bare (EAN) în caseta de căutare de sus.</p>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Căutări frecvente</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {POPULAR.map((s) => (
          <li key={s}>
            <a href={`/cauta?q=${encodeURIComponent(s)}`} className="inline-block rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line hover:bg-brand-50">
              {s}
            </a>
          </li>
        ))}
      </ul>
      {roots.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Sau răsfoiește o categorie</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roots.map((c) => (
              <li key={c.slug}>
                <Link href={categoryHref(c)} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-line hover:ring-brand-300">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-muted">{plural(counts[c.slug] ?? 0, 'produs', 'produse')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}

function NoResults({ p, tree, filtered }: { p: SearchParams; tree: CategoryTree; filtered: boolean }) {
  return (
    <div className="max-w-2xl" data-testid="no-results">
      <p className="text-lg font-semibold text-ink">Nu am găsit niciun produs{filtered ? ' pentru filtrele alese' : ''}.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-soft">
        {filtered && (
          <li>
            <a href={p.q ? `/cauta?q=${encodeURIComponent(p.q)}` : '/cauta'} className="text-brand-700 underline">
              Caută fără filtre
            </a>
          </li>
        )}
        <li>Verifică scrierea sau încearcă mai puține cuvinte (de exemplu doar marca și modelul).</li>
        <li>Caută după codul de bare (EAN) de pe cutie sau după codul producătorului.</li>
      </ul>
      <p className="mt-4 text-sm text-ink-soft">
        Pretoscop compară deocamdată electronice, IT și electrocasnice, doar din magazinele pe care le acoperim. Vezi{' '}
        <Link href="/magazine" className="text-brand-700 underline">
          magazinele incluse
        </Link>{' '}
        sau răsfoiește categoriile:
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {tree.roots.map((c) => (
          <li key={c.slug}>
            <Link href={categoryHref(c)} className="inline-block rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line hover:bg-brand-50">
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Cea mai mare scădere verificată" lists only products with a verified drop; say so when there is none. */
function NoVerifiedDrops({ p }: { p: SearchParams }) {
  return (
    <div className="max-w-2xl" data-testid="no-verified-drops">
      <p className="text-lg font-semibold text-ink">Niciun produs de aici nu are acum o scădere de preț verificată de Pretoscop.</p>
      <p className="mt-2 text-ink-soft">
        Numim scădere verificată doar un preț total mai mic decât cel mai mic preț observat de noi în cele 30 de zile dinainte, după cel puțin 14 zile de
        istoric.{' '}
        <Link href="/metodologie" className="text-brand-700 underline">
          Cum verificăm
        </Link>
      </p>
      <p className="mt-3">
        <a href={`/cauta?${toQueryString({ ...p, sort: p.q ? 'relevanta' : 'populare', page: 1 })}`} rel="nofollow" className="text-brand-700 underline">
          Vezi toate produsele găsite
        </a>
      </p>
    </div>
  );
}

function SearchUnavailable() {
  return (
    <div className="max-w-2xl rounded-[var(--radius-card)] bg-usual-bg p-4 text-ink-soft ring-1 ring-amber-200" role="alert" data-testid="search-unavailable">
      <p className="font-semibold text-ink">Căutarea nu este disponibilă în acest moment.</p>
      <p className="mt-1 text-sm">
        Încearcă din nou peste câteva momente sau răsfoiește{' '}
        <Link href="/categorii" className="text-brand-700 underline">
          categoriile
        </Link>
        .
      </p>
    </div>
  );
}
