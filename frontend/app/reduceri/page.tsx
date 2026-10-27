import type { Metadata } from "next";
import Link from "next/link";

import DemoBanner from "@/components/DemoBanner";
import { getDeals } from "@/lib/api";
import { formatDate, formatLei, productHref, variantLabel } from "@/lib/format";
import { IS_STATIC } from "@/lib/static";

export const metadata: Metadata = {
  title: "Reduceri reale",
  description: "Ofertele al căror preț a scăzut cu adevărat față de ultima lună, și reducerile false de evitat.",
};

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export default async function DealsPage({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source;
  const data = await getDeals(source);
  const ev = data.next_event;

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/reduceri" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reduceri reale</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Comparăm prețul de azi cu ce a cerut fiecare magazin în ultimele {data.window_days} de zile (mediana), nu cu
        prețul tăiat afișat. Apar doar ofertele noi, vândute direct de magazin, cu o scădere de cel puțin 3%.
      </p>

      {ev && (
        <div className="mt-4 rounded-xl border border-line bg-card p-4 text-sm">
          {ev.days_until === 0 ? (
            <>
              <strong>{ev.name}</strong> e în desfășurare (până pe {formatDate(ev.end)}). Atenție la reducerile
              „din prețul tăiat”: lista de mai jos arată doar scăderile reale.
            </>
          ) : (
            <>
              <strong>{ev.name}</strong> începe în <strong>{ev.days_until}</strong>{" "}
              {ev.days_until === 1 ? "zi" : "zile"} ({formatDate(ev.start)} – {formatDate(ev.end)}). Magazinele scumpesc
              uneori produsele înainte, ca „reducerea” să pară mai mare — urmărim asta.
            </>
          )}
        </div>
      )}

      <section className="mt-6">
        {data.deals.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.deals.map((d) => (
              <li key={d.offer.id}>
                <Link
                  href={productHref(d.product, source)}
                  className="flex h-full flex-col rounded-xl border border-line bg-card p-4 shadow-sm transition hover:border-brand"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold leading-snug">{d.product.name}</h2>
                      <p className="text-xs text-muted">{variantLabel(d.product)}</p>
                    </div>
                    <span className="rounded-lg bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                      −{pct(d.real_drop_pct)}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums">{formatLei(d.offer.breakdown.final_price)}</p>
                  <p className="text-xs text-muted">
                    preț final la <strong className="text-ink">{d.offer.shop.name}</strong> · de obicei{" "}
                    {formatLei(d.reference_price)} (preț afișat)
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {d.lowest_in_window && <span className="font-medium text-ink">Cel mai mic preț din ultima lună. </span>}
                    {d.claimed_discount_pct != null &&
                      `Magazinul afișează −${Math.round(d.claimed_discount_pct)}% față de prețul tăiat.`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">
            Nicio scădere reală de preț în ultima lună la produsele urmărite. Revino mai aproape de{" "}
            {ev?.name ?? "următoarea campanie"}.
          </p>
        )}
      </section>

      {data.fake.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Reduceri false</h2>
          <p className="mt-1 text-sm text-muted">Preț tăiat afișat, dar prețul nu e de fapt mai mic decât de obicei.</p>
          <ul className="mt-3 space-y-3">
            {data.fake.map(({ product, fake }) => (
              <li key={fake.offer_id} className="rounded-xl border border-red-200 bg-card p-4 text-sm dark:border-red-900">
                <Link href={productHref(product, source)} className="font-semibold hover:text-brand">
                  {product.name} · {fake.shop_name}
                </Link>
                <p className="mt-1 text-muted">
                  Afișat: <s>{formatLei(fake.old_price)}</s> → {formatLei(fake.price)} (−{Math.round(fake.claimed_discount_pct)}%)
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  {fake.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
