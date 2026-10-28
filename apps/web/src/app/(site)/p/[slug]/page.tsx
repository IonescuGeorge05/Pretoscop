import { isProductIndexable } from '@pretoscop/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { OffersTable } from '@/components/product/offers-table';
import { PriceChart } from '@/components/product/price-chart';
import { ProductImage } from '@/components/product/product-image';
import { keySpecs } from '@/components/product/specs';
import { SummaryCard } from '@/components/product/summary-card';
import { ViewBeacon } from '@/components/product/view-beacon';
import { JsonLd } from '@/components/seo/json-ld';
import { Container } from '@/components/ui/container';
import { serverEnv } from '@/lib/db';
import { formatDate, formatLeiNumeric, plural } from '@/lib/format';
import { bestOffer, getProductPageData, idFromSlug, type ProductPageData } from '@/lib/product';
import { robotsFor } from '@/lib/seo';
import { breadcrumbList, productJsonLd, type BreadcrumbItem } from '@/lib/structured-data';

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

/** The product to show, or null (missing, hidden, merged without a target). */
async function find(slug: string): Promise<ProductPageData | null> {
  const id = idFromSlug(slug);
  const p = id ? await getProductPageData(id) : null;
  return p && (p.status === 'active' || (p.status === 'merged' && p.mergedIntoSlug)) ? p : null;
}

/**
 * Redirects and 404s are raised by the page, never by generateMetadata: a notFound() thrown while
 * metadata streams leaves the 404 body empty in the HTML (only the RSC payload carries it).
 */
async function resolve(slug: string): Promise<ProductPageData> {
  const p = await find(slug);
  if (!p) notFound();
  if (p.status === 'merged' && p.mergedIntoSlug) permanentRedirect(`/p/${p.mergedIntoSlug}`);
  if (p.slug !== slug) permanentRedirect(`/p/${p.slug}`);
  return p;
}

/** Index policy (docs/03 §6.6): the one decision function of @pretoscop/core. */
function indexable(p: ProductPageData): boolean {
  return isProductIndexable({ provisional: p.provisional, liveOffers: p.offers.filter((o) => !o.stale).length, observationsDays: p.stats?.observationsDays ?? 0 });
}

const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '/media';

function crumbs(p: ProductPageData): BreadcrumbItem[] {
  const out: BreadcrumbItem[] = [{ name: 'Pretoscop', href: '/' }];
  if (p.category?.parent) out.push({ name: p.category.parent.name, href: `/c/${p.category.parent.slug}` });
  if (p.category) out.push({ name: p.category.name, href: `/c/${p.category.parent ? `${p.category.parent.slug}/` : ''}${p.category.slug}` });
  out.push({ name: p.title, href: `/p/${p.slug}` });
  return out;
}

