import { facetCounts, listProducts, type ListResult } from '@pretoscop/search';
import { SlidersHorizontal } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { NotFoundResponse } from '@/components/http/not-found-status';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { Breadcrumbs, type Crumb } from '@/components/listing/breadcrumbs';
import { ProductGrid } from '@/components/listing/product-card';
import { Pagination } from '@/components/listing/pagination';
import { JsonLd } from '@/components/seo/json-ld';
import { Container } from '@/components/ui/container';
import { categoryHref, getBrands, getCategoryTree, type CategoryNode } from '@/lib/catalog';
import { serverEnv } from '@/lib/db';
import { inSentence, plural } from '@/lib/format';
import { meili, names, q } from '@/lib/search';
import { forMetadata, pageOrNotFound, robotsFor, unresolvedMetadata } from '@/lib/seo';
import { breadcrumbList, itemList } from '@/lib/structured-data';

// docs/03 §7.1: ISR 1 h. Rendered on first request, never at build time (no database needed to build).
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

const PER_PAGE = 24;
type Props = { params: Promise<{ path: string[] }> };

interface CategoryPage {
  node: CategoryNode;
  page: number;
  list: ListResult;
  crumbs: Crumb[];
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * `/c/tv-audio/televizoare/2` → category + page; a trailing number is the page (slugs are never
 * numeric). Cached per request by the joined path (generateMetadata and the page share one load).
 */
const load = cache(async (key: string): Promise<CategoryPage> => {
  const segments = key.split('/');
  const parts = segments.map((s) => decode(s).toLowerCase());
  let page = 1;
  if (parts.length > 1 && /^\d+$/.test(parts.at(-1)!)) page = Number(parts.pop());
  const tree = await getCategoryTree();
  const node = tree.byPath.get(parts.join('/'));
  if (!node) {
    // An old or shortened link (`/c/televizoare`): send it to the canonical path.
    const bySlug = tree.bySlug.get(parts.at(-1) ?? '');
    if (bySlug) permanentRedirect(categoryHref(bySlug, page));
    notFound();
  }
  if (page <= 1 && segments.length > node.path.split('/').length) permanentRedirect(categoryHref(node));
  const list = await listProducts(meili(), names(), {
    filter: [`category_slugs = ${q(node.slug)}`],
    sort: ['popularity:desc', 'min_total_bani:asc'],
    page,
    perPage: PER_PAGE,
    facets: ['brand_slug', 'category_slug', 'indexable'],
  });
  if (page > 1 && page > list.totalPages) notFound();
  const crumbs: Crumb[] = [
    { name: 'Pretoscop', href: '/' },
    { name: 'Categorii', href: '/categorii' },
    ...(node.parent ? [{ name: node.parent.name, href: categoryHref(node.parent) }] : []),
    { name: node.name, href: categoryHref(node) },
  ];
  return { node, page, list, crumbs };
});

const indexableCount = (list: ListResult) => list.facets.indexable?.true ?? 0;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const loaded = await forMetadata(() => load(path.join('/')));
  if (!loaded) return unresolvedMetadata();
  const { node, page, list } = loaded;
  const n = list.total;
  const title = page > 1 ? `${node.name} – pagina ${page}` : n > 0 ? `${node.name} – compară prețurile la ${plural(n, 'produs', 'produse')}` : node.name;
  return {
    title,
    description:
      n > 0
        ? `${node.name}: ${plural(n, 'produs', 'produse')} cu prețul total (preț + livrare) din magazinele online din România și istoricul prețului observat de Pretoscop.`
        : `${node.name}: categoria în care Pretoscop va compara prețurile din magazinele online din România.`,
    alternates: { canonical: categoryHref(node, page), languages: { 'ro-RO': categoryHref(node, page) } },
    robots: robotsFor(indexableCount(list) > 0),
    openGraph: { title, url: categoryHref(node, page), type: 'website' },
  };
}

