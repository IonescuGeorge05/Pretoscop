import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { dropVersus30dMin } from '@pretoscop/core';
import { AlertForm } from '@/components/alerts/alert-form';
import { OffersTable } from '@/components/product/offers-table';
import { PriceChart } from '@/components/product/price-chart';
import { ProductImage } from '@/components/product/product-image';
import { keySpecs } from '@/components/product/specs';
import { SummaryCard } from '@/components/product/summary-card';
import { Container } from '@/components/ui/container';
import { alertConsent, alertsEnabled } from '@/lib/alerts';
import { serverEnv } from '@/lib/db';
import { formatDate, formatLeiNumeric, plural, toBani } from '@/lib/format';
import { bestOffer, getProductPageData, idFromSlug, type ProductPageData } from '@/lib/product';

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function resolve(slug: string): Promise<ProductPageData> {
  const id = idFromSlug(slug);
  if (!id) notFound();
  const p = await getProductPageData(id);
  if (!p) notFound();
  if (p.status === 'merged' && p.mergedIntoSlug) permanentRedirect(`/p/${p.mergedIntoSlug}`);
  if (p.status !== 'active') notFound();
  if (p.slug !== slug) permanentRedirect(`/p/${p.slug}`);
  return p;
}

/** Index policy (docs/03 §6.6): ≥ 2 live offers or ≥ 14 days of history, and not provisional. */
function indexable(p: ProductPageData): boolean {
  const live = p.offers.filter((o) => !o.stale).length;
  return !p.provisional && (live >= 2 || (p.stats?.observationsDays ?? 0) >= 14);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await resolve(slug);
  const shops = new Set(p.offers.map((o) => o.shopSlug)).size;
  const min = p.stats?.currentMinTotal ?? p.offers[0]?.total ?? null;
  const title = min ? `${p.title} – prețuri de la ${formatLeiNumeric(min)} la ${plural(shops, 'magazin', 'magazine')}` : p.title;
  return {
    title: { absolute: `${title} | Pretoscop` },
    description: `Compară prețul total pentru ${p.title}${shops ? ` la ${plural(shops, 'magazin', 'magazine')}` : ''} și vezi istoricul prețului observat de Pretoscop.`,
    alternates: { canonical: `/p/${p.slug}` },
    robots: serverEnv().SITE_INDEXABLE && indexable(p) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, type: 'website', url: `/p/${p.slug}` },
  };
}

function jsonLd(p: ProductPageData) {
  const live = p.offers.filter((o) => o.availability === 'in_stock' && !o.stale);
  const prices = live.map((o) => Number(o.total));
  const gtin13 = p.gtins.find((g) => g.startsWith('0'))?.slice(1);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand.name } } : {}),
    ...(p.mpn ? { mpn: p.mpn } : {}),
    ...(gtin13 ? { gtin13 } : {}),
    ...(prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'RON',
            lowPrice: Math.min(...prices).toFixed(2),
            highPrice: Math.max(...prices).toFixed(2),
            offerCount: live.length,
          },
        }
      : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await resolve(slug);
  const specs = keySpecs(p.attributes);
  const stats = p.stats;
  // Best = what a buyer pays now (marketplace sellers included); the drop badge compares like with
  // like: the best shop-sold offer against the shop-sold 30-day minimum of the history series.
  const best = bestOffer(p.offers);
  const bestShop = bestOffer(p.offers, { shopSoldOnly: true });
  const current = toBani(bestShop?.total ?? null);
  const drop = current !== null && stats ? dropVersus30dMin(current, toBani(stats.min30d), stats.observationsDays) : null;
  const shops = new Set(p.offers.map((o) => o.shopSlug)).size;
  const affiliate = p.offers.some((o) => o.hasAffiliate);
  const alertsOn = await alertsEnabled();
  const consent = alertConsent();

  return (
    <Container className="py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p)).replace(/</g, '\\u003c') }} />
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
            <SummaryCard best={best} stats={stats} drop={drop} placement="summary_mobile" />
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
            <SummaryCard best={best} stats={stats} drop={drop} placement="summary" />
          </div>
          <section aria-labelledby="alerta" className="rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line">
            <h2 id="alerta" className="font-semibold text-ink">
              Alertă de preț
            </h2>
            {alertsOn ? (
              <>
                <p className="mt-1 text-sm text-ink-soft">Te anunțăm pe email când prețul total (preț + livrare) scade.</p>
                <div className="mt-3">
                  <AlertForm
                    productId={p.id}
                    currentBestBani={current}
                    hasVariants={p.variants.length > 1}
                    consent={{ key: consent.key, text: consent.text, link: consent.link }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">În curând: te anunțăm pe email când prețul scade sub pragul ales (cu acordul tău explicit).</p>
            )}
          </section>
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
