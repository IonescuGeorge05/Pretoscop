import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/listing/breadcrumbs';
import { ShopStateBadge, shopState } from '@/components/shop/shop-facts';
import { JsonLd } from '@/components/seo/json-ld';
import { Container } from '@/components/ui/container';
import { listShops, type ShopFacts } from '@/lib/catalog';
import { serverEnv } from '@/lib/db';
import { formatPercent, plural } from '@/lib/format';
import { robotsFor } from '@/lib/seo';
import { breadcrumbList } from '@/lib/structured-data';

// ISR 1 h; the optional catch-all keeps it out of `next build` (it reads the database).
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ rest?: string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Magazinele comparate',
    description: 'Magazinele online din România ale căror prețuri le compară Pretoscop, cât de proaspete sunt datele și magazinele pe care nu le acoperim încă.',
    alternates: { canonical: '/magazine', languages: { 'ro-RO': '/magazine' } },
    robots: robotsFor(true),
  };
}

function ShopRow({ s }: { s: ShopFacts }) {
  const fresh = s.activeOffers > 0 ? s.checked24h / s.activeOffers : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-white px-4 py-3 ring-1 ring-line">
      <Link href={`/magazin/${s.slug}`} className="font-semibold text-ink hover:text-brand-700">
        {s.name}
      </Link>
      <span className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {s.liveOffers > 0 && <span>{plural(s.products, 'produs', 'produse')}</span>}
        {fresh !== null && s.liveOffers > 0 && <span className="text-muted">· {formatPercent(fresh)} verificate în 24 h</span>}
        <ShopStateBadge s={s} />
      </span>
    </li>
  );
}

export default async function ShopsPage({ params }: Props) {
  if ((await params).rest?.length) notFound();
  const shops = await listShops();
  const covered = shops.filter((s) => shopState(s).covered);
  const coming = shops.filter((s) => s.status === 'active' && !shopState(s).covered);
  const paused = shops.filter((s) => s.status === 'paused');
  const notYet = shops.filter((s) => s.status === 'blocked');
  const crumbs = [
    { name: 'Pretoscop', href: '/' },
    { name: 'Magazine', href: '/magazine' },
  ];
  return (
    <Container className="py-6">
      <JsonLd data={breadcrumbList(serverEnv().PUBLIC_BASE_URL, crumbs)} />
      <Breadcrumbs items={crumbs} />
      <h1 className="text-2xl font-bold text-ink">Magazinele comparate</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Comparăm doar magazinele ale căror prețuri le putem verifica. Ordinea ofertelor nu depinde de magazin:{' '}
        <Link href="/cum-functioneaza" className="text-brand-700 underline">
          cum ordonăm ofertele
        </Link>
        .
      </p>

      <section aria-labelledby="incluse" className="mt-6">
        <h2 id="incluse" className="mb-2 font-semibold">
          Incluse acum ({covered.length})
        </h2>
        {covered.length ? (
          <ul className="space-y-2" data-testid="shops-covered">
            {covered.map((s) => (
              <ShopRow key={s.slug} s={s} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Momentan nu avem prețuri verificate recent din niciun magazin.</p>
        )}
      </section>

      {coming.length + paused.length > 0 && (
        <section aria-labelledby="curand" className="mt-8">
          <h2 id="curand" className="mb-2 font-semibold">
            În curs de adăugare sau suspendate
          </h2>
          <ul className="space-y-2">
            {[...coming, ...paused].map((s) => (
              <ShopRow key={s.slug} s={s} />
            ))}
          </ul>
        </section>
      )}

      {notYet.length > 0 && (
        <section aria-labelledby="neincluse" className="mt-8">
          <h2 id="neincluse" className="mb-1 font-semibold">
            Neincluse încă ({notYet.length})
          </h2>
          <p className="mb-2 max-w-2xl text-sm text-ink-soft">
            Pentru aceste magazine nu avem încă o sursă de date potrivită (un feed de la magazin sau acces pentru robotul nostru). Pe paginile de produs îți
            arătăm un link de căutare pe site-ul lor.
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="shops-not-yet">
            {notYet.map((s) => (
              <li key={s.slug}>
                <Link href={`/magazin/${s.slug}`} className="inline-block rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line hover:bg-brand-50">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
