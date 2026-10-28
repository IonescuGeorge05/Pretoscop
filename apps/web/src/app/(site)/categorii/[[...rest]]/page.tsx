import { facetCounts } from '@pretoscop/search';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/listing/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { Container } from '@/components/ui/container';
import { categoryHref, getCategoryTree } from '@/lib/catalog';
import { serverEnv } from '@/lib/db';
import { plural } from '@/lib/format';
import { meili, names } from '@/lib/search';
import { robotsFor } from '@/lib/seo';
import { breadcrumbList } from '@/lib/structured-data';

// ISR 1 h. The optional catch-all with no static params keeps this page out of `next build`
// (it needs the search index); `/categorii/<anything>` is a 404.
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ rest?: string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Categorii',
    description:
      'Toate categoriile în care Pretoscop compară prețul total din magazinele online din România: telefoane, laptopuri, televizoare, console și electrocasnice.',
    alternates: { canonical: '/categorii', languages: { 'ro-RO': '/categorii' } },
    robots: robotsFor(true),
  };
}

export default async function CategoriesPage({ params }: Props) {
  if ((await params).rest?.length) notFound();
  const [tree, counts] = await Promise.all([getCategoryTree(), facetCounts(meili(), names(), [], ['category_slugs'])]);
  const n = counts.facets.category_slugs ?? {};
  const crumbs = [
    { name: 'Pretoscop', href: '/' },
    { name: 'Categorii', href: '/categorii' },
  ];
  return (
    <Container className="py-6">
      <JsonLd data={breadcrumbList(serverEnv().PUBLIC_BASE_URL, crumbs)} />
      <Breadcrumbs items={crumbs} />
      <h1 className="text-2xl font-bold text-ink">Categorii</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Deocamdată comparăm electronice, IT și electrocasnice. Categoriile fără produse se vor umple pe măsură ce adăugăm magazine; afișăm doar prețuri pe
        care le-am verificat.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tree.roots.map((root) => (
          <section key={root.slug} aria-labelledby={`cat-${root.slug}`} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
            <h2 id={`cat-${root.slug}`} className="flex items-baseline justify-between gap-2 font-semibold">
              {(n[root.slug] ?? 0) > 0 ? (
                <Link href={categoryHref(root)} className="text-ink hover:text-brand-700">
                  {root.name}
                </Link>
              ) : (
                <span className="text-muted">{root.name}</span>
              )}
              <span className="text-xs font-normal text-muted">{(n[root.slug] ?? 0) > 0 ? plural(n[root.slug]!, 'produs', 'produse') : 'în curând'}</span>
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {root.children.map((c) => (
                <li key={c.slug} className="flex items-baseline justify-between gap-2">
                  {(n[c.slug] ?? 0) > 0 ? (
                    <>
                      <Link href={categoryHref(c)} className="text-ink-soft hover:text-brand-700">
                        {c.name}
                      </Link>
                      <span className="text-xs tabular text-muted">{n[c.slug]}</span>
                    </>
                  ) : (
                    <span className="text-muted">{c.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
