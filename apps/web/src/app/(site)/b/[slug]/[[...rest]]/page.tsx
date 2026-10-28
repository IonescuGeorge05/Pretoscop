import { BRAND_CATEGORY_MIN_PRODUCTS } from '@pretoscop/core';
import { listProducts, type ListResult } from '@pretoscop/search';
import { SlidersHorizontal } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/listing/breadcrumbs';
import { ProductGrid } from '@/components/listing/product-card';
import { Pagination } from '@/components/listing/pagination';
import { JsonLd } from '@/components/seo/json-ld';
import { Container } from '@/components/ui/container';
import { categoryHref, getBrands, getCategoryTree, type BrandInfo, type CategoryNode } from '@/lib/catalog';
import { serverEnv } from '@/lib/db';
import { plural } from '@/lib/format';
import { meili, names, q } from '@/lib/search';
import { robotsFor } from '@/lib/seo';
import { breadcrumbList, itemList } from '@/lib/structured-data';

// docs/03 §7.1: ISR 1 h, rendered on first request.
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

const PER_PAGE = 24;
type Props = { params: Promise<{ slug: string; rest?: string[] }> };

interface BrandPage {
  brand: BrandInfo;
  category: CategoryNode | null;
  page: number;
  list: ListResult;
  crumbs: Crumb[];
  href: (page: number) => string;
}

/**
 * `/b/samsung`, `/b/samsung/2`, `/b/samsung/televizoare`, `/b/samsung/televizoare/2`. A brand ×
 * category page exists only when the brand has products in that category, and is indexable (a
 * curated landing page, docs/03 §6.6) from BRAND_CATEGORY_MIN_PRODUCTS indexable products.
 */
const load = cache(async (slug: string, rest: string[]): Promise<BrandPage> => {
  const brand = (await getBrands()).get(slug.toLowerCase());
  if (!brand) notFound();
  const parts = [...rest];
  let page = 1;
  if (parts.length && /^\d+$/.test(parts.at(-1)!)) page = Number(parts.pop());
  if (parts.length > 1) notFound();
  const tree = await getCategoryTree();
  const category = parts[0] ? (tree.bySlug.get(parts[0]) ?? notFound()) : null;
  const base = `/b/${brand.slug}${category ? `/${category.slug}` : ''}`;
  const href = (n: number) => (n > 1 ? `${base}/${n}` : base);
  // `/b/samsung/1` and `/b/samsung/0` → the canonical first page.
  if (rest.length && page <= 1 && /^\d+$/.test(rest.at(-1)!)) permanentRedirect(href(1));
  const list = await listProducts(meili(), names(), {
    filter: [`brand_slug = ${q(brand.slug)}`, ...(category ? [`category_slugs = ${q(category.slug)}`] : [])],
    sort: ['popularity:desc', 'min_total_bani:asc'],
    page,
    perPage: PER_PAGE,
    facets: ['category_slug', 'indexable'],
  });
  if ((category && list.total === 0) || (page > 1 && page > list.totalPages)) notFound();
  const crumbs: Crumb[] = category
    ? [
        { name: 'Pretoscop', href: '/' },
        { name: 'Categorii', href: '/categorii' },
        ...(category.parent ? [{ name: category.parent.name, href: categoryHref(category.parent) }] : []),
        { name: category.name, href: categoryHref(category) },
        { name: brand.name, href: base },
      ]
    : [
        { name: 'Pretoscop', href: '/' },
        { name: brand.name, href: base },
      ];
  return { brand, category, page, list, crumbs, href };
});

function heading(p: BrandPage): string {
  return p.category ? `${p.category.name} ${p.brand.name}` : p.brand.name;
}

function pageIndexable(p: BrandPage): boolean {
  const n = p.list.facets.indexable?.true ?? 0;
  return p.category ? n >= BRAND_CATEGORY_MIN_PRODUCTS : n > 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, rest } = await params;
  const p = await load(slug, rest ?? []);
  const n = p.list.total;
  const h = heading(p);
  const cats = Object.keys(p.list.facets.category_slug ?? {}).length;
  const title =
    p.page > 1 ? `${h} – pagina ${p.page}` : p.category ? `${h} – compară prețurile la ${plural(n, 'model', 'modele')}` : `${h}: prețuri la ${plural(n, 'produs', 'produse')}${cats > 1 ? ` în ${plural(cats, 'categorie', 'categorii')}` : ''}`;
  return {
    title,
    description: `${h}: ${plural(n, 'produs', 'produse')} cu prețul total (preț + livrare) din magazinele online din România și istoricul prețului observat de Pretoscop.`,
    alternates: { canonical: p.href(p.page) },
    robots: robotsFor(pageIndexable(p)),
    openGraph: { title, url: p.href(p.page), type: 'website' },
  };
}

export default async function BrandPageView({ params }: Props) {
  const { slug, rest } = await params;
  const p = await load(slug, rest ?? []);
  const tree = await getCategoryTree();
  const base = serverEnv().PUBLIC_BASE_URL;
  const h = heading(p);
  const cats = Object.entries(p.list.facets.category_slug ?? {})
    .filter(([s]) => tree.bySlug.has(s))
    .sort((a, b) => b[1] - a[1]);
  const indexableHrefs = p.list.hits.filter((x) => x.indexable).map((x) => `/p/${x.slug}`);
  const filterHref = `/cauta?marca=${p.brand.slug}${p.category ? `&categorie=${p.category.slug}` : ''}`;

  return (
    <Container className="py-6">
      <JsonLd data={[breadcrumbList(base, p.crumbs), ...(indexableHrefs.length ? [itemList(base, h, indexableHrefs, (p.page - 1) * PER_PAGE + 1)] : [])]} />
      <Breadcrumbs items={p.crumbs} />
      <h1 className="text-2xl font-bold text-ink">
        {h}
        {p.page > 1 && <span className="text-base font-normal text-muted"> · pagina {p.page}</span>}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {p.list.total > 0
          ? `${plural(p.list.total, 'produs', 'produse')} ${p.brand.name} cu prețul total din magazinele pe care le acoperim. Ordonate după popularitate, apoi după preț.`
          : `Momentan nu avem oferte verificate pentru produse ${p.brand.name}.`}
      </p>

      {p.list.total > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {p.category ? (
            <Link href={`/b/${p.brand.slug}`} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line hover:bg-brand-50">
              Toate produsele {p.brand.name}
            </Link>
          ) : (
            cats.map(([s, n]) => (
              <Link key={s} href={`/b/${p.brand.slug}/${s}`} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line hover:bg-brand-50">
                {tree.bySlug.get(s)!.name} <span className="text-muted">{n}</span>
              </Link>
            ))
          )}
          <a href={filterHref} rel="nofollow" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
            <SlidersHorizontal className="size-4" aria-hidden /> Filtrează și ordonează
          </a>
        </div>
      )}

      {p.list.total > 0 ? (
        <>
          <div className="mt-4">
            <ProductGrid products={p.list.hits} placement="brand" />
          </div>
          <Pagination page={p.page} totalPages={p.list.totalPages} href={p.href} />
        </>
      ) : (
        <p className="mt-4">
          <Link href="/categorii" className="text-brand-700 underline">
            Vezi categoriile
          </Link>
        </p>
      )}
    </Container>
  );
}