function structuredData(p: ProductPageData) {
  const base = serverEnv().PUBLIC_BASE_URL;
  const image = p.imageKey ? `${MEDIA_BASE}/${p.imageKey.replace(/(\.[a-z]+)$/i, '_800$1')}` : null;
  return [
    productJsonLd(base, {
      path: `/p/${p.slug}`,
      title: p.title,
      brand: p.brand?.name ?? null,
      mpn: p.mpn,
      gtins: p.gtins,
      category: p.category?.name ?? null,
      images: image ? [image] : [],
      offers: p.offers.map((o) => ({
        price: o.price,
        total: o.total,
        shippingCost: o.shippingCost,
        availability: o.availability,
        condition: o.condition,
        url: o.url,
        seller: o.sellerName && o.sellerType === 'marketplace' ? o.sellerName : o.shopName,
        stale: o.stale,
      })),
    }),
    breadcrumbList(base, crumbs(p)),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await find(slug);
  if (!p || p.status !== 'active') return { robots: { index: false, follow: true } };
  const shops = new Set(p.offers.map((o) => o.shopSlug)).size;
  const min = p.stats?.currentMinTotal ?? p.offers[0]?.total ?? null;
  const title = min ? `${p.title} – prețuri de la ${formatLeiNumeric(min)} la ${plural(shops, 'magazin', 'magazine')}` : p.title;
  return {
    title: { absolute: `${title} | Pretoscop` },
    description: `Compară prețul total pentru ${p.title}${shops ? ` la ${plural(shops, 'magazin', 'magazine')}` : ''} și vezi istoricul prețului observat de Pretoscop.`,
    alternates: { canonical: `/p/${p.slug}`, languages: { 'ro-RO': `/p/${p.slug}` } },
    robots: robotsFor(indexable(p)),
    openGraph: { title, type: 'website', url: `/p/${p.slug}`, locale: 'ro_RO' },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await resolve(slug);
  const specs = keySpecs(p.attributes);
  const stats = p.stats;
  // Best = what a buyer pays now (marketplace sellers included); the drop badge (M15) compares like with
  // like: the best shop-sold offer against the shop-sold daily series (computed in the loader).
  const best = bestOffer(p.offers);
  const shops = new Set(p.offers.map((o) => o.shopSlug)).size;
  const affiliate = p.offers.some((o) => o.hasAffiliate);

  return (
    <Container className="py-6">
      <ViewBeacon productId={p.id} />
      <JsonLd data={structuredData(p)} />
      <nav aria-label="Navigare ierarhică" className="mb-3 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-brand-700">Pretoscop</Link>
          </li>
          {p.category?.parent && (
            <li>
              › <Link href={`/c/${p.category.parent.slug}`} className="hover:text-brand-700">{p.category.parent.name}</Link>
            </li>
          )}
          {p.category && (
            <li>
              › <Link href={`/c/${p.category.parent ? `${p.category.parent.slug}/` : ''}${p.category.slug}`} className="hover:text-brand-700">{p.category.name}</Link>
            </li>
          )}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <header className="flex gap-4">
            <ProductImage storageKey={p.imageKey} alt={p.title} size={120} className="w-24 shrink-0 self-start sm:w-28" priority />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-snug text-ink sm:text-2xl">{p.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {p.brand && (
                  <Link href={`/b/${p.brand.slug}`} className="text-brand-700 hover:underline">
                    {p.brand.name}
                  </Link>
                )}
                {p.mpn && <span> · cod producător {p.mpn}</span>}
                {p.gtins[0] && <span> · EAN {p.gtins[0].replace(/^0+(?=\d{13})/, '')}</span>}
              </p>
              {specs.length > 0 && (
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {specs.map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <dt className="text-muted">{k}:</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </header>

          <div className="lg:hidden">
            <SummaryCard best={best} stats={stats} facts={p.priceFacts} placement="summary_mobile" />
          </div>

          {p.variants.length > 1 && (
            <section aria-labelledby="variante">
              <h2 id="variante" className="mb-2 text-sm font-semibold text-ink-soft">Alte variante</h2>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <Link
                    key={v.id}
                    href={`/p/${v.slug}`}
                    aria-current={v.current ? 'page' : undefined}
                    className={v.current ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white' : 'rounded-lg bg-surface px-3 py-1.5 text-sm ring-1 ring-line hover:ring-brand-300'}
                  >
                    {keySpecs(v.attributes).filter(([k]) => k === 'Stocare' || k === 'Culoare' || k === 'Memorie RAM').map(([, val]) => val).join(' · ') || v.title.slice(0, 40)}
                    {v.minTotal && <span className={v.current ? 'ml-1 opacity-90' : 'ml-1 text-muted'}> · {formatLeiNumeric(v.minTotal)}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="oferte">
            <h2 id="oferte" className="mb-3 text-lg font-semibold">
              {p.offers.length ? `${plural(p.offers.length, 'ofertă', 'oferte')} la ${plural(shops, 'magazin', 'magazine')}` : 'Nicio ofertă activă acum'}
            </h2>
            <OffersTable offers={p.offers} productId={p.id} bestId={best?.id ?? null} />
          </section>

          <section aria-labelledby="istoric">
            <h2 id="istoric" className="mb-1 text-lg font-semibold">Istoricul prețului</h2>
            <p className="mb-3 text-sm text-muted">
              Prețuri observate de Pretoscop (preț + livrare cunoscută), zilnic, în ora României. Zilele fără observații rămân goale.
              {stats?.historyStartedAt && ` Istoricul începe la ${formatDate(stats.historyStartedAt)}.`}
            </p>
            <PriceChart productId={p.id} />
            {stats && (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
                  <dt className="text-muted">Minim 30 de zile</dt>
                  <dd className="font-semibold tabular">{formatLeiNumeric(stats.min30d)}</dd>
                </div>
                <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
                  <dt className="text-muted">Minim istoric</dt>
                  <dd className="font-semibold tabular">{formatLeiNumeric(stats.minAllTime)}</dd>
                </div>
                <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
                  <dt className="text-muted">Mediana 90 de zile</dt>
                  <dd className="font-semibold tabular">{formatLeiNumeric(stats.median90d)}</dd>
                </div>
                <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
                  <dt className="text-muted">Zile observate</dt>
                  <dd className="font-semibold tabular">{stats.observationsDays}</dd>
                </div>
              </dl>
            )}
          </section>

          {p.notCovered.length > 0 && (
            <section aria-labelledby="neincluse" className="rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line">
              <h2 id="neincluse" className="font-semibold">Magazine neincluse încă</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Nu avem încă prețuri de la aceste magazine, așa că nu le putem compara. Poți verifica direct (căutare pe site-ul magazinului,
                neverificată de Pretoscop):
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {p.notCovered.map((s) => (
                  <li key={s.slug}>
                    <a href={s.searchUrl} target="_blank" rel="nofollow noopener noreferrer" className="rounded-md bg-white px-2.5 py-1 ring-1 ring-line hover:ring-brand-300">
                      Verifică și la {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <SummaryCard best={best} stats={stats} facts={p.priceFacts} placement="summary" />
          </div>
          <div className="rounded-[var(--radius-card)] bg-surface p-4 text-sm text-ink-soft ring-1 ring-line">
            <p className="font-semibold text-ink">Alertă de preț</p>
            <p className="mt-1">În curând: te anunțăm pe email când prețul scade sub pragul ales (cu acordul tău explicit).</p>
          </div>
          <div className="space-y-2 text-xs leading-relaxed text-muted">
            <p>Prețurile și disponibilitatea sunt preluate automat de pe site-urile magazinelor și pot fi modificate de acestea; prețul final este cel afișat de magazin la plasarea comenzii.</p>
            {affiliate && <p>Unele linkuri sunt linkuri afiliate: Pretoscop poate primi un comision, fără cost pentru tine. Comisionul nu influențează ordinea ofertelor.</p>}
            <p>
              <Link href={`/contact?subiect=price_error&url=${encodeURIComponent(`/p/${p.slug}`)}`} className="text-brand-700 underline">
                Raportează o eroare de preț
              </Link>{' '}
              · <Link href="/cum-functioneaza" className="text-brand-700 underline">Cum ordonăm ofertele</Link>
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
