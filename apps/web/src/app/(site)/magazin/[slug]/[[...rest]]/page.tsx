import { listProducts, type ListResult } from '@pretoscop/search';
import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/listing/breadcrumbs';
import { ProductGrid } from '@/components/listing/product-card';
import { Pagination } from '@/components/listing/pagination';
import { JsonLd } from '@/components/seo/json-ld';
import { CollectionNote, ShippingNote, ShopFactsList, ShopStateBadge, shopState } from '@/components/shop/shop-facts';
import { Container } from '@/components/ui/container';
import { getCategoryTree, getShop, type ShopFacts } from '@/lib/catalog';
import { serverEnv } from '@/lib/db';
import { plural } from '@/lib/format';
import { meili, names, q } from '@/lib/search';
import { robotsFor } from '@/lib/seo';
import { breadcrumbList } from '@/lib/structured-data';

// docs/03 §7.1: ISR 1 h, rendered on first request.
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

const PER_PAGE = 24;
type Props = { params: Promise<{ slug: string; rest?: string[] }> };

interface ShopPage {
  shop: ShopFacts;
  page: number;
  list: ListResult | null;
  crumbs: Crumb[];
  href: (n: number) => string;
}

/** `/magazin/emag` and `/magazin/emag/2`: shop facts plus the products it sells (live offers). */
const load = cache(async (slug: string, rest: string[]): Promise<ShopPage> => {
  const shop = await getShop(slug.toLowerCase());
  if (!shop || shop.status === 'removed' || rest.length > 1 || (rest[0] !== undefined && !/^\d+$/.test(rest[0]))) notFound();
  const page = rest[0] ? Number(rest[0]) : 1;
  const base = `/magazin/${shop.slug}`;
  const href = (n: number) => (n > 1 ? `${base}/${n}` : base);
  if (rest[0] !== undefined && page <= 1) permanentRedirect(base);
  const list =
    shop.liveOffers > 0
      ? await listProducts(meili(), names(), {
          filter: [`shop_slugs = ${q(shop.slug)}`],
          sort: ['popularity:desc', 'min_total_bani:asc'],
          page,
          perPage: PER_PAGE,
          facets: ['category_slug'],
        })
      : null;
  if (page > 1 && (!list || page > list.totalPages)) notFound();
  const crumbs: Crumb[] = [
    { name: 'Pretoscop', href: '/' },
    { name: 'Magazine', href: '/magazine' },
    { name: shop.name, href: base },
  ];
  return { shop, page, list, crumbs, href };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, rest } = await params;
  const p = await load(slug, rest ?? []);
  const { shop } = p;
  const covered = shopState(shop).covered;
  const title = p.page > 1 ? `${shop.name} – pagina ${p.page}` : covered ? `${shop.name}: prețuri urmărite de Pretoscop la ${plural(shop.products, 'produs', 'produse')}` : `${shop.name} pe Pretoscop`;
  return {
    title,
    description: covered
      ? `Ce produse ${shop.name} urmărim, cât de des verificăm prețurile, cum le colectăm și ce știm despre livrare.`
      : `${shop.name}: de ce nu apare încă în comparațiile Pretoscop și cum poate fi inclus.`,
    alternates: { canonical: p.href(p.page) },
    robots: robotsFor(covered),
  };
}

export default async function ShopPageView({ params }: Props) {
  const { slug, rest } = await params;
  const p = await load(slug, rest ?? []);
  const { shop, list } = p;
  const tree = await getCategoryTree();
  const cats = Object.entries(list?.facets.category_slug ?? {})
    .filter(([s]) => tree.bySlug.has(s))
    .sort((a, b) => b[1] - a[1]);

  return (
    <Container className="py-6">
      <JsonLd data={breadcrumbList(serverEnv().PUBLIC_BASE_URL, p.crumbs)} />
      <Breadcrumbs items={p.crumbs} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {shop.name}
          {p.page > 1 && <span className="text-base font-normal text-muted"> · pagina {p.page}</span>}
        </h1>
        <ShopStateBadge s={shop} />
      </div>
      <p className="mt-1 text-sm">
        <a href={shop.websiteUrl} rel="nofollow noopener" target="_blank" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
          {shop.domain} <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(se deschide într-o filă nouă)</span>
        </a>
      </p>

      {p.page === 1 && (
        <div className="mt-5 space-y-5">
          {shop.status !== 'blocked' && <ShopFactsList s={shop} />}
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="colectare" className="rounded-[var(--radius-card)] bg-white p-4 text-sm text-ink-soft ring-1 ring-line [&_a]:text-brand-700 [&_a]:underline">
              <h2 id="colectare" className="mb-1 font-semibold text-ink">
                Cum colectăm prețurile
              </h2>
              <CollectionNote s={shop} />
            </section>
            {shop.status !== 'blocked' && (
              <section aria-labelledby="livrare" className="rounded-[var(--radius-card)] bg-white p-4 text-sm text-ink-soft ring-1 ring-line [&_ul]:list-disc [&_ul]:pl-5">
                <h2 id="livrare" className="mb-1 font-semibold text-ink">
                  Livrare
                </h2>
                <ShippingNote s={shop} />
                {shop.warrantyMonths !== null && (
                  <p className="mt-1">Garanție: de obicei {plural(shop.warrantyMonths, 'lună', 'luni')}; verifică pe pagina produsului, mai ales la vânzătorii din marketplace.</p>
                )}
              </section>
            )}
          </div>
          <p className="text-xs text-muted">
            Reprezinți {shop.name}? <Link href="/pentru-magazine" className="text-brand-700 underline">Trimite-ne un feed</Link> sau{' '}
            <Link href="/contact?subiect=merchant" className="text-brand-700 underline">
              scrie-ne
            </Link>
            {shop.status === 'blocked' ? '.' : (
              <>
                {' '}pentru corecturi; ne poți cere și oprirea colectării (
                <Link href="/contact?subiect=shop_objection" className="text-brand-700 underline">
                  obiecție magazin
                </Link>
                ).
              </>
            )}
          </p>
        </div>
      )}

      {list && list.total > 0 && (
        <section aria-labelledby="produse" className="mt-8">
          <h2 id="produse" className="text-lg font-semibold">
            Produse {shop.name} pe care le urmărim{' '}
            <span className="text-sm font-normal text-muted">({plural(list.total, 'produs', 'produse')})</span>
          </h2>
          {cats.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {cats.map(([s, n]) => (
                <li key={s}>
                  <a href={`/cauta?magazin=${shop.slug}&categorie=${s}`} rel="nofollow" className="inline-block rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line hover:bg-brand-50">
                    {tree.bySlug.get(s)!.name} <span className="text-muted">{n}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <ProductGrid products={list.hits} placement="shop" />
          </div>
          <Pagination page={p.page} totalPages={list.totalPages} href={p.href} />
        </section>
      )}
    </Container>
  );
}