export default async function CategoryPage({ params }: Props) {
  const loaded = await pageOrNotFound(async () => load((await params).path.join('/')));
  if (!loaded) {
    return (
      <NotFoundResponse>
        <NotFoundContent />
      </NotFoundResponse>
    );
  }
  const { node, page, list, crumbs } = loaded;
  const [tree, brands] = await Promise.all([getCategoryTree(), getBrands()]);
  const base = serverEnv().PUBLIC_BASE_URL;
  const childCounts = list.facets.category_slug ?? {};
  const brandFacet = Object.entries(list.facets.brand_slug ?? {})
    .filter(([slug]) => brands.has(slug))
    .sort((a, b) => b[1] - a[1]);
  const indexableHrefs = list.hits.filter((h) => h.indexable).map((h) => `/p/${h.slug}`);

  return (
    <Container className="py-6">
      <JsonLd data={[breadcrumbList(base, crumbs), ...(indexableHrefs.length ? [itemList(base, node.name, indexableHrefs, (page - 1) * PER_PAGE + 1)] : [])]} />
      <Breadcrumbs items={crumbs} />
      <h1 className="text-2xl font-bold text-ink">
        {node.name}
        {page > 1 && <span className="text-base font-normal text-muted"> · pagina {page}</span>}
      </h1>
      {list.total > 0 ? (
        <p className="mt-1 text-sm text-ink-soft">
          {plural(list.total, 'produs', 'produse')}
          {brandFacet.length > 0 && ` de la ${plural(brandFacet.length, 'marcă', 'mărci')}`}, cu prețul total (preț + livrare cunoscută) din magazinele
          pe care le acoperim. Ordonate după popularitate, apoi după preț.
        </p>
      ) : null}

      {node.children.length > 0 && (
        <section aria-labelledby="subcategorii" className="mt-5">
          <h2 id="subcategorii" className="sr-only">
            Subcategorii
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {node.children.map((c) => {
              const n = childCounts[c.slug] ?? 0;
              return (
                <li key={c.slug}>
                  {n > 0 ? (
                    <Link href={categoryHref(c)} className="flex h-full flex-col rounded-lg bg-white px-3 py-2.5 ring-1 ring-line hover:ring-brand-300">
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="text-xs text-muted">{plural(n, 'produs', 'produse')}</span>
                    </Link>
                  ) : (
                    <span className="flex h-full flex-col rounded-lg bg-surface px-3 py-2.5 text-muted ring-1 ring-line">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs">în curând</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {list.total === 0 ? (
        <EmptyCategory node={node} roots={tree.roots} />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {brandFacet.slice(0, 12).map(([slug, n]) => (
              <BrandChip key={slug} href={`/b/${slug}/${node.slug}`} name={brands.get(slug)!.name} n={n} />
            ))}
            <a href={`/cauta?categorie=${node.slug}`} rel="nofollow" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
              <SlidersHorizontal className="size-4" aria-hidden /> Filtrează și ordonează
            </a>
          </div>
          {brandFacet.length > 12 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-brand-700">Toate mărcile ({brandFacet.length})</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {brandFacet.slice(12).map(([slug, n]) => (
                  <BrandChip key={slug} href={`/b/${slug}/${node.slug}`} name={brands.get(slug)!.name} n={n} />
                ))}
              </div>
            </details>
          )}
          <div className="mt-4">
            <ProductGrid products={list.hits} placement="category" />
          </div>
          <Pagination page={page} totalPages={list.totalPages} href={(n) => categoryHref(node, n)} />
        </>
      )}
    </Container>
  );
}

function BrandChip({ href, name, n }: { href: string; name: string; n: number }) {
  return (
    <Link href={href} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line hover:bg-brand-50">
      {name} <span className="text-muted">{n}</span>
    </Link>
  );
}

async function EmptyCategory({ node, roots }: { node: CategoryNode; roots: CategoryNode[] }) {
  const counts = (await facetCounts(meili(), names(), [], ['category_slugs'])).facets.category_slugs ?? {};
  const rootsWithProducts = roots.filter((r) => r.slug !== node.slug && (counts[r.slug] ?? 0) > 0);
  return (
    <div className="mt-4 max-w-2xl rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-line" data-testid="empty-category">
      <p className="font-semibold text-ink">Încă nu avem prețuri pentru {inSentence(node.name)}.</p>
      <p className="mt-1 text-sm text-ink-soft">
        Adăugăm magazine și categorii treptat și afișăm doar prețuri pe care le-am verificat noi. Vezi{' '}
        <Link href="/magazine" className="text-brand-700 underline">
          magazinele incluse
        </Link>{' '}
        sau alte categorii:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rootsWithProducts.map((c) => (
          <li key={c.slug}>
            <Link href={categoryHref(c)} className="inline-block rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line hover:bg-brand-50">
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
